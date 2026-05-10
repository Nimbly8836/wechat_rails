class CreateChatRoomBots < ActiveRecord::Migration[8.0]
  def change
    create_table :chat_room_bots do |t|
      t.references :chat_room, null: false, foreign_key: true
      t.references :chat_bot, null: false, foreign_key: true
      t.boolean :enabled, null: false, default: true
      t.integer :position, null: false, default: 0

      t.timestamps
    end

    add_index :chat_room_bots, [ :chat_room_id, :chat_bot_id ], unique: true
  end
end
