class ChatRoom < ApplicationRecord
  belongs_to :contact
  has_many :messages, -> { order(message_time: :desc) }
  has_many :chat_room_members
  has_many :chat_folder_memberships, dependent: :destroy

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

  def latest_wx_message
    messages.first&.wx_message
  end

  def official_account?
    wx_id.to_s.start_with?("gh_") || contact&.official_account?
  end

  def official_account
    official_account?
  end

  def group_chat?
    wx_id.to_s.end_with?("@chatroom")
  end

  def group_chat
    group_chat?
  end

end
