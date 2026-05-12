class Message < ApplicationRecord
  belongs_to :chat_room
  belongs_to :wx_message, foreign_key: :wx_messages_id
  after_create_commit :notify_chat_room
  has_one_attached :file

  def notify_chat_room
    return unless wx_message

    MessageEventStream.publish_message!(self)
  rescue Redis::BaseError, RedisClient::Error => e
    Rails.logger.warn("Failed to publish message event: message_id=#{id} #{e.class}: #{e.message}")
    PublishMessageEventJob.perform_later(id)
  end
end
