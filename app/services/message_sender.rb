# frozen_string_literal: true
require "base64"
require "digest/md5"
require "cgi"

class MessageSender
  MESSAGE_TYPES = {
    text: 1,
    image: 3,
    video: 43,
    voice: 34,
    file: 6,
    emoji: 47,
    quote: 49
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
      res = message_api_service.send_text(@chat_room.wx_id, @message_content, extra_value(:at) || "")
    when MESSAGE_TYPES[:image]
      res = message_api_service.send_image(@chat_room.wx_id, extra_value(:base64))
    when MESSAGE_TYPES[:emoji]
      payload = emoji_payload
      return payload if payload.is_a?(Hash) && payload[:success] == false

      @extra ||= {}
      @extra[:base64] = payload[:base64]
      @extra[:md5] = payload[:md5]
      @extra[:total_len] = payload[:total_len]
      res = message_api_service.send_emoji(@chat_room.wx_id, payload[:base64], md5: payload[:md5], total_len: payload[:total_len])
    when MESSAGE_TYPES[:quote]
      reference_message = quoted_reference_message
      return { success: false, message: "引用消息不存在" } unless reference_message

      @message_content = build_quote_xml(reference_message, @message_content.to_s)
      res = message_api_service.send_quote(@chat_room.wx_id, @message_content)
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
    save_send_image(result[:data]&.dig("id"), extra_value(:base64)) if @message_type.to_i ==
    MESSAGE_TYPES[:image]
    save_send_emoji(extra_value(:md5), extra_value(:base64)) if @message_type == MESSAGE_TYPES[:emoji]
    save_send_file(result[:data]&.dig("id"), @file) if @message_type == MESSAGE_TYPES[:file]
    result
  end

  def save_send_message(res)
    return unless @chat_room && @message_type

    # 根据消息类型提取主数据节点
    msg_res = extract_message_response_data(res)

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
      msg_type: persisted_message_type,
      from_user_name: @chat_room.contact&.own_wxid,
      to_user_name: to_user_name,
      content: @message_content,
      self_send: true
    }

    # 特殊类型字段
    wx_message_attrs[:msg_source] = msg_res["MsgSource"] if @message_type == MESSAGE_TYPES[:image]
    if @message_type == MESSAGE_TYPES[:emoji]
      wx_message_attrs[:emoji_md5] = extra_value(:md5)
    end
    if @message_type == MESSAGE_TYPES[:quote]
      quoted = WechatModels::SyncMessageModel.parse_refer_app_msg(@message_content)
      wx_message_attrs[:refer_new_msg_id] = quoted&.dig(:srv_id)
      wx_message_attrs[:refer_title] = quoted&.dig(:title)
    end
    wx_message = WxMessage.new(wx_message_attrs)
    wx_message.real_msg_type = persisted_real_message_type

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

  def extract_message_response_data(res)
    data = res&.dig("Data")
    return data&.first if data.is_a?(Array)

    list = data&.dig("List")
    return list.first if list.is_a?(Array) && list.first.is_a?(Hash)

    return data if data.is_a?(Hash)

    nil
  end

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

  def save_send_emoji(emoji_md5, emoji_base64)
    return if emoji_md5.blank?
    payload = decode_base64_payload(emoji_base64)
    return if payload[:encoded].blank?

    storage_dir = Rails.root.join("storage", "emojis")
    FileUtils.mkdir_p(storage_dir)

    file_path = storage_dir.join("#{emoji_md5}.gif")
    File.binwrite(file_path, Base64.strict_decode64(payload[:encoded]))

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

  def emoji_payload
    base64 = extra_value(:base64)

    if base64.blank?
      return { success: false, message: "缺少表情文件" } unless @file.respond_to?(:tempfile)

      file_name = @file.original_filename.to_s
      content_type = @file.content_type.to_s
      unless content_type == "image/gif" || file_name.downcase.end_with?(".gif")
        return { success: false, message: "仅支持 GIF 表情文件" }
      end

      @file.tempfile.rewind
      data = @file.tempfile.read
      @file.tempfile.rewind
      base64 = "data:image/gif;base64,#{Base64.strict_encode64(data)}"
    end

    payload = decode_base64_payload(base64)
    return { success: false, message: "缺少表情文件" } if payload[:encoded].blank?

    data = Base64.strict_decode64(payload[:encoded])
    mime_type = payload[:mime_type].presence || Marcel::MimeType.for(StringIO.new(data), name: "emoji.gif")
    return { success: false, message: "仅支持 GIF 表情文件" } unless mime_type == "image/gif"

    {
      base64: base64,
      md5: Digest::MD5.hexdigest(data),
      total_len: data.bytesize
    }
  rescue ArgumentError
    { success: false, message: "表情文件编码无效" }
  end

  def decode_base64_payload(base64)
    value = base64.to_s
    match = value.match(/\Adata:(?<mime>[^;]+);base64,(?<data>.+)\z/m)
    return { mime_type: match[:mime], encoded: match[:data] } if match

    { mime_type: nil, encoded: value }
  end

  def extra_value(key)
    return nil unless @extra.respond_to?(:dig)

    @extra.dig(key) || @extra.dig(key.to_s)
  end

  def quoted_reference_message
    reference_message_id = extra_value(:reference_message_id)
    return nil if reference_message_id.blank?

    Message.includes(:wx_message)
           .find_by(id: reference_message_id, chat_room_id: @chat_room.id)
  end

  def build_quote_xml(reference_message, reply_content)
    wx_message = reference_message.wx_message
    raise ArgumentError, "引用消息不存在" unless wx_message

    title = CGI.escapeHTML(reply_content.to_s)
    reference_content = CGI.escapeHTML(quote_preview_content(wx_message))
    reference_sender = CGI.escapeHTML(wx_message.from_user_name.to_s)
    server_id = wx_message.new_msg_id.to_s

    <<~XML.gsub(/\n\s*/, "").strip
      <appmsg appid="" sdkver="0">
        <title>#{title}</title>
        <des />
        <action />
        <type>57</type>
        <showtype>0</showtype>
        <soundtype>0</soundtype>
        <mediatagname />
        <messageext />
        <messageaction />
        <content />
        <contentattr>0</contentattr>
        <url />
        <lowurl />
        <dataurl />
        <lowdataurl />
        <songalbumurl />
        <songlyric />
        <appattach>
          <totallen>0</totallen>
          <attachid />
          <emoticonmd5 />
          <fileext />
          <aeskey />
        </appattach>
        <extinfo />
        <sourceusername />
        <sourcedisplayname />
        <thumburl />
        <md5 />
        <statextstr />
        <refermsg>
          <content>#{reference_content}</content>
          <type>1</type>
          <svrid>#{server_id}</svrid>
          <chatusr>#{reference_sender}</chatusr>
          <fromusr>#{CGI.escapeHTML(@chat_room.wx_id.to_s)}</fromusr>
        </refermsg>
      </appmsg>
    XML
  end

  def quote_preview_content(wx_message)
    case wx_message.real_msg_type.to_sym
    when :text
      wx_message.content.to_s
    when :image
      "[图片]"
    when :emoji
      "[表情]"
    when :voice
      "[语音]"
    when :video
      "[视频]"
    when :file_message
      wx_message.refer_title.presence || "[文件]"
    when :quote
      wx_message.refer_title.presence || "[引用消息]"
    else
      wx_message.preview_content.to_s.presence || "[消息]"
    end
  end

  def persisted_message_type
    return MESSAGE_TYPES[:quote] if @message_type == MESSAGE_TYPES[:quote]

    @message_type.to_i
  end

  def persisted_real_message_type
    return :quote if @message_type == MESSAGE_TYPES[:quote]

    @message_type
  end
end
