require "test_helper"

class GifEmojiFoldersControllerTest < ActionDispatch::IntegrationTest
  setup do
    post session_path, params: {
      email_address: users(:one).email_address,
      password: "password"
    }
    GifEmojiFolder.ensure_defaults_for!(users(:one))
    @emoji = users(:one).gif_emojis.create!(file_md5: Digest::MD5.hexdigest("GIF89a"), total_len: 6)
  end

  test "creates custom folder and toggles emoji" do
    post gif_emoji_folders_path, params: { name: "常用" }

    assert_response :created
    folder_id = JSON.parse(response.body).dig("folder", "id")

    patch toggle_emoji_gif_emoji_folder_path(folder_id), params: { gif_emoji_id: @emoji.id }

    assert_response :success
    payload = JSON.parse(response.body)
    folder = payload["folders"].find { |item| item["id"] == folder_id }
    assert_includes folder["emoji_ids"], @emoji.id.to_s
  end

  test "does not destroy built in favorites folder" do
    folder = users(:one).gif_emoji_folders.find_by!(kind: "favorites")

    delete gif_emoji_folder_path(folder)

    assert_response :unprocessable_entity
  end
end
