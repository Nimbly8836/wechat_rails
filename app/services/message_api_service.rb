# frozen_string_literal: true

class MessageApiService
  def initialize(wx_id = nil)
    @api_service = BaseApiService.instance
    @wx_id = wx_id || BaseApiService.wx_id
  end

  def sync_messages

  end

end
