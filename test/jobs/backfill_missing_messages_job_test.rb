require "test_helper"
require "securerandom"

class BackfillMissingMessagesJobTest < ActiveJob::TestCase
  test "missing_messages_scope joins messages via wx_messages_id" do
    owner_wxid = "owner-#{SecureRandom.hex(4)}"
    contact = Contact.create!(
      user_name: "contact-#{SecureRandom.hex(4)}",
      own_wxid: owner_wxid,
      nick_name: "测试联系人"
    )
    chat_room = ChatRoom.create!(
      wx_id: contact.user_name,
      name: "测试会话",
      contact: contact
    )
    wx_message = WxMessage.create!(
      msg_id: rand(10_000..99_999),
      new_msg_id: rand(100_000..999_999),
      msg_seq: 1,
      msg_create_time: Time.current,
      msg_type: :text,
      real_msg_type: :text,
      from_user_name: owner_wxid,
      to_user_name: contact.user_name,
      content: "hello"
    )
    Message.create!(
      chat_room: chat_room,
      wx_messages_id: wx_message.id,
      message_time: Time.current
    )

    scope = BackfillMissingMessagesJob.new.send(:missing_messages_scope, owner_wxid, nil, nil)

    assert_equal [], scope.to_a
  end
end
