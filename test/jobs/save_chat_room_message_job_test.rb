require "test_helper"

class SaveChatRoomMessageJobTest < ActiveJob::TestCase
  test "creates messages after fetching missing contacts for incoming payload" do
    owner_wxid = "wxid_owner"
    remote_wxid = "wxid_friend"
    wx_message = WxMessage.create!(
      msg_id: 101,
      new_msg_id: 202,
      msg_seq: 1,
      msg_create_time: Time.current,
      msg_type: 1,
      from_user_name: remote_wxid,
      to_user_name: owner_wxid,
      content: "hello"
    )

    remote_contact_payload = {
      "UserName" => { "string" => remote_wxid },
      "NickName" => { "string" => "Friend" }
    }

    fake_contact_service = Object.new
    fake_contact_service.define_singleton_method(:fetch_contacts_detail) do |ids|
      raise "unexpected ids: #{ids}" unless ids == remote_wxid

      {
        "Success" => true,
        "Data" => {
          "ContactList" => [ remote_contact_payload ]
        }
      }
    end
    fake_contact_service.define_singleton_method(:parse_contact_data) do |contact_data|
      {
        user_name: contact_data.dig("UserName", "string"),
        nick_name: contact_data.dig("NickName", "string")
      }
    end

    ContactApiService.stub(:new, fake_contact_service) do
      assert_difference("Contact.count", 1) do
        assert_difference("ChatRoom.count", 1) do
          assert_difference("Message.count", 1) do
            SaveChatRoomMessageJob.perform_now([ wx_message.as_json ], owner_wxid)
          end
        end
      end
    end

    message = Message.order(:id).last
    assert_equal wx_message.id, message.wx_messages_id
    assert_equal remote_wxid, message.chat_room.wx_id
    assert_equal owner_wxid, message.chat_room.contact.own_wxid
  end

  test "is idempotent for existing wx_message rows" do
    owner_wxid = "wxid_owner"
    remote_wxid = "wxid_friend"
    contact = Contact.create!(own_wxid: owner_wxid, user_name: remote_wxid, nick_name: "Friend")
    ChatRoom.create!(contact: contact, wx_id: remote_wxid, name: "Friend")
    wx_message = WxMessage.create!(
      msg_id: 301,
      new_msg_id: 302,
      msg_seq: 1,
      msg_create_time: Time.current,
      msg_type: 1,
      from_user_name: remote_wxid,
      to_user_name: owner_wxid,
      content: "hello again"
    )

    payload = [ wx_message.as_json ]

    assert_difference("Message.count", 1) do
      SaveChatRoomMessageJob.perform_now(payload, owner_wxid)
    end

    assert_no_difference("Message.count") do
      SaveChatRoomMessageJob.perform_now(payload, owner_wxid)
    end
  end

  test "routes incoming group messages to the group chat room instead of sender direct chat" do
    owner_wxid = "wxid_owner"
    room_wxid = "123456@chatroom"
    member_wxid = "wxid_member"

    group_contact = Contact.create!(
      own_wxid: owner_wxid,
      user_name: room_wxid,
      nick_name: "Project Group"
    )
    member_contact = Contact.create!(
      own_wxid: owner_wxid,
      user_name: member_wxid,
      nick_name: "Alice"
    )

    group_room = ChatRoom.create!(contact: group_contact, wx_id: room_wxid, name: "Project Group")
    member_room = ChatRoom.create!(contact: member_contact, wx_id: member_wxid, name: "Alice")

    wx_message = WxMessage.create!(
      msg_id: 401,
      new_msg_id: 402,
      msg_seq: 1,
      msg_create_time: Time.current,
      msg_type: 1,
      from_user_name: member_wxid,
      to_user_name: room_wxid,
      content: "group hello"
    )

    assert_difference("Message.count", 1) do
      SaveChatRoomMessageJob.perform_now([ wx_message.as_json ], owner_wxid)
    end

    created_message = Message.order(:id).last
    assert_equal group_room.id, created_message.chat_room_id
    assert_not_equal member_room.id, created_message.chat_room_id
  end
end
