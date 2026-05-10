require "json"
require "open3"
require "timeout"

class ChatRoomHookRunner
  RUNNER_PATH = Rails.root.join("app", "javascript", "hooks", "chat_room_hook_runner.js").freeze
  MAX_STDOUT_BYTES = 64.kilobytes

  def initialize(hook)
    @hook = hook
  end

  def run(event:, context:)
    return fallback_result(event) unless @hook&.active?

    stdout, stderr, status = execute_node(event, context)
    raise "#{stderr.presence || 'hook failed'}" unless status.success?
    raise "hook output too large" if stdout.bytesize > MAX_STDOUT_BYTES

    payload = JSON.parse(stdout.presence || "{}")
    raise(payload["error"].presence || "hook failed") unless payload["ok"]

    normalize_result(payload["result"], event)
  rescue Timeout::Error
    record_error("hook timed out")
    fallback_result(event)
  rescue JSON::ParserError => e
    record_error("invalid hook output: #{e.message}")
    fallback_result(event)
  rescue => e
    record_error("#{e.class}: #{e.message}")
    fallback_result(event)
  end

  private

  def execute_node(event, context)
    input = JSON.generate({
      event: event,
      code: @hook.code.to_s,
      timeout_ms: timeout_ms,
      context: context
    })

    Timeout.timeout((timeout_ms / 1000.0) + 0.2) do
      capture_node(input)
    end
  end

  def capture_node(input)
    node_binaries.each_with_index do |binary, index|
      return Open3.capture3(binary, RUNNER_PATH.to_s, stdin_data: input)
    rescue Errno::ENOENT
      raise if index == node_binaries.length - 1
    end
  end

  def node_binaries
    [ ENV["NODE_BINARY"].presence, "node", "nodejs" ].compact.uniq
  end

  def normalize_result(result, event)
    return fallback_result(event) unless result.is_a?(Hash)

    result
  end

  def fallback_result(event)
    event.to_s == "beforeSend" ? { "action" => "allow" } : { "action" => "ignore" }
  end

  def record_error(message)
    @hook.update_columns(
      last_error: message.to_s.truncate(1_000),
      last_error_at: Time.current,
      updated_at: Time.current
    ) if @hook&.persisted?
  end

  def timeout_ms
    @timeout_ms ||= @hook.timeout_ms.to_i.clamp(ChatBot::MIN_TIMEOUT_MS, ChatBot::MAX_TIMEOUT_MS)
  end
end
