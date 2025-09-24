class WsController < ApplicationController
  include ActionController::Live

  def connect
    if Faye::WebSocket.websocket?(request.env)
      ws = Faye::WebSocket.new(request.env)

      ws.on :open do |_event|
        Rails.logger.info "WebSocket opened"
        ws.send("hello from rails #{Time.now}")
      end

      ws.on :message do |event|
        Rails.logger.info "Got message: #{event.data}"
        ws.send("You said: #{event.data}")
      end

      ws.on :close do |_event|
        Rails.logger.info "WebSocket closed"
        ws = nil
      end

      # 必须 return async.rack_response
      return ws.rack_response
    else
      render plain: "Not a WebSocket request"
    end
  end
end
