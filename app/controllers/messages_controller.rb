require "base64"
require "digest/md5"
require "net/http"
require "stringio"

class MessagesController < ApplicationController
  LARGE_RECORD_ITEM_THRESHOLD = 100.megabytes
  skip_before_action :verify_authenticity_token, only: :callback
  skip_before_action :require_authentication, only: :callback
  before_action :disable_http_cache, only: [ :index, :show, :resolve_reference ]

  def index
    chat_room_id = params[:chat_room_id]
    query = params[:q].to_s.strip
    before_id = params[:before_id] # 可选，用于加载更多消息
    after_id = params[:after_id]
    include_id = params[:include_id]

    if query.present?
      messages = search_messages_scope(chat_room_id, query)
      render json: serialize_messages(messages, chat_room_id)
      return
    end

    base_scope = messages_scope(chat_room_id)
    messages = base_scope

    # 如果前端传了 before_id，就取更早的消息
    messages = messages.where("id < ?", before_id) if before_id.present?
    messages = messages.where("id > ?", after_id) if after_id.present?

    messages = messages.order(id: :desc).limit(100).to_a
    if include_id.present?
      included_message = base_scope.find_by(id: include_id)
      already_included = included_message &&
        messages.any? { |message| message.id == included_message.id }
      messages << included_message if included_message && !already_included
    end

    messages.sort_by!(&:id)
    render json: serialize_messages(messages, chat_room_id)
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
    chat_room = ChatRoom.includes(:contact, chat_room_bots: :chat_bot).find(args[:chat_room_id])
    message_attrs = hook_message_attrs(args)
    bot_runner = ChatRoomBotRunner.new(chat_room)

    before_result = bot_runner.run_before_send(hook_context(chat_room, message_attrs)) do |result|
      apply_before_hook_result(message_attrs, result)
    end
    if before_result["action"].to_s == "block"
      render json: { success: false, message: before_result["message"].presence || "消息已被 Bot 拦截" }
      return
    end

    sender = MessageSender.new(
      chat_room,
      message_attrs[:msg_type],
      message_attrs[:content],
      message_attrs[:extra],
      message_attrs[:file]
    )
    res = sender.send
    bot_runner.run_after_send(hook_context(chat_room, message_attrs).merge(result: res))
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
    result = sync_service.sync_and_persist!(full_backfill: true, local_backfill: true, inline_save: true)

    render json: {
      success: true,
      requested_wxid: requested_wxid,
      sync_wxid: result[:sync_wxid],
      target_talker: result[:target_talker],
      synced_count: result[:synced_count],
      sync_synced_count: result[:sync_synced_count],
      local_synced_count: result[:local_synced_count]
    }
  rescue MessageSyncService::SyncError => e
    payload = e.payload
    Rails.logger.warn do
      "message sync failed: requested_wxid=#{requested_wxid} sync_wxid=#{sync_service.sync_wxid} payload=#{payload.inspect}"
    end
    render json: {
      success: false,
      message: "sync failed",
      requested_wxid: requested_wxid,
      sync_wxid: sync_service.sync_wxid,
      target_talker: sync_service.target_talker,
      payload: payload
    }, status: :bad_gateway
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
      Rails.logger.error do
        "Voice conversion failed: #{e.message} source=#{converter.cached_source_path} output=#{converter.cached_file_path}"
      end
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

    Rails.logger.info do
      "file download metadata message_id=#{message.id} wx_message_id=#{wx_message.id} " \
      "app_id=#{file_meta[:app_id].inspect} attach_id=#{file_meta[:attach_id].inspect} " \
      "totallen=#{file_meta[:totallen].inspect} from_user_name=#{file_meta[:from_user_name].inspect} " \
      "chat_room_wxid=#{message.chat_room&.wx_id.inspect}"
    end


    contact = Contact.find(message.chat_room&.contact_id)
    unless contact.own_wxid.present?
      render json: { error: true, message: "contact wxid missing" }, status: :unprocessable_content and return
    end

    tools_api = ToolsApiService.new(contact.own_wxid)
    data = download_file_chunks(tools_api, message, wx_message, file_meta)
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

  def download_chat_history_attachment
    message = Message.includes(:wx_message, :chat_room).find(params[:id])
    wx_message = message.wx_message
    item = wx_message&.chat_history_record_item(params[:data_id])
    unless item && item[:download_url].present?
      render json: { error: true, message: "chat history attachment not found" }, status: :not_found and return
    end

    storage_dir = Rails.root.join("storage", "record_items", message.id.to_s)
    FileUtils.mkdir_p(storage_dir)
    basename = sanitize_filename(item[:data_id], default: "record-item")
    filename = chat_history_attachment_filename(item)

    if (cached = locate_cached_media(storage_dir, basename))
      mime = Marcel::MimeType.for(Pathname.new(cached), name: filename)
      return send_file(cached, type: mime, disposition: chat_history_attachment_disposition(item), filename: filename)
    end

    contact = Contact.find(message.chat_room&.contact_id)
    unless contact.own_wxid.present?
      render json: { error: true, message: "contact wxid missing" }, status: :unprocessable_content and return
    end

    tools_api = ToolsApiService.new(contact.own_wxid)
    download = download_chat_history_record_item(tools_api, message, wx_message, item, storage_dir, basename, filename)
    unless download
      render json: { error: true, message: "chat history attachment download failed" }, status: :bad_gateway and return
    end

    send_file(download[:path], type: download[:mime], disposition: chat_history_attachment_disposition(item), filename: filename)
  rescue ActiveRecord::RecordNotFound
    render json: { error: true, message: "chat history message not found" }, status: :not_found
  rescue => e
    Rails.logger.error { "chat history attachment download error: #{e.message}" }
    render json: { error: true, message: "chat history attachment download error" }, status: :bad_gateway
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
    parsed_message = materialize_chat_history_download_urls(parsed_message, message) if parsed_message

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

  def materialize_chat_history_download_urls(payload, message)
    return payload unless payload.is_a?(Hash) && payload[:type].to_s == "chat_history"

    payload.deep_dup.tap do |copy|
      materialize_chat_history_item_urls(copy[:items], message)
    end
  end

  def materialize_chat_history_item_urls(items, message)
    return unless items.is_a?(Array)

    items.each do |item|
      if item[:download_url].present?
        item[:download_url] = item[:download_url].sub(":message_id", message.id.to_s)
      end
      materialize_chat_history_item_urls(item[:items], message)
    end
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

  def download_file_chunks(api_service, message, wx_message, file_meta)
    total_size = file_meta[:totallen].to_i
    return nil if total_size <= 0

    user_name = resolve_file_download_user_name(message, wx_message, file_meta)
    if user_name.blank?
      Rails.logger.warn do
        "file download missing user_name wx_message_id=#{wx_message.id} msg_id=#{wx_message.msg_id} " \
        "new_msg_id=#{wx_message.new_msg_id} file_meta=#{file_meta.inspect}"
      end
      return nil
    end

    if file_meta[:app_id].blank? || file_meta[:attach_id].blank?
      Rails.logger.warn do
        "file download missing identifiers wx_message_id=#{wx_message.id} msg_id=#{wx_message.msg_id} " \
        "app_id=#{file_meta[:app_id].inspect} attach_id=#{file_meta[:attach_id].inspect} file_meta=#{file_meta.inspect}"
      end
      return nil
    end

    Rails.logger.info do
      "file download request wx_message_id=#{wx_message.id} user_name=#{user_name.inspect} " \
      "app_id=#{file_meta[:app_id].inspect} attach_id=#{file_meta[:attach_id].inspect} total_size=#{total_size}"
    end

    download_chunks(total_size) do |section|
      api_service.download_file_chunk(
        app_id: file_meta[:app_id],
        data_len: file_meta[:totallen],
        section: section,
        user_name: user_name,
        attach_id: file_meta[:attach_id],
      )
    end
  end

  def download_chat_history_record_item(api_service, message, wx_message, item, storage_dir, basename, filename)
    if chat_history_record_item_cdn_downloadable?(item) && item[:data_size].to_i <= LARGE_RECORD_ITEM_THRESHOLD
      if (data = download_record_item_via_cdn(api_service, item))
        mime = detect_mime(data, name: filename, fallback: chat_history_attachment_fallback_mime(item))
        extension_hint = File.extname(filename).presence || extension_for_mime(mime)
        path = persist_binary(storage_dir, basename, data, extension_hint: extension_hint, fallback_extension: ".bin")
        return { path: path, mime: mime }
      end
    end

    download_record_item_via_file_helper(api_service, message, wx_message, item, storage_dir, basename, filename)
  end

  def chat_history_record_item_cdn_downloadable?(item)
    item[:cdn_data_url].present? && item[:cdn_data_key].present?
  end

  def download_record_item_via_cdn(api_service, item)
    response = api_service.cdn_download_record_item(
      cdn_data_url: item[:cdn_data_url],
      cdn_data_key: item[:cdn_data_key],
      data_id: item[:data_id],
      full_md5: item[:full_md5],
      data_size: item[:data_size],
      is_thumb: 0
    )
    extract_record_item_payload(response)
  end

  def download_record_item_via_file_helper(api_service, message, wx_message, item, storage_dir, basename, filename)
    extension_hint = File.extname(filename).presence || chat_history_attachment_default_extension(item)
    path = storage_dir.join("#{basename}#{extension_hint}")
    response = api_service.forward_record_item_to_file_helper_download(
      file_path: path,
      msgID: wx_message.msg_id,
      newMsgID: wx_message.new_msg_id,
      diagnostic: false
    )
    unless response[:success]
      Rails.logger.warn { "filehelper record item download failed: #{response.inspect}" }
      return nil
    end

    mime = response[:content_type].presence || Marcel::MimeType.for(Pathname.new(path), name: filename)
    { path: path, mime: mime }
  end

  def chat_history_record_item_index(wx_message, data_id)
    payload = WxMessage.parse_chat_history_payload(wx_message.content)
    find_chat_history_record_item_index(payload&.dig(:items), data_id)
  end

  def find_chat_history_record_item_index(items, data_id)
    return nil unless items.is_a?(Array)

    items.each_with_index do |item, index|
      return index if item[:data_id].to_s == data_id.to_s

      nested_index = find_chat_history_record_item_index(item[:items], data_id)
      return nested_index if nested_index
    end
    nil
  end

  def extract_record_item_payload(response)
    payload = response.is_a?(Hash) ? response : {}
    data_node = payload["Data"] || payload[:Data]
    buffer_node = data_node&.[]("data") || data_node&.[](:data) || data_node
    encoded = buffer_node if buffer_node.is_a?(String)
    encoded ||= buffer_node&.[]("Image") || buffer_node&.[](:Image) ||
      buffer_node&.[]("File") || buffer_node&.[](:File) ||
      buffer_node&.[]("Data") || buffer_node&.[](:Data) ||
      buffer_node&.[]("Base64") || buffer_node&.[](:Base64) ||
      buffer_node&.[]("Buffer") || buffer_node&.[](:Buffer) ||
      buffer_node&.[]("buffer") || buffer_node&.[](:buffer) ||
      buffer_node&.[]("FileBase64") || buffer_node&.[](:FileBase64) ||
      buffer_node&.[]("ImageBase64") || buffer_node&.[](:ImageBase64) ||
      payload["Base64"] || payload[:Base64] ||
      payload["FileBase64"] || payload[:FileBase64]
    unless encoded.present?
      Rails.logger.warn { "record item payload missing data: #{payload.inspect}" }
      return nil
    end

    data = Base64.decode64(encoded)
    data.force_encoding(Encoding::BINARY)
    data
  rescue => e
    Rails.logger.error { "record item payload parse error: #{e.message}" }
    nil
  end

  def chat_history_attachment_filename(item)
    title = item[:title].presence || item[:content].presence || item[:data_id].presence || "record-item"
    base_name = sanitize_filename(title, default: "record-item")
    extension_hint = item[:format].present? ? ".#{item[:format].to_s.downcase}" : nil
    extension_hint ||= ".jpg" if item[:type].to_s == "image"
    ensure_extension(base_name, extension_hint)
  end

  def chat_history_attachment_disposition(item)
    item[:type].to_s == "image" ? "inline" : "attachment"
  end

  def chat_history_attachment_default_extension(item)
    extension = item[:format].presence
    return ".#{extension.to_s.downcase}" if extension.present?
    return ".jpg" if item[:type].to_s == "image"

    ".bin"
  end

  def chat_history_attachment_fallback_mime(item)
    item[:type].to_s == "image" ? "image/jpeg" : "application/octet-stream"
  end

  def extract_chunk_payload(response)
    payload = response.is_a?(Hash) ? response : {}
    data_node = payload["Data"] || payload[:Data]
    buffer_node = data_node&.[]("data") || data_node&.[](:data) || data_node
    buffer_base64 = buffer_node&.[]("buffer") || buffer_node&.[](:buffer)
    length_value = buffer_node&.[]("iLen") || buffer_node&.[](:iLen) || data_node&.[]("iLen") || data_node&.[](:iLen)
    unless buffer_base64.present?
      Rails.logger.warn { "chunk payload missing buffer: #{payload.inspect}" }
      return nil
    end

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
      unless response.is_a?(Hash) && (response["Success"] == true || response[:Success] == true || response["Data"].present? || response[:Data].present?)
        Rails.logger.warn { "chunk download upstream response: #{response.inspect}" }
      end
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

  def resolve_file_download_user_name(message, wx_message, file_meta)
    message.chat_room&.wx_id.presence ||
      file_meta[:from_user_name].presence ||
      (wx_message.self_send? ? wx_message.to_user_name.presence : wx_message.from_user_name.presence) ||
      wx_message.from_user_name.presence ||
      wx_message.to_user_name.presence
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
    params.permit(
      :chat_room_id, :msg_type, :content, :file,
      extra: [
        :xml, :source_xml, :sourceXml, :source_message_id,
        :msg_id, :msgID, :new_msg_id, :newMsgID,
        :talker, :sender_user_name, :senderUserName, :title, :desc,
        { items: [ :msg_id, :msgID, :new_msg_id, :newMsgID, :source_xml, :sourceXml ],
          Items: [ :MsgID, :NewMsgID, :SourceXml ] }
      ]
    )
  end

  def hook_message_attrs(args)
    {
      msg_type: args[:msg_type]&.to_i,
      content: args[:content],
      extra: args[:extra]&.to_h || {},
      file: args[:file]
    }
  end

  def hook_context(chat_room, message_attrs)
    {
      room: {
        id: chat_room.id,
        wx_id: chat_room.wx_id,
        name: chat_room.name,
        contact_id: chat_room.contact_id
      },
      message: {
        msg_type: message_attrs[:msg_type],
        content: message_attrs[:content].to_s,
        extra: message_attrs[:extra] || {},
        has_file: message_attrs[:file].present?,
        file: hook_file_context(message_attrs[:file])
      }
    }
  end

  def hook_file_context(file)
    return nil unless file.respond_to?(:original_filename)

    {
      original_filename: file.original_filename,
      content_type: file.content_type,
      size: file.respond_to?(:size) ? file.size : nil
    }
  end

  def apply_before_hook_result(message_attrs, hook_result)
    return unless hook_result["action"].to_s == "modify"

    message = hook_result["message"]
    return unless message.is_a?(Hash)

    message_attrs[:content] = message["content"].to_s if message.key?("content")
    message_attrs[:msg_type] = message["msg_type"].to_i if message.key?("msg_type")
    message_attrs[:extra] = message["extra"] if message["extra"].is_a?(Hash)
  end
end
