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

  # 自动心跳，自动二次登录
  def auto_heart_beat(wxid)
    path = WechatApis::Base.auto_heart_beat
    response = @api_service.post(path, { wxid: wxid })
    if response[:error]
      @api_service.handle_error("自动心跳失败", body: response)
    else
      response
    end
  end

  def heart_beat(wxid)
    path = WechatApis::Base.heart_beat
    response = @api_service.post(path, { wxid: wxid })
    if response[:error]
      @api_service.handle_error("心跳失败", body: response)
    else
      response
    end
  end

  def heart_beat_long(wxid)
    path = WechatApis::Base.heart_beat_long
    response = @api_service.post(path, { wxid: wxid })
    if response[:error]
      @api_service.handle_error("长心跳失败", body: response)
    else
      response
    end
  end

  def re_login(wxid)
    path = WechatApis::Base.re_login(wxid)
    response = @api_service.post(path)
    if response[:error] or !response["Success"]
      @api_service.handle_error("二次登录失败", body: response)
    else
      response
    end
  end

  def ensure_session(wxid, include_relogin: true)
    set_wx_id(wxid)

    results = {}
    results[:re_login] = invoke_step("二次登录", wxid) { re_login(wxid) } if include_relogin
    results[:auto_heart_beat] = invoke_step("自动心跳", wxid) { auto_heart_beat(wxid) }
    results[:heart_beat] = invoke_step("心跳", wxid) { heart_beat(wxid) }
    results[:heart_beat_long] = invoke_step("长心跳", wxid) { heart_beat_long(wxid) }
    results
  end

  private

  def invoke_step(step_name, wxid)
    response = yield
    { success: true, response: response }
  rescue => e
    Rails.logger.error("#{step_name}失败 wxid=#{wxid}: #{e.class} #{e.message}")
    { success: false, message: e.message }
  end

end
