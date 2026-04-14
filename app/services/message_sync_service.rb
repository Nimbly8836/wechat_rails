# frozen_string_literal: true

class MessageSyncService
  class SyncError < StandardError
    attr_reader :payload

    def initialize(message = "sync failed", payload: nil)
      @payload = payload
      super(message)
    end
  end

  LOCAL_QUERY_BATCH_SIZE = 200
  LOCAL_QUERY_MAX_BATCHES = 5
  LOCAL_QUERY_LOOKBACK_SECONDS = 10.minutes.to_i

  attr_reader :requested_wxid, :sync_wxid, :target_talker

  def initialize(requested_wxid)
    @requested_wxid = requested_wxid
    @sync_wxid = resolve_sync_wxid(requested_wxid)
    @target_talker = resolve_target_talker(requested_wxid)
  end

  def sync_payload
    MessageApiService.new(sync_wxid).sync_messages(sync_wxid)
  end

  def sync_and_persist!(full_backfill: true, local_backfill: true, inline_save: false)
    payload = sync_payload
    sync_result = { synced_count: 0, synced_ids: [] }
    sync_succeeded = success_response?(payload)

    if sync_succeeded
      sync_result = persist_payload(payload, full_backfill: full_backfill, inline_save: inline_save)
    end

    local_result = local_backfill ? sync_local_messages(inline_save: inline_save) : { synced_count: 0, synced_ids: [] }

    unless sync_succeeded || local_result[:synced_count].positive?
      raise SyncError.new(payload: payload)
    end

    {
      payload: payload,
      sync_wxid: sync_wxid,
      target_talker: target_talker,
      sync_synced_count: sync_result[:synced_count],
      local_synced_count: local_result[:synced_count],
      synced_count: sync_result[:synced_count] + local_result[:synced_count],
      synced_ids: (sync_result[:synced_ids] + local_result[:synced_ids]).uniq
    }
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

  def sync_local_messages(inline_save: false, limit: LOCAL_QUERY_BATCH_SIZE, max_batches: LOCAL_QUERY_MAX_BATCHES)
    return { synced_count: 0, synced_ids: [] } if target_talker.blank?

    offset = 0
    total_synced_count = 0
    total_synced_ids = []
    start_create_time = local_query_start_time

    max_batches.times do
      payload = query_local_payload(
        talker: target_talker,
        start_create_time: start_create_time,
        limit: limit,
        offset: offset,
        desc: false
      )
      break unless success_response?(payload)

      batch_count = source_message_count(payload)
      break if batch_count.zero?

      result = persist_payload(payload, full_backfill: false, inline_save: inline_save)
      total_synced_count += result[:synced_count]
      total_synced_ids.concat(result[:synced_ids])

      break if batch_count < limit

      offset += batch_count
    end

    {
      synced_count: total_synced_count,
      synced_ids: total_synced_ids.uniq
    }
  end

  private

  def normalize_payload(payload)
    payload.is_a?(Hash) ? payload : {}
  end

  def query_local_payload(**params)
    MessageApiService.new(sync_wxid).query_local_messages(**params)
  end

  def source_message_count(payload)
    WechatModels::SyncMessageModel.callback_source_messages(normalize_payload(payload)).size
  end

  def local_query_start_time
    latest_time = Message.joins(chat_room: :contact)
                         .where(chat_rooms: { wx_id: target_talker }, contacts: { own_wxid: sync_wxid })
                         .maximum(:message_time)
    return nil if latest_time.blank?

    [ latest_time.to_i - LOCAL_QUERY_LOOKBACK_SECONDS, 0 ].max
  end

  def resolve_target_talker(candidate_wxid)
    return nil if candidate_wxid.blank? || candidate_wxid == sync_wxid

    chat_room = ChatRoom.find_by(wx_id: candidate_wxid)
    return chat_room.wx_id if chat_room.present?

    contact = Contact.find_by(user_name: candidate_wxid)
    return contact.user_name if contact.present?

    candidate_wxid
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
