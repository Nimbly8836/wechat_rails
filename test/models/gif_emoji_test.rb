require "test_helper"

class GifEmojiTest < ActiveSupport::TestCase
  test "file md5 is unique per user" do
    md5 = Digest::MD5.hexdigest("GIF89a")
    users(:one).gif_emojis.create!(file_md5: md5, total_len: 6)

    duplicate = users(:one).gif_emojis.build(file_md5: md5, total_len: 6)
    other_user = users(:two).gif_emojis.build(file_md5: md5, total_len: 6)

    assert_not duplicate.valid?
    assert other_user.valid?
  end
end
