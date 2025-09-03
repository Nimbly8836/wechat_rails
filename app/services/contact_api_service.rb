# app/services/contact_service.rb
class ContactService
  def initialize(wx_id = nil)
    @api_service = BaseApiService.instance
    @wx_id = wx_id || BaseApiService.wx_id
  end

  def fetch_contacts(current_wx_seq = 0, current_chatroom_seq = 0)
    path = WechatApis::Contact.list

    response = @api_service.post(path, {
      Wxid: @wx_id,
      CurrentWxcontactSeq: current_wx_seq,
      CurrentChatRoomContactSeq: current_chatroom_seq
    })

    if response[:error]
      Rails.logger.error("获取联系人列表失败: #{response[:message]}")
      return { error: true, message: "获取联系人列表失败" }
    end

    save_contacts(response)

    # 如果CountinueFlag为1，说明还有更多联系人需要获取
    if response.dig("Data", "CountinueFlag") == 1
      next_wx_seq = response.dig("Data", "CurrentWxcontactSeq") || 0
      next_chatroom_seq = response.dig("Data", "CurrentChatRoomContactSeq") || 0

      # 递归获取下一批联系人
      fetch_contacts(next_wx_seq, next_chatroom_seq)
    end

    response
  end

  private

  def save_contacts(response)
    return unless response.dig("Data", "ContactUsernameList").is_a?(Array)

    usernames = response["Data"]["ContactUsernameList"]

    Rails.logger.info("保存 #{usernames.size} 个联系人")

    # 批量插入联系人，忽略已存在的
    usernames.each do |username|
      Contact.find_or_create_by(username: username) do |contact|
        contact.wx_id = @wx_id
      end
    end
  end
end
