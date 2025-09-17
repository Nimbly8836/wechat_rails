# frozen_string_literal: true

module WechatModels

  module SyncMessageModel
    def self.parse(api_hash)
      WxMessage.new(
        msg_id: api_hash["MsgId"],
        from_user_name: api_hash.dig("FromUserName", "string"),
        to_user_name: api_hash.dig("ToUserName", "string"),
        msg_type: api_hash["MsgType"],
        content: api_hash.dig("Content", "string"),
        status: api_hash["Status"],
        img_status: api_hash["ImgStatus"],
        msg_create_time: Time.at(api_hash["CreateTime"]).utc,
        msg_source: api_hash["MsgSource"],
        push_content: api_hash["PushContent"],
        new_msg_id: api_hash["NewMsgId"],
        msg_seq: api_hash["MsgSeq"]
      )
    end

    def self.parse_saves(res)
      return [] unless res["Success"]
      add_messages = res.dig("Data", "AddMsgs") || []
      wx_messages = add_messages
                      .reject { |msg_hash| [51, 10002].include?(msg_hash["MsgType"]) }
                      .map do |msg_hash|
        parse(msg_hash).attributes.except("id", "created_at", "updated_at")
      end
      WxMessage.insert_all(wx_messages) if wx_messages.any?
      wx_messages
    end
  end
end
