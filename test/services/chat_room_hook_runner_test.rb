require "test_helper"
require "securerandom"

class ChatRoomHookRunnerTest < ActiveSupport::TestCase
  test "before send can modify message" do
    hook = ChatRoomHook.new(
      enabled: true,
      timeout_ms: 500,
      code: <<~JS
        module.exports.beforeSend = async function(ctx) {
          return { action: 'modify', message: { content: ctx.message.content + ' hooked' } }
        }
      JS
    )

    result = ChatRoomHookRunner.new(hook).run(
      event: "beforeSend",
      context: { message: { content: "hello" } }
    )

    assert_equal "modify", result["action"]
    assert_equal "hello hooked", result.dig("message", "content")
  end

  test "before send can block message" do
    hook = ChatRoomHook.new(
      enabled: true,
      timeout_ms: 500,
      code: "module.exports.beforeSend = async function() { return { action: 'block', message: 'nope' } }"
    )

    result = ChatRoomHookRunner.new(hook).run(event: "beforeSend", context: {})

    assert_equal "block", result["action"]
    assert_equal "nope", result["message"]
  end

  test "invalid hook falls back to allow" do
    hook = ChatRoomHook.new(enabled: true, timeout_ms: 500, code: "throw new Error('boom')")

    result = ChatRoomHookRunner.new(hook).run(event: "beforeSend", context: {})

    assert_equal "allow", result["action"]
  end

  test "fetch is available but require is not available in hook sandbox" do
    hook = ChatRoomHook.new(
      enabled: true,
      timeout_ms: 500,
      code: <<~JS
        module.exports.beforeSend = async function() {
          return { action: 'modify', message: { content: `${typeof fetch}:${typeof require}` } }
        }
      JS
    )

    result = ChatRoomHookRunner.new(hook).run(event: "beforeSend", context: {})

    assert_equal "modify", result["action"]
    assert_equal "function:undefined", result.dig("message", "content")
  end

  test "fetch blocks localhost targets" do
    hook = persisted_hook(<<~JS)
      module.exports.beforeSend = async function() {
        await fetch('http://127.0.0.1:3000')
        return { action: 'block', message: 'should not happen' }
      }
    JS

    result = ChatRoomHookRunner.new(hook).run(event: "beforeSend", context: {})

    assert_equal "allow", result["action"]
    assert_match "fetch is blocked for private network addresses", hook.reload.last_error
  end

  test "fetch blocks private network targets" do
    hook = persisted_hook(<<~JS)
      module.exports.beforeSend = async function() {
        await fetch('http://192.168.1.10/api')
        return { action: 'block', message: 'should not happen' }
      }
    JS

    result = ChatRoomHookRunner.new(hook).run(event: "beforeSend", context: {})

    assert_equal "allow", result["action"]
    assert_match "fetch is blocked for private network addresses", hook.reload.last_error
  end

  test "fetch blocks non http protocols" do
    hook = persisted_hook(<<~JS)
      module.exports.beforeSend = async function() {
        await fetch('file:///etc/passwd')
        return { action: 'block', message: 'should not happen' }
      }
    JS

    result = ChatRoomHookRunner.new(hook).run(event: "beforeSend", context: {})

    assert_equal "allow", result["action"]
    assert_match "fetch only supports http and https URLs", hook.reload.last_error
  end

  test "fetch blocks unsupported methods" do
    hook = persisted_hook(<<~JS)
      module.exports.beforeSend = async function() {
        await fetch('https://example.com/api', { method: 'PUT' })
        return { action: 'block', message: 'should not happen' }
      }
    JS

    result = ChatRoomHookRunner.new(hook).run(event: "beforeSend", context: {})

    assert_equal "allow", result["action"]
    assert_match "fetch only supports GET and POST methods", hook.reload.last_error
  end

  private

  def persisted_hook(code)
    contact = Contact.create!(
      user_name: "hook-contact-#{SecureRandom.hex(4)}",
      own_wxid: "owner-#{SecureRandom.hex(4)}",
      nick_name: "Hook Test"
    )
    chat_room = ChatRoom.create!(
      wx_id: "room-#{SecureRandom.hex(4)}@chatroom",
      name: "Hook Test Room",
      contact: contact
    )
    ChatRoomHook.create!(chat_room: chat_room, enabled: true, timeout_ms: 500, code: code)
  end
end
