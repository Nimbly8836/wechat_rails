class ChatRoom < ApplicationRecord
  belongs_to :contact
  has_many :messages, -> { order(message_time: :desc) }
  has_many :chat_room_members

  scope :order_by_latest_message, -> {
    left_joins(:messages)
      .group(:id)
      .order(Arel.sql("MAX(messages.message_time) DESC NULLS LAST"))
  }

  def avatar_base64
    if self.avatar.present?
      Base64.strict_encode64(self.avatar)
    else
      nil
    end
  end

end
