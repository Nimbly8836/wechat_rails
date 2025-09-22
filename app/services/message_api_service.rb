# frozen_string_literal: true

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

end
