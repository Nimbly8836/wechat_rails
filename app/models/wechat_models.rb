# frozen_string_literal: true
require "digest"
require "nokogiri"

module WechatModels

  module SyncMessageModel
    TYPE_NAME_ALIASES = {
      "voip" => "voip_msg",
      "system_notice" => "sys_notice",
      "system" => "sys"
    }.freeze

    def self.parse(api_hash, current_wxid)
      normalized_hash = api_hash.is_a?(Hash) ? api_hash.deep_stringify_keys : {}
      content = normalized_hash.dig("Content", "string")
      msg_type = normalized_hash["MsgType"]
      refer_app_msg = parse_refer_app_msg(content) if msg_type == 49
      refer_new_msg_id = refer_app_msg&.dig(:srv_id)
      title = refer_app_msg&.dig(:title)
      from_user_name = normalized_hash.dig("FromUserName", "string")
      parsed_emoji = parse_emoji(content) if msg_type == 47
      wx_message = WxMessage.new(
        msg_id: normalized_hash["MsgId"],
        from_user_name: from_user_name,
        to_user_name: normalized_hash.dig("ToUserName", "string"),
        msg_type: msg_type,
        content: content,
        status: normalized_hash["Status"],
        img_status: normalized_hash["ImgStatus"],
        msg_create_time: parse_message_time(normalized_hash["CreateTime"]),
        msg_source: normalized_hash["MsgSource"],
        push_content: normalized_hash["PushContent"],
        new_msg_id: normalized_hash["NewMsgId"],
        msg_seq: normalized_hash["MsgSeq"],
        refer_new_msg_id: refer_new_msg_id,
        refer_title: title,
        self_send: from_user_name == current_wxid,
        emoji_md5: parsed_emoji&.dig(:md5),
        )
      wx_message.real_msg_type = wx_message.get_real_msg_type
      wx_message
    end

    def self.parse_saves(res, current_wxid)
      return [] unless res["Success"]
      source_messages = callback_source_messages(res)
      persisted_ids = source_messages
                      .reject { |msg_hash| [ 51, 10002 ].include?(msg_hash["MsgType"]) }
                      .filter_map do |msg_hash|
        persist_one(msg_hash, current_wxid)
      end
      return [] if persisted_ids.empty?

      WxMessage.where(id: persisted_ids)
    end

    def self.parse_refer_app_msg(content)
      metadata = WxMessage.parse_quote_metadata(content)
      return nil if metadata.blank?

      {
        title: metadata[:title],
        type: metadata[:refer_type],
        refer_type: metadata[:refer_type],
        from_user_name: metadata[:from_user_name],
        sender_user_name: metadata[:sender_user_name],
        display_name: metadata[:display_name],
        content: metadata[:content],
        preview_content: metadata[:preview_content],
        srv_id: metadata[:srv_id],
        create_time: metadata[:create_time]
      }.compact
    end

    def self.parse_emoji(content)
      doc = Nokogiri::XML(content)
      emoji_node = doc.at_xpath("//emoji")
      md5_text = doc.at_xpath("//emoji/md5")&.text
      cdn_text = doc.at_xpath("//emoji/cdnurl")&.text

      md5_attr = emoji_node&.attr("md5")
      cdn_attr = emoji_node&.attr("cdnurl")

      {
        md5: md5_text.presence || md5_attr,
        cdn_url: cdn_text.presence || cdn_attr,
      }
    end

    def self.callback_source_messages(res)
      data = res["Data"] || {}
      messages = Array(data["Messages"])
      add_messages = Array(data["AddMsgs"])

      return add_messages if messages.blank?

      messages.map.with_index do |message_hash, index|
        merge_callback_payload(message_hash, add_messages[index], index)
      end
    end

    def self.merge_callback_payload(message_hash, add_message_hash, index)
      message = message_hash.is_a?(Hash) ? message_hash.deep_stringify_keys : {}
      add_message = add_message_hash.is_a?(Hash) ? add_message_hash.deep_stringify_keys : {}

      content = add_message.dig("Content", "string").presence ||
                message["Content"].presence ||
                message["ContentText"].presence ||
                ""
      talker = message["Talker"].presence ||
               add_message.dig("ToUserName", "string").presence ||
               add_message.dig("FromUserName", "string").presence
      sender = message["SenderUserName"].presence ||
               add_message.dig("FromUserName", "string").presence ||
               extract_group_sender(content)
      msg_type = message["MsgType"] || add_message["MsgType"] ||
                 msg_type_from_name(message["MsgTypeName"])
      create_time = message["CreateTime"] || add_message["CreateTime"]
      msg_seq = message["MsgSeq"] || add_message["MsgSeq"] || 0
      synthetic_key = [ talker, sender, content, msg_type, create_time, index ].join("|")

      {
        "MsgId" => message["MsgId"] || add_message["MsgId"] || synthetic_message_id(synthetic_key, "msg"),
        "NewMsgId" => message["NewMsgId"] || add_message["NewMsgId"] || synthetic_message_id(synthetic_key, "new"),
        "MsgSeq" => msg_seq,
        "CreateTime" => create_time,
        "MsgType" => msg_type,
        "Status" => message["Status"] || add_message["Status"],
        "ImgStatus" => message["ImgStatus"] || add_message["ImgStatus"],
        "MsgSource" => message["MsgSource"] || add_message["MsgSource"],
        "PushContent" => message["ContentText"].presence || add_message["PushContent"],
        "Content" => { "string" => content },
        "FromUserName" => { "string" => sender },
        "ToUserName" => { "string" => talker }
      }
    end

    def self.parse_message_time(value)
      timestamp = value.to_i
      return Time.current if timestamp <= 0

      Time.at(timestamp).utc
    end

    def self.msg_type_from_name(type_name)
      key = TYPE_NAME_ALIASES[type_name.to_s] || type_name.to_s
      WxMessage.msg_types[key]
    end

    def self.synthetic_message_id(seed, prefix)
      Digest::SHA256.hexdigest("#{prefix}|#{seed}")[0, 15].to_i(16)
    end

    def self.extract_group_sender(content)
      content.to_s[/\A([^:\n]+):\n/, 1]
    end

    def self.persist_one(msg_hash, current_wxid)
      attrs = nil

      begin
        attrs = parse(msg_hash, current_wxid).attributes.except("id", "created_at", "updated_at")
        record = persist_wx_message!(attrs)
        WxMessageIngestFailure.resolve!(
          owner_wxid: current_wxid,
          raw_payload: msg_hash,
          normalized_payload: attrs
        )
        record.id
      rescue => e
        stage = attrs.present? ? "persist" : "parse"
        WxMessageIngestFailure.record!(
          owner_wxid: current_wxid,
          stage: stage,
          raw_payload: msg_hash,
          normalized_payload: attrs,
          error: e
        )
        Rails.logger.error(
          "wx_message ingest failed owner_wxid=#{current_wxid} stage=#{stage} error=#{e.class} #{e.message}"
        )
        nil
      end
    end

    def self.persist_wx_message!(attrs)
      key_attrs = attrs.slice("msg_id", "new_msg_id", "msg_seq")
      wx_message = WxMessage.find_or_initialize_by(key_attrs)
      wx_message.assign_attributes(attrs)
      wx_message.save!
      wx_message
    end

  end

end
