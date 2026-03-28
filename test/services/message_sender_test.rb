require "test_helper"
require "securerandom"
require "tempfile"

class MessageSenderTest < ActiveSupport::TestCase
  setup do
    @contact = Contact.create!(
      user_name: "sender-contact-#{SecureRandom.hex(4)}",
      own_wxid: "owner-#{SecureRandom.hex(4)}",
      nick_name: "发送者"
    )
    @chat_room = ChatRoom.create!(
      wx_id: "room-#{SecureRandom.hex(4)}@chatroom",
      name: "测试群",
      contact: @contact
    )
  end

  test "build_quote_xml embeds reference metadata" do
    wx_message = WxMessage.create!(
      msg_id: 123,
      new_msg_id: 9_000_000_000_000_001_234,
      msg_seq: 1,
      msg_create_time: Time.at(1_700_000_000),
      msg_type: :text,
      real_msg_type: :text,
      from_user_name: "wxid_target_user",
      to_user_name: @chat_room.wx_id,
      content: "原始消息内容",
      self_send: false
    )

    reference_message = create_message_for(wx_message)
    sender = MessageSender.new(@chat_room, 49, "回复一下", {}, nil)

    xml = sender.send(:build_quote_xml, reference_message, "回复一下")

    assert_match(/\A<appmsg/, xml)
    assert_includes xml, "<type>57</type>"
    assert_includes xml, "<title>回复一下</title>"
    assert_includes xml, "<svrid>9000000000000001234</svrid>"
    assert_includes xml, "<content>原始消息内容</content>"
    assert_includes xml, "<chatusr>wxid_target_user</chatusr>"
    assert_includes xml, "<fromusr>#{@chat_room.wx_id}</fromusr>"
  end

  test "emoji_file_metadata computes gif md5 and size" do
    tempfile = Tempfile.new(["emoji", ".gif"])
    tempfile.binmode
    tempfile.write("GIF89a")
    tempfile.rewind

    uploaded = ActionDispatch::Http::UploadedFile.new(
      tempfile: tempfile,
      filename: "emoji.gif",
      type: "image/gif"
    )
    sender = MessageSender.new(@chat_room, 47, "", {}, uploaded)

    metadata = sender.send(:emoji_file_metadata)

    assert_equal Digest::MD5.hexdigest("GIF89a"), metadata[:md5]
    assert_equal 6, metadata[:total_len]
  ensure
    tempfile.close!
  end

  private

  def create_message_for(wx_message)
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
end
