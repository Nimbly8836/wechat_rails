class Message < ApplicationRecord
  belongs_to :chat_room
  belongs_to :wx_message, foreign_key: :wx_messages_id
  after_create_commit :notify_chat_room

  def notify_chat_room
    msg = self.wx_message
    Rails.logger.debug "notify_chat_room: #{msg.as_json}"
    return if msg.nil? || msg.self_send

    payload = {
      chat_room_id: self.chat_room_id,
      wx_messages_id: msg.id,
      message_id: self.id,
      content_preview: msg.content&.truncate(50)
    }.to_json

    # 使用 PG NOTIFY
    ActiveRecord::Base.connection.execute("NOTIFY message, '#{payload}'")
  end
end
