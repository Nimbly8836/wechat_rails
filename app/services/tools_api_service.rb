# frozen_string_literal: true

class ToolsApiService
  def initialize(wx_id = nil)
    @api_service = BaseApiService.instance
    @wx_id = wx_id || BaseApiService.wx_id
    if wx_id.present?
      BaseApiService.wx_id = wx_id
    end
  end

  def download_voice(buf_id:, from_user_name:, length:, msg_id:)
    path = WechatApis::Tools.download_voice
    params = WechatRequest::Tools::DownloadVoice
               .new(
                 wxid: @wx_id,
                 bufid: buf_id,
                 fromUserName: from_user_name,
                 length: length,
                 msgId: msg_id
               ).to_h
    @api_service.post(path, params)
  end
end
