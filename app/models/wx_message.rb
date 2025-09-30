# frozen_string_literal: true

class WxMessage < ApplicationRecord
  has_many :messages, -> { order(message_time: :desc) }

  enum :msg_type, {
    self_send: 0,           # 我发送的
    text: 1,                # 文本消息 (M_DATA_TEXT)
    html: 2,                # HTML 消息 (MM_DATA_HTML)
    image: 3,               # 图片消息 (MM_DATA_IMG)
    room_invitation: 5,     # 群聊邀请
    file: 6, # 文件

    private_text: 11,       # 私聊文本 (MM_DATA_PRIVATEMSG_TEXT)
    private_html: 12,       # 私聊 HTML (MM_DATA_PRIVATEMSG_HTML)
    private_image: 13,      # 私聊图片 (MM_DATA_PRIVATEMSG_IMG)

    real_time_location: 17,
    chat_history: 19,
    mini_app: 33,
    voice: 34,              # 语音消息 (MM_DATA_VOICEMSG)
    push_mail: 35,          # 推送邮件 (MM_DATA_PUSHMAIL)
    qmsg: 36,               # QMSG (MM_DATA_QMSG)
    verify_msg: 37,         # 验证消息 (MM_DATA_VERIFYMSG)
    push_system: 38,        # 系统推送消息 (MM_DATA_PUSHSYSTEMMSG)
    offline_img: 39,        # QQ 离线图片 (MM_DATA_QQLIXIANMSG_IMG)
    possible_friend: 40,    # 可能认识的人 (MM_DATA_POSSIBLEFRIEND_MSG)
    card: 42,               # 名片 (MM_DATA_SHARECARD)
    video: 43,              # 视频消息 (MM_DATA_VIDEO)
    video_export: 44,       # iPhone 导出视频 (MM_DATA_VIDEO_IPHONE_EXPORT)
    emoji: 47,              # 表情 (MM_DATA_EMOJI)
    location: 48,           # 位置消息 (MM_DATA_LOCATION)
    refer: 49,              # 应用/引用消息 (MM_DATA_APPMSG)

    voip_msg: 50,           # VoIP 消息 (MM_DATA_VOIPMSG)
    status_notify: 51,      # 状态通知 (MM_DATA_STATUSNOTIFY)
    voip_notify: 52,        # VoIP 通知 (MM_DATA_VOIPNOTIFY)
    voip_invite: 53,        # VoIP 邀请 (MM_DATA_VOIPINVITE)
    micro_video: 62,        # 小视频 (MM_DATA_MICROVIDEO)

    sys_notice: 9999,       # 系统通知 (MM_DATA_SYSNOTICE)
    sys: 10_000,            # 系统消息 (MM_DATA_SYS)
    recalled: 10002         # 撤回消息 (MM_DATA_RECALLED)
  }

  def parse_voice_content
    return unless (msg_type.to_sym == :voice) and content.present?
    doc = Nokogiri::XML(self.content)
    voice_node = doc.at_xpath("//voicemsg")
    return {} unless voice_node

    # 获取属性
    voicelength_ms = voice_node['voicelength'].to_i    # 毫秒
    voice_length_sec = (voicelength_ms / 1000.0).ceil  # 秒，整数

    voice_url = voice_node['voiceurl']
    aes_key   = voice_node['aeskey']
    from_user = voice_node['fromusername']

    {
      voice_length_sec: voice_length_sec,
      voice_url: voice_url,
      aes_key: aes_key,
      from_user_name: from_user,
      end_flag: voice_node['endflag'] == '1',
      cancel_flag: voice_node['cancelflag'] == '1',
      voice_format: voice_node['voiceformat'].to_i,
      buf_id: voice_node['bufid'].to_s,
      length: voice_node['length'].to_i,
    }

  end


end
