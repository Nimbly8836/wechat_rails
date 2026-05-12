class MessageEventStream
  class << self
    def publish_message!(message, redis: RedisConfig.client)
      payload = payload_for(message)
      return unless payload

      redis.xadd(
        RedisConfig::STREAM_KEY,
        {
          "payload" => payload.to_json,
          "message_id" => message.id.to_s,
          "chat_room_id" => message.chat_room_id.to_s
        },
        approximate: true,
        maxlen: RedisConfig::STREAM_MAXLEN
      )
    end

    def read(last_id:, redis: RedisConfig.client, block_ms: RedisConfig::STREAM_READ_BLOCK_MS, count: RedisConfig::STREAM_READ_COUNT)
      streams = redis.xread(RedisConfig::STREAM_KEY, last_id, block: block_ms, count: count)
      entries = streams.fetch(RedisConfig::STREAM_KEY, [])

      entries.filter_map do |entry_id, fields|
        payload = fields && fields["payload"]
        next if payload.blank?

        { id: entry_id, payload: payload }
      end
    end

    def current_id(redis: RedisConfig.client)
      redis.xrevrange(RedisConfig::STREAM_KEY, "+", "-", count: 1).first&.first || "0-0"
    end

    def payload_for(message)
      wx_message = message.wx_message
      return unless wx_message

      {
        chat_room_id: message.chat_room_id,
        chat_room_name: message.chat_room&.name,
        wx_messages_id: wx_message.id,
        message_id: message.id,
        content_preview: wx_message.preview_content&.truncate(50),
        message_time: message.message_time&.iso8601,
        self_send: wx_message.self_send
      }
    end
  end
end
