class CreateChatRoomHooks < ActiveRecord::Migration[8.0]
  def change
    create_table :chat_room_hooks do |t|
      t.references :chat_room, null: false, foreign_key: true, index: { unique: true }
      t.boolean :enabled, null: false, default: false
      t.text :code, null: false, default: ""
      t.integer :timeout_ms, null: false, default: 1000
      t.datetime :last_error_at
      t.text :last_error

      t.timestamps
    end
  end
end
