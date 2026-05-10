class ChatRoomBotRunner
  def initialize(chat_room)
    @chat_room = chat_room
  end

  def run_before_send(context)
    active_bots.each do |bot|
      result = ChatRoomHookRunner.new(bot).run(event: "beforeSend", context: context.merge(bot: bot_context(bot)))
      return result if result["action"].to_s == "block"

      yield result if result["action"].to_s == "modify" && block_given?
    end

    { "action" => "allow" }
  end

  def run_after_send(context)
    active_bots.each do |bot|
      ChatRoomHookRunner.new(bot).run(event: "afterSend", context: context.merge(bot: bot_context(bot)))
    end
  end

  def run_on_message(context)
    active_bots.each do |bot|
      result = ChatRoomHookRunner.new(bot).run(event: "onMessage", context: context.merge(bot: bot_context(bot)))
      yield bot, result if block_given? && result["action"].to_s == "reply"
    end
  end

  private

  def active_bots
    @active_bots ||= @chat_room.chat_bots.where(chat_room_bots: { enabled: true }).merge(ChatBot.where(enabled: true)).where.not(code: [ nil, "" ]).order("chat_room_bots.position ASC", "chat_room_bots.id ASC")
  end

  def bot_context(bot)
    {
      id: bot.id,
      name: bot.name
    }
  end
end
