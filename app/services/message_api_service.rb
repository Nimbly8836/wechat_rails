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
    send_app(to_wxid, 57, xml)
  end

  def send_emoji(to_wxid, md5, total_len)
    path = WechatApis::Message.send_emoji
    params = WechatRequest::Message::SendEmoji.new(
      wxid: @wx_id,
      toWxid: to_wxid,
      md5: md5,
      totalLen: total_len
    ).to_h

    @api_service.post(path, params)
  end

end
