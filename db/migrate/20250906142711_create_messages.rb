class CreateMessages < ActiveRecord::Migration[8.0]
  def change
    create_table :messages do |t|
      t.references :chat_room, null: false, foreign_key: true
      t.string :from_wxid
      t.text :text
      t.string :from_user_name
      t.string :wx_msg_id
      t.string :wx_new_msg_id
      t.boolean :deleted, default: false
      t.timestamps
    end
    add_index :messages, [ :from_wxid, :wx_msg_id, :wx_new_msg_id ], unique: true
  end
end
