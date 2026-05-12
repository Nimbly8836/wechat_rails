require "test_helper"
require "securerandom"

class MessageTest < ActiveSupport::TestCase
  setup do
    ActiveJob::Base.queue_adapter = :test
  end

  test "fill real msg type" do
    WxMessage.all.each do |msg|
      if msg.real_msg_type.blank?
        msg.real_msg_type = msg.get_real_msg_type
        msg.save
      end
    end
  end

  test "notify_chat_room publishes to message event stream" do
    message = build_message
    published = []

    MessageEventStream.stub(:publish_message!, ->(published_message) { published << published_message }) do
      message.notify_chat_room
    end

    assert_equal [ message ], published
  end

  test "notify_chat_room enqueues retry job when Redis publish fails" do
    message = build_message
    ActiveJob::Base.queue_adapter.enqueued_jobs.clear

    MessageEventStream.stub(:publish_message!, ->(*) { raise Redis::CannotConnectError, "down" }) do
      message.notify_chat_room
    end

    job = ActiveJob::Base.queue_adapter.enqueued_jobs.find { |enqueued| enqueued[:job] == PublishMessageEventJob }
    assert_not_nil job
    assert_equal message.id, job[:args].first
  end

  private

  def build_message
    owner_wxid = "wxid_message_test_owner_#{SecureRandom.hex(4)}"
    remote_wxid = "wxid_message_test_friend_#{SecureRandom.hex(4)}"
    contact = Contact.create!(user_name: remote_wxid, own_wxid: owner_wxid, nick_name: "Message Test")
    chat_room = ChatRoom.create!(contact: contact, wx_id: remote_wxid, name: "Message Test")
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
