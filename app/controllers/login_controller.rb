# frozen_string_literal: true

class LoginController < ApplicationController

  def index
    # 将协议选项传递给视图
    @protocol_options = WechatProtocol.options_for_select
    # 获取已登录的用户列表
    @logged_in_users = LoginInfo.all.order(last_login_at: :desc)
  end

  def show_wechat_qrcode
    wechat_protocol = params[:protocol]

    if wechat_protocol.blank?
      render json: { status: "error", message: "请选择一个微信协议" }, status: :unprocessable_entity
      return
    end

    # 使用微信API服务
    @api_service = WechatLoginService.new(wechat_protocol)
    result = @api_service.get_qrcode

    if result[:error]
      render json: { status: "error", message: result[:message] }, status: :service_unavailable
    else
      # 检查结果是否包含预期的数据结构
      Rails.logger.debug("API结果: #{result.inspect}")

      @protocol_type = wechat_protocol
      @protocol_label = WechatProtocol.label_for(wechat_protocol)

      if result["Data"].present?
        # 将API返回的数据格式转换为我们自己的格式
        @qrcode_data = {
          qrcode_base64: result["Data"]["QrBase64"],
          qrcode_url: result["Data"]["QrUrl"],
          uuid: result["Data"]["Uuid"],
          expired_time: result["Data"]["ExpiredTime"],
          device_id: result["DeviceId"],
          protocol: @protocol_type
        }
        respond_to do |format|
          format.html { render :qrcode }
          format.json { render json: {
            status: "success",
            data: @qrcode_data
          } }
        end
      else
        render json: { status: "error", message: "API返回的数据格式不正确" }, status: :service_unavailable
      end
    end
  end

  # 检查登录状态
  def check_login_status
    # Get uuid from params instead of as a method argument
    uuid = params[:uuid]

    if uuid.blank?
      render json: { Success: false, Message: "UUID不能为空" }, status: :unprocessable_entity
      return
    end

    escape_uuid = uuid.to_s.delete('\\n').strip
    @api_service = WechatLoginService.new(nil)
    response = @api_service.check_qrcode_status(escape_uuid)
    # 登录成功之后调用自动心跳和设置wx_id
    Rails.logger.debug(response.to_json)
    if response&.dig("Data", "baseResponse", "ret") == 0 and
       response&.dig("Data", "acctSectResp", "userName")
      # 获取并设置微信ID
      wx_id = response&.dig("Data", "acctSectResp", "userName")
      @api_service.set_wx_id(wx_id)
      # 自动心跳
      @api_service.auto_heart_beat(wx_id)
      # 保存当前登录用户
      save_current_login_user(response&.dig("Data", "acctSectResp"))
      # 异步获取联系人列表
      fetch_contacts_in_background(wx_id)
    end

    # @api_service.set_wx_id(response["Data"]["WxId"])
    render json: response[:error] ?
                   { Success: false, Message: "检查登录状态失败" } :
                   response
  end

  def reconnect_user
    user_name = params[:user_name]

    if user_name.blank?
      render json: { status: "error", message: "用户名不能为空" }, status: :unprocessable_entity
      return
    end

    # 查找用户
    login_info = LoginInfo.find_by(user_name: user_name)

    if login_info.nil?
      render json: { status: "error", message: "找不到该用户" }, status: :not_found
      return
    end

    # 使用API服务重新连接用户
    @api_service = WechatLoginService.new(nil)
    re_login_response = @api_service.re_login(user_name)
    unless re_login_response["Success"]
      raise StandardError, "API 重新登录失败: #{re_login_response["Message"] || '未知错误'}"
    end
    @api_service.set_wx_id(login_info.user_name)
    @api_service.auto_heart_beat(login_info.user_name)
    # 异步获取联系人列表
    fetch_contacts_in_background(user_name)

    # 更新用户状态
    login_info.mark_as_online!

    render json: {
      status: "success",
      message: "重新连接成功",
      user: {
        user_name: login_info.user_name,
        nick_name: login_info.nick_name
      }
    }
  end

  private

  def fetch_contacts_in_background(wx_id)
    Thread.new do
      begin
        contact_service = ContactApiService.new(wx_id)
        contact_service.fetch_contacts
        contact_service.sync_contacts_for_init
      rescue => e
        Rails.logger.error("获取联系人失败: #{e.message}")
        Rails.logger.error(e.backtrace.join("\n"))
      ensure
        ActiveRecord::Base.connection_pool.release_connection
      end
    end
  end

  def save_current_login_user(userinfo)
    return false if userinfo.blank?

    # Extract and filter only the attributes we need
    user_data = {
      user_name: userinfo["userName"],
      nick_name: userinfo["nickName"],
      bind_uin: userinfo["bindUin"],
      bind_email: userinfo["bindEmail"],
      bind_mobile: userinfo["bindMobile"],
      alias: userinfo["alias"],
      status: userinfo["status"],
      plugin_flag: userinfo["pluginFlag"],
      reg_type: userinfo["regType"],
      safe_device: userinfo["safeDevice"],
      official_user_name: userinfo["officialUserName"],
      official_nick_name: userinfo["officialNickName"],
      push_mail_status: userinfo["pushMailStatus"],
      fs_url: userinfo["fsurl"],
      last_login_at: Time.current,
      online: true
    }

    begin
      login_info = LoginInfo.create(user_data)
      if login_info.persisted?
        Rails.logger.info("User #{login_info.user_name} successfully saved")
        true
      else
        Rails.logger.error("Failed to save login info: #{login_info.errors.full_messages.join(', ')}")
        false
      end
    rescue => e
      Rails.logger.error("Error saving login info: #{e.message}")
      Rails.logger.error(e.backtrace.join("\n"))
      false
    end

  end

end
