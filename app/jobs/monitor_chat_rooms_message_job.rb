class MonitorChatRoomsMessageJob < ApplicationJob
  queue_as :monitor_chat_rooms_message

  def perform(*args)
    # Do something later
  end
end
