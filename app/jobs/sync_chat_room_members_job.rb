class SyncChatRoomMembersJob < ApplicationJob
  queue_as :default

  def perform(chat_room_id, chat_room_wxid, owner_wxid, members)
    members = JSON.parse(members) if members.is_a?(String)

    return if members.blank?

    contact_service = ContactApiService.new(owner_wxid)
    Rails.logger.debug "First SyncMembers #{members[0]['UserName']}" if members[0]

    # 去重处理，确保每批 20 个
    members.map { |m| m["UserName"] }.compact.uniq.each_slice(20) do |member_slice|
      user_names_param = member_slice.join(",")
      response = contact_service.fetch_contacts_detail(user_names_param, chat_room_wxid)
      Rails.logger.debug "contacts details res #{response}"

      next unless response&.dig("Success")

      contact_list = response.dig("Data", "ContactList") || []
      contact_list.each do |c|
        # 兼容 API 返回格式
        next if c.blank? || c.dig("UserName", "string").blank?

        attrs = contact_service.parse_contact_data(c)
        next unless attrs.is_a?(Hash) && attrs[:user_name].present?

        Rails.logger.debug "Creating ChatRoomMember with: chat_room_id=#{chat_room_id}, room_wxid=#{chat_room_wxid}, user_name=#{attrs[:user_name]}"

        chat_room_member = ChatRoomMember.find_or_initialize_by(
          chat_room_id: chat_room_id,
          room_wxid: chat_room_wxid,
          user_name: attrs[:user_name]
        )
        filtered_attrs = attrs.except(:member_list)
        chat_room_member.assign_attributes(filtered_attrs)
        chat_room_member.save!
      rescue => e
        Rails.logger.error "Failed to save ChatRoomMember for user #{attrs[:user_name]}: #{e.message}"
      end
    end
  end
end

