class MessagesController < ApplicationController
  skip_before_action :verify_authenticity_token, only: :callback

  def index
    chat_room_id = params[:chat_room_id]
    before_id = params[:before_id] # 可选，用于加载更多消息
    after_id = params[:after_id]

    messages = Message.includes(:wx_message)
                      .where(chat_room_id: chat_room_id)

    # 如果前端传了 before_id，就取更早的消息
    messages = messages.where("id < ?", before_id) if before_id.present?
    messages = messages.where("id >= ?", after_id) if after_id.present?

    messages = messages.order(id: :desc).limit(100).to_a
    refer_ids = messages.filter_map { |msg| msg.wx_message&.refer_new_msg_id }.presence || []
    refer_ids = refer_ids.uniq if refer_ids.present?

    referenced_messages = if refer_ids.present?
                            Message.includes(:wx_message)
                                   .where(chat_room_id: chat_room_id)
                                   .joins(:wx_message)
                                   .where(wx_messages: { new_msg_id: refer_ids })
                                   .to_a
    else
                            []
    end

    referenced_by_new_msg_id = referenced_messages.index_by { |msg| msg.wx_message&.new_msg_id }

    message_json = messages.reverse.map do |message|
      wx_message = message.wx_message
      referenced = wx_message && referenced_by_new_msg_id[wx_message.refer_new_msg_id]

      base = message.as_json(
        include: {
          wx_message: {
            only: [ :msg_type, :content, :from_user_name, :to_user_name,
                   :new_msg_id, :refer_new_msg_id, :refer_title, :self_send, :real_msg_type ]
          }
        }
      )

      base.merge(
        "referenced_message" => referenced&.as_json(
          only: [ :id, :chat_room_id, :created_at, :message_time ],
          include: {
            wx_message: {
              only: [ :msg_type, :content, :from_user_name, :to_user_name,
                     :new_msg_id, :self_send, :real_msg_type ]
            }
          }
        )
      )
    end

    render json: message_json
  end

  def create
    args = send_message_params
    chat_room = ChatRoom.includes(:contact).find(args[:chat_room_id])
    sender = MessageSender.new(
      chat_room,
      args[:msg_type],
      args[:content],
      args[:extra],
    )
    res = sender.send
    render json: { success: true, result: res }
  end

  def callback
    # 收到回掉消息才去主动去同步消息
    Rails.logger.debug "message callback"
    wxid = params[:wxid]
    if wxid.present?
      message_api_service = MessageApiService.new(wxid)
      @contact_service = ContactApiService.new(wxid)
      response = message_api_service.sync_messages(wxid)
      unless response["Success"]
        render json: response and return
      end
      saves = WechatModels::SyncMessageModel.parse_saves(response, wxid)
      SaveChatRoomMessageJob.perform_later(saves.as_json, wxid)
      SyncCreateContactsJob.perform_later(saves.as_json, wxid)
      render json: { "save_number": saves.length, "error": false, "message": "success" }
    end
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
      render json: { error: true, message: "voice conversion failed" }, status: :unprocessable_entity
    end
  end

  def download_emoji
    message = Message.includes(:wx_message, :chat_room).find(params[:id])
    wx_message = message.wx_message

    unless wx_message&.content
      render json: { error: true, message: "emoji message not found" }, status: :not_found and return
    end

    storage_dir = Rails.root.join("storage", "emojis")
    FileUtils.mkdir_p(storage_dir)

    emoji_md5 = wx_message.emoji_md5.presence&.strip
    cdn_url = nil
    existing_path = if emoji_md5.present?
                      Dir.glob(storage_dir.join("#{emoji_md5}.*")).first || (storage_dir.join(emoji_md5) if File.exist?(storage_dir.join(emoji_md5)))
                    end

    return send_emoji_file(existing_path) if existing_path

    emoji_content = wx_message.parse_emoji || {}
    Rails.logger.debug "EMOJI parse : #{emoji_content.inspect}"
    parsed_md5 = emoji_content[:md5].presence&.strip
    cdn_url = emoji_content[:cdn_url].presence

    if emoji_md5.blank? && parsed_md5.present?
      emoji_md5 = parsed_md5
      wx_message.update_column(:emoji_md5, parsed_md5)
      existing_path = Dir.glob(storage_dir.join("#{emoji_md5}.*")).first || (storage_dir.join(emoji_md5) if File.exist?(storage_dir.join(emoji_md5)))
      return send_emoji_file(existing_path) if existing_path
    end

    if emoji_md5.blank? || cdn_url.blank?
      render json: { error: true, message: "emoji metadata missing" }, status: :unprocessable_entity and return
    end

    existing_path = Dir.glob(storage_dir.join("#{emoji_md5}.*")).first
    existing_path ||= storage_dir.join(emoji_md5) if File.exist?(storage_dir.join(emoji_md5))

    uri = URI.parse(cdn_url)
    response = Net::HTTP.get_response(uri)

    unless response.is_a?(Net::HTTPSuccess)
      render json: { error: true, message: "emoji download failed" }, status: :bad_gateway and return
    end

    content_type = response["content-type"]
    extension = determine_extension(uri, content_type)
    file_path = storage_dir.join("#{emoji_md5}#{extension}")

    File.binwrite(file_path, response.body)
    wx_message.update_column(:emoji_md5, emoji_md5) if wx_message.emoji_md5.blank? && emoji_md5.present?

    send_emoji_file(file_path, content_type)
  rescue URI::InvalidURIError, SocketError, Timeout::Error, Errno::ECONNREFUSED => e
    Rails.logger.error { "emoji download error: #{e.message}" }
    render json: { error: true, message: "emoji download error" }, status: :bad_gateway
  end

  def send_emoji_file(path, content_type = nil)
    mime_type = content_type || Marcel::MimeType.for(Pathname.new(path))
    send_file(path, type: mime_type, disposition: "inline")
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

  private

  def send_message_params
    params.require(:chat_room_id)
    params.require(:msg_type)
    params.require(:content)
    params.permit(:chat_room_id, :msg_type, :content, :extra)
  end
end
