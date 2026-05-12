require "test_helper"
require "securerandom"

class PublishMessageEventJobTest < ActiveJob::TestCase
  test "publishes an existing message" do
    message = build_message
    published = []

    MessageEventStream.stub(:publish_message!, ->(published_message) { published << published_message }) do
      PublishMessageEventJob.perform_now(message.id)
    end

    assert_equal [ message ], published
  end

  test "ignores deleted messages" do
    MessageEventStream.stub(:publish_message!, ->(*) { flunk("deleted message should not be published") }) do
      PublishMessageEventJob.perform_now(-1)
    end
  end

  private

  def build_message
    owner_wxid = "wxid_publish_job_owner_#{SecureRandom.hex(4)}"
    remote_wxid = "wxid_publish_job_friend_#{SecureRandom.hex(4)}"
    contact = Contact.create!(user_name: remote_wxid, own_wxid: owner_wxid, nick_name: "Publish Job")
    chat_room = ChatRoom.create!(contact: contact, wx_id: remote_wxid, name: "Publish Job")
    wx_message = WxMessage.create!(
      msg_id: SecureRandom.random_number(1_000_000),
      new_msg_id: SecureRandom.random_number(1_000_000_000),
      msg_seq: 1,
      msg_create_time: Time.current,
      msg_type: :text,
      real_msg_type: :text,
      from_user_name: remote_wxid,
      to_user_name: owner_wxid,
      content: "hello",
      self_send: false
    )

    Message.insert_all!([
      {
        chat_room_id: chat_room.id,
        wx_messages_id: wx_message.id,
        message_time: wx_message.msg_create_time,
        created_at: Time.current,
        updated_at: Time.current
      }
    ])
    Message.find_by!(wx_messages_id: wx_message.id)
  end
end
