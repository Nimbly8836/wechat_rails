class CreateChatFolders < ActiveRecord::Migration[8.0]
  def change
    create_table :chat_folders do |t|
      t.references :user, null: false, foreign_key: true
      t.string :name, null: false
      t.string :kind, null: false, default: "custom"
      t.boolean :built_in, null: false, default: false
      t.integer :position, null: false, default: 0

      t.timestamps
    end

    add_index :chat_folders, [ :user_id, :position ]
  end
end
