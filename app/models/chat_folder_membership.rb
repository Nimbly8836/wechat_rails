class ChatFolderMembership < ApplicationRecord
  belongs_to :chat_folder
  belongs_to :chat_room

  validates :chat_room_id, uniqueness: { scope: :chat_folder_id }
end
