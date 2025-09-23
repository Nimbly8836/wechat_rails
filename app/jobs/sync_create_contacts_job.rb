class SyncCreateContactsJob < ApplicationJob
  queue_as :sync_create_contacts

  def perform(wx_messages, owner_wxid)
    return if wx_messages.blank?

    # 直接从 JSON 收集唯一用户名
    from_user_names = wx_messages.map { |msg| msg["from_user_name"] }.compact.uniq
    return if from_user_names.empty?

    begin
      contact_service = ContactApiService.new(owner_wxid)

      # 已存在的用户名
      existing = Contact.where(own_wxid: owner_wxid, user_name: from_user_names).pluck(:user_name)

      # 需要同步的用户名
      missing = from_user_names - existing
      return if missing.empty?

      missing.each_slice(20) do |batch|
        user_names_param = batch.join(",")
        response = contact_service.fetch_contacts_detail(user_names_param)
        next unless response&.dig("Success")

        contact_list = response.dig("Data", "ContactList") || []
        contact_list.each do |c|
          # 兼容 API 返回格式
          next if c&.dig("UserName", "string").blank?

          attrs = contact_service.parse_contact_data(c)
          attrs[:own_wxid] = owner_wxid
          attrs[:user_name] ||= c.dig("UserName", "string")

          contact = Contact.find_or_initialize_by(own_wxid: owner_wxid, user_name: attrs[:user_name])
          contact.assign_attributes(attrs)
          contact.save!
        end
      end
      Rails.logger.debug "Saved #{missing.count} in message contacts"
    rescue => e
      Rails.logger.error("[sync_create_contacts] failed: #{e.message}\n#{e.backtrace.join("\n")}")
    end
  end
end
