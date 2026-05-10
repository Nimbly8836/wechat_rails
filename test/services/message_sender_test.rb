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

  test "emoji_payload computes gif base64 file md5 and size" do
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

    payload = sender.send(:emoji_payload)

    assert_equal "data:image/gif;base64,R0lGODlh", payload[:base64]
    assert_equal Digest::MD5.hexdigest("GIF89a"), payload[:file_md5]
    assert_equal 6, payload[:total_len]
  ensure
    tempfile.close!
  end

  test "emoji_payload accepts cached md5 without base64" do
    md5 = Digest::MD5.hexdigest("GIF89a")
    path = Rails.root.join("storage", "emojis", "#{md5}.gif")
    FileUtils.mkdir_p(path.dirname)
    File.binwrite(path, "GIF89a")
    sender = MessageSender.new(@chat_room, 47, "", { file_md5: md5 }, nil)

    payload = sender.send(:emoji_payload)

    assert_nil payload[:base64]
    assert_equal md5, payload[:file_md5]
    assert_equal 6, payload[:total_len]
    assert_equal path.to_s, payload[:cached_path]
  ensure
    FileUtils.rm_f(path) if defined?(path)
  end

  test "send retries cached md5 emoji with server side base64 fallback" do
    md5 = Digest::MD5.hexdigest("GIF89a")
    path = Rails.root.join("storage", "emojis", "#{md5}.gif")
    FileUtils.mkdir_p(path.dirname)
    File.binwrite(path, "GIF89a")
    service = RetryEmojiMessageApiService.new(@chat_room.wx_id)
    sender = MessageSender.new(@chat_room, 47, "", { file_md5: md5 }, nil)

    sender.stub(:message_api_service, service) do
      result = sender.send
      assert_equal true, result[:success]
    end

    assert_equal 2, service.calls.length
    assert_nil service.calls.first[:base64]
    assert_equal "data:image/gif;base64,R0lGODlh", service.calls.second[:base64]
  ensure
    FileUtils.rm_f(path) if defined?(path)
  end

  test "send persists emoji metadata content for local echo" do
    tempfile = Tempfile.new(["emoji", ".gif"])
    tempfile.binmode
    tempfile.write("GIF89a")
    tempfile.rewind

    uploaded = ActionDispatch::Http::UploadedFile.new(
      tempfile: tempfile,
      filename: "emoji.gif",
      type: "image/gif"
    )

    expected_md5 = Digest::MD5.hexdigest("GIF89a")
    service = FakeEmojiMessageApiService.new(@chat_room.wx_id)
    sender = MessageSender.new(@chat_room, 47, "", {}, uploaded)

    sender.stub(:message_api_service, service) do
      result = sender.send

      assert_equal true, result[:success]
    end

    wx_message = WxMessage.order(:id).last
    assert_equal :emoji, wx_message.msg_type.to_sym
    assert_equal :emoji, wx_message.real_msg_type.to_sym
    assert_equal expected_md5, wx_message.emoji_file_md5
    assert_equal %(<msg><emoji md5="#{expected_md5}" /></msg>), wx_message.content
    assert_equal expected_md5, service.last_md5
    assert_equal 6, service.last_total_len
  ensure
    tempfile.close!
    FileUtils.rm_f(Rails.root.join("storage", "emojis", "#{expected_md5}.gif")) if defined?(expected_md5)
  end

  private

  class RetryEmojiMessageApiService
    attr_reader :calls

    def initialize(to_wxid)
      @to_wxid = to_wxid
      @calls = []
    end

    def send_emoji(to_wxid, base64, md5:, total_len:)
      @calls << { to_wxid: to_wxid, base64: base64, md5: md5, total_len: total_len }
      return { "success" => false, "message" => "md5 only unsupported" } if @calls.length == 1

      {
        "success" => true,
        "Data" => {
          "Msgid" => 123_456,
          "Newmsgid" => 789_012,
          "ToUserName" => { "string" => to_wxid },
          "CreateTime" => Time.current.to_i
        }
      }
    end
  end

  class FakeEmojiMessageApiService
    attr_reader :last_md5, :last_total_len

    def initialize(to_wxid)
      @to_wxid = to_wxid
    end

    def send_emoji(to_wxid, _base64, md5:, total_len:)
      @last_md5 = md5
      @last_total_len = total_len

      {
        "success" => true,
        "Data" => {
          "Msgid" => 123_456,
          "Newmsgid" => 789_012,
          "ToUserName" => { "string" => to_wxid },
          "CreateTime" => Time.current.to_i
        }
      }
    end
  end

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
