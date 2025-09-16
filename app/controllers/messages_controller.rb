class MessagesController < ApplicationController
  skip_before_action :verify_authenticity_token, only: :callback

  def index
    messages = Message.where(chat_room_id: params[:chat_room_id]).order(:created_at)
    render json: messages
  end

  def create
    message = Message.create!(message_params)
    ActionCable.server.broadcast(
      "chat_room_#{message.chat_room_id}",
      {
        id: message.id,
        text: message.text,
        from_user_name: message.from_user_name,
        created_at: message.created_at.strftime("%Y-%m-%d %H:%M:%S")
      }
    )
    render json: message
  end

  def callback
    # 主动去同步消息
    if params[:wxid].present?

    end
  end
  private

  def message_params
    params.require(:message).permit(:chat_room_id, :from_user_name, :text)
  end
end


