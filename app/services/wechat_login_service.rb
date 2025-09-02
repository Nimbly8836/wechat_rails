# frozen_string_literal: true

class WechatLoginService < BaseApiService

  # 获取微信登录二维码
  def get_qrcode
    path = WechatApis::Base.qrcode(protocol_type)

    response = post(path, {
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

    response = post(path)
    if response[:error]
      # handle_error(response, "获取二维码失败")
    else
      response
    end
  end
end
