class AddEmojiFilesFromWxMessage < ActiveRecord::Migration[8.0]
  def change
    add_column(:wx_messages, :emoji_md5, :text)
  end
end
