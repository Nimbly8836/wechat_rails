# frozen_string_literal: true

class MessageSyncService
  class SyncError < StandardError
    attr_reader :payload

    def initialize(message = "sync failed", payload: nil)
      @payload = payload
      super(message)
    end
  end

  attr_reader :requested_wxid, :sync_wxid

  def initialize(requested_wxid)
    @requested_wxid = requested_wxid
    @sync_wxid = resolve_sync_wxid(requested_wxid)
  end

  def sync_payload
    MessageApiService.new(sync_wxid).sync_messages(sync_wxid)
  end

  def sync_and_persist!(full_backfill: true)
    payload = sync_payload
    raise SyncError.new(payload: payload) unless success_response?(payload)

    persist_payload(payload, full_backfill: full_backfill)
    payload
  end

  def persist_payload(payload, full_backfill: false, inline_save: false)
    saves = WechatModels::SyncMessageModel.parse_saves(normalize_payload(payload), sync_wxid)
    if saves.blank?
      BackfillMissingMessagesJob.perform_later(sync_wxid) if full_backfill
      return { synced_count: 0, synced_ids: [] }
    end

    serialized_saves = saves.as_json
    synced_ids = saves.pluck(:id)

    if inline_save
      SaveChatRoomMessageJob.perform_now(serialized_saves, sync_wxid)
    else
      SaveChatRoomMessageJob.perform_later(serialized_saves, sync_wxid)
    end
    SyncCreateContactsJob.perform_later(serialized_saves, sync_wxid)
    BackfillMissingMessagesJob.perform_later(sync_wxid, nil, synced_ids) if full_backfill

    { synced_count: saves.size, synced_ids: synced_ids }
  end

  def success_response?(payload)
    value = normalize_payload(payload).values_at("Success", :Success).compact.first
    value == true || value.to_s.casecmp("true").zero?
  end

  def explicit_failure_response?(payload)
    normalized = normalize_payload(payload)
    return false unless normalized.key?("Success") || normalized.key?(:Success)

    !success_response?(normalized)
  end

  def message_batch_present?(payload)
    normalized = normalize_payload(payload)
    add_msgs = normalized.dig("Data", "AddMsgs") || normalized.dig(:Data, :AddMsgs)
    messages = normalized.dig("Data", "Messages") || normalized.dig(:Data, :Messages)
    (add_msgs.is_a?(Array) && add_msgs.any?) || (messages.is_a?(Array) && messages.any?)
  end

  private

  def normalize_payload(payload)
    payload.is_a?(Hash) ? payload : {}
  end

  def resolve_sync_wxid(candidate_wxid)
    return candidate_wxid if Contact.where(own_wxid: candidate_wxid).exists?

    chat_room = ChatRoom.includes(:contact).find_by(wx_id: candidate_wxid)
    return chat_room.contact.own_wxid if chat_room&.contact&.own_wxid.present?

    contact = Contact.find_by(user_name: candidate_wxid)
    return contact.own_wxid if contact&.own_wxid.present?

    candidate_wxid
  end
end
