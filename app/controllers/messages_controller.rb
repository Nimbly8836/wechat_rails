require "base64"
require "digest/md5"
require "net/http"
require "stringio"

class MessagesController < ApplicationController
  skip_before_action :verify_authenticity_token, only: :callback
  skip_before_action :require_authentication, only: :callback
  before_action :disable_http_cache, only: [ :index, :show, :resolve_reference ]

  def index
    chat_room_id = params[:chat_room_id]
    query = params[:q].to_s.strip
    before_id = params[:before_id] # 可选，用于加载更多消息
    after_id = params[:after_id]

    if query.present?
      messages = search_messages_scope(chat_room_id, query)
      render json: serialize_messages(messages, chat_room_id)
      return
    end

    messages = messages_scope(chat_room_id)

    # 如果前端传了 before_id，就取更早的消息
    messages = messages.where("id < ?", before_id) if before_id.present?
    messages = messages.where("id > ?", after_id) if after_id.present?

    messages = messages.order(id: :desc).limit(100).to_a
    render json: serialize_messages(messages.reverse, chat_room_id)
  end

  def show
    chat_room_id = params[:chat_room_id]
    message = messages_scope(chat_room_id).find_by(id: params[:id])

    if message.blank?
      render json: { success: false, message: "消息不存在" }, status: :not_found
      return
    end

    render json: serialize_messages([ message ], chat_room_id).first
  end

  def resolve_reference
    chat_room_id = params[:chat_room_id]
    new_msg_id = params[:new_msg_id]

    if new_msg_id.blank?
      render json: { success: false, message: "new_msg_id 不能为空" }, status: :bad_request
      return
    end

    message = messages_scope(chat_room_id)
              .joins(:wx_message)
              .where(wx_messages: { new_msg_id: new_msg_id })
              .order(message_time: :asc, id: :asc)
              .first

    if message.blank?
      render json: { success: false, message: "引用消息不存在" }, status: :not_found
      return
    end

    render json: serialize_messages([ message ], chat_room_id).first
  end

  def create
    args = send_message_params
    chat_room = ChatRoom.includes(:contact).find(args[:chat_room_id])
    sender = MessageSender.new(
      chat_room,
      args[:msg_type]&.to_i,
      args[:content],
      args[:extra],
      args[:file]
    )
    res = sender.send
    serialized = serialize_send_result(res, chat_room.id)
    render json: serialized
  end

  def callback
    requested_wxid = params[:wxid]
    return head :bad_request if requested_wxid.blank?

    sync_service = MessageSyncService.new(requested_wxid)
    sync_wxid = sync_service.sync_wxid

    payload = params.to_unsafe_h
    source_payload = payload
    if sync_service.message_batch_present?(source_payload)
      unless sync_service.success_response?(source_payload)
        Rails.logger.warn { "message callback ignored: AddMsgs present but success flag is false for requested_wxid=#{requested_wxid} sync_wxid=#{sync_wxid}" }
        return head :ok
      end
    else
      if sync_service.explicit_failure_response?(source_payload)
        Rails.logger.warn { "message callback ignored: explicit failure for requested_wxid=#{requested_wxid} sync_wxid=#{sync_wxid}" }
        return head :ok
      end

      Rails.logger.info { "message callback missing AddMsgs, triggering one sync for requested_wxid=#{requested_wxid} sync_wxid=#{sync_wxid}" }
      sync_payload = sync_service.sync_payload
      source_payload = sync_payload if sync_payload.is_a?(Hash)
    end

    unless sync_service.success_response?(source_payload)
      Rails.logger.warn { "message callback sync failed or success flag missing for requested_wxid=#{requested_wxid} sync_wxid=#{sync_wxid}" }
      return head :ok
    end

    unless sync_service.message_batch_present?(source_payload)
      Rails.logger.info { "message callback produced no messages after sync for requested_wxid=#{requested_wxid} sync_wxid=#{sync_wxid}" }
      BackfillMissingMessagesJob.perform_later(sync_wxid)
      return head :ok
    end

    sync_service.persist_payload(source_payload, full_backfill: true, inline_save: true)
    head :ok
  end

  def sync
    requested_wxid = params[:wxid]
    return render json: { success: false, message: "wxid is required" }, status: :bad_request if requested_wxid.blank?

    sync_service = MessageSyncService.new(requested_wxid)
    payload = sync_service.sync_payload
    unless sync_service.success_response?(payload)
      Rails.logger.warn do
        "message sync failed: requested_wxid=#{requested_wxid} sync_wxid=#{sync_service.sync_wxid} payload=#{payload.inspect}"
      end
      return render json: {
        success: false,
        message: "sync failed",
        requested_wxid: requested_wxid,
        sync_wxid: sync_service.sync_wxid,
        payload: payload
      }, status: :bad_gateway
    end

    result = sync_service.persist_payload(payload, full_backfill: true)

    render json: {
      success: true,
      requested_wxid: requested_wxid,
      sync_wxid: sync_service.sync_wxid,
      synced_count: result[:synced_count]
    }
  end

  def send_image_message
    to_wx_id = params[:to_wx_id]
    image_base64 = params[:image_base64]
  end

  def download_voice
    # 下载语音消息
    message = Message.includes(:wx_message, :chat_room).find(params[:id])
    voice_content = message.wx_message.parse_voice_content
    unless voice_content
      render json: { error: true, message: "voice message not found" }, status: :not_found and return
    end

    converter = VoiceConversionService.new(message.id)

    if converter.cached_file_available?
      return send_file(converter.cached_file_path, type: converter.mime_type, disposition: "inline")
    end

    contact = Contact.find(message.chat_room.contact_id)
    api_service = ToolsApiService.new(contact.own_wxid)
    res = api_service.download_voice(
      msg_id: message.wx_message.msg_id,
      from_user_name: voice_content[:from_user_name],
      length: voice_content[:length],
      buf_id: voice_content[:buf_id]
    )

    buffer = res&.dig("Data", "data", "buffer")

    begin
      file_path = converter.convert_and_store!(buffer)
      send_file(file_path, type: converter.mime_type, disposition: "inline")
    rescue VoiceConversionService::ConversionError => e
      Rails.logger.error { "Voice conversion failed: #{e.message}" }
      render json: { error: true, message: "voice conversion failed" }, status: :unprocessable_content
    end
  end

  def download_emoji
    message = find_message_for_media(params[:id])
    return render json: { error: true, message: "emoji message not found" }, status: :not_found unless message&.wx_message

    serve_emoji(message.wx_message)
  rescue ActiveRecord::RecordNotFound
    render json: { error: true, message: "emoji message not found" }, status: :not_found
  rescue URI::InvalidURIError, SocketError, Timeout::Error, Errno::ECONNREFUSED => e
    Rails.logger.error { "emoji download error: #{e.message}" }
    render json: { error: true, message: "emoji download error" }, status: :bad_gateway
  end

  def download_emoji_by_md5
    file_md5 = params[:md5].to_s.strip
    return render json: { error: true, message: "emoji file md5 missing" }, status: :bad_request if file_md5.blank?

    if (existing_path = locate_cached_emoji(file_md5))
      wx_message = WxMessage.where(emoji_file_md5: file_md5).where.not(content: [ nil, "" ]).order(:id).first
      wx_message ||= WxMessage.where(emoji_md5: file_md5).where.not(content: [ nil, "" ]).order(:id).first
      return send_emoji_file(backfill_emoji_file_cache!(wx_message, existing_path, preferred_file_md5: wx_message&.emoji_file_md5.present? ? file_md5 : nil)) if wx_message

      return send_emoji_file(existing_path)
    end

    wx_message = WxMessage.where(emoji_file_md5: file_md5).where.not(content: [ nil, "" ]).order(:id).first
    return serve_emoji(wx_message, preferred_file_md5: file_md5) if wx_message

    wx_message = WxMessage.where(emoji_md5: file_md5).where.not(content: [ nil, "" ]).order(:id).first
    return render json: { error: true, message: "emoji message not found" }, status: :not_found unless wx_message

    serve_emoji(wx_message)
  rescue URI::InvalidURIError, SocketError, Timeout::Error, Errno::ECONNREFUSED => e
    Rails.logger.error { "emoji download error: #{e.message}" }
    render json: { error: true, message: "emoji download error" }, status: :bad_gateway
  end

  def download_image
    message = Message.includes(:wx_message, :chat_room).find(params[:id])
    wx_message = message.wx_message

    unless wx_message&.content && wx_message.msg_type.to_sym == :image
      render json: { error: true, message: "image message not found" }, status: :not_found and return
    end

    storage_dir = Rails.root.join("storage", "images")
    FileUtils.mkdir_p(storage_dir)
    basename = message.id.to_s
    if (cached = locate_cached_media(storage_dir, basename))
      return send_file(cached, type: Marcel::MimeType.for(Pathname.new(cached)), disposition: "inline")
    end

    image_meta = wx_message.parse_image
    unless image_meta
      render json: { error: true, message: "image metadata missing" }, status: :unprocessable_content and return
    end

    contact = Contact.find(message.chat_room&.contact_id)
    unless contact.own_wxid.present?
      render json: { error: true, message: "contact wxid missing" }, status: :unprocessable_content and return
    end

    tools_api = ToolsApiService.new(contact.own_wxid)

    if (cdn_payload = try_cdn_image_download(tools_api, image_meta))
      file_path = persist_image(storage_dir, basename, cdn_payload[:data], image_meta[:cdn_img_url], cdn_payload[:mime])
      return send_file(file_path, type: cdn_payload[:mime], disposition: "inline")
    end

    chunk_payload = download_image_chunks(tools_api, wx_message, image_meta)
    unless chunk_payload
      render json: { error: true, message: "image download failed" }, status: :bad_gateway and return
    end

    file_path = persist_image(storage_dir, basename, chunk_payload[:data], image_meta[:cdn_img_url], chunk_payload[:mime])
    send_file(file_path, type: chunk_payload[:mime], disposition: "inline")
  rescue ActiveRecord::RecordNotFound
    render json: { error: true, message: "image message not found" }, status: :not_found
  rescue => e
    Rails.logger.error { "image download error: #{e.message}" }
    render json: { error: true, message: "image download error" }, status: :bad_gateway
  end

  def download_video
    message = Message.includes(:wx_message, :chat_room).find(params[:id])
    wx_message = message.wx_message

    unless wx_message&.content && wx_message.msg_type.to_sym == :video
      render json: { error: true, message: "video message not found" }, status: :not_found and return
    end

    video_meta = wx_message.parse_video
    unless video_meta
      render json: { error: true, message: "video metadata missing" }, status: :unprocessable_content and return
    end

    storage_dir = Rails.root.join("storage", "videos")
    FileUtils.mkdir_p(storage_dir)
    basename = message.id.to_s

    if (cached = locate_cached_media(storage_dir, basename))
      mime = Marcel::MimeType.for(Pathname.new(cached)) rescue "video/mp4"
      ext = extension_for_mime(mime) || File.extname(cached) || ".mp4"
      filename = ensure_extension("video-#{message.id}", ext)
      return send_file(cached, type: mime, disposition: "attachment", filename: filename)
    end

    contact = Contact.find(message.chat_room&.contact_id)
    unless contact&.own_wxid.present?
      render json: { error: true, message: "contact wxid missing" }, status: :unprocessable_content and return
    end

    tools_api = ToolsApiService.new(contact.own_wxid)
    chunk_payload = download_video_chunks(tools_api, wx_message, video_meta)
    unless chunk_payload
      render json: { error: true, message: "video download failed" }, status: :bad_gateway and return
    end

    data = chunk_payload[:data]
    mime = chunk_payload[:mime] || "video/mp4"
    extension_hint = extension_for_mime(mime) || ".mp4"
    file_path = persist_binary(storage_dir, basename, data, extension_hint: extension_hint, fallback_extension: ".mp4")

    filename = ensure_extension("video-#{message.id}", extension_hint)
    send_file(file_path, type: mime, disposition: "attachment", filename: filename)
  rescue ActiveRecord::RecordNotFound
    render json: { error: true, message: "video message not found" }, status: :not_found
  rescue => e
    Rails.logger.error { "video download error: #{e.message}" }
    render json: { error: true, message: "video download error" }, status: :bad_gateway
  end

  def download_file
    message = Message.includes(:wx_message, :chat_room).find(params[:id])
    wx_message = message.wx_message

    storage_dir = Rails.root.join("storage", "files")
    FileUtils.mkdir_p(storage_dir)
    basename = message.id.to_s

    if (cached = locate_cached_media(storage_dir, basename))
      # filename = sanitize_filename(file_meta[:title], default: "file")
      filename = wx_message.content || "unknow"
      mime = Marcel::MimeType.for(Pathname.new(cached)) rescue "application/octet-stream"
      return send_file(cached, type: mime, disposition: "attachment", filename: filename)
    end

    file_meta = wx_message.parse_file_attachment
    unless file_meta
      render json: { error: true, message: "file metadata missing" }, status: :unprocessable_content and return
    end


    contact = Contact.find(message.chat_room&.contact_id)
    unless contact.own_wxid.present?
      render json: { error: true, message: "contact wxid missing" }, status: :unprocessable_content and return
    end

    tools_api = ToolsApiService.new(contact.own_wxid)
    data = download_file_chunks(tools_api, file_meta)
    unless data
      render json: { error: true, message: "file download failed" }, status: :bad_gateway and return
    end

    data.force_encoding(Encoding::BINARY)

    base_name = sanitize_filename(file_meta[:title], default: "file")
    extension_hint = file_meta[:fileext].present? ? ".#{file_meta[:fileext].downcase}" : nil
    filename = ensure_extension(base_name, extension_hint)
    mime = detect_mime(data, name: filename, fallback: "application/octet-stream")

    file_path = persist_binary(storage_dir, basename, data, extension_hint: File.extname(filename), fallback_extension: ".bin")

    send_file(file_path, type: mime, disposition: "attachment", filename: filename)
  rescue ActiveRecord::RecordNotFound
    Rails.logger.error { "file message not found: id=#{params[:id]}" }
    render json: { error: true, message: "file message not found" }, status: :not_found
  rescue => e
    Rails.logger.error { "file download error: #{e}" }
    render json: { error: true, message: "file download error" }, status: :bad_gateway
  end

  def send_emoji_file(path, content_type = nil)
    mime_type = content_type || Marcel::MimeType.for(Pathname.new(path))
    response.headers["Cache-Control"] = "no-store, max-age=0"
    response.headers["Pragma"] = "no-cache"
    send_file(path, type: mime_type, disposition: "inline")
  end

  def serve_emoji(wx_message, preferred_file_md5: nil)
    unless wx_message
      render json: { error: true, message: "emoji message not found" }, status: :not_found and return
    end

    file_md5 = preferred_file_md5.presence || wx_message.emoji_file_md5.presence&.strip
    legacy_md5 = wx_message.emoji_md5.presence&.strip

    if (existing_path = locate_cached_emoji(file_md5) || locate_cached_emoji(legacy_md5))
      send_emoji_file(backfill_emoji_file_cache!(wx_message, existing_path, preferred_file_md5: file_md5))
      return
    end

    unless wx_message.content.present?
      render json: { error: true, message: "emoji metadata missing" }, status: :unprocessable_content and return
    end

    emoji_meta = normalize_emoji_metadata!(wx_message)
    legacy_md5 = emoji_meta[:emoji_md5].presence || legacy_md5

    if (existing_path = locate_cached_emoji(file_md5) || locate_cached_emoji(legacy_md5))
      send_emoji_file(backfill_emoji_file_cache!(wx_message, existing_path, preferred_file_md5: file_md5))
      return
    end

    if legacy_md5.blank? || emoji_meta[:cdn_url].blank?
      render json: { error: true, message: "emoji metadata missing" }, status: :unprocessable_content and return
    end

    storage_dir = emoji_storage_dir
    uri = URI.parse(emoji_meta[:cdn_url])
    response, resolved_uri = fetch_http_response(uri)

    unless response.is_a?(Net::HTTPSuccess)
      render json: { error: true, message: "emoji download failed" }, status: :bad_gateway and return
    end

    file_md5 = preferred_file_md5.presence || Digest::MD5.hexdigest(response.body)
    content_type = response["content-type"]
    extension = determine_extension(resolved_uri, content_type)
    file_path = storage_dir.join("#{file_md5}#{extension}")

    File.binwrite(file_path, response.body) unless File.exist?(file_path)
    wx_message.update_columns(
      emoji_md5: legacy_md5,
      emoji_file_md5: file_md5
    )
    send_emoji_file(file_path, content_type)
  end

  def emoji_storage_dir
    storage_dir = Rails.root.join("storage", "emojis")
    FileUtils.mkdir_p(storage_dir)
    storage_dir
  end

  def locate_cached_emoji(emoji_md5)
    return nil if emoji_md5.blank?

    storage_dir = emoji_storage_dir
    Dir.glob(storage_dir.join("#{emoji_md5}.*")).first || begin
      path = storage_dir.join(emoji_md5)
      path if File.exist?(path)
    end
  end

  def normalize_emoji_metadata!(wx_message)
    emoji_content = wx_message.parse_emoji || {}
    Rails.logger.debug { "EMOJI parse : #{emoji_content.inspect}" }

    emoji_md5 = wx_message.emoji_md5.presence&.strip || emoji_content[:md5].presence&.strip
    cdn_url = emoji_content[:cdn_url].presence

    if emoji_md5.present? && wx_message.emoji_md5.blank?
      wx_message.update_column(:emoji_md5, emoji_md5)
    end

    {
      emoji_md5: emoji_md5,
      cdn_url: cdn_url
    }
  end

  def backfill_emoji_file_cache!(wx_message, path, preferred_file_md5: nil)
    file_md5 = preferred_file_md5.presence || wx_message.emoji_file_md5.presence&.strip
    extension = File.extname(path)
    actual_file_md5 = file_md5.presence || Digest::MD5.hexdigest(File.binread(path))
    target_path = emoji_storage_dir.join("#{actual_file_md5}#{extension}")

    unless File.expand_path(path) == File.expand_path(target_path)
      FileUtils.cp(path, target_path) unless File.exist?(target_path)
    end

    updates = {}
    updates[:emoji_file_md5] = actual_file_md5 if wx_message.emoji_file_md5 != actual_file_md5
    emoji_md5 = wx_message.emoji_md5.presence&.strip || wx_message.parse_emoji&.dig(:md5)&.presence
    updates[:emoji_md5] = emoji_md5 if emoji_md5.present? && wx_message.emoji_md5.blank?
    wx_message.update_columns(updates) if updates.any?

    target_path
  end

  def determine_extension(uri, content_type)
    extension = File.extname(uri.path)
    return extension if extension.present?

    case content_type
    when "image/gif"
      ".gif"
    when "image/png"
      ".png"
    when "image/jpeg"
      ".jpg"
    when "image/webp"
      ".webp"
    else
      ""
    end
  end

  def fetch_http_response(uri, limit: 3)
    raise URI::InvalidURIError, "too many redirects" if limit <= 0

    response = Net::HTTP.get_response(uri)
    return [ response, uri ] unless response.is_a?(Net::HTTPRedirection)

    location = response["location"].to_s.strip
    raise URI::InvalidURIError, "redirect location missing" if location.blank?

    redirected_uri = URI.join(uri.to_s, location)
    fetch_http_response(redirected_uri, limit: limit - 1)
  end

  private

  def messages_scope(chat_room_id)
    Message.includes(:wx_message).where(chat_room_id: chat_room_id)
  end

  def find_message_for_media(identifier)
    message = Message.includes(:wx_message, :chat_room).find_by(id: identifier)
    return message if message

    Message.includes(:wx_message, :chat_room).find_by(wx_messages_id: identifier)
  end

  def search_messages_scope(chat_room_id, query)
    messages_scope(chat_room_id)
      .joins(:wx_message)
      .merge(WxMessage.keyword_search(query))
      .order(message_time: :desc, id: :desc)
      .limit(search_limit)
      .to_a
  end

  def search_limit
    value = params[:limit].to_i
    return 40 if value <= 0

    [ value, 100 ].min
  end

  def serialize_messages(messages, chat_room_id)
    refer_ids = messages.filter_map { |msg| reference_identifier_for(msg.wx_message) }.uniq
    referenced_by_new_msg_id = referenced_messages_by_new_msg_id(chat_room_id, refer_ids)

    messages.map do |message|
      wx_message = message.wx_message
      referenced = wx_message && referenced_by_new_msg_id[reference_identifier_for(wx_message)]
      serialize_message(message, referenced)
    end
  end

  def referenced_messages_by_new_msg_id(chat_room_id, refer_ids)
    return {} if refer_ids.blank?

    Message.includes(:wx_message)
           .where(chat_room_id: chat_room_id)
           .joins(:wx_message)
           .where(wx_messages: { new_msg_id: refer_ids })
           .order(message_time: :asc, id: :asc)
           .each_with_object({}) do |msg, result|
             new_msg_id = msg.wx_message&.new_msg_id
             next if new_msg_id.blank? || result.key?(new_msg_id)

             result[new_msg_id] = msg
           end
  end

  def serialize_message(message, referenced = nil)
    base = message.as_json(
      include: {
        wx_message: {
          only: [ :msg_type, :content, :from_user_name, :to_user_name,
                 :new_msg_id, :refer_new_msg_id, :refer_title, :self_send, :real_msg_type, :emoji_md5, :emoji_file_md5 ]
        }
      }
    )
    base["message_id"] = message.id
    base["wx_message_id"] = message.wx_messages_id

    base["wx_message"] = serialize_wx_message_json(base["wx_message"], message: message, wx_message: message.wx_message)
    referenced_json = referenced&.as_json(
      only: [ :id, :chat_room_id, :created_at, :message_time ],
      include: {
        wx_message: {
          only: [ :msg_type, :content, :from_user_name, :to_user_name,
                 :new_msg_id, :self_send, :real_msg_type, :emoji_md5, :emoji_file_md5 ]
        }
      }
    )
    referenced_json["wx_message"] = serialize_wx_message_json(referenced_json["wx_message"], message: referenced, wx_message: referenced.wx_message) if referenced_json

    base.merge(
      "referenced_message" => referenced_json
    )
  end

  def serialize_wx_message_json(wx_message_json, message: nil, wx_message: nil)
    return wx_message_json unless wx_message_json.is_a?(Hash)

    emoji_md5 = wx_message_json["emoji_md5"].presence || wx_message&.parse_emoji&.dig(:md5)
    emoji_file_md5 = wx_message_json["emoji_file_md5"].presence || wx_message&.emoji_file_md5
    quote_metadata = wx_message&.quote_metadata || {}
    refer_new_msg_id = wx_message_json["refer_new_msg_id"].presence || quote_metadata[:srv_id]
    refer_title = wx_message_json["refer_title"].presence || quote_metadata[:title]
    parsed_message = wx_message&.parsed_message_payload

    updates = {}
    if emoji_md5.present? && wx_message&.emoji_md5.blank?
      updates[:emoji_md5] = emoji_md5
    end
    if refer_new_msg_id.present? && wx_message&.refer_new_msg_id.blank?
      updates[:refer_new_msg_id] = refer_new_msg_id
    end
    if refer_title.present? && wx_message&.refer_title.blank?
      updates[:refer_title] = refer_title
    end
    wx_message.update_columns(updates) if updates.any?

    wx_message_json.merge(
      "new_msg_id" => serialize_frontend_identifier(wx_message_json["new_msg_id"]),
      "refer_new_msg_id" => serialize_frontend_identifier(refer_new_msg_id),
      "refer_title" => refer_title,
      "emoji_md5" => emoji_md5,
      "emoji_file_md5" => emoji_file_md5,
      "emoji_url" => build_emoji_url(message: message, wx_message: wx_message, emoji_file_md5: emoji_file_md5, emoji_md5: emoji_md5),
      "parsed_message" => parsed_message&.deep_stringify_keys
    )
  end

  def build_emoji_url(message: nil, wx_message: nil, emoji_file_md5: nil, emoji_md5: nil)
    identifier = message&.id || wx_message&.id
    if identifier.present?
      return "/message/emoji/#{identifier}"
    end

    md5 = emoji_file_md5.presence || emoji_md5.presence
    return nil if md5.blank?

    "/message/emoji/md5/#{ERB::Util.url_encode(md5.to_s)}"
  end

  def serialize_send_result(result, chat_room_id)
    payload = result.is_a?(Hash) ? result.deep_dup : result
    return payload unless payload.is_a?(Hash) && payload[:success] && payload[:data].is_a?(Hash)

    message_id = payload.dig(:data, "id") || payload.dig(:data, :id)
    return payload if message_id.blank?

    message = messages_scope(chat_room_id).find_by(id: message_id)
    return payload unless message

    payload.merge(data: serialize_messages([ message ], chat_room_id).first)
  end

  def serialize_frontend_identifier(value)
    return nil if value.blank?

    value.to_s
  end

  def reference_identifier_for(wx_message)
    return nil unless wx_message

    wx_message.refer_new_msg_id.presence || wx_message.quote_metadata[:srv_id]
  end

  def disable_http_cache
    response.headers["Cache-Control"] = "no-store"
    response.headers["Pragma"] = "no-cache"
  end

  def try_cdn_image_download(api_service, image_meta)
    aes_key = image_meta[:aes_key].presence
    file_no = image_meta[:cdn_img_url].presence
    return nil unless aes_key && file_no

    response = api_service.cdn_download_image(file_aes_key: aes_key, file_no: file_no)
    payload = response.is_a?(Hash) ? response : {}
    message = payload["Message"] || payload[:Message]
    success = message == "成功" || payload["Success"] == true || payload[:Success] == true
    data_node = payload["Data"] || payload[:Data]
    image_base64 = data_node&.[]("Image") || data_node&.[](:Image)
    return nil unless success && image_base64.present?

    data = Base64.decode64(image_base64)
    data.force_encoding(Encoding::BINARY)
    mime = detect_mime(data, fallback: "image/jpeg")
    { data: data, mime: mime }
  rescue => e
    Rails.logger.error { "cdn image download error: #{e.message}" }
    nil
  end

  def download_image_chunks(api_service, wx_message, image_meta)
    total_size = image_meta[:length].to_i
    return nil if total_size <= 0

    msg_identifier = wx_message.msg_id.presence || wx_message.new_msg_id
    return nil unless msg_identifier.present?

    data = download_chunks(total_size) do |section|
      api_service.download_image_chunk(
        to_wxid: wx_message.to_user_name,
        msg_id: msg_identifier,
        data_len: total_size,
        section: section
      )
    end

    return nil unless data

    mime = detect_mime(data, fallback: "image/jpeg")
    { data: data, mime: mime }
  end

  def download_video_chunks(api_service, wx_message, video_meta)
    total_size = video_meta[:length].to_i
    return nil if total_size <= 0

    msg_identifier = wx_message.msg_id.presence || wx_message.new_msg_id
    return nil unless msg_identifier.present?

    data = download_chunks(total_size) do |section|
      api_service.download_video_chunk(
        to_wxid: wx_message.to_user_name,
        msg_id: msg_identifier,
        data_len: total_size,
        section: section
      )
    end

    return nil unless data

    mime = detect_mime(data, name: "video.mp4", fallback: "video/mp4")
    { data: data, mime: mime }
  end

  def download_file_chunks(api_service, file_meta)
    total_size = file_meta[:totallen].to_i
    return nil if total_size <= 0

    data = download_chunks(total_size) do |section|
      api_service.download_file_chunk(
        app_id: file_meta[:app_id],
        data_len: file_meta[:totallen],
        section: section,
        user_name: file_meta[:from_user_name],
        attach_id: file_meta[:attach_id],
      )
    end

    return nil unless data

    data
  end

  def extract_chunk_payload(response)
    payload = response.is_a?(Hash) ? response : {}
    data_node = payload["Data"] || payload[:Data]
    buffer_node = data_node&.[]("data") || data_node&.[](:data) || data_node
    buffer_base64 = buffer_node&.[]("buffer") || buffer_node&.[](:buffer)
    length_value = buffer_node&.[]("iLen") || buffer_node&.[](:iLen) || data_node&.[]("iLen") || data_node&.[](:iLen)
    return nil unless buffer_base64.present?

    decoded = Base64.decode64(buffer_base64)
    decoded.force_encoding(Encoding::BINARY)
    { data: decoded, length: length_value.to_i }
  rescue => e
    Rails.logger.error { "chunk payload parse error: #{e.message}" }
    nil
  end

  def download_chunks(total_size)
    total = total_size.to_i
    return nil if total <= 0

    collected = +"".b
    downloaded = 0
    requested_size = FileChunkHelper::INITIAL_CHUNK_SIZE

    while downloaded < total
      current_size = [ requested_size, total - downloaded ].min
      section = { start_pos: downloaded, data_len: current_size }
      response = yield(section)
      payload = extract_chunk_payload(response)
      return nil unless payload

      chunk_data = payload[:data]
      actual = payload[:length].to_i
      actual = chunk_data.bytesize if actual <= 0
      return nil if actual <= 0

      collected << chunk_data
      downloaded += actual
      requested_size = actual
    end

    collected.force_encoding(Encoding::BINARY)
    collected
  rescue => e
    Rails.logger.error { "chunk download error: #{e.message}" }
    nil
  end

  def persist_image(storage_dir, basename, data, url_hint, mime)
    extension_hint = extension_from_url(url_hint)
    extension_hint ||= extension_for_mime(mime)
    persist_binary(storage_dir, basename, data, extension_hint: extension_hint, fallback_extension: ".bin")
  end

  def persist_binary(storage_dir, basename, data, extension_hint:, fallback_extension: ".bin")
    extension = extension_hint.to_s.strip
    extension = fallback_extension if extension.blank?
    extension = ".#{extension}" unless extension.start_with?(".")

    path = storage_dir.join("#{basename}#{extension}")
    File.binwrite(path, data)
    path
  end

  def detect_mime(data, name: nil, fallback: "application/octet-stream")
    Marcel::MimeType.for(StringIO.new(data), name: name, declared_type: fallback)
  end

  def extension_for_mime(mime)
    case mime
    when "image/png" then ".png"
    when "image/jpeg" then ".jpg"
    when "image/gif" then ".gif"
    when "image/webp" then ".webp"
    when "video/mp4" then ".mp4"
    when "video/quicktime" then ".mov"
    when "video/x-msvideo" then ".avi"
    when "application/pdf" then ".pdf"
    else
      nil
    end
  end

  def extension_from_url(url)
    return nil if url.blank?
    uri = URI.parse(url)
    ext = File.extname(uri.path)
    ext.presence
  rescue URI::InvalidURIError
    nil
  end

  def locate_cached_media(storage_dir, basename)
    Dir.glob(storage_dir.join("#{basename}.*")).first
  end

  def sanitize_filename(name, default: "file")
    sanitized = name.to_s.strip
    sanitized = default if sanitized.blank?
    sanitized.gsub(/[\r\n]+/, " ").gsub(/[\\\/:*?"<>|]+/, "_")
  end

  def ensure_extension(base_name, extension_or_path)
    extension = if extension_or_path.to_s.start_with?(".")
                  extension_or_path
    else
                  File.extname(extension_or_path.to_s)
    end
    extension = extension.presence
    return base_name if extension.blank?
    base_name.end_with?(extension) ? base_name : "#{base_name}#{extension}"
  end

  def send_message_params
    params.require(:chat_room_id)
    params.require(:msg_type)
    # params.require(:content)
    params.permit(:chat_room_id, :msg_type, :content, :file, extra: {})
  end
end
