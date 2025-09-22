class MessagesController < ApplicationController
  skip_before_action :verify_authenticity_token, only: :callback

  def index
    messages = Message.includes(:wx_message)
                      .where(chat_room_id: params[:chat_room_id]).limit(100)
    render json: messages.as_json(
      include: {
        wx_message: {
          only: [:msg_type, :content, :from_user_name, :to_user_name,
                 :new_msg_id,
                 :refer_new_msg_id,
                 :refer_title
          ]
        }
      }
    )
  end

  def create
    args = send_message_params
    chat_room = ChatRoom.includes(:contact).find(args[:chat_room_id])
    sender = MessageSender.new(
      chat_room,
      args[:msg_type],
      args[:content],
      args[:extra],
    )
    res = sender.send
    render json: { success: true, result: res }
  end

  def callback
    # 收到回掉消息才去主动去同步消息
    wxid = params[:wxid]
    if wxid.present?
      message_api_service = MessageApiService.new(wxid)
      @contact_service = ContactApiService.new(wxid)
      response = message_api_service.sync_messages(wxid)
      unless response["Success"]
        render json: response and return
      end
      saves = WechatModels::SyncMessageModel.parse_saves(response)
      save_to_chat_room_message(saves, wxid)
      sync_create_contacts(saves, wxid)
      render json: { "save_number": saves.length, "error": false, "message": "success" }
    end
  end

  private

  def send_message_params
    params.require(:chat_room_id)
    params.require(:msg_type)
    params.require(:content)
    params.permit(:chat_room_id, :msg_type, :content, :extra)
  end

  def save_to_chat_room_message(wx_messages, owner_wxid)
    Thread.new do
      begin
        chat_rooms = ChatRoom.joins(:contact)
                             .where(contacts: { own_wxid: owner_wxid })
                             .select(:id, :wx_id)
        chat_room_map = chat_rooms.index_by(&:wx_id)
        chat_room_wx_ids_set = chat_room_map.keys.to_set

        # 过滤有效消息
        valid_messages = wx_messages.select do |msg|
          chat_room_wx_ids_set.include?(msg.from_user_name) || chat_room_wx_ids_set.include?(msg.to_user_name)
        end

        # 转换为 Message 记录
        messages_to_save = valid_messages.map do |msg|
          chat_room = chat_room_map[msg.from_user_name] || chat_room_map[msg.to_user_name]
          next unless chat_room

          {
            chat_room_id: chat_room.id,
            wx_messages_id: msg.id,
            message_time: msg.msg_create_time,
          }
        end.compact

        Message.insert_all(messages_to_save) if messages_to_save.any?
        Rails.logger.debug "Saved #{messages_to_save.count} messages to messages table"
      rescue StandardError => e
        Rails.logger.error "Failed to save messages: #{e.message}"
      end
    end
  end

  def sync_create_contacts(wx_messages, owner_wxid)
    Thread.new do
      begin
        # 1) 收集唯一用户名（数组）
        from_user_names = wx_messages.map(&:from_user_name).compact.uniq
        return if from_user_names&.empty?

        # 2) 找出已经存在的用户名
        existing = Contact.where(own_wxid: owner_wxid, user_name: from_user_names).pluck(:user_name)
        # 3) 需要同步的用户名（在消息里出现但 DB 不存在）
        missing = from_user_names - existing
        return if missing.empty?

        # 4) 按 20 个一批调用 API
        missing.each_slice(20) do |batch|
          user_names_param = batch.join(",") # 根据你的 API 要求调整分隔符

          response = @contact_service.fetch_contacts_detail(user_names_param)
          next unless response && response["Success"]

          contact_list = response.dig("Data", "ContactList") || []
          contact_list.each do |c|
            # 兼容 API 返回格式：UserName 可能是 { "string" => "xxx" } 或直接 "xxx"
            next if c&.dig("UserName", "string").blank?

            attrs = @contact_service.parse_contact_data(c) # 你已有的解析方法
            attrs[:own_wxid] = owner_wxid
            attrs[:user_name] ||= user_name

            # 更新或创建
            contact = Contact.find_or_initialize_by(own_wxid: owner_wxid, user_name: attrs[:user_name])
            contact.assign_attributes(attrs) # 注意 parse_contact_data 返回的键名需要和模型字段对齐
            contact.save!
          end
        end
      rescue => e
        Rails.logger.error("[sync_create_contacts] failed: #{e.message}\n#{e.backtrace.join("\n")}")
      end
    end
  end

end


