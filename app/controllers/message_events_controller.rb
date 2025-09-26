class MessageEventsController < ApplicationController
  include ActionController::Live

  def events
    response.headers['Content-Type'] = 'text/event-stream'
    response.headers['Cache-Control'] = 'no-cache'

    # 使用原生 PG 连接
    conn = ActiveRecord::Base.connection.raw_connection # PG::Connection

    # 订阅全局 chat_room 通道
    conn.exec("LISTEN message")

    # 循环监听通知
    loop do
      # wait_for_notify 阻塞等待，有事件才回调
      conn.wait_for_notify do |channel, pid, payload|
        response.stream.write "data: #{payload}\n\n"
      end
    end

  rescue IOError
    # 客户端断开
  ensure
    response.stream.close
  end
end
