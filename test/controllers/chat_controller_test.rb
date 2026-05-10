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
    @message_chat_room = ChatRoom.create!(
      wx_id: "message-room-#{SecureRandom.hex(4)}@chatroom",
      name: "消息命中群聊",
      contact: @contact
    )
    message = Message.create!(
      chat_room: @message_chat_room,
      msg_id: rand(10_000..99_999),
      new_msg_id: rand(10_000..99_999),
      message_time: Time.current
    )
    WxMessage.create!(
      message: message,
      real_msg_type: 1,
      content: "PGroonga 中文消息命中"
    )
  end

  test "search returns matched rooms and contacts" do
    get "/chat/search", params: { q: "中文" }

    assert_response :success
    payload = JSON.parse(response.body)
    assert_equal @chat_room.id, payload["rooms"].first["id"]
    assert_equal @contact.id, payload["contacts"].first["id"]
  end

  test "search returns rooms matched by message content" do
    get "/chat/search", params: { q: "PGroonga 中文消息" }

    assert_response :success
    payload = JSON.parse(response.body)
    assert_includes payload["rooms"].map { |room| room["id"] }, @message_chat_room.id
  end

  test "collapsed desktop sidebar keeps folder rail visible" do
    css = Rails.root.join("app/assets/stylesheets/chat.css").read
    js = Rails.root.join("app/javascript/controllers/chat_controller.js").read

    assert_no_match(/#sidebar\.tg-sidebar-collapsed\s*\{[^}]*width:\s*0\s*!important/m, css)
    assert_match(/#sidebar\.tg-sidebar-collapsed\s+\.tg-sidebar-panel\s*\{[^}]*display:\s*none/m, css)
    assert_match(/sidebarTarget\.style\.width\s*=\s*"88px"/, js)
  end

  test "chat background image is limited to message list and has global setting" do
    css = Rails.root.join("app/assets/stylesheets/chat.css").read
    chat_room_theme = Rails.root.join("app/javascript/controllers/chat_room/chat_room_theme.js").read
    chat_controller = Rails.root.join("app/javascript/controllers/chat_controller.js").read
    chat_view = Rails.root.join("app/views/chat/index.html.erb").read

    assert_no_match(/tg-has-chat-background \.tg-folder-rail/, css)
    assert_no_match(/applyBackgroundStyles\(backgroundTarget, backgroundColor, backgroundImageValue\)/,
      chat_room_theme)
    assert_match(/applyBackgroundStyles\(list, backgroundColor, backgroundImageValue\)/,
      chat_room_theme)
    assert_match(/globalBackgroundImage/, chat_controller)
    assert_match(/data-chat-target="globalBackgroundImageInput"/, chat_view)
  end

  test "chat background image is not scaled or scrolled with messages" do
    css = Rails.root.join("app/assets/stylesheets/chat.css").read
    chat_room_theme = Rails.root.join("app/javascript/controllers/chat_room/chat_room_theme.js").read

    assert_match(/\.tg-app-shell\.tg-has-chat-background \.telegram-message-list\s*\{[^}]*background-size:\s*auto/m,
      css)
    assert_match(/list\.style\.backgroundAttachment\s*=\s*"fixed"/, chat_room_theme)
    assert_no_match(/list\.style\.backgroundAttachment\s*=\s*"local"/, chat_room_theme)
  end

  test "collapsed sidebar toggle avoids chat header avatar area" do
    css = Rails.root.join("app/assets/stylesheets/chat.css").read

    assert_match(/\.tg-app-shell\.tg-sidebar-rail-only \.tg-desktop-sidebar-toggle\s*\{[^}]*left:\s*88px/m,
      css)
    assert_match(/\.tg-app-shell\.tg-sidebar-rail-only \.tg-desktop-sidebar-toggle\s*\{[^}]*top:\s*50%/m,
      css)
    assert_no_match(/\.tg-app-shell\.tg-sidebar-rail-only \.tg-desktop-sidebar-toggle\s*\{[^}]*left:\s*102px/m,
      css)
  end

  test "quoted image messages render inline preview instead of download action" do
    template = Rails.root.join("app/views/chat/_message_templates.html.erb").read
    bubbles_js = Rails.root.join("app/javascript/controllers/chat_room/chat_room_message_bubbles.js").read

    assert_match(/data-role="refer-quoted-image-wrapper"/, template)
    assert_match(/data-role="refer-quoted-image"/, template)
    assert_match(/renderQuotedImagePreview/, bubbles_js)
    assert_match(/controller\.attachmentUrl\("image", refWx\)/, bubbles_js)
    assert_match(/controller\.openMediaPreview/, bubbles_js)
    assert_no_match(/downloadFile[^\n]*refer-quoted-image/, bubbles_js)
  end

  test "forwarded chat history image actions open preview instead of downloading" do
    bubbles_js = Rails.root.join("app/javascript/controllers/chat_room/chat_room_message_bubbles.js").read

    assert_match(/if \(item\.type === "image"\) \{\s*controller\.openMediaPreview/m, bubbles_js)
    assert_match(/controller\.downloadFile\(item\.downloadUrl, filename\)/, bubbles_js)
  end
end
