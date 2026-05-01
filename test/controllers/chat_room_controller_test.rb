require "test_helper"
require "fileutils"
require "securerandom"

class ChatRoomControllerTest < ActionDispatch::IntegrationTest
  setup do
    post session_path, params: {
      email_address: users(:one).email_address,
      password: "password"
    }

    @contact = Contact.create!(
      user_name: "room-contact-#{SecureRandom.hex(4)}",
      own_wxid: "owner-#{SecureRandom.hex(4)}",
      nick_name: "测试群"
    )
    @chat_room = ChatRoom.create!(
      wx_id: "room-#{SecureRandom.hex(4)}@chatroom",
      name: "搜索群聊",
      contact: @contact
    )
    ChatRoomMember.create!(
      chat_room: @chat_room,
      room_wxid: @chat_room.wx_id,
      user_name: "wxid_member_1",
      nick_name: "张三",
      remark: "产品经理"
    )
    ChatRoomMember.create!(
      chat_room: @chat_room,
      room_wxid: @chat_room.wx_id,
      user_name: "wxid_member_2",
      nick_name: "李四",
      remark: "开发同学"
    )
    message = Message.create!(
      chat_room: @chat_room,
      msg_id: rand(10_000..99_999),
      new_msg_id: rand(10_000..99_999),
      message_time: Time.current
    )
    WxMessage.create!(
      message: message,
      real_msg_type: 1,
      content: "聊天室列表搜索命中"
    )

    FileUtils.rm_rf(Rails.root.join("storage", "chat_backgrounds", @chat_room.id.to_s))
  end

  teardown do
    FileUtils.rm_rf(Rails.root.join("storage", "chat_backgrounds", @chat_room.id.to_s)) if @chat_room
  end

  test "chat_members supports keyword search" do
    get chat_members_chat_room_path(@chat_room), params: { q: "产品" }

    assert_response :success
    payload = JSON.parse(response.body)
    assert_equal 1, payload.size
    assert_equal "张三", payload.first["nick_name"]
  end

  test "list supports keyword search by message content" do
    get "/chat_room/list", params: { q: "列表搜索命中" }

    assert_response :success
    payload = JSON.parse(response.body)
    assert_includes payload.map { |room| room["id"] }, @chat_room.id
  end

  test "create returns existing chat room for contact id" do
    post chat_room_index_path, params: { contact_id: @contact.id }, as: :json

    assert_response :success
    payload = JSON.parse(response.body)
    assert_equal @chat_room.id, payload["id"]
    assert_equal @contact.id, payload["contact_id"]
  end

  test "create builds chat room for contact without avatar url" do
    contact = Contact.create!(
      user_name: "friend-#{SecureRandom.hex(4)}",
      own_wxid: "owner-#{SecureRandom.hex(4)}",
      nick_name: "新联系人",
      big_head_img_url: nil,
      small_head_img_url: nil
    )

    assert_difference("ChatRoom.count", 1) do
      post chat_room_index_path, params: { contact_id: contact.id }, as: :json
    end

    assert_response :success
    payload = JSON.parse(response.body)
    assert_equal contact.id, payload["contact_id"]
    assert_equal contact.user_name, payload["wx_id"]
  end

  test "upload_background_image stores image and returns url" do
    image = fixture_file_upload("files/background.png", "image/png")

    post upload_background_image_chat_room_path(@chat_room), params: { image: image }

    assert_response :success
    payload = JSON.parse(response.body)
    assert_equal true, payload["success"]
    assert_match %r{\A/chat_room/#{@chat_room.id}/background_image/[^/]+\.png\z}, payload["url"]

    filename = File.basename(payload["url"])
    stored_path = Rails.root.join("storage", "chat_backgrounds", @chat_room.id.to_s, filename)
    assert_path_exists stored_path
    assert_equal File.binread(file_fixture("background.png")), File.binread(stored_path)
  end

  test "upload_background_image rejects non image files" do
    file = fixture_file_upload("files/not-image.txt", "text/plain")

    post upload_background_image_chat_room_path(@chat_room), params: { image: file }

    assert_response :unprocessable_entity
    payload = JSON.parse(response.body)
    assert_equal false, payload["success"]
    assert_equal "请选择图片文件", payload["error"]
    assert_empty Dir.glob(Rails.root.join("storage", "chat_backgrounds", @chat_room.id.to_s, "*"))
  end

  test "upload_background_image rejects forged image content type" do
    tempfile = file_fixture("not-image.txt").open
    file = ActionDispatch::Http::UploadedFile.new(
      filename: "forged.png",
      type: "image/png",
      tempfile: tempfile
    )

    post upload_background_image_chat_room_path(@chat_room), params: { image: file }

    assert_response :unprocessable_entity
    payload = JSON.parse(response.body)
    assert_equal false, payload["success"]
    assert_equal "请选择图片文件", payload["error"]
    assert_empty Dir.glob(Rails.root.join("storage", "chat_backgrounds", @chat_room.id.to_s, "*"))
  ensure
    tempfile&.close
  end

  test "background_image serves stored image" do
    filename = "stored.png"
    directory = Rails.root.join("storage", "chat_backgrounds", @chat_room.id.to_s)
    FileUtils.mkdir_p(directory)
    File.binwrite(directory.join(filename), File.binread(file_fixture("background.png")))

    get background_image_chat_room_path(@chat_room, filename: filename)

    assert_response :success
    assert_equal "image/png", response.media_type
    assert_equal File.binread(file_fixture("background.png")), response.body
  end

  test "background_image returns 404 for encoded slash traversal filename" do
    get "/chat_room/#{@chat_room.id}/background_image/%2E%2E%2Fsecret.png"

    assert_response :not_found
  end

  test "background_image does not serve same basename from sibling directory" do
    filename = "shared.png"
    sibling_directory = Rails.root.join("storage", "chat_backgrounds", "#{@chat_room.id}-sibling")
    FileUtils.mkdir_p(sibling_directory)
    File.binwrite(sibling_directory.join(filename), File.binread(file_fixture("background.png")))

    get background_image_chat_room_path(@chat_room, filename: filename)

    assert_response :not_found
  ensure
    FileUtils.rm_rf(sibling_directory) if sibling_directory
  end
end
