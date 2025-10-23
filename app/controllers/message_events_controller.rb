class MessageEventsController < ApplicationController
  include ActionController::Live

  LISTEN_TIMEOUT = 1 # 秒级超时，避免客户端断开时长时间阻塞

  def events
    response.headers["Content-Type"] = "text/event-stream"
    response.headers["Cache-Control"] = "no-cache"

    NotifyRecord.connection_pool.with_connection do |active_conn|
      pg_conn = active_conn.raw_connection
      pg_conn.exec("LISTEN message")

      # 立即向客户端发送一次心跳，避免浏览器等待数据导致阻塞
      response.stream.write ": connected\n\n"

      loop do
        break if response.stream.closed?

        notified = false
        pg_conn.wait_for_notify(LISTEN_TIMEOUT) do |_channel, _pid, payload|
          notified = true
          response.stream.write "data: #{payload}\n\n"
        end

        unless notified
          response.stream.write "event: ping\n" \
                                  "data: {\"timestamp\": \"#{Time.now.utc.iso8601}\"}\n\n"
        end
      end
    ensure
      pg_conn.exec("UNLISTEN message") if pg_conn
    end

  rescue IOError
    # 客户端断开
  rescue ActionController::Live::ClientDisconnected
    # 提前结束 SSE 循环
  rescue PG::ConnectionBad, PG::UnableToSend => e
    Rails.logger.warn("SSE connection lost: #{e.class}: #{e.message}")
  ensure
    response.stream.close
  end
end
