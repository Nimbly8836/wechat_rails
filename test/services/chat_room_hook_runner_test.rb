require "test_helper"
require "json"
require "open3"

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

  test "node runner imports configured packages" do
    payload = run_node_hook(
      code: <<~JS,
        module.exports.beforeSend = async function() {
          const OpenAI = await importPackage('openai')
          return { action: 'modify', message: { content: typeof OpenAI } }
        }
      JS
      node_packages: { openai: "openai" }
    )

    assert payload["ok"]
    assert_equal "modify", payload.dig("result", "action")
    assert_equal "function", payload.dig("result", "message", "content")
  end

  test "node runner rejects packages that are not configured" do
    payload = run_node_hook(
      code: <<~JS,
        module.exports.beforeSend = async function() {
          await importPackage('fs')
          return { action: 'block' }
        }
      JS
      node_packages: {}
    )

    refute payload["ok"]
    assert_match "Node package is not allowed: fs", payload["error"]
  end

  private

  def run_node_hook(code:, node_packages: {})
    input = JSON.generate(
      event: "beforeSend",
      code: code,
      timeout_ms: 1_000,
      context: {},
      node_packages: node_packages
    )
    stdout, stderr, status = Open3.capture3("node", ChatRoomHookRunner::RUNNER_PATH.to_s, stdin_data: input)

    assert status.success?, stderr
    JSON.parse(stdout)
  end
end
