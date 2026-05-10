require "test_helper"

class ChatRoomHookTest < ActiveSupport::TestCase
  test "active requires enabled and code" do
    hook = ChatRoomHook.new(enabled: false, code: "module.exports.beforeSend = () => ({ action: 'allow' })")
    assert_not hook.active?

    hook.enabled = true
    assert hook.active?

    hook.code = ""
    assert_not hook.active?
  end

  test "timeout is clamped before validation" do
    hook = ChatRoomHook.new(timeout_ms: 99)
    hook.valid?
    assert_equal ChatRoomHook::MIN_TIMEOUT_MS, hook.timeout_ms

    hook.timeout_ms = 10_000
    hook.valid?
    assert_equal ChatRoomHook::MAX_TIMEOUT_MS, hook.timeout_ms
  end
end
