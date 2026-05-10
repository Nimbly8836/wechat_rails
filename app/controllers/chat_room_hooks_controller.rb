class ChatRoomHooksController < ApplicationController
  before_action :set_chat_room

  def show
    render json: {
      bots: bot_scope.order(:name, :id).map { |bot| serialize_bot(bot) },
      enabled_bot_ids: enabled_room_bot_ids,
      legacy_hook: serialize_hook(hook)
    }
  end

  def update
    if params.key?(:enabled_bot_ids) || params.dig(:hook, :enabled_bot_ids)
      update_room_bots
      render json: {
        bots: bot_scope.order(:name, :id).map { |bot| serialize_bot(bot) },
        enabled_bot_ids: enabled_room_bot_ids,
        legacy_hook: serialize_hook(hook)
      }
      return
    end

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

  def bot_scope
    ChatBot.where(user: Current.user)
  end

  def update_room_bots
    ids = Array(params[:enabled_bot_ids] || params.dig(:hook, :enabled_bot_ids)).map(&:to_i).uniq
    allowed_ids = bot_scope.where(id: ids).pluck(:id)
    @chat_room.chat_room_bots.where.not(chat_bot_id: allowed_ids).destroy_all

    allowed_ids.each_with_index do |bot_id, index|
      room_bot = @chat_room.chat_room_bots.find_or_initialize_by(chat_bot_id: bot_id)
      room_bot.enabled = true
      room_bot.position = index
      room_bot.save!
    end
  end

  def enabled_room_bot_ids
    @chat_room.chat_room_bots.where(enabled: true).order(:position, :id).pluck(:chat_bot_id)
  end

  def hook_params
    params.require(:hook).permit(:enabled, :code, :timeout_ms)
  rescue ActionController::ParameterMissing
    params.permit(:enabled, :code, :timeout_ms)
  end

  def serialize_bot(bot)
    {
      id: bot.id,
      name: bot.name,
      enabled: bot.enabled?,
      code: bot.code.to_s,
      timeout_ms: bot.timeout_ms || 1000,
      last_error: bot.last_error,
      last_error_at: bot.last_error_at
    }
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
