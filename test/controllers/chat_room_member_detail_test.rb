require "test_helper"
require "securerandom"

class ChatRoomMemberDetailTest < ActionDispatch::IntegrationTest
  setup do
    post session_path, params: {
      email_address: users(:one).email_address,
      password: "password"
    }

    contact = Contact.create!(
      user_name: "detail-room-#{SecureRandom.hex(4)}@chatroom",
      own_wxid: "owner-#{SecureRandom.hex(4)}",
      nick_name: "详情群"
    )
    @chat_room = ChatRoom.create!(
      wx_id: contact.user_name,
      name: "详情群",
      contact: contact
    )
    @member = ChatRoomMember.create!(
      chat_room: @chat_room,
      room_wxid: @chat_room.wx_id,
      user_name: "wxid_member_detail",
      nick_name: "张三",
      remark: "产品经理",
      alias: "zhangsan",
      signature: "hello",
      city: "上海",
      small_head_img_url: "https://example.com/avatar.jpg"
    )
  end

  test "member_detail returns one room member by user_name" do
    get member_detail_chat_room_path(@chat_room, user_name: @member.user_name)

    assert_response :success
    payload = JSON.parse(response.body)
    assert_equal @member.user_name, payload["user_name"]
    assert_equal "产品经理", payload["display_name"]
    assert_equal "https://example.com/avatar.jpg", payload["avatar_url"]
    assert_equal "hello", payload["signature"]
  end

  test "member_detail returns not found outside current room" do
    get member_detail_chat_room_path(@chat_room, user_name: "missing_member")

    assert_response :not_found
  end
end
