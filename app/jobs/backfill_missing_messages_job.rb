class BackfillMissingMessagesJob < ApplicationJob
  queue_as :save_chat_room_message

  BATCH_SIZE = 200

  def perform(owner_wxid, wx_message_ids = nil, excluded_wx_message_ids = nil)
    scope = missing_messages_scope(owner_wxid, wx_message_ids, excluded_wx_message_ids)

    scope.find_in_batches(batch_size: BATCH_SIZE) do |batch|
      payload = batch.map do |wx_message|
        {
          "id" => wx_message.id,
          "from_user_name" => wx_message.from_user_name,
          "to_user_name" => wx_message.to_user_name,
          "msg_create_time" => wx_message.msg_create_time
        }
      end

      SaveChatRoomMessageJob.perform_now(payload, owner_wxid)
    end
  end

  private

  def missing_messages_scope(owner_wxid, wx_message_ids, excluded_wx_message_ids)
    scope = WxMessage.left_outer_joins(:messages)
                     .where(messages: { id: nil })
    scope = scope.where.not(id: excluded_wx_message_ids) if excluded_wx_message_ids.present?

    if wx_message_ids.present?
      scope.where(id: wx_message_ids)
    else
      candidate_wxids = (Contact.where(own_wxid: owner_wxid).pluck(:user_name) + [ owner_wxid ]).uniq
      scope.where("wx_messages.from_user_name IN (:wxids) OR wx_messages.to_user_name IN (:wxids)", wxids: candidate_wxids)
    end
  end
end
