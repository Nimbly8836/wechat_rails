# app/services/contact_service.rb
class ContactApiService
  def initialize(wx_id = nil)
    @api_service = BaseApiService.instance
    @wx_id = wx_id || BaseApiService.wx_id
  end

  def fetch_contacts(current_wx_seq = 0, current_chatroom_seq = 0)
    path = WechatApis::Contact.list

    response = @api_service.post(path, {
      # Wxid: @wx_id,
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

  # 这里循环同步所有的人的信息
  def sync_contacts_for_init(force: false)
    scope = Contact.where(own_wxid: @wx_id)
    scope = scope.where(nick_name: nil) unless force

    scope.in_batches(of: 20) do |relation|
      user_names = relation.pluck(:user_name).join(",")

      response = fetch_contacts_detail(user_names)
      next unless response && response["Success"]
      contacts = response.dig("Data", "ContactList") || []

      contacts.each do |c|
        next if c["UserName"].present?
        attrs = parse_contact_data(c)

        # 只更新这一批的数据
        relation.where(user_name: attrs[:user_name]).update_all(attrs.merge(updated_at: Time.current))
      end
    end

  end

  def fetch_contacts_detail(ids)
    path = WechatApis::Contact.details
    @api_service.post(path, {
      "ChatRoom": "",
      "Towxids": ids
    })
  end

  # 解析接口返回的单个联系人
  def parse_contact_data(c)
    {
      user_name: c.dig("UserName", "string"),
      nick_name: c.dig("NickName", "string"),
      py_initial: c.dig("Pyinitial", "string"),
      quan_pin: c.dig("QuanPin", "string"),
      sex: c["Sex"],
      remark: c.dig("Remark", "string"),
      remark_py_initial: c.dig("RemarkPyinitial", "string"),
      remark_quan_pin: c.dig("RemarkQuanPin", "string"),
      signature: c["Signature"],
      alias: c["Alias"],
      sns_bg_img: c.dig("SnsUserInfo", "SnsBgobjectId").to_s, # 这里接口里没有现成 bg_img_url，只存 ID？
      country: c["Country"],
      big_head_img_url: c["BigHeadImgUrl"],
      small_head_img_url: c["SmallHeadImgUrl"],
      description: c.dig("CustomizedInfo", "ExternalInfo"), # 这里可能是 JSON，需要你决定怎么存
      card_img_url: c["CardImgUrl"], # 如果有
      label_list: c["LabelList"], # 如果有
      province: c["Province"],
      city: c["City"],
      phone_num_list: c.dig("PhoneNumListInfo", "PhoneNumList")&.to_json # 接口里是结构化的，存 JSON
    }.compact # 去掉 nil
  end

  private

  def save_contacts(response)
    return unless response.dig("Data", "ContactUsernameList").is_a?(Array)

    usernames = response["Data"]["ContactUsernameList"]

    Rails.logger.info("保存 #{usernames.size} 个联系人")

    # 批量插入联系人，忽略已存在的
    usernames.each do |username|
      Contact.find_or_create_by(user_name: username) do |contact|
        contact.own_wxid = @wx_id
      end
    end
  end
end
