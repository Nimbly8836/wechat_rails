class Message < ApplicationRecord
  belongs_to :chat_room
  belongs_to :wx_message, foreign_key: :wx_messages_id
  after_create_commit :notify_chat_room
  has_one_attached :file

  def notify_chat_room
    msg = self.wx_message
    Rails.logger.debug "notify_chat_room: #{msg.as_json}"
    return unless msg.msg_source.present?

    payload = {
      chat_room_id: self.chat_room_id,
      chat_room_name: chat_room&.name,
      wx_messages_id: msg.id,
      message_id: self.id,
      content_preview: msg.preview_content&.truncate(50),
      message_time: message_time&.iso8601,
      self_send: msg.self_send
    }.to_json

    # 使用 PG NOTIFY
    NotifyRecord.connection.execute("NOTIFY message, #{NotifyRecord.connection.quote(payload)}")
  end
end
