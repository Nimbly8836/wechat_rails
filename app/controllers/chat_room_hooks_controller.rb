class ChatRoomHooksController < ApplicationController
  before_action :set_chat_room

  def show
    render json: serialize_hook(hook)
  end

  def update
    hook.assign_attributes(hook_params)

    if hook.save
      render json: serialize_hook(hook)
    else
      render json: { errors: hook.errors.full_messages }, status: :unprocessable_entity
    end
  end

  private

  def set_chat_room
    @chat_room = ChatRoom.find(params[:chat_room_id])
  end

  def hook
    @hook ||= @chat_room.chat_room_hook || @chat_room.build_chat_room_hook
  end

  def hook_params
    params.require(:hook).permit(:enabled, :code, :timeout_ms)
  rescue ActionController::ParameterMissing
    params.permit(:enabled, :code, :timeout_ms)
  end

  def serialize_hook(chat_room_hook)
    {
      enabled: chat_room_hook.enabled?,
      code: chat_room_hook.code.to_s,
      timeout_ms: chat_room_hook.timeout_ms || ChatRoomHook::MIN_TIMEOUT_MS,
      last_error: chat_room_hook.last_error,
      last_error_at: chat_room_hook.last_error_at
    }
  end
end
