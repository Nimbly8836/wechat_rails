require "test_helper"
require "securerandom"

class ChatControllerTest < ActionDispatch::IntegrationTest
  setup do
    post session_path, params: {
      email_address: users(:one).email_address,
      password: "password"
    }

    @contact = Contact.create!(
      user_name: "contact-#{SecureRandom.hex(4)}",
      own_wxid: "owner-#{SecureRandom.hex(4)}",
      nick_name: "中文联系人",
      remark: "测试备注"
    )
    @chat_room = ChatRoom.create!(
      wx_id: "room-#{SecureRandom.hex(4)}@chatroom",
      name: "中文群聊",
      contact: @contact
    )
  end

  test "search returns matched rooms and contacts" do
    get "/chat/search", params: { q: "中文" }

    assert_response :success
    payload = JSON.parse(response.body)
    assert_equal @chat_room.id, payload["rooms"].first["id"]
    assert_equal @contact.id, payload["contacts"].first["id"]
  end
end
