# app/jobs/save_chat_room_message_job.rb
class SaveChatRoomMessageJob < ApplicationJob
  queue_as :save_chat_room_message

  def perform(wx_messages, owner_wxid)
    return if wx_messages.blank?

    begin
      candidate_message_ids = wx_messages.filter_map { |msg| msg["id"] || msg[:id] }.compact.uniq
      existing_message_ids = Message.where(wx_messages_id: candidate_message_ids).pluck(:wx_messages_id).to_set

      # 先补齐当前批次涉及到的联系人，避免消息保存依赖异步联系人同步的执行顺序。
      candidate_wx_ids = wx_messages.flat_map { |m| [ m["from_user_name"], m["to_user_name"] ] }
                                    .compact
                                    .uniq
      ensure_contacts_for!(candidate_wx_ids, owner_wxid)

      # 1) 预加载当前 owner 的 ChatRoom 映射（按 wx_id）
      chat_rooms = ChatRoom.joins(:contact)
                           .where(contacts: { own_wxid: owner_wxid })
                           .select(:id, :wx_id)
      chat_room_map = chat_rooms.index_by(&:wx_id)

      # 3) 过滤出自己发送的消息（from_user_name == owner_wxid）并将其按照 to_user_name 进行处理
      self_sent_messages = wx_messages.select do |msg|
        msg_id = msg["id"] || msg[:id]
        msg["from_user_name"] == owner_wxid && !existing_message_ids.include?(msg_id)
      end

      # 4) 对于自己发送的消息，根据 to_user_name 查找对应的聊天室
      self_sent_messages.each do |msg|
        to_user_name = msg["to_user_name"]
        chat_room = chat_room_map[to_user_name]

        unless chat_room
          # 如果找不到对应的聊天室，可以选择创建
          chat_room = ensure_chat_rooms_for!([ to_user_name ], owner_wxid).first
          chat_room_map[to_user_name] = chat_room if chat_room
        end

        # 保存消息到对应的聊天室
        if chat_room
          Message.create!(
            chat_room_id: chat_room.id,
            wx_messages_id: msg["id"],
            message_time: msg["msg_create_time"]
          )
          existing_message_ids << msg["id"]
          chat_room.notify_chat_room
        end
      end

      # 5) 继续处理其他消息（来自其他用户的消息）
      other_messages = wx_messages.reject { |msg| msg["from_user_name"] == owner_wxid }

      # 6) 自动创建缺失的 ChatRoom（以 contact_id 为唯一约束）
      missing_wx_ids = other_messages.flat_map { |msg| [ msg["from_user_name"], msg["to_user_name"] ] }
                                      .compact
                                      .uniq
                                      .reject { |wx_id| wx_id == owner_wxid } # 排除自己
                                      .reject { |wx_id| chat_room_map.keys.include?(wx_id) } # 排除已存在的聊天室

      if missing_wx_ids.any?
        created_rooms = ensure_chat_rooms_for!(missing_wx_ids, owner_wxid)
        chat_room_map.merge!(created_rooms.index_by(&:wx_id)) if created_rooms.any?
      end

      chat_room_wx_ids_set = chat_room_map.keys.to_set

      unresolved_wx_ids = missing_wx_ids.reject { |wx_id| chat_room_wx_ids_set.include?(wx_id) }
      if unresolved_wx_ids.any?
        Rails.logger.info("Skipped message save for unresolved wxids: #{unresolved_wx_ids.join(', ')}")
      end

      # 7) 过滤能匹配到 ChatRoom 的消息
      valid_messages = other_messages.select do |msg|
        msg_id = msg["id"] || msg[:id]
        !existing_message_ids.include?(msg_id) && (
          chat_room_wx_ids_set.include?(msg["from_user_name"]) ||
          chat_room_wx_ids_set.include?(msg["to_user_name"])
        )
      end

      # 8) 构造待插入记录
      messages_to_save = valid_messages.map do |msg|
        chat_room = chat_room_map[msg["from_user_name"]] || chat_room_map[msg["to_user_name"]]
        next unless chat_room

        {
          chat_room_id:   chat_room.id,
          wx_messages_id: msg["id"],
          message_time:   msg["msg_create_time"]
        }
      end.compact

      Rails.logger.debug "Insert Message List: #{messages_to_save}"

      # 9) 批量写入与通知（保持你的 insert_all 逻辑）
      if messages_to_save.any?
        result = Message.insert_all(messages_to_save)
        Rails.logger.debug "Insert result: #{result.to_json}"

        message_ids = messages_to_save.map { |m| m[:wx_messages_id] }
        new_messages = Message.includes(:wx_message).where(wx_messages_id: message_ids)
        new_messages.each(&:notify_chat_room)
      end

    rescue StandardError => e
      Rails.logger.error "Failed to save messages: #{e.message}\n#{e.backtrace.join("\n")}"
    end
  end

  private

  def ensure_contacts_for!(wx_ids, owner_wxid)
    candidate_wx_ids = Array(wx_ids).compact.uniq.reject { |wx_id| wx_id == owner_wxid }
    return if candidate_wx_ids.empty?

    existing = Contact.where(own_wxid: owner_wxid, user_name: candidate_wx_ids).pluck(:user_name)
    missing = candidate_wx_ids - existing
    return if missing.empty?

    contact_service = ContactApiService.new(owner_wxid)

    missing.each_slice(20) do |batch|
      response = contact_service.fetch_contacts_detail(batch.join(","))
      next unless response&.dig("Success")

      contact_list = response.dig("Data", "ContactList") || []
      contact_list.each do |contact_data|
        next if contact_data&.dig("UserName", "string").blank?

        attrs = contact_service.parse_contact_data(contact_data)
        attrs[:own_wxid] = owner_wxid
        attrs[:user_name] ||= contact_data.dig("UserName", "string")

        contact = Contact.find_or_initialize_by(own_wxid: owner_wxid, user_name: attrs[:user_name])
        contact.assign_attributes(attrs)
        contact.save!
      end
    end
  end

  # 仅使用现有结构：依赖 chat_rooms.contact_id 唯一索引保证并发安全
  def ensure_chat_rooms_for!(wx_ids, owner_wxid)
    contacts = Contact.where(own_wxid: owner_wxid, user_name: wx_ids)
                  .select(:id, :remark, :nick_name, :user_name, :own_wxid, :member_list, :big_head_img_url, :small_head_img_url)

    contacts.map do |contact|
      chat_room = ChatRoom.find_or_create_by!(contact_id: contact.id) do |cr|
        cr.wx_id   = contact.user_name            # 赋值给现有字段
        cr.name    = contact.remark.presence || contact.nick_name
        cr.members = contact.member_list.as_json
        cr.avatar  = safe_download_avatar(contact.avatar_url)
      end

      # 和你 Controller#create 的行为一致：建完就异步同步成员
      SyncChatRoomMembersJob.perform_later(
        chat_room.id,
        contact.user_name,
        contact.own_wxid,
        contact.member_list.as_json
      )

      chat_room
    rescue => e
      Rails.logger.error "Create ChatRoom failed: contact_id=#{contact.id} user_name=#{contact.user_name} #{e.message}"
      nil
    end.compact
  end

  def safe_download_avatar(url)
    return nil if url.blank?
    URI.open(url, read_timeout: 5).read
  rescue => e
    Rails.logger.warn "Download avatar failed: #{url} #{e.message}"
    nil
  end
end
