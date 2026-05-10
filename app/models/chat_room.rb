class ChatRoom < ApplicationRecord
  belongs_to :contact
  has_many :messages, -> { order(message_time: :desc) }
  has_many :chat_room_members
  has_many :chat_folder_memberships, dependent: :destroy
  has_one :chat_room_hook, dependent: :destroy

  scope :order_by_latest_message, -> {
    left_joins(:messages)
      .group(:id)
      .order(Arel.sql("MAX(messages.message_time) DESC NULLS LAST"))
  }

  scope :keyword_search, ->(query) {
    keyword = pgroonga_query(query)
    return none if keyword.blank?

    matching_ids = joins(:contact)
      .left_joins(messages: :wx_message)
      .where(
        [
          "chat_rooms.name &@~ :keyword",
          "chat_rooms.wx_id &@~ :keyword",
          "contacts.user_name &@~ :keyword",
          "contacts.nick_name &@~ :keyword",
          "contacts.remark &@~ :keyword",
          "contacts.alias &@~ :keyword",
          "wx_messages.content &@~ :keyword",
          "wx_messages.refer_title &@~ :keyword",
          "wx_messages.push_content &@~ :keyword"
        ].join(" OR "),
        keyword: keyword
      )
      .select(:id)
      .distinct

    where(id: matching_ids)
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
