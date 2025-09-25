class MessagesController < ApplicationController
  skip_before_action :verify_authenticity_token, only: :callback

  def index
    chat_room_id = params[:chat_room_id]
    before_id = params[:before_id] # 可选，用于加载更多消息

    messages = Message.includes(:wx_message)
                      .where(chat_room_id: chat_room_id)

    # 如果前端传了 before_id，就取更早的消息
    messages = messages.where('id < ?', before_id) if before_id.present?

    messages = messages.order(id: :desc).limit(100)

    render json: messages.reverse.as_json(
      include: {
        wx_message: {
          only: [:msg_type, :content, :from_user_name, :to_user_name,
                 :new_msg_id, :refer_new_msg_id, :refer_title]
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
    Rails.logger.debug "message callback"
    wxid = params[:wxid]
    if wxid.present?
      message_api_service = MessageApiService.new(wxid)
      @contact_service = ContactApiService.new(wxid)
      response = message_api_service.sync_messages(wxid)
      unless response["Success"]
        render json: response and return
      end
      saves = WechatModels::SyncMessageModel.parse_saves(response)
      SaveChatRoomMessageJob.perform_later(saves.as_json, wxid)
      SyncCreateContactsJob.perform_later(saves.as_json, wxid)
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

end


