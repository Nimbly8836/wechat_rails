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

    xml = sender.__send__(:build_quote_xml, reference_message, "回复一下")

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

    payload = sender.__send__(:emoji_payload)

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

    payload = sender.__send__(:emoji_payload)

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

  test "send accepts upstream code zero as success" do
    service = CodeZeroMessageApiService.new
    sender = MessageSender.new(@chat_room, 3, "", { base64: Base64.strict_encode64("image") }, nil)

    sender.stub(:message_api_service, service) do
      result = sender.send

      assert_equal true, result[:success]
    end

    assert_equal @chat_room.wx_id, service.last_to_wxid
  ensure
    if (message_id = Message.order(:id).last&.id)
      FileUtils.rm_f(Dir.glob(Rails.root.join("storage", "images", "#{message_id}.*")))
    end
  end

  test "send file returns upload failure when upstream code is missing" do
    uploaded = ActionDispatch::Http::UploadedFile.new(
      tempfile: Tempfile.new(["document", ".txt"]),
      filename: "document.txt",
      type: "text/plain"
    )
    tools_service = FailedFileToolsApiService.new
    message_service = FakeFileMessageApiService.new
    sender = MessageSender.new(@chat_room, 6, "", {}, uploaded)

    sender.instance_variable_set(:@tool_api_service, tools_service)
    sender.stub(:message_api_service, message_service) do
      result = sender.send

      assert_equal false, result[:success]
      assert_nil message_service.last_to_wxid
    end
  ensure
    uploaded&.tempfile&.close! if defined?(uploaded)
  end

  test "send file targets the chat room wxid" do
    tempfile = Tempfile.new(["document", ".txt"])
    tempfile.write("hello")
    tempfile.rewind

    uploaded = ActionDispatch::Http::UploadedFile.new(
      tempfile: tempfile,
      filename: "document.txt",
      type: "text/plain"
    )
    tools_service = FakeFileToolsApiService.new
    message_service = FakeFileMessageApiService.new
    sender = MessageSender.new(@chat_room, 6, "", {}, uploaded)

    sender.instance_variable_set(:@tool_api_service, tools_service)
    sender.stub(:message_api_service, message_service) do
      result = sender.send

      assert_equal true, result[:success]
    end

    assert_equal @chat_room.wx_id, message_service.last_to_wxid
  ensure
    tempfile.close! if defined?(tempfile)
    FileUtils.rm_f(Rails.root.join("storage", "files", "#{Message.order(:id).last&.id}.txt"))
  end

  test "send voice uploads silk payload and stores mp3 preview" do
    tempfile = Tempfile.new(["voice", ".mp3"])
    tempfile.binmode
    tempfile.write("source-audio")
    tempfile.rewind

    uploaded = ActionDispatch::Http::UploadedFile.new(
      tempfile: tempfile,
      filename: "voice.mp3",
      type: "audio/mpeg"
    )
    transcoder = FakeVoiceTranscoder.new
    service = FakeVoiceMessageApiService.new(@chat_room.wx_id)
    sender = MessageSender.new(@chat_room, 34, "", { voice_time: 1234 }, uploaded)

    AudioTranscodingService.stub(:new, transcoder) do
      sender.stub(:message_api_service, service) do
        result = sender.send

        assert_equal true, result[:success]
        message_id = result[:data]["id"] || result[:data][:id]
        preview_path = Rails.root.join("storage", "voices", "#{message_id}.mp3")
        assert_equal "mp3-preview", File.binread(preview_path)
      end
    end

    wx_message = WxMessage.order(:id).last
    assert_equal :voice, wx_message.msg_type.to_sym
    assert_equal :voice, wx_message.real_msg_type.to_sym
    assert_includes wx_message.content, %(voicelength="1234")
    assert_includes wx_message.content, %(length="11")
    assert_includes wx_message.content, %(voiceformat="4")
    assert_equal Base64.strict_encode64("silk-upload"), service.last_base64
    assert_equal 4, service.last_type
    assert_equal 1234, service.last_voice_time
  ensure
    tempfile.close! if defined?(tempfile)
    FileUtils.rm_f(preview_path) if defined?(preview_path)
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

  class CodeZeroMessageApiService
    attr_reader :last_to_wxid

    def send_image(to_wxid, _base64)
      @last_to_wxid = to_wxid
      {
        "Code" => 0,
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

  class FailedFileToolsApiService
    def upload_file(_file)
      { error: true, message: "文件上传失败" }
    end
  end

  class FakeFileToolsApiService
    def upload_file(_file)
      {
        "Code" => 0,
        "Data" => {
          "totalLen" => 5,
          "mediaId" => "media-id"
        }
      }
    end
  end

  class FakeFileMessageApiService
    attr_reader :last_to_wxid

    def send_app_file(to_wxid, _name, _size, _id, _ext_name)
      @last_to_wxid = to_wxid
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

  class FakeVoiceTranscoder
    def transcode_voice_assets!
      {
        upload_binary: "silk-upload",
        upload_base64: Base64.strict_encode64("silk-upload"),
        preview_binary: "mp3-preview",
        voice_format_type: 4
      }
    end
  end

  class FakeVoiceMessageApiService
    attr_reader :last_base64, :last_type, :last_voice_time

    def initialize(to_wxid)
      @to_wxid = to_wxid
    end

    def send_voice(to_wxid, base64, type:, voice_time:)
      @last_base64 = base64
      @last_type = type
      @last_voice_time = voice_time

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
