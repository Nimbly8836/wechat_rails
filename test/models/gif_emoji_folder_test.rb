require "test_helper"

class GifEmojiFolderTest < ActiveSupport::TestCase
  test "ensure_defaults_for creates favorites folder" do
    user = users(:one)

    GifEmojiFolder.ensure_defaults_for!(user)

    folder = user.gif_emoji_folders.find_by(kind: "favorites", built_in: true)
    assert_equal "收藏", folder.name
  end
end
