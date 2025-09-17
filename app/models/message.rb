class Message < ApplicationRecord
  belongs_to :chat_room
  belongs_to :wx_message, foreign_key: :wx_messages_id
end
