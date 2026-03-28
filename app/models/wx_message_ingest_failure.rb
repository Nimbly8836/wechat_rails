# frozen_string_literal: true

require "digest"

class WxMessageIngestFailure < ApplicationRecord
  validates :fingerprint, presence: true, uniqueness: true
  validates :owner_wxid, :stage, :error_class, :error_message, presence: true

  scope :unresolved, -> { where(resolved_at: nil) }

  class << self
    def record!(owner_wxid:, stage:, raw_payload:, normalized_payload: nil, error:)
      failure = find_or_initialize_by(
        fingerprint: fingerprint_for(
          owner_wxid: owner_wxid,
          raw_payload: raw_payload,
          normalized_payload: normalized_payload
        )
      )

      now = Time.current
      identifiers = extract_identifiers(raw_payload, normalized_payload)

      failure.assign_attributes(
        owner_wxid: owner_wxid,
        stage: stage,
        msg_id: identifiers[:msg_id],
        new_msg_id: identifiers[:new_msg_id],
        msg_seq: identifiers[:msg_seq],
        msg_type: identifiers[:msg_type],
        from_user_name: identifiers[:from_user_name],
        to_user_name: identifiers[:to_user_name],
        error_class: error.class.name,
        error_message: error.message.to_s,
        payload: build_payload(raw_payload, normalized_payload),
        last_failed_at: now,
        resolved_at: nil
      )
      failure.first_failed_at ||= now
      failure.failure_count = failure.failure_count.to_i + 1
      failure.save!
      failure
    rescue => e
      Rails.logger.error("Failed to persist wx_message ingest failure: #{e.class} #{e.message}")
      nil
    end

    def resolve!(owner_wxid:, raw_payload:, normalized_payload: nil)
      now = Time.current
      where(
        owner_wxid: owner_wxid,
        fingerprint: fingerprint_for(
          owner_wxid: owner_wxid,
          raw_payload: raw_payload,
          normalized_payload: normalized_payload
        )
      ).update_all(resolved_at: now, updated_at: now)
    rescue => e
      Rails.logger.error("Failed to resolve wx_message ingest failure: #{e.class} #{e.message}")
    end

    def fingerprint_for(owner_wxid:, raw_payload:, normalized_payload: nil)
      identifiers = extract_identifiers(raw_payload, normalized_payload)
      content = extract_content(raw_payload, normalized_payload)

      Digest::SHA256.hexdigest(
        [
          owner_wxid,
          identifiers[:msg_id],
          identifiers[:new_msg_id],
          identifiers[:msg_seq],
          identifiers[:from_user_name],
          identifiers[:to_user_name],
          identifiers[:msg_type],
          content
        ].map(&:to_s).join("|")
      )
    end

    private

    def build_payload(raw_payload, normalized_payload)
      {}.tap do |payload|
        payload["raw"] = stringify_hash(raw_payload) if raw_payload.is_a?(Hash)
        payload["normalized"] = stringify_hash(normalized_payload) if normalized_payload.is_a?(Hash)
      end
    end

    def extract_identifiers(raw_payload, normalized_payload)
      raw = stringify_hash(raw_payload)
      normalized = stringify_hash(normalized_payload)

      {
        msg_id: normalized["msg_id"] || raw["MsgId"] || raw["msg_id"],
        new_msg_id: normalized["new_msg_id"] || raw["NewMsgId"] || raw["new_msg_id"],
        msg_seq: normalized["msg_seq"] || raw["MsgSeq"] || raw["msg_seq"],
        msg_type: normalized["msg_type"] || raw["MsgType"] || raw["msg_type"],
        from_user_name: normalized["from_user_name"] || raw.dig("FromUserName", "string") || raw["from_user_name"],
        to_user_name: normalized["to_user_name"] || raw.dig("ToUserName", "string") || raw["to_user_name"]
      }
    end

    def extract_content(raw_payload, normalized_payload)
      normalized = stringify_hash(normalized_payload)
      raw = stringify_hash(raw_payload)
      normalized["content"] ||
        raw.dig("Content", "string") ||
        raw["Content"] ||
        raw["ContentText"] ||
        ""
    end

    def stringify_hash(payload)
      payload.is_a?(Hash) ? payload.deep_stringify_keys : {}
    end
  end
end
