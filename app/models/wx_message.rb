# frozen_string_literal: true

class WxMessage < ApplicationRecord
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
    doc = Nokogiri::XML(extract_xml_body(content))
    appmsg_node = doc.at_xpath("//appmsg")
    return unless appmsg_node
    type_value = appmsg_node.at_xpath("type")&.text.to_i
    return unless type_value == 6

    attach_node = appmsg_node.at_xpath("appattach")

    {
      title: appmsg_node.at_xpath("title").text,
      app_id: appmsg_node.attr("appid").to_s,
      totallen: (attach_node.at_xpath("totallen").text).to_s.to_i,
      fileext: attach_node.at_xpath("fileext").text,
      cdn_attach_url: attach_node.at_xpath("cdnattachurl").text,
      aes_key: attach_node.at_xpath("aeskey").text,
      attach_id: attach_node.at_xpath("attachid").text,
      from_user_name: doc.at_xpath("//fromusername").text,
    }
  end

  def extract_xml_body(raw)
    return raw if raw.strip.start_with?("<")
    _, _, body = raw.to_s.partition("\n")
    candidate = body.lstrip
    candidate.start_with?("<") ? candidate : raw
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

    # 3. 其它消息类型，默认返回 content
    xml = extract_xml_body(content)
    if xml&.to_s&.start_with?("<")
      return ""
    end

    content
  end

end
