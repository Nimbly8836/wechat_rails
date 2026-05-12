require "redis"

module RedisConfig
  STREAM_KEY = ENV.fetch("MESSAGE_EVENT_STREAM_KEY", "wechat_rails:message_events")
  STREAM_MAXLEN = Integer(ENV.fetch("MESSAGE_EVENT_STREAM_MAXLEN", 100_000))
  STREAM_READ_BLOCK_MS = Integer(ENV.fetch("MESSAGE_EVENT_STREAM_READ_BLOCK_MS", 250))
  STREAM_READ_COUNT = Integer(ENV.fetch("MESSAGE_EVENT_STREAM_READ_COUNT", 100))

  module_function

  def client
    Thread.current[:wechat_rails_redis] ||= Redis.new(url: url)
  end

  def url
    ENV.fetch("REDIS_URL", default_url)
  end

  def default_url
    if Rails.env.production?
      "redis://wechat-rails-redis:6379/1"
    else
      "redis://localhost:6379/1"
    end
  end
end
