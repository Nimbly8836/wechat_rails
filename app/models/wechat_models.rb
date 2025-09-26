# frozen_string_literal: true
require "nokogiri"

module WechatModels

  module SyncMessageModel
    def self.parse(api_hash, current_wxid)
      content = api_hash.dig("Content", "string")
      refer_app_msg = parse_refer_app_msg(content)
      refer_new_msg_id = refer_app_msg[:srv_id]
      title = refer_app_msg[:title]
      from_user_name = api_hash.dig("FromUserName", "string")
      WxMessage.new(
        msg_id: api_hash["MsgId"],
        from_user_name: from_user_name,
        to_user_name: api_hash.dig("ToUserName", "string"),
        msg_type: api_hash["MsgType"],
        content: content,
        status: api_hash["Status"],
        img_status: api_hash["ImgStatus"],
        msg_create_time: Time.at(api_hash["CreateTime"]).utc,
        msg_source: api_hash["MsgSource"],
        push_content: api_hash["PushContent"],
        new_msg_id: api_hash["NewMsgId"],
        msg_seq: api_hash["MsgSeq"],
        refer_new_msg_id: refer_new_msg_id,
        refer_title: title,
        self_send: from_user_name === current_wxid,
      )
    end

    def self.parse_saves(res, current_wxid)
      return [] unless res["Success"]
      add_messages = res.dig("Data", "AddMsgs") || []
      wx_messages = add_messages
                      .reject { |msg_hash| [51, 10002].include?(msg_hash["MsgType"]) }
                      .map do |msg_hash|
        parse(msg_hash, current_wxid).attributes.except("id", "created_at", "updated_at")
      end
      return [] if wx_messages.empty?
      result = WxMessage.insert_all(wx_messages, returning: %w[id])
      ids = result.map { |r| r["id"] }
      WxMessage.where(id: ids)
    end

    def self.parse_refer_app_msg(content)
      doc = Nokogiri::XML(content)

      {
        title: doc.at_xpath("//appmsg/title")&.text,
        type: doc.at_xpath("//refermsg/type")&.text&.to_i,
        from_user_name: doc.at_xpath("//refermsg/fromusr")&.text,
        display_name: doc.at_xpath("//refermsg/displayname")&.text,
        content: doc.at_xpath("//refermsg/content")&.text,
        srv_id: doc.at_xpath("//refermsg/svrid")&.text&.to_i,
        create_time: doc.at_xpath("//refermsg/createtime")&.text&.to_i
      }
    end

  end

end
