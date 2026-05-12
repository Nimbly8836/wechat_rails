class PublishMessageEventJob < ApplicationJob
  queue_as :default
  retry_on Redis::BaseError, RedisClient::Error, wait: 5.seconds, attempts: 5

  def perform(message_id)
    message = Message.includes(:chat_room, :wx_message).find_by(id: message_id)
    return unless message

    MessageEventStream.publish_message!(message)
  end
end
