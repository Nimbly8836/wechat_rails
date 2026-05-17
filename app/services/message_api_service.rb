# frozen_string_literal: true
require "builder"

class MessageApiService
  def initialize(wx_id = nil)
    @api_service = BaseApiService.instance
    @wx_id = wx_id || BaseApiService.wx_id
    if wx_id.present?
      BaseApiService.wx_id = wx_id
    end
  end

  def sync_messages(wxid)
    path = WechatApis::Message.sync
    params = WechatRequest::Message::Sync.new(wxid: wxid).to_h
    @api_service.post(path, params)
  end

  def query_local_messages(talker:, sender_user_name: nil, msg_type: nil, keyword: nil,
                           start_create_time: nil, end_create_time: nil, limit: 200, offset: 0, desc: false)
    path = WechatApis::Message.query_local
    params = WechatRequest::Message::QueryLocal.new(
      wxid: @wx_id,
      talker: talker,
      senderUserName: sender_user_name,
      msgType: msg_type,
      keyword: keyword,
      startCreateTime: start_create_time,
      endCreateTime: end_create_time,
      limit: limit,
      offset: offset,
      desc: desc
    ).to_h

    @api_service.post(path, params)
  end

  def send_text(to_wxid, content, at)
    path = WechatApis::Message.send_text
    params = WechatRequest::Message::SendText.new(wxid: @wx_id,
                                                  at: at,
                                                  content: content,
                                                  toWxid: to_wxid).to_h

    @api_service.post(path, params)
  end

  def send_image(to_wxid, image_base64)
    path = WechatApis::Message.send_image
    params = WechatRequest::Message::UploadImg.new(wxid: @wx_id,
                                                   toWxid: to_wxid,
                                                   base64: image_base64).to_h
    @api_service.post(path, params)
  end

  def send_app(to_wxid, type, xml)
    path = WechatApis::Message.send_app
    params = WechatRequest::Message::SendApp.new(wxid: @wx_id,
                                                 toWxid: to_wxid,
                                                 xml: xml,
                                                 type: type)
                                            .to_h
    @api_service.post(path, params)
  end

  def send_app_file(to_wxid, name, size, id, ext_name)
    xml = <<~XML
      <appmsg appid='' sdkver=''>
        <title>#{CGI.escapeHTML(name.to_s)}</title>
        <des></des>
        <action></action>
        <type>6</type>
        <content></content>
        <url></url>
        <lowurl></lowurl>
        <appattach>
          <totallen>#{size}</totallen>
          <attachid>#{id}</attachid>
          <fileext>#{ext_name}</fileext>
        </appattach>
        <extinfo></extinfo>
      </appmsg>
    XML
    xml = xml.gsub(/\n\s*/, "")
    send_app(to_wxid, 6, xml.strip)
  end

  def send_quote(to_wxid, xml)
    send_app(to_wxid, 49, xml)
  end

  def send_merged_forward(to_wxid, **attrs)
    path = WechatApis::Message.send_merged_forward
    params = WechatRequest::Message::SendMergedForward
               .new(wxid: @wx_id, toWxid: to_wxid, **attrs)
               .to_h
    @api_service.post(path, params)
  end

  def send_emoji(to_wxid, base64, md5: nil, total_len: nil)
    path = WechatApis::Message.send_emoji
    params = WechatRequest::Message::SendEmoji.new(
      wxid: @wx_id,
      toWxid: to_wxid,
      base64: base64,
      md5: md5,
      totalLen: total_len
    ).to_h

    @api_service.post(path, params)
  end

  def send_voice(to_wxid, base64, type:, voice_time:)
    path = WechatApis::Message.send_voice
    params = WechatRequest::Message::SendVoice.new(
      wxid: @wx_id,
      toWxid: to_wxid,
      base64: base64,
      type: type,
      voiceTime: voice_time
    ).to_h

    @api_service.post(path, params)
  end

end
