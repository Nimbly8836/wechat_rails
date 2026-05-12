require "test_helper"

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
          return { action: 'modify', message: { content: `${typeof fetch}:${typeof require}:${typeof process}` } }
        }
      JS
    )

    result = ChatRoomHookRunner.new(hook).run(event: "beforeSend", context: {})

    assert_equal "modify", result["action"]
    assert_equal "function:undefined:undefined", result.dig("message", "content")
  end
end
