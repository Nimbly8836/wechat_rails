class MessageEventsController < ApplicationController
  include ActionController::Live

  def events
    response.headers["Content-Type"] = "text/event-stream"
    response.headers["Cache-Control"] = "no-cache"

    NotifyRecord.connection_pool.with_connection do |active_conn|
      pg_conn = active_conn.raw_connection
      pg_conn.exec("LISTEN message")

      loop do
        pg_conn.wait_for_notify(30) do |_channel, _pid, payload|
          response.stream.write "data: #{payload}\n\n"
        end

        response.stream.write "event: ping\n" \
                                "data: {\"timestamp\": \"#{Time.now.utc.iso8601}\"}\n\n"
      end
    ensure
      pg_conn.exec("UNLISTEN message") if pg_conn
    end

  rescue IOError
    # 客户端断开
  rescue PG::ConnectionBad, PG::UnableToSend => e
    Rails.logger.warn("SSE connection lost: #{e.class}: #{e.message}")
  ensure
    response.stream.close
  end

end
