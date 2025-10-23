class CreateChatRooms < ActiveRecord::Migration[8.0]
  def change
    create_table :chat_rooms do |t|
      t.string :wx_id, null: false
      t.string :name
      t.binary :avatar
      t.json :members, default: []

      t.references :contact, null: false, foreign_key: true

      t.timestamps
    end
  end
end
