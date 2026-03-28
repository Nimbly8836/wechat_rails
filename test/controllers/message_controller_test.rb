require "test_helper"
require "securerandom"

class MessageControllerTest < ActionDispatch::IntegrationTest
  setup do
    post session_path, params: {
      email_address: users(:one).email_address,
      password: "password"
    }

    @contact = Contact.create!(
      user_name: "room-contact-#{SecureRandom.hex(4)}",
      own_wxid: "owner-#{SecureRandom.hex(4)}",
      nick_name: "测试联系人"
    )
    @chat_room = ChatRoom.create!(
      wx_id: "room-#{SecureRandom.hex(4)}@chatroom",
      name: "测试群",
      contact: @contact
    )
  end

  test "index serializes large reference ids as strings" do
    referenced_new_msg_id = 9_000_000_000_000_001_234
    referenced = create_message!(
      new_msg_id: referenced_new_msg_id,
      content: "原消息"
    )
    quoted = create_message!(
      new_msg_id: referenced_new_msg_id + 1,
      refer_new_msg_id: referenced_new_msg_id,
      refer_title: "引用标题",
      msg_type: :refer,
      real_msg_type: :quote,
      content: quoted_message_xml(referenced_new_msg_id)
    )

    get chat_room_messages_path(@chat_room)

    assert_response :success
    payload = JSON.parse(response.body)
    quote_payload = payload.find { |item| item["id"] == quoted.id }

    assert_equal referenced_new_msg_id.to_s,
      quote_payload.dig("wx_message", "refer_new_msg_id")
    assert_equal referenced_new_msg_id.to_s,
      quote_payload.dig("referenced_message", "wx_message", "new_msg_id")
    assert_equal referenced.id, quote_payload.dig("referenced_message", "id")
  end

  test "resolve_reference accepts string new_msg_id values" do
    referenced_new_msg_id = 9_000_000_000_000_001_234
    referenced = create_message!(
      new_msg_id: referenced_new_msg_id,
      content: "原消息"
    )

    get resolve_reference_chat_room_messages_path(@chat_room),
      params: { new_msg_id: referenced_new_msg_id.to_s }

    assert_response :success
    payload = JSON.parse(response.body)
    assert_equal referenced.id, payload["id"]
    assert_equal referenced_new_msg_id.to_s, payload.dig("wx_message", "new_msg_id")
  end

  private

  def create_message!(new_msg_id:, content:, msg_type: :text, real_msg_type: :text,
    refer_new_msg_id: nil, refer_title: nil)
    wx_message = WxMessage.create!(
      msg_id: new_msg_id - 100,
      new_msg_id: new_msg_id,
      msg_seq: new_msg_id % 1000,
      msg_create_time: Time.current,
      msg_type: msg_type,
      real_msg_type: real_msg_type,
      from_user_name: "wxid_sender",
      to_user_name: @chat_room.wx_id,
      content: content,
      refer_new_msg_id: refer_new_msg_id,
      refer_title: refer_title,
      self_send: false
    )

    timestamp = Time.current
    result = Message.insert_all!(
      [ {
        chat_room_id: @chat_room.id,
        wx_messages_id: wx_message.id,
        message_time: timestamp,
        created_at: timestamp,
        updated_at: timestamp
      } ],
      returning: %w[id]
    )

    Message.includes(:wx_message).find(result.rows.dig(0, 0))
  end

  def quoted_message_xml(referenced_new_msg_id)
    <<~XML
      <msg>
        <appmsg>
          <type>57</type>
          <title>引用标题</title>
        </appmsg>
        <refermsg>
          <svrid>#{referenced_new_msg_id}</svrid>
          <content>原消息</content>
        </refermsg>
      </msg>
    XML
  end
end
