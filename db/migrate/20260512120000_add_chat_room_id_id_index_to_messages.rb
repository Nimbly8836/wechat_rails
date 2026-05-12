class AddChatRoomIdIdIndexToMessages < ActiveRecord::Migration[8.0]
  disable_ddl_transaction!

  def change
    add_index :messages, [ :chat_room_id, :id ], algorithm: :concurrently
  end
end
