require "test_helper"
require "securerandom"

class MessageControllerTest < ActionDispatch::IntegrationTest
  setup do
    post session_path, params: {
      email_address: users(:one).email_address,
      password: "password"
    }

    @contact = Contact.create!(
      user_name: "room-contact-#{SecureRandom.hex(4)}",
      own_wxid: "owner-#{SecureRandom.hex(4)}",
      nick_name: "测试联系人"
    )
    @chat_room = ChatRoom.create!(
      wx_id: "room-#{SecureRandom.hex(4)}@chatroom",
      name: "测试群",
      contact: @contact
    )
  end

  test "index serializes large reference ids as strings" do
    referenced_new_msg_id = 9_000_000_000_000_001_234
    referenced = create_message!(
      new_msg_id: referenced_new_msg_id,
      content: "原消息"
    )
    quoted = create_message!(
      new_msg_id: referenced_new_msg_id + 1,
      refer_new_msg_id: referenced_new_msg_id,
      refer_title: "引用标题",
      msg_type: :refer,
      real_msg_type: :quote,
      content: quoted_message_xml(referenced_new_msg_id)
    )

    get chat_room_messages_path(@chat_room)

    assert_response :success
    payload = JSON.parse(response.body)
    quote_payload = payload.find { |item| item["id"] == quoted.id }

    assert_equal referenced_new_msg_id.to_s,
      quote_payload.dig("wx_message", "refer_new_msg_id")
    assert_equal referenced_new_msg_id.to_s,
      quote_payload.dig("referenced_message", "wx_message", "new_msg_id")
    assert_equal referenced.id, quote_payload.dig("referenced_message", "id")
  end

  test "resolve_reference accepts string new_msg_id values" do
    referenced_new_msg_id = 9_000_000_000_000_001_234
    referenced = create_message!(
      new_msg_id: referenced_new_msg_id,
      content: "原消息"
    )

    get resolve_reference_chat_room_messages_path(@chat_room),
      params: { new_msg_id: referenced_new_msg_id.to_s }

    assert_response :success
    payload = JSON.parse(response.body)
    assert_equal referenced.id, payload["id"]
    assert_equal referenced_new_msg_id.to_s, payload.dig("wx_message", "new_msg_id")
  end

  test "resolve_reference returns earliest message when new_msg_id is duplicated" do
    duplicated_new_msg_id = 296_196_776_536_405_682
    older = create_message!(
      new_msg_id: duplicated_new_msg_id,
      content: "较早的原消息",
      message_time: Time.at(1_700_000_000)
    )
    create_message!(
      new_msg_id: duplicated_new_msg_id,
      content: "较晚的重复消息",
      message_time: Time.at(1_700_000_100)
    )

    get resolve_reference_chat_room_messages_path(@chat_room),
      params: { new_msg_id: duplicated_new_msg_id.to_s }

    assert_response :success
    payload = JSON.parse(response.body)
    assert_equal older.id, payload["id"]
    assert_equal "较早的原消息", payload.dig("wx_message", "content")
  end

  test "index uses earliest referenced message when new_msg_id is duplicated" do
    duplicated_new_msg_id = 296_196_776_536_405_682
    older = create_message!(
      new_msg_id: duplicated_new_msg_id,
      content: "较早的原消息",
      message_time: Time.at(1_700_000_000)
    )
    create_message!(
      new_msg_id: duplicated_new_msg_id,
      content: "较晚的重复消息",
      message_time: Time.at(1_700_000_100)
    )
    quoted = create_message!(
      new_msg_id: duplicated_new_msg_id + 1,
      refer_new_msg_id: duplicated_new_msg_id,
      refer_title: "引用标题",
      msg_type: :refer,
      real_msg_type: :quote,
      content: quoted_message_xml(duplicated_new_msg_id),
      message_time: Time.at(1_700_000_200)
    )

    get chat_room_messages_path(@chat_room)

    assert_response :success
    payload = JSON.parse(response.body)
    quote_payload = payload.find { |item| item["id"] == quoted.id }
    assert_equal older.id, quote_payload.dig("referenced_message", "id")
    assert_equal "较早的原消息",
      quote_payload.dig("referenced_message", "wx_message", "content")
  end

  test "index backfills quote metadata from group-prefixed xml and resolves referenced message" do
    referenced_new_msg_id = 3_404_025_882_978_823_795
    referenced = create_message!(
      new_msg_id: referenced_new_msg_id,
      msg_type: :image,
      real_msg_type: :image,
      content: image_xml("b8bd630d79ce44b5cc2dd503ffd879b9")
    )
    quoted = create_message!(
      new_msg_id: referenced_new_msg_id + 1,
      msg_type: :refer,
      real_msg_type: :quote,
      content: quoted_message_xml(
        referenced_new_msg_id,
        title: "这笔订单，是没有收到吗？",
        display_name: "小枫",
        type: 3,
        from_user: "18479154916@chatroom",
        chat_user: "Like_peng",
        content: "Like_peng:\n<?xml version=\"1.0\"?>\n<msg><img md5=\"abc\" /></msg>",
        prefix: "wxid_3gs9e3fkynja12:\n"
      )
    )

    get chat_room_messages_path(@chat_room)

    assert_response :success
    payload = JSON.parse(response.body)
    quote_payload = payload.find { |item| item["id"] == quoted.id }
    assert_equal referenced_new_msg_id.to_s,
      quote_payload.dig("wx_message", "refer_new_msg_id")
    assert_equal "这笔订单，是没有收到吗？",
      quote_payload.dig("wx_message", "refer_title")
    assert_equal referenced.id, quote_payload.dig("referenced_message", "id")
    assert_equal "quote", quote_payload.dig("wx_message", "parsed_message", "type")
    assert_equal "[图片]",
      quote_payload.dig("wx_message", "parsed_message", "quote_preview", "content")
  end

  test "index serializes nested quote preview text without exposing raw xml as preview" do
    quoted = create_message!(
      new_msg_id: 7_057_159_837_024_330_545,
      msg_type: :refer,
      real_msg_type: :quote,
      content: quoted_message_xml(
        nil,
        title: "我这单能也能看到",
        display_name: "东康",
        type: 49,
        from_user: "18479154916@chatroom",
        chat_user: "wxid_3gs9e3fkynja12",
        content: "<msg><appmsg><title>这个就是你刚刚这笔订单推送成功的日志，是推送了的</title><type>57</type></appmsg></msg>",
        prefix: "Like_peng:\n"
      )
    )

    get chat_room_messages_path(@chat_room)

    assert_response :success
    payload = JSON.parse(response.body)
    quote_payload = payload.find { |item| item["id"] == quoted.id }
    parsed_message = quote_payload.dig("wx_message", "parsed_message")

    assert_equal "quote", parsed_message["type"]
    assert_equal "我这单能也能看到", parsed_message["title"]
    assert_equal "这个就是你刚刚这笔订单推送成功的日志，是推送了的",
      parsed_message.dig("quote_preview", "content")
    refute_match(/<msg>|<appmsg>/, parsed_message.dig("quote_preview", "content"))
  end

  test "index supports keyword search for wx_messages content" do
    target = create_message!(
      new_msg_id: 9_000_000_000_000_001_300,
      content: "这是一个中文搜索测试"
    )
    create_message!(
      new_msg_id: 9_000_000_000_000_001_301,
      content: "完全不相关"
    )

    get chat_room_messages_path(@chat_room), params: { q: "中文搜索" }

    assert_response :success
    payload = JSON.parse(response.body)
    assert_equal [target.id], payload.map { |item| item["id"] }
  end

  test "index disables http caching for message polling" do
    create_message!(
      new_msg_id: 9_000_000_000_000_001_400,
      content: "缓存测试"
    )

    get chat_room_messages_path(@chat_room), params: { after_id: 0 }

    assert_response :success
    assert_equal "no-store", response.headers["Cache-Control"]
    assert_equal "no-cache", response.headers["Pragma"]
  end

  test "index serializes and backfills emoji md5 for emoji messages" do
    emoji_md5 = SecureRandom.hex(16)
    emoji_message = create_message!(
      new_msg_id: 9_000_000_000_000_001_450,
      msg_type: :emoji,
      real_msg_type: :emoji,
      content: emoji_xml(emoji_md5)
    )

    get chat_room_messages_path(@chat_room)

    assert_response :success
    payload = JSON.parse(response.body)
    message_payload = payload.find { |item| item["id"] == emoji_message.id }
    assert_equal emoji_md5, message_payload.dig("wx_message", "emoji_md5")
    assert_equal emoji_md5, emoji_message.wx_message.reload.emoji_md5
    assert_nil message_payload.dig("wx_message", "emoji_file_md5")
    assert_equal "/message/emoji/#{emoji_message.id}",
      message_payload.dig("wx_message", "emoji_url")
  end

  test "index serializes emoji file md5 url when cached file fingerprint exists" do
    emoji_md5 = SecureRandom.hex(16)
    emoji_file_md5 = SecureRandom.hex(16)
    emoji_message = create_message!(
      new_msg_id: 9_000_000_000_000_001_451,
      msg_type: :emoji,
      real_msg_type: :emoji,
      content: emoji_xml(emoji_md5),
      emoji_md5: emoji_md5,
      emoji_file_md5: emoji_file_md5
    )

    get chat_room_messages_path(@chat_room)

    assert_response :success
    payload = JSON.parse(response.body)
    message_payload = payload.find { |item| item["id"] == emoji_message.id }
    assert_equal "/message/emoji/#{emoji_message.id}",
      message_payload.dig("wx_message", "emoji_url")
  end

  test "download_emoji backfills file md5 from legacy emoji md5 cache" do
    emoji_md5 = SecureRandom.hex(16)
    cached_file = Rails.root.join("storage", "emojis", "#{emoji_md5}.gif")
    file_md5 = Digest::MD5.hexdigest("GIF89a")
    canonical_file = Rails.root.join("storage", "emojis", "#{file_md5}.gif")
    FileUtils.mkdir_p(cached_file.dirname)
    File.binwrite(cached_file, "GIF89a")
    emoji_message = create_message!(
      new_msg_id: 9_000_000_000_000_001_451,
      msg_type: :emoji,
      real_msg_type: :emoji,
      content: emoji_xml(emoji_md5),
      emoji_md5: emoji_md5
    )

    get "/message/emoji/#{emoji_message.id}"

    assert_response :success
    assert_equal "image/gif", response.media_type
    assert_equal file_md5, emoji_message.wx_message.reload.emoji_file_md5
    assert File.exist?(canonical_file)
  ensure
    FileUtils.rm_f(cached_file) if cached_file
    FileUtils.rm_f(canonical_file) if canonical_file
  end

  test "download_emoji accepts wx_message id as fallback identifier" do
    emoji_md5 = SecureRandom.hex(16)
    cached_file = Rails.root.join("storage", "emojis", "#{emoji_md5}.gif")
    FileUtils.mkdir_p(cached_file.dirname)
    File.binwrite(cached_file, "GIF89a")
    emoji_message = create_message!(
      new_msg_id: 9_000_000_000_000_001_452,
      msg_type: :emoji,
      real_msg_type: :emoji,
      content: emoji_xml(emoji_md5),
      emoji_md5: emoji_md5
    )

    get "/message/emoji/#{emoji_message.wx_message.id}"

    assert_response :success
    assert_equal "image/gif", response.media_type
    assert_equal "GIF89a", response.body
  ensure
    FileUtils.rm_f(cached_file) if cached_file
  end

  test "download_emoji serves cached local gif when content is blank" do
    file_md5 = SecureRandom.hex(16)
    cached_file = Rails.root.join("storage", "emojis", "#{file_md5}.gif")
    FileUtils.mkdir_p(cached_file.dirname)
    File.binwrite(cached_file, "GIF89a")
    emoji_message = create_message!(
      new_msg_id: 9_000_000_000_000_001_452,
      msg_type: :emoji,
      real_msg_type: :emoji,
      content: "",
      emoji_file_md5: file_md5
    )

    get "/message/emoji/#{emoji_message.id}"

    assert_response :success
    assert_equal "image/gif", response.media_type
    assert_equal "GIF89a", response.body
  ensure
    FileUtils.rm_f(cached_file) if cached_file
  end

  test "download_emoji_by_md5 serves cached emoji file" do
    emoji_md5 = SecureRandom.hex(16)
    cached_file = Rails.root.join("storage", "emojis", "#{emoji_md5}.gif")
    FileUtils.mkdir_p(cached_file.dirname)
    File.binwrite(cached_file, "GIF89a")

    get "/message/emoji/md5/#{emoji_md5}"

    assert_response :success
    assert_equal "image/gif", response.media_type
    assert_equal "GIF89a", response.body
  ensure
    FileUtils.rm_f(cached_file) if cached_file
  end

  test "download_emoji_by_md5 follows redirected remote emoji url" do
    emoji_md5 = SecureRandom.hex(16)
    emoji_message = create_message!(
      new_msg_id: 9_000_000_000_000_001_453,
      msg_type: :emoji,
      real_msg_type: :emoji,
      content: emoji_xml(emoji_md5, cdn_url: "https://example.com/start"),
      emoji_md5: emoji_md5
    )
    redirect_response = build_http_response(Net::HTTPFound, code: "302",
      message: "Found", headers: {
        "location" => "https://cdn.example.com/emojis/#{emoji_md5}.gif"
      })
    success_response = build_http_response(Net::HTTPOK, code: "200",
      message: "OK", headers: { "content-type" => "image/gif" },
      body: "GIF89a")
    requested_urls = []
    stored_file = Rails.root.join("storage", "emojis",
      "#{Digest::MD5.hexdigest('GIF89a')}.gif")

    Net::HTTP.stub(:get_response, proc { |uri|
      requested_urls << uri.to_s
      uri.to_s == "https://example.com/start" ? redirect_response : success_response
    }) do
      get "/message/emoji/md5/#{emoji_md5}"
    end

    assert_response :success
    assert_equal "image/gif", response.media_type
    assert_equal "GIF89a", response.body
    assert_equal [
      "https://example.com/start",
      "https://cdn.example.com/emojis/#{emoji_md5}.gif"
    ], requested_urls
    assert_equal Digest::MD5.hexdigest("GIF89a"),
      emoji_message.wx_message.reload.emoji_file_md5
    assert File.exist?(stored_file)
  ensure
    FileUtils.rm_f(stored_file) if stored_file
  end

  test "callback resolves owner wxid before parsing group system messages" do
    ActiveJob::Base.queue_adapter = :test
    group_wxid = @chat_room.wx_id
    owner_wxid = @contact.own_wxid

    post "/message/callback/#{group_wxid}", params: {
      Success: true,
      Data: {
        AddMsgs: [
          {
            "MsgId" => 370_519_749,
            "NewMsgId" => 296_196_776_536_405_682,
            "CreateTime" => Time.current.to_i,
            "MsgType" => 10_000,
            "MsgSeq" => 1,
            "Status" => 3,
            "ImgStatus" => 1,
            "PushContent" => "群消息通知",
            "MsgSource" => "",
            "Content" => { "string" => 'Note: "幸福像花儿一样" is not friends with anyone else in this group chat.' },
            "FromUserName" => { "string" => group_wxid },
            "ToUserName" => { "string" => owner_wxid }
          }
        ]
      }
    }

    assert_response :success
    assert_equal false, WxMessage.order(:id).last.self_send
    save_job = ActiveJob::Base.queue_adapter.enqueued_jobs.find do |job|
      job[:job] == SaveChatRoomMessageJob
    end
    assert_not_nil save_job
    assert_equal owner_wxid, save_job[:args][1]
  end

  test "callback accepts new messages payload format" do
    ActiveJob::Base.queue_adapter = :test
    group_wxid = @chat_room.wx_id
    owner_wxid = @contact.own_wxid

    post "/message/callback/#{group_wxid}", params: {
      Code: 0,
      Success: true,
      Message: "成功",
      Data: {
        HasChanges: true,
        HasNewMessage: true,
        MessageCount: 1,
        Messages: [
          {
            "MsgType" => 1,
            "MsgTypeName" => "text",
            "Talker" => group_wxid,
            "SenderUserName" => "wxid_sender_xxx",
            "Content" => "wxid_sender_xxx:\n你好",
            "ContentText" => "你好"
          }
        ],
        AddMsgs: [
          {
            "Content" => { "string" => "wxid_sender_xxx:\n你好" }
          }
        ]
      }
    }

    assert_response :success
    wx_message = WxMessage.order(:id).last
    assert_equal "text", wx_message.msg_type
    assert_equal "wxid_sender_xxx", wx_message.from_user_name
    assert_equal group_wxid, wx_message.to_user_name
    assert_equal "wxid_sender_xxx:\n你好", wx_message.content
    assert wx_message.msg_id.present?
    assert wx_message.new_msg_id.present?
  end

  private

  def create_message!(new_msg_id:, content:, msg_id: nil, msg_type: :text, real_msg_type: :text,
    refer_new_msg_id: nil, refer_title: nil, message_time: Time.current, emoji_md5: nil, emoji_file_md5: nil)
    wx_message = WxMessage.create!(
      msg_id: msg_id || new_msg_id - 100,
      new_msg_id: new_msg_id,
      msg_seq: new_msg_id % 1000,
      msg_create_time: message_time,
      msg_type: msg_type,
      real_msg_type: real_msg_type,
      from_user_name: "wxid_sender",
      to_user_name: @chat_room.wx_id,
      content: content,
      refer_new_msg_id: refer_new_msg_id,
      refer_title: refer_title,
      emoji_md5: emoji_md5,
      emoji_file_md5: emoji_file_md5,
      self_send: false
    )

    timestamp = Time.current
    result = Message.insert_all!(
      [ {
        chat_room_id: @chat_room.id,
        wx_messages_id: wx_message.id,
        message_time: message_time,
        created_at: timestamp,
        updated_at: timestamp
      } ],
      returning: %w[id]
    )

    Message.includes(:wx_message).find(result.rows.dig(0, 0))
  end

  def quoted_message_xml(referenced_new_msg_id, title: "引用标题", content: "原消息",
    type: 1, display_name: "引用人", from_user: "wxid_sender",
    chat_user: "wxid_sender", prefix: "")
    svrid_node = referenced_new_msg_id.present? ? "<svrid>#{referenced_new_msg_id}</svrid>" : ""

    <<~XML
      #{prefix}<msg>
        <appmsg>
          <type>57</type>
          <title>#{title}</title>
          <refermsg>
            <type>#{type}</type>
            <displayname>#{display_name}</displayname>
            <fromusr>#{from_user}</fromusr>
            <chatusr>#{chat_user}</chatusr>
            #{svrid_node}
            <content>#{ERB::Util.html_escape(content)}</content>
          </refermsg>
        </appmsg>
      </msg>
    XML
  end

  def emoji_xml(emoji_md5, cdn_url: "https://example.com/#{emoji_md5}.gif")
    <<~XML
      <msg>
        <emoji md5="#{emoji_md5}" cdnurl="#{cdn_url}" />
      </msg>
    XML
  end

  def image_xml(image_md5)
    <<~XML
      <msg>
        <img md5="#{image_md5}" />
      </msg>
    XML
  end

  def build_http_response(klass, code:, message:, headers: {}, body: nil)
    response = klass.new("1.1", code, message)
    headers.each do |key, value|
      response[key] = value
    end
    response.instance_variable_set(:@read, true)
    response.instance_variable_set(:@body, body) if body
    response
  end
end
