# frozen_string_literal: true
require "nokogiri"

module WechatModels

  module SyncMessageModel
    def self.parse(api_hash, current_wxid)
      content = api_hash.dig("Content", "string")
      msg_type = api_hash["MsgType"]
      refer_app_msg = parse_refer_app_msg(content) if msg_type == 49
      refer_new_msg_id = refer_app_msg&.dig(:srv_id)
      title = refer_app_msg&.dig(:title)
      from_user_name = api_hash.dig("FromUserName", "string")
      parsed_emoji = parse_emoji(content) if msg_type == 47
      wx_message = WxMessage.new(
        msg_id: api_hash["MsgId"],
        from_user_name: from_user_name,
        to_user_name: api_hash.dig("ToUserName", "string"),
        msg_type: msg_type,
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
        self_send: from_user_name == current_wxid,
        emoji_md5: parsed_emoji&.dig(:md5),
        )
      wx_message.real_msg_type = wx_message.get_real_msg_type
      wx_message
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
      result = WxMessage.upsert_all(wx_messages, returning: %w[id])
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

  end

end
