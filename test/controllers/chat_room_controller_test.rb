require "test_helper"
require "securerandom"

class ChatRoomControllerTest < ActionDispatch::IntegrationTest
  setup do
    post session_path, params: {
      email_address: users(:one).email_address,
      password: "password"
    }

    @contact = Contact.create!(
      user_name: "room-contact-#{SecureRandom.hex(4)}",
      own_wxid: "owner-#{SecureRandom.hex(4)}",
      nick_name: "测试群"
    )
    @chat_room = ChatRoom.create!(
      wx_id: "room-#{SecureRandom.hex(4)}@chatroom",
      name: "搜索群聊",
      contact: @contact
    )
    ChatRoomMember.create!(
      chat_room: @chat_room,
      room_wxid: @chat_room.wx_id,
      user_name: "wxid_member_1",
      nick_name: "张三",
      remark: "产品经理"
    )
    ChatRoomMember.create!(
      chat_room: @chat_room,
      room_wxid: @chat_room.wx_id,
      user_name: "wxid_member_2",
      nick_name: "李四",
      remark: "开发同学"
    )
    message = Message.create!(
      chat_room: @chat_room,
      msg_id: rand(10_000..99_999),
      new_msg_id: rand(10_000..99_999),
      message_time: Time.current
    )
    WxMessage.create!(
      message: message,
      real_msg_type: 1,
      content: "聊天室列表搜索命中"
    )
  end

  test "chat_members supports keyword search" do
    get chat_members_chat_room_path(@chat_room), params: { q: "产品" }

    assert_response :success
    payload = JSON.parse(response.body)
    assert_equal 1, payload.size
    assert_equal "张三", payload.first["nick_name"]
  end

  test "list supports keyword search by message content" do
    get "/chat_room/list", params: { q: "列表搜索命中" }

    assert_response :success
    payload = JSON.parse(response.body)
    assert_includes payload.map { |room| room["id"] }, @chat_room.id
  end
end
