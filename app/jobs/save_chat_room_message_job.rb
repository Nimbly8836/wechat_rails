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
          message_time: msg["msg_create_time"]
        }
      end.compact

      Rails.logger.debug "Insert Message List: #{messages_to_save}"

      if messages_to_save.any?
        result = Message.insert_all(messages_to_save)
        Rails.logger.debug "Insert result: #{result.to_json}" # 输出插入结果

        # 批量查出插入的 messages
        message_ids = messages_to_save.map { |m| m[:wx_messages_id] }
        new_messages = Message.includes(:wx_message)
                              .where(wx_messages_id: message_ids)

        new_messages.each do |m|
          m.notify_chat_room
        end
      end

    rescue StandardError => e
      Rails.logger.error "Failed to save messages: #{e.message}\n#{e.backtrace.join("\n")}"
    end
  end
end
