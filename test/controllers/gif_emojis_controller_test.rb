require "test_helper"

class GifEmojisControllerTest < ActionDispatch::IntegrationTest
  setup do
    post session_path, params: {
      email_address: users(:one).email_address,
      password: "password"
    }
    @gif_data = "GIF89a"
    @md5 = Digest::MD5.hexdigest(@gif_data)
    @path = Rails.root.join("storage", "emojis", "#{@md5}.gif")
    FileUtils.mkdir_p(@path.dirname)
    File.binwrite(@path, @gif_data)
  end

  teardown do
    FileUtils.rm_f(@path)
  end

  test "creates gif emoji from cached md5 and favorites it" do
    post gif_emojis_path, params: { file_md5: @md5, favorite: true }

    assert_response :created
    payload = JSON.parse(response.body)
    emoji = payload["emojis"].find { |item| item["file_md5"] == @md5 }
    assert_equal 6, emoji["total_len"]
    assert_equal true, emoji["favorite"]
    assert_equal "/message/emoji/md5/#{@md5}", emoji["preview_url"]
  end

  test "rejects missing cached md5" do
    post gif_emojis_path, params: { file_md5: Digest::MD5.hexdigest("missing") }

    assert_response :not_found
  end

  test "index returns default favorites folder" do
    get gif_emojis_path

    assert_response :success
    payload = JSON.parse(response.body)
    assert payload["folders"].any? { |folder| folder["kind"] == "favorites" }
  end
end
