# app/jobs/save_chat_room_message_job.rb
class SaveChatRoomMessageJob < ApplicationJob
  queue_as :save_chat_room_message
  retry_on StandardError, wait: 5.seconds, attempts: 3

  def perform(wx_messages, owner_wxid)
    return if wx_messages.blank?

    normalized_messages = Array(wx_messages)
    candidate_message_ids = normalized_messages.filter_map { |msg| message_id_for(msg) }.uniq
    existing_message_ids = Message.where(wx_messages_id: candidate_message_ids).pluck(:wx_messages_id).to_set

    target_room_wxids = normalized_messages.filter_map do |msg|
      target_chat_room_wxid_for(msg, owner_wxid)
    end.uniq

    ensure_contacts_for!(target_room_wxids, owner_wxid)

    chat_room_map = ChatRoom.joins(:contact)
                           .where(contacts: { own_wxid: owner_wxid })
                           .select(:id, :wx_id)
                           .index_by(&:wx_id)

    missing_room_wxids = target_room_wxids.reject { |wxid| chat_room_map.key?(wxid) }
    if missing_room_wxids.any?
      created_rooms = ensure_chat_rooms_for!(missing_room_wxids, owner_wxid)
      chat_room_map.merge!(created_rooms.index_by(&:wx_id)) if created_rooms.any?
    end

    unresolved_room_wxids = target_room_wxids.reject { |wxid| chat_room_map.key?(wxid) }
    if unresolved_room_wxids.any?
      Rails.logger.info("Skipped message save for unresolved target wxids: #{unresolved_room_wxids.join(', ')}")
    end

    messages_to_save = normalized_messages.filter_map do |msg|
      msg_id = message_id_for(msg)
      next if msg_id.blank? || existing_message_ids.include?(msg_id)

      target_room_wxid = target_chat_room_wxid_for(msg, owner_wxid)
      chat_room = target_room_wxid.present? ? chat_room_map[target_room_wxid] : nil
      next unless chat_room

      existing_message_ids << msg_id
      {
        chat_room_id: chat_room.id,
        wx_messages_id: msg_id,
        message_time: msg["msg_create_time"] || msg[:msg_create_time]
      }
    end

    Rails.logger.debug { "Insert Message List: #{messages_to_save}" }

    if messages_to_save.any?
      result = Message.insert_all(messages_to_save)
      Rails.logger.debug { "Insert result: #{result.to_json}" }

      message_ids = messages_to_save.map { |message| message[:wx_messages_id] }
      Message.includes(:wx_message).where(wx_messages_id: message_ids).find_each(&:notify_chat_room)
    end
  rescue StandardError => e
    Rails.logger.error "Failed to save messages: #{e.message}\n#{e.backtrace.join("\n")}"
    raise
  end

  private

  def message_id_for(message)
    message["id"] || message[:id]
  end

  def target_chat_room_wxid_for(message, owner_wxid)
    from_user_name = message["from_user_name"] || message[:from_user_name]
    to_user_name = message["to_user_name"] || message[:to_user_name]

    return to_user_name if from_user_name == owner_wxid && to_user_name.present?
    return from_user_name if to_user_name == owner_wxid && from_user_name.present?
    return from_user_name if chat_room_wxid?(from_user_name)
    return to_user_name if chat_room_wxid?(to_user_name)

    from_user_name.presence || to_user_name.presence
  end

  def chat_room_wxid?(wxid)
    wxid.to_s.end_with?("@chatroom")
  end

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

  def ensure_chat_rooms_for!(wx_ids, owner_wxid)
    contacts = Contact.where(own_wxid: owner_wxid, user_name: wx_ids)
                      .select(:id, :remark, :nick_name, :user_name, :own_wxid, :member_list, :big_head_img_url, :small_head_img_url)

    contacts.map do |contact|
      chat_room = ChatRoom.find_or_create_by!(contact_id: contact.id) do |room|
        room.wx_id = contact.user_name
        room.name = contact.remark.presence || contact.nick_name
        room.members = contact.member_list.as_json
        room.avatar = safe_download_avatar(contact.avatar_url)
      end

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
