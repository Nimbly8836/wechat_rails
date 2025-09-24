class SyncChatRoomMembersJob < ApplicationJob
  queue_as :default

  def perform(chat_room_id, chat_room_wxid, owner_wxid, members)
    contact_service = ContactApiService.new(owner_wxid)
    unless members&.present?
      members.map { |m| m["UserName"] }.compact.uniq.each_slice(20) do |member|
        user_names_param = member.join(",")
        response = contact_service.fetch_contacts_detail(user_names_param)
        next unless response&.dig("Success")

        contact_list = response.dig("Data", "ContactList") || []
        contact_list.each do |c|
          # 兼容 API 返回格式
          next if c&.dig("UserName", "string").blank?

          attrs = contact_service.parse_contact_data(c)

          chat_room_member = ChatRoomMember.find_or_initialize_by(chat_room_id: chat_room_id,
                                                         room_wxid: chat_room_wxid,
                                                         user_name: attrs[:user_name])
          chat_room_member.assign_attributes(attrs)
          chat_room_member.save!
        end
      end
    end
  end
end
