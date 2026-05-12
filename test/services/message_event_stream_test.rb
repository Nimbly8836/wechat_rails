require "test_helper"
require "securerandom"

class MessageEventStreamTest < ActiveSupport::TestCase
  setup do
    owner_wxid = "wxid_stream_owner_#{SecureRandom.hex(4)}"
    remote_wxid = "wxid_stream_friend_#{SecureRandom.hex(4)}"
    contact = Contact.create!(user_name: remote_wxid, own_wxid: owner_wxid, nick_name: "Stream Friend")
    @chat_room = ChatRoom.create!(contact: contact, wx_id: contact.user_name, name: "Stream Friend")
    @wx_message = WxMessage.create!(
      msg_id: SecureRandom.random_number(1_000_000),
      new_msg_id: SecureRandom.random_number(1_000_000_000),
      msg_seq: 1,
      msg_create_time: Time.utc(2026, 1, 1, 12, 0, 0),
      msg_type: :text,
      real_msg_type: :text,
      from_user_name: remote_wxid,
      to_user_name: owner_wxid,
      content: "hello stream",
      self_send: false
    )
    Message.insert_all!([
      {
        chat_room_id: @chat_room.id,
        wx_messages_id: @wx_message.id,
        message_time: @wx_message.msg_create_time,
        created_at: Time.current,
        updated_at: Time.current
      }
    ])
    @message = Message.find_by!(wx_messages_id: @wx_message.id)
  end

  test "publishes compatible message payload to Redis stream" do
    redis = FakeRedis.new

    stream_id = MessageEventStream.publish_message!(@message, redis: redis)

    assert_equal "1-0", stream_id
    command = redis.xadds.last
    assert_equal RedisConfig::STREAM_KEY, command[:key]
    assert_equal true, command[:approximate]
    assert_equal RedisConfig::STREAM_MAXLEN, command[:maxlen]
    assert_equal @message.id.to_s, command[:entry]["message_id"]
    assert_equal @chat_room.id.to_s, command[:entry]["chat_room_id"]

    payload = JSON.parse(command[:entry]["payload"])
    assert_equal @chat_room.id, payload["chat_room_id"]
    assert_equal @chat_room.name, payload["chat_room_name"]
    assert_equal @wx_message.id, payload["wx_messages_id"]
    assert_equal @message.id, payload["message_id"]
    assert_equal "hello stream", payload["content_preview"]
    assert_equal "2026-01-01T12:00:00Z", payload["message_time"]
    assert_equal false, payload["self_send"]
  end

  test "reads Redis stream entries as SSE-ready events" do
    redis = FakeRedis.new({
      RedisConfig::STREAM_KEY => [
        [ "10-0", { "payload" => { message_id: 1 }.to_json } ],
        [ "10-1", { "payload" => "" } ]
      ]
    })

    entries = MessageEventStream.read(last_id: "9-0", redis: redis, block_ms: 500, count: 10)

    assert_equal [ { id: "10-0", payload: { message_id: 1 }.to_json } ], entries
    assert_equal({ keys: RedisConfig::STREAM_KEY, ids: "9-0", block: 500, count: 10 }, redis.xreads.last)
  end

  test "uses the latest stream id as the fresh connection cursor" do
    redis = FakeRedis.new({}, [ [ "20-0", { "payload" => "{}" } ] ])

    assert_equal "20-0", MessageEventStream.current_id(redis: redis)
  end

  test "uses zero cursor when the stream does not exist yet" do
    assert_equal "0-0", MessageEventStream.current_id(redis: FakeRedis.new)
  end

  class FakeRedis
    attr_reader :xadds, :xreads

    def initialize(streams = {}, reverse_entries = [])
      @streams = streams
      @reverse_entries = reverse_entries
      @xadds = []
      @xreads = []
    end

    def xadd(key, entry, approximate: nil, maxlen: nil)
      @xadds << { key: key, entry: entry, approximate: approximate, maxlen: maxlen }
      "1-0"
    end

    def xread(keys, ids, block: nil, count: nil)
      @xreads << { keys: keys, ids: ids, block: block, count: count }
      @streams
    end

    def xrevrange(_key, _range_end = "+", _start = "-", count: nil)
      count ? @reverse_entries.first(count) : @reverse_entries
    end
  end
end
