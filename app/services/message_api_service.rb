# frozen_string_literal: true

class MessageApiService
  def initialize(wx_id = nil)
    @api_service = BaseApiService.instance
    @wx_id = wx_id || BaseApiService.wx_id
  end

  def sync_messages(wxid)
    path = WechatApis::Message.sync
    @api_service.post(path, {
      "Scene": 0,
      "Synckey": "",
      "Wxid": wxid,
    })
  end

end
