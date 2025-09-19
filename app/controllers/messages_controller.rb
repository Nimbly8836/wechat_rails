class MessagesController < ApplicationController
  skip_before_action :verify_authenticity_token, only: :callback

  def index
    messages = Message.includes(:wx_message)
                      .where(chat_room_id: params[:chat_room_id])
    render json: messages.as_json(
      include: {
        wx_message: {
          only: [:msg_type, :content, :from_user_name, :to_user_name] # 想要的字段
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
      response = message_api_service.sync_messages(wxid)
      unless response["Success"]
        render json: response and return
      end
      saves = WechatModels::SyncMessageModel.parse_saves(response)
      save_to_chat_room_message(saves, wxid)
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
end


