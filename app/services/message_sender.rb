# frozen_string_literal: true

class MessageSender
  MESSAGE_TYPES = {
    text: 0,
    image: 1,
    video: 2,
    voice: 3,
    card: 4,
    share_link: 5,
    file: 6,
    auto_file: 7,
    app_msg: 8
  }.freeze

  attr_reader :chat_room, :message_type, :message_content

  def initialize(chat_room, message_type, message_content, extra)
    @chat_room = chat_room
    @message_type = message_type
    @message_content = message_content
    @extra = extra
  end

  def send
    case @message_type
    when MESSAGE_TYPES[:text]
      res = message_api_service.send_text(@chat_room.wx_id, @message_content, @extra&.dig(:at) || "")
    else
      raise ArgumentError, "Unsupported message_type: #{@message_type}"
    end
    save_send_message(res)
  end

  def save_send_message(res)
    msg_res = res&.dig("Data", "List")&.first
    return unless msg_res
    # 先保存到 wx_message 表
    wx_message = WxMessage.create({
                                    msg_id: msg_res.dig("Msgid") ||
                                      msg_res.dig("ClientMsgid") ||
                                      msg_res.dig("clientMsgId"),
                                    new_msg_id: msg_res.dig("Newmsgid") ||
                                      msg_res.dig("NewMsgId") ||
                                      msg_res.dig("newMsgId"),
                                    msg_seq: 0,
                                    msg_create_time: Time.at(msg_res.dig("servertime") ||
                                                             msg_res.dig("CreateTime")),
                                    msg_type: :self_send,
                                    from_user_name: @chat_room.contact.own_wxid,
                                    to_user_name: msg_res.dig("ToUsetName", "string") ||
                                      msg_res.dig("ToUserName", "string") ||
                                      msg_res.dig("toUserName") ||
                                      @chat_room.wx_id,
                                    content: @message_content,
                                  })
    # 保存到当前聊天的消息
    message =  Message.create({
                     wx_messages_id: wx_message.id,
                     chat_room_id: @chat_room.id,
                     message_time: wx_message.msg_create_time
                   })
    # 返回和分页一样的结构
    message.as_json.merge(
      wx_message: wx_message.as_json
    )
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

end
