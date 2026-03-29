class AddEmojiFileMd5ToWxMessages < ActiveRecord::Migration[8.0]
  def change
    add_column :wx_messages, :emoji_file_md5, :text
    add_index :wx_messages, :emoji_file_md5
  end
end
