class MessageEventsController < ApplicationController
  include ActionController::Live

  STREAM_ID_PATTERN = /\A\d+-\d+\z/

  def events
    response.headers["Content-Type"] = "text/event-stream"
    response.headers["Cache-Control"] = "no-cache, no-transform"
    response.headers["Last-Modified"] = Time.now.httpdate
    response.headers["X-Accel-Buffering"] = "no"

    last_id = resume_stream_id
    response.stream.write ": connected\n\n"

    loop do
      break if response.stream.closed?

      entries = MessageEventStream.read(last_id: last_id)
      if entries.empty?
        write_ping
        next
      end

      entries.each do |entry|
        response.stream.write "id: #{entry[:id]}\n" \
                              "data: #{entry[:payload]}\n\n"
        last_id = entry[:id]
      end
    end
  rescue IOError
  rescue ActionController::Live::ClientDisconnected
  rescue Redis::BaseError, RedisClient::Error => e
    Rails.logger.warn("SSE Redis stream failed: #{e.class}: #{e.message}")
  ensure
    response.stream.close
  end

  private

  def resume_stream_id
    stream_id = params[:last_event_id].presence || request.headers["Last-Event-ID"].presence
    return stream_id if stream_id&.match?(STREAM_ID_PATTERN)

    MessageEventStream.current_id
  end

  def write_ping
    response.stream.write "event: ping\n" \
                          "data: {\"timestamp\": \"#{Time.now.utc.iso8601}\"}\n\n"
  end
end
