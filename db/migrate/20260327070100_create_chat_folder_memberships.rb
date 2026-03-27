class CreateChatFolderMemberships < ActiveRecord::Migration[8.0]
  def change
    create_table :chat_folder_memberships do |t|
      t.references :chat_folder, null: false, foreign_key: true
      t.references :chat_room, null: false, foreign_key: true
      t.integer :pinned_position

      t.timestamps
    end

    add_index :chat_folder_memberships, [ :chat_folder_id, :chat_room_id ],
      unique: true, name: "index_chat_folder_memberships_on_folder_and_room"
    add_index :chat_folder_memberships, [ :chat_folder_id, :pinned_position ]
  end
end
