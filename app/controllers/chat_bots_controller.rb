class ChatBotsController < ApplicationController
  def index
    render json: {
      bots: bot_scope.order(:name, :id).map { |bot| serialize_bot(bot) }
    }
  end

  def create
    bot = bot_scope.new(bot_params)

    if bot.save
      render json: serialize_bot(bot), status: :created
    else
      render json: { errors: bot.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def update
    bot = bot_scope.find(params[:id])
    bot.assign_attributes(bot_params)

    if bot.save
      render json: serialize_bot(bot)
    else
      render json: { errors: bot.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def destroy
    bot_scope.find(params[:id]).destroy!
    head :no_content
  end

  private

  def bot_scope
    ChatBot.where(user: Current.user)
  end

  def bot_params
    params.require(:bot).permit(:name, :enabled, :code, :timeout_ms)
  rescue ActionController::ParameterMissing
    params.permit(:name, :enabled, :code, :timeout_ms)
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
end
