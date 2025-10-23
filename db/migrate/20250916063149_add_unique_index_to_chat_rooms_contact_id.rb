class AddUniqueIndexToChatRoomsContactId < ActiveRecord::Migration[8.0]
  def change
    remove_index :chat_rooms, :contact_id
    add_index :chat_rooms, :contact_id, unique: true
  end
end
