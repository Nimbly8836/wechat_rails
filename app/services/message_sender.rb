# frozen_string_literal: true

class MessageSender
  MESSAGE_TYPES = {
    text: 1,
    image: 3,
    video: 43,
    voice: 34,
    file: 6,
    emoji: 47
  }.freeze

  attr_reader :chat_room, :message_type, :message_content

  def initialize(chat_room, message_type, message_content, extra, file)
    @chat_room = chat_room
    @message_type = message_type.to_i
    @message_content = message_content
    @extra = extra
    @file = file
  end

  def send
    case @message_type.to_i
    when MESSAGE_TYPES[:text]
      res = message_api_service.send_text(@chat_room.wx_id, @message_content, @extra&.dig(:at) || "")
    when MESSAGE_TYPES[:image]
      res = message_api_service.send_image(@chat_room.wx_id, @extra&.dig(:base64))
    when MESSAGE_TYPES[:file]
      res = send_file
    else
      raise ArgumentError, "Unsupported message_type: #{@message_type}"
    end
    Rails.logger.debug { "send message res: #{res.inspect}" }
    unless res&.dig("success") || res&.dig("Success")
      return res
    end
    result = save_send_message(res)
    save_send_image(result[:data]&.dig("id"), @extra&.dig(:base64)) if @message_type.to_i ==
    MESSAGE_TYPES[:image]
    save_send_file(result[:data]&.dig("id"), @file) if @message_type == MESSAGE_TYPES[:file]
    result
  end

  def save_send_message(res)
    return unless @chat_room && @message_type

    # 根据消息类型提取主数据节点
    msg_res = case @message_type.to_i
    when MESSAGE_TYPES[:text]
                res&.dig("Data", "List")&.first
    when MESSAGE_TYPES[:image]
                res&.dig("Data")
    else
                res&.dig("Data")
    end

    return unless msg_res.is_a?(Hash)

    # 统一提取字段，集中处理兼容性问题
    msg_id = msg_res["Msgid"] || msg_res["ClientMsgid"] || msg_res["clientMsgId"] || msg_res["msgId"]
    new_msg_id = msg_res["Newmsgid"] || msg_res["NewMsgId"] || msg_res["newMsgId"]

    timestamp = msg_res["servertime"] || msg_res["CreateTime"]
    msg_time = timestamp.to_i > 0 ? Time.at(timestamp.to_i) : Time.current

    to_user_name = msg_res.dig("ToUserName", "string") ||
                   msg_res.dig("toUserName") ||
                   msg_res.dig("ToUsetName", "string") || # 兼容错误拼写
                   @chat_room.wx_id

    wx_message_attrs = {
      msg_id: msg_id,
      new_msg_id: new_msg_id,
      msg_seq: 0,
      msg_create_time: msg_time,
      msg_type: @message_type.to_i,
      from_user_name: @chat_room.contact&.own_wxid,
      to_user_name: to_user_name,
      content: @message_content,
      self_send: true
    }

    # 特殊类型字段
    wx_message_attrs[:msg_source] = msg_res["MsgSource"] if @message_type == MESSAGE_TYPES[:image]
    wx_message = WxMessage.new(wx_message_attrs)
    wx_message.real_msg_type = @message_type

    unless wx_message.save
      Rails.logger.error("WxMessage 保存失败: #{wx_message.errors.full_messages.join(', ')}")
      return { success: false, message: "保存微信消息失败" }
    end

    message = Message.new(
      wx_messages_id: wx_message.id,
      chat_room_id: @chat_room.id,
      message_time: wx_message.msg_create_time
    )

    unless message.save
      Rails.logger.error("Message 保存失败: #{message.errors.full_messages.join(', ')}")
      return { error: true, message: "保存消息失败" }
    end
    {
      success: true,
      message: "ok",
      data: message.as_json.merge(wx_message: wx_message.as_json)
    }
  rescue => e
    Rails.logger.error("save_send_message 出错: #{e.class} - #{e.message}")
    { success: false, message: "内部错误: #{e.message}" }
  end

  private

  def normalize_type(type)
    return type if MESSAGE_TYPES.key?(type)
    return MESSAGE_TYPES.key(type) if MESSAGE_TYPES.value?(type)

    raise ArgumentError, "Invalid message_type: #{type.inspect}"
  end

  def message_api_service
    @message_api_service ||= MessageApiService.new(@chat_room.contact.own_wxid)
  end

  def save_send_image(message_id, image_base64)
    # 保存目录
    storage_dir = Rails.root.join("storage", "images")
    FileUtils.mkdir_p(storage_dir)

    # 去掉可能带的 data URI 头
    if image_base64 =~ /^data:(image\/\w+);base64,(.+)$/
      mime_type = Regexp.last_match(1)
      data = Regexp.last_match(2)
    else
      mime_type = "image/jpeg"
      data = image_base64
    end

    # 计算扩展名
    ext = Marcel::MimeType.for(StringIO.new(Base64.decode64(data)), name: "image").split("/").last || "jpg"
    filename = "#{message_id}.#{ext}"
    file_path = storage_dir.join(filename)

    # 写入文件
    File.open(file_path, "wb") do |f|
      f.write(Base64.decode64(data))
    end

    file_path.to_s
  end

  def save_send_file(message_id, file)
    return unless file.respond_to?(:tempfile)

    storage_dir = Rails.root.join("storage", "files")
    FileUtils.mkdir_p(storage_dir)

    ext = File.extname(file.original_filename).delete_prefix(".")
    filename = "#{message_id}.#{ext}"
    file_path = storage_dir.join(filename)

    # 从临时文件复制到目标路径
    File.open(file_path, "wb") do |f|
      IO.copy_stream(file.tempfile, f)
    end

    file_path.to_s
  end

  def send_file
    @tool_api_service ||= ToolsApiService.new(@chat_room.contact.own_wxid)
    file_res = @tool_api_service.upload_file(@file)
    unless file_res&.dig("Code").to_i == 0
      return { success: false, message: "Error on upload file" }
    end
    size = file_res&.dig("Data", "totalLen").to_i
    id = file_res&.dig("Data", "mediaId")
    name = @file.original_filename&.to_s
    # set message content file original_filename
    @message_content = name
    message_api_service.send_app_file(@chat_room.contact.user_name,
                                      name,
                                      size,
                                      id,
                                      name&.split(".")&.last)
  end
end
