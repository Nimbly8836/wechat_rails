class ChatRoomBot < ApplicationRecord
  belongs_to :chat_room
  belongs_to :chat_bot

  validates :chat_bot_id, uniqueness: { scope: :chat_room_id }
end
