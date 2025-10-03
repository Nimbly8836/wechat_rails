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

  def cdn_download_image(file_aes_key:, file_no:)
    path = WechatApis::Tools.cdn_download_image
    params = WechatRequest::Tools::CdnDownloadImage
               .new(
                 wxid: @wx_id,
                 fileAesKey: file_aes_key,
                 fileNo: file_no
               ).to_h
    @api_service.post(path, params)
  end

  def download_image_chunk(to_wxid:, msg_id:, data_len:, section:, compress_type: 0)
    section_payload = {
      StartPos: section[:start_pos].to_i,
      DataLen: section[:data_len].to_i
    }

    path = WechatApis::Tools.download_img
    params = WechatRequest::Tools::DownloadImg
               .new(
                 wxid: @wx_id,
                 toWxid: to_wxid,
                 msgId: msg_id,
                 dataLen: data_len,
                 section: section_payload,
                 compressType: compress_type
               ).to_h
    @api_service.post(path, params)
  end

  def download_video_chunk(to_wxid:, msg_id:, data_len:, section:, compress_type: 0)
    section_payload = {
      StartPos: section[:start_pos].to_i,
      DataLen: section[:data_len].to_i
    }

    path = WechatApis::Tools.download_video
    params = WechatRequest::Tools::DownloadVideo
               .new(
                 wxid: @wx_id,
                 toWxid: to_wxid,
                 msgId: msg_id,
                 dataLen: data_len,
                 section: section_payload,
                 compressType: compress_type
               ).to_h
    @api_service.post(path, params)
  end

  def download_file_chunk(data_len:, section:, user_name:, app_id:, attach_id:)
    section_payload = {
      StartPos: section[:start_pos].to_i,
      DataLen: section[:data_len].to_i
    }

    path = WechatApis::Tools.download_file
    params = WechatRequest::Tools::DownloadFile
               .new(
                 wxid: @wx_id,
                 appId: app_id,
                 dataLen: data_len,
                 section: section_payload,
                 userName: user_name,
                 attachId: attach_id
               ).to_h
    @api_service.post(path, params)
  end
end
