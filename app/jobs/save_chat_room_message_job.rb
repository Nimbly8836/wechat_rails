class SaveChatRoomMessageJob < ApplicationJob
  queue_as :save_chat_room_message

  def perform(wx_messages, owner_wxid)
    return if wx_messages.blank?

    begin
      chat_rooms = ChatRoom.joins(:contact)
                           .where(contacts: { own_wxid: owner_wxid })
                           .select(:id, :wx_id)
      chat_room_map = chat_rooms.index_by(&:wx_id)
      chat_room_wx_ids_set = chat_room_map.keys.to_set

      # 过滤有效消息
      valid_messages = wx_messages.select do |msg|
        chat_room_wx_ids_set.include?(msg["from_user_name"]) ||
          chat_room_wx_ids_set.include?(msg["to_user_name"])
      end

      # 转换为 Message 记录
      messages_to_save = valid_messages.map do |msg|
        chat_room = chat_room_map[msg["from_user_name"]] || chat_room_map[msg["to_user_name"]]
        next unless chat_room

        {
          chat_room_id: chat_room.id,
          wx_messages_id: msg["id"],
          message_time: msg["msg_create_time"],
        }
      end.compact

      Message.insert_all(messages_to_save) if messages_to_save.any?
      # messages_to_save.each do |message|
      #   ActionCable.server.broadcast("chat_room_#{message[:chat_room_id]}", message.as_json)
      # end
      Rails.logger.debug "Saved #{messages_to_save.count} messages to messages table"
      # 在 Message create 后回调
    rescue StandardError => e
      Rails.logger.error "Failed to save messages: #{e.message}\n#{e.backtrace.join("\n")}"
    end
  end
end
