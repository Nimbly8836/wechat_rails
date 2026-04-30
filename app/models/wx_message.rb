# frozen_string_literal: true

class WxMessage < ApplicationRecord
  APP_MESSAGE_TYPE_NAMES = {
    5 => "card",
    6 => "file_message",
    19 => "chat_history",
    33 => "mini_app",
    36 => "mini_game",
    51 => "video_account",
    57 => "quote",
    74 => "file_transfer_start",
    2000 => "transfer",
    2001 => "red_packet"
  }.freeze

  has_many :messages, -> { order(message_time: :desc) }, foreign_key: :wx_messages_id, inverse_of: :wx_message

  scope :keyword_search, ->(query) {
    pgroonga_search(
      %w[
        wx_messages.content
        wx_messages.refer_title
        wx_messages.push_content
        wx_messages.from_user_name
        wx_messages.to_user_name
      ],
      query
    )
  }

  enum :msg_type, {
    self_send: 0, # 我发送的
    text: 1, # 文本消息 (M_DATA_TEXT)
    html: 2, # HTML 消息 (MM_DATA_HTML)
    image: 3, # 图片消息 (MM_DATA_IMG)
    room_invitation: 5, # 群聊邀请
    file: 6, # 文件

    private_text: 11, # 私聊文本 (MM_DATA_PRIVATEMSG_TEXT)
    private_html: 12, # 私聊 HTML (MM_DATA_PRIVATEMSG_HTML)
    private_image: 13, # 私聊图片 (MM_DATA_PRIVATEMSG_IMG)

    real_time_location: 17,
    chat_history: 19,
    mini_app: 33,
    voice: 34, # 语音消息 (MM_DATA_VOICEMSG)
    push_mail: 35, # 推送邮件 (MM_DATA_PUSHMAIL)
    qmsg: 36, # QMSG (MM_DATA_QMSG)
    verify_msg: 37, # 验证消息 (MM_DATA_VERIFYMSG)
    push_system: 38, # 系统推送消息 (MM_DATA_PUSHSYSTEMMSG)
    offline_img: 39, # QQ 离线图片 (MM_DATA_QQLIXIANMSG_IMG)
    possible_friend: 40, # 可能认识的人 (MM_DATA_POSSIBLEFRIEND_MSG)
    card: 42, # 名片 (MM_DATA_SHARECARD)
    video: 43, # 视频消息 (MM_DATA_VIDEO)
    video_export: 44, # iPhone 导出视频 (MM_DATA_VIDEO_IPHONE_EXPORT)
    emoji: 47, # 表情 (MM_DATA_EMOJI)
    location: 48, # 位置消息 (MM_DATA_LOCATION)
    refer: 49, # 应用/引用消息 (MM_DATA_APPMSG)

    voip_msg: 50, # VoIP 消息 (MM_DATA_VOIPMSG)
    status_notify: 51, # 状态通知 (MM_DATA_STATUSNOTIFY)
    voip_notify: 52, # VoIP 通知 (MM_DATA_VOIPNOTIFY)
    voip_invite: 53, # VoIP 邀请 (MM_DATA_VOIPINVITE)
    micro_video: 62, # 小视频 (MM_DATA_MICROVIDEO)

    sys_notice: 9999, # 系统通知 (MM_DATA_SYSNOTICE)
    sys: 10_000, # 系统消息 (MM_DATA_SYS)
    recalled: 10002 # 撤回消息 (MM_DATA_RECALLED)
  }

  enum :real_msg_type, {
    unknown: 0,
    text: 1,
    image: 3,
    voice: 34,
    add_friend: 37,
    contact: 42,
    video: 43,
    emoji: 47,
    location: 48,

    card: 5,
    file_message: 6,
    real_time_location: 17,
    chat_history: 19,
    mini_app: 33,
    mini_game: 36,
    video_account: 51,
    quote: 57,
    file_transfer_start: 74,
    transfer: 2000,
    red_packet: 2001,

    voip: 50,
    status_notify: 51,

    revoke: 1,
    pat: 2,
    function_message: 3,
    voip_invite: 4
  }, prefix: :real

  class << self
    def extract_xml_body(raw)
      value = raw.to_s
      return value if value.strip.start_with?("<")

      _, _, body = value.partition("\n")
      candidate = body.lstrip
      candidate.start_with?("<") ? candidate : value
    end

    def xml_document(raw)
      payload = extract_xml_body(raw).to_s.strip
      return nil unless payload.start_with?("<")

      doc = Nokogiri::XML(payload)
      doc.errors.empty? ? doc : nil
    end

    def strip_sender_prefix(text)
      text.to_s.sub(/\A[^:\n]+:\n/, "")
    end

    def clean_xml_title(title)
      cleaned = title.to_s.strip
      return "" if cleaned.blank?
      return "" if cleaned.match?(/当前版本不支持展示该内容|请升级至最新版本/)

      cleaned
    end

    def normalize_app_message_url(url)
      value = url.to_s.strip
      return "" if value.match?(/support\.weixin\.qq\.com\/security\/readtemplate/)

      value
    end

    def human_message_placeholder(type_code)
      case type_code.to_i
      when 1
        "[文本]"
      when 3
        "[图片]"
      when 6
        "[文件]"
      when 19
        "[聊天记录]"
      when 34
        "[语音]"
      when 43, 62
        "[视频]"
      when 47
        "[表情]"
      when 49, 57
        "[引用消息]"
      else
        "[消息]"
      end
    end

    def app_message_type_name(type_code)
      APP_MESSAGE_TYPE_NAMES[type_code.to_i]
    end

    def normalized_message_type_name(type_code)
      case type_code.to_i
      when 1
        "text"
      when 3
        "image"
      when 6
        "file_message"
      when 19
        "chat_history"
      when 34
        "voice"
      when 43, 62
        "video"
      when 47
        "emoji"
      when 49, 57
        "quote"
      else
        app_message_type_name(type_code)
      end
    end

    def parse_app_message_payload(raw)
      doc = xml_document(raw)
      return nil unless doc

      appmsg_node = doc.at_xpath("//appmsg")
      return nil unless appmsg_node

      title = clean_xml_title(appmsg_node.at_xpath("title")&.text)
      desc = appmsg_node.at_xpath("des")&.text.to_s.strip
      raw_url = appmsg_node.at_xpath("url")&.text.to_s.strip
      cover = appmsg_node.at_xpath("thumburl")&.text.to_s.strip
      cover = appmsg_node.at_xpath("cover")&.text.to_s.strip if cover.blank?
      source = doc.at_xpath("//publisher/nickname")&.text.to_s.strip
      source = doc.at_xpath("//appname")&.text.to_s.strip if source.blank?
      msg_type = appmsg_node.at_xpath("type")&.text.to_i
      refer_content = doc.at_xpath("//refermsg/content")&.text.to_s.strip
      refer_server_id = doc.at_xpath("//refermsg/svrid")&.text.to_s.strip
      finder_feed = doc.at_xpath("//finderFeed")

      if finder_feed
        media_node = finder_feed.at_xpath("mediaList/media")
        finder_desc = finder_feed.at_xpath("desc")&.text.to_s.strip
        nickname = finder_feed.at_xpath("nickname")&.text.to_s.strip
        finder_cover = media_node&.at_xpath("coverUrl")&.text.to_s.strip
        finder_cover = media_node&.at_xpath("thumbUrl")&.text.to_s.strip if finder_cover.blank?
        finder_cover = media_node&.at_xpath("fullCoverUrl")&.text.to_s.strip if finder_cover.blank?
        finder_cover = finder_feed.at_xpath("avatar")&.text.to_s.strip if finder_cover.blank?

        return {
          type: "video_account",
          title: nickname.presence || title.presence || "视频号分享",
          desc: finder_desc.presence || desc,
          url: normalize_app_message_url(raw_url),
          cover: finder_cover.presence || cover.presence,
          source: nickname.present? ? "视频号 · #{nickname}" : "视频号",
          media_url: media_node&.at_xpath("url")&.text.to_s.strip,
          msg_type: msg_type,
          ref_content: refer_content.presence,
          ref_server_id: refer_server_id.presence,
          duration_seconds: media_node&.at_xpath("videoPlayDuration")&.text.to_i
        }.compact
      end

      {
        type: app_message_type_name(msg_type),
        title: title.presence,
        desc: desc.presence,
        url: normalize_app_message_url(raw_url),
        cover: cover.presence,
        source: source.presence,
        msg_type: msg_type,
        ref_content: refer_content.presence,
        ref_server_id: refer_server_id.presence
      }.compact
    end

    def parse_quote_metadata(raw)
      doc = xml_document(raw)
      return {} unless doc

      appmsg_node = doc.at_xpath("//appmsg")
      refer_node = doc.at_xpath("//refermsg")
      return {} unless appmsg_node || refer_node

      refer_type = refer_node&.at_xpath("type")&.text.to_i
      refer_content = refer_node&.at_xpath("content")&.text.to_s
      srv_id = refer_node&.at_xpath("svrid")&.text.to_s.strip

      {
        title: clean_xml_title(appmsg_node&.at_xpath("title")&.text).presence,
        refer_type: refer_type.positive? ? refer_type : nil,
        from_user_name: refer_node&.at_xpath("fromusr")&.text.to_s.presence,
        sender_user_name: refer_node&.at_xpath("chatusr")&.text.to_s.presence,
        display_name: refer_node&.at_xpath("displayname")&.text.to_s.presence,
        content: refer_content.presence,
        preview_content: quote_preview_content(refer_type, refer_content),
        srv_id: srv_id.present? ? srv_id.to_i : nil,
        create_time: refer_node&.at_xpath("createtime")&.text.to_i
      }.compact
    end

    def quote_preview_content(type_code, raw_content)
      content = raw_content.to_s
      app_payload = parse_app_message_payload(content)

      case type_code.to_i
      when 1
        text = strip_sender_prefix(content).strip
        return text if text.present? && !text.start_with?("<")
        return app_payload[:title] if app_payload&.dig(:title).present?
        return app_payload[:desc] if app_payload&.dig(:desc).present?
      when 3, 34, 43, 47, 62
        return human_message_placeholder(type_code)
      when 6
        file_payload = parse_file_attachment_payload(content)
        return file_payload[:title] if file_payload&.dig(:title).present?
        return human_message_placeholder(type_code)
      when 19
        history_payload = parse_chat_history_payload(content)
        return history_payload[:desc] if history_payload&.dig(:desc).present?
        return history_payload[:title] if history_payload&.dig(:title).present?
      when 49, 57
        nested_quote = parse_quote_metadata(content)
        return nested_quote[:title] if nested_quote[:title].present?
        return nested_quote[:preview_content] if nested_quote[:preview_content].present?
      end

      return app_payload[:title] if app_payload&.dig(:title).present?
      return app_payload[:desc] if app_payload&.dig(:desc).present?

      stripped = strip_sender_prefix(content).strip
      return stripped unless stripped.blank? || stripped.start_with?("<")

      human_message_placeholder(type_code)
    end

    def parse_chat_history_payload(raw)
      payload = parse_app_message_payload(raw)
      return nil unless payload

      doc = xml_document(raw)
      record_raw = doc&.at_xpath("//appmsg/recorditem")&.text.to_s.strip
      count = 0
      items = []
      if record_raw.present?
        record_doc = xml_document(record_raw)
        item_nodes = record_doc&.xpath("//recordinfo/datalist/dataitem") || []
        count = (record_doc&.at_xpath("//recordinfo/datalist")&.[]("count") || items.length).to_i
        items = item_nodes.first(4).map do |item_node|
          data_type = item_node["datatype"].to_i
          {
            type: case data_type
              when 2 then "image"
              when 4 then "video"
              when 6 then "file_message"
              else "text"
              end,
            sender_name: item_node.at_xpath("sourcename")&.text.to_s.strip.presence,
            time: item_node.at_xpath("sourcetime")&.text.to_s.strip.presence,
            content: item_node.at_xpath("datadesc")&.text.to_s.strip.presence || human_message_placeholder(data_type)
          }.compact
        end
      end

      payload.merge(
        type: "chat_history",
        count: count.positive? ? count : nil,
        items: items
      ).compact
    end

    def parse_voip_payload(raw)
      doc = xml_document(raw)
      return nil unless doc

      voip_node = doc.at_xpath("//voipmsg")
      bubble_node = doc.at_xpath("//VoIPBubbleMsg")
      return nil unless voip_node || bubble_node

      raw_msg = bubble_node&.at_xpath("msg")&.text.to_s.strip
      duration_seconds = bubble_node&.at_xpath("duration")&.text.to_i
      duration_label = if raw_msg[/Duration:\s*([0-9:]+)/i, 1].present?
        raw_msg[/Duration:\s*([0-9:]+)/i, 1]
      elsif duration_seconds.positive?
        format_duration(duration_seconds)
      end
      summary = duration_label.present? ? "通话时长 #{duration_label}" : raw_msg.presence || "通话消息"

      {
        type: "voip",
        title: bubble_node&.at_xpath("room_type")&.text.to_s == "1" ? "微信通话" : "微信语音通话",
        summary: summary
      }.compact
    end

    def parse_file_attachment_payload(raw)
      doc = xml_document(raw)
      return nil unless doc

      appmsg_node = doc.at_xpath("//appmsg")
      return nil unless appmsg_node
      return nil unless appmsg_node.at_xpath("type")&.text.to_i == 6

      attach_node = appmsg_node.at_xpath("appattach")
      title = appmsg_node.at_xpath("title")&.text.to_s
      app_id = appmsg_node["appid"].to_s
      app_id = doc.at_xpath("//appinfo/appid")&.text.to_s if app_id.blank?
      app_id = doc.at_xpath("//appmsg/wxappinfo/appid")&.text.to_s if app_id.blank?
      attach_id = attach_node&.at_xpath("attachid")&.text.to_s
      attach_id = attach_node&.at_xpath("cdnattachid")&.text.to_s if attach_id.blank?
      from_user_name = doc.at_xpath("//fromusername")&.text.to_s
      from_user_name = doc.at_xpath("//fromuser")&.text.to_s if from_user_name.blank?

      {
        title: title,
        app_id: app_id,
        totallen: attach_node&.at_xpath("totallen")&.text.to_s.to_i,
        fileext: attach_node&.at_xpath("fileext")&.text.to_s,
        cdn_attach_url: attach_node&.at_xpath("cdnattachurl")&.text.to_s,
        aes_key: attach_node&.at_xpath("aeskey")&.text.to_s,
        attach_id: attach_id,
        from_user_name: from_user_name
      }
    end

    def parse_location_payload(raw)
      doc = xml_document(raw)
      return nil unless doc

      location_node = doc.at_xpath("//location")
      return nil unless location_node

      latitude = location_node["x"].to_s.strip
      longitude = location_node["y"].to_s.strip
      label = location_node["label"].to_s.strip
      poi_name = location_node["poiname"].to_s.strip
      title = poi_name.presence || label.presence || "位置"
      coordinates = [ latitude, longitude ].select(&:present?).join(",")

      {
        type: "location",
        title: title,
        label: label.presence,
        poiname: poi_name.presence,
        latitude: latitude.presence,
        longitude: longitude.presence,
        scale: location_node["scale"].to_i,
        map_type: location_node["maptype"].to_s.presence,
        city_name: location_node["cityname"].to_s.presence,
        map_url: coordinates.present? ? "https://maps.google.com/?q=#{coordinates}" : nil
      }.compact
    end

    def format_duration(total_seconds)
      seconds = total_seconds.to_i
      minutes = seconds / 60
      remain_seconds = seconds % 60
      [ minutes, remain_seconds ].map { |value| value.to_s.rjust(2, "0") }.join(":")
    end
  end

  def parse_voice_content
    return unless (msg_type.to_sym == :voice) and content.present?
    doc = Nokogiri::XML(extract_xml_body(self.content))
    voice_node = doc.at_xpath("//voicemsg")
    return {} unless voice_node

    # 获取属性
    voicelength_ms = voice_node["voicelength"].to_i # 毫秒
    voice_length_sec = (voicelength_ms / 1000.0).ceil # 秒，整数

    voice_url = voice_node["voiceurl"]
    aes_key = voice_node["aeskey"]
    from_user = voice_node["fromusername"]

    {
      voice_length_sec: voice_length_sec,
      voice_url: voice_url,
      aes_key: aes_key,
      from_user_name: from_user,
      end_flag: voice_node["endflag"] == "1",
      cancel_flag: voice_node["cancelflag"] == "1",
      voice_format: voice_node["voiceformat"].to_i,
      buf_id: voice_node["bufid"].to_s,
      length: voice_node["length"].to_i,
    }

  end

  def parse_emoji
    return unless (msg_type.to_sym == :emoji) and self.content.present?
    doc = Nokogiri::XML(extract_xml_body(self.content))
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

  def parse_image
    return unless (msg_type.to_sym == :image) and self.content.present?
    doc = Nokogiri::XML(extract_xml_body(self.content))
    image_node = doc.at_xpath("//img")
    return unless image_node
    aes_key = image_node.attr("aeskey")
    cdn_img_url = image_node.attr("cdnbigimgurl") || image_node.attr("cdnmidimgurl") || image_node.attr("cdnthumburl")
    length = image_node.attr("hdlength").to_i || image_node.attr("length").to_i
    {
      aes_key: aes_key,
      cdn_img_url: cdn_img_url,
      length: length,
    }
  end

  def parse_video
    return unless (msg_type.to_sym == :video) && content.present?
    doc = Nokogiri::XML(extract_xml_body(content))
    video_node = doc.at_xpath("//videomsg")
    return unless video_node

    {
      aes_key: video_node.attr("aeskey"),
      cdn_video_url: video_node.attr("cdnvideourl"),
      length: video_node.attr("length").to_i,
      play_length: video_node.attr("playlength").to_i,
      cdn_thumb_aes_key: video_node.attr("cdnthumbaeskey"),
      cdn_thumb_url: video_node.attr("cdnthumburl"),
      thumb_length: video_node.attr("cdnthumblength").to_i,
      thumb_width: video_node.attr("cdnthumbwidth").to_i,
      thumb_height: video_node.attr("cdnthumbheight").to_i
    }
  end

  def parse_file_attachment
    return unless (real_msg_type.to_sym == :file_message) && content.present?
    self.class.parse_file_attachment_payload(content)
  end

  def parse_location
    return unless (get_real_msg_type.to_sym == :location) && content.present?

    self.class.parse_location_payload(content)
  end

  def extract_xml_body(raw)
    self.class.extract_xml_body(raw)
  end

  def quote_metadata
    return {} unless content.present?

    self.class.parse_quote_metadata(content)
  end

  def parsed_message_payload
    message_type = get_real_msg_type

    case message_type
    when :quote
      metadata = quote_metadata
      {
        type: "quote",
        title: metadata[:title].presence || refer_title.presence,
        refer_new_msg_id: (metadata[:srv_id].presence || refer_new_msg_id.presence)&.to_s,
        quote_preview: {
          type: self.class.normalized_message_type_name(metadata[:refer_type]) || metadata[:refer_type],
          content: metadata[:preview_content],
          display_name: metadata[:display_name],
          sender_user_name: metadata[:sender_user_name],
          from_user_name: metadata[:from_user_name],
          server_id: metadata[:srv_id]&.to_s
        }.compact
      }.compact
    when :file_message
      self.class.parse_file_attachment_payload(content)&.merge(type: "file_message")
    when :chat_history
      self.class.parse_chat_history_payload(content)
    when :voip
      self.class.parse_voip_payload(content)
    when :location
      parse_location
    when :card, :mini_app, :mini_game, :video_account, :transfer, :red_packet
      payload = self.class.parse_app_message_payload(content)
      payload&.merge(type: payload[:type].presence || message_type.to_s)
    else
      payload = self.class.parse_app_message_payload(content)
      payload if payload&.dig(:type).present?
    end
  end

  def get_real_msg_type
    base_type = msg_type&.to_sym
    return :unknown if base_type.nil?

    unless [ :refer, :recalled ].include?(base_type)
      current = real_msg_type
      return current.to_sym if current.present?
      return base_type if self.class.real_msg_types.key?(base_type.to_s)
      return :unknown
    end

    return :unknown unless content.present?

    doc = Nokogiri::XML(extract_xml_body(content))
    type_node = doc.at_xpath("//appmsg/type")
    if type_node&.text.present?
      numeric_value = type_node.text.to_i
      enum_key = self.class.real_msg_types.key(numeric_value)
      return enum_key ? enum_key.to_sym : :unknown
    end

    app_msg_node = doc.at_xpath("//appmsg")
    raw_type_attr = app_msg_node&.[]("type")
    return :unknown if raw_type_attr.blank?

    numeric_value = raw_type_attr.to_i
    enum_key = self.class.real_msg_types.key(numeric_value)
    enum_key ? enum_key.to_sym : :unknown
  end

  def preview_content
    # 1. 推送类消息，直接返回推送内容
    if push_content?
      unless from_user_name&.end_with?("@chatroom")
        return push_content.sub(/\S+ : /, "")
      end
      return push_content
    end

    # 2. 文本消息：截断显示
    if real_msg_type.to_sym == :text && content.present?
      return content&.length > 100 ? "#{content[0..100]}..." : content
    end

    if real_msg_type.to_sym == :emoji
      return "表情消息"
    end

    if real_msg_type.to_sym == :image
      return "图片消息"
    end

    if real_msg_type.to_sym == :voice
      return "语音消息"
    end

    if real_msg_type.to_sym == :video
      return "视频消息"
    end

    if real_msg_type.to_sym == :location
      location = parse_location
      return location&.dig(:title).present? ? "[位置] #{location[:title]}" : "[位置]"
    end

    # 3. 其它消息类型，默认返回 content
    xml = extract_xml_body(content)
    if xml&.to_s&.start_with?("<")
      return ""
    end

    content
  end

end
