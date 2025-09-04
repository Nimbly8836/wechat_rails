# frozen_string_literal: true

class WechatLoginService
  attr_reader :protocol_type

  def initialize(protocol_type = nil)
    @protocol_type = protocol_type
    @api_service = BaseApiService.instance
    @api_service.protocol_type = protocol_type # 使用属性赋值而不是构造函数参数
  end

  # 设置 wx_id
  def set_wx_id(wx_id)
    BaseApiService.wx_id = wx_id
  end

  # 获取 wx_id
  def wx_id
    BaseApiService.wx_id
  end

  # 获取微信登录二维码
  def get_qrcode
    path = WechatApis::Base.qrcode(protocol_type)

    response = @api_service.post(path, {
      DeviceID: "",
      DeviceName: "",
      Proxy: {
        "ProxyIp": "",
        "ProxyPassword": "",
        "ProxyUser": ""
      }
    })

    if response[:error]
      # handle_error(response, "获取二维码失败")
    else
      response
    end
  end

  def check_qrcode_status(uuid)
    path = WechatApis::Base.check_status(uuid)

    response = @api_service.post(path)
    if response[:error]
      # handle_error(response, "获取二维码失败")
    else
      response
    end
  end

  def auto_heart_beat(wxid)
    path = WechatApis::Base.auto_heart_beat
    response = @api_service.post(path, { wxid: wxid })
    if response[:error]
      # handle_error(response, "获取二维码失败")
    else
      response
    end
  end

end
