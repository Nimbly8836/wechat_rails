require "test_helper"

class ChatRoomTest < ActiveSupport::TestCase
  test "official account uses contact description" do
    contact = Contact.new(user_name: "gh_example", own_wxid: "owner")
    chat_room = ChatRoom.new(wx_id: "gh_example", contact: contact)
    refute chat_room.official_account?

    contact.description = "{}"
    assert chat_room.official_account?
  end
end
