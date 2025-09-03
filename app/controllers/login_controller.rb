# frozen_string_literal: true

class LoginController < ApplicationController

  def index
    # 将协议选项传递给视图
    @protocol_options = WechatProtocol.options_for_select
  end

  def show_wechat_qrcode
    wechat_protocol = params[:protocol]

    if wechat_protocol.blank?
      render json: { status: 'error', message: "请选择一个微信协议" }, status: :unprocessable_entity
      return
    end

    begin
      # 使用微信API服务
      @api_service = WechatLoginService.new(wechat_protocol)
      result = @api_service.get_qrcode

      if result[:error]
        render json: { status: 'error', message: result[:message] }, status: :service_unavailable
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
              status: 'success',
              data: @qrcode_data
            } }
          end
        else
          render json: { status: 'error', message: "API返回的数据格式不正确" }, status: :service_unavailable
        end
      end
    rescue => e
      Rails.logger.error("微信API调用失败: #{e.message}")
      Rails.logger.error(e.backtrace.join("\n"))
      render json: { status: 'error', message: "服务暂时不可用，请稍后再试" }, status: :internal_server_error
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
    # Rails.logger.debug(response)
    if response&.dig(:Data, :baseResponse, :ret) == 0 and
       response&.dig(:Data, :baseResponse, :acctSectResp, :userName)
      # 获取并设置微信ID
      wx_id = response&.dig(:Data, :baseResponse, :acctSectResp, :userName)
      @api_service.set_wx_id(wx_id)
      # 异步获取联系人列表
      fetch_contacts_in_background(wx_id)
    end

    # @api_service.set_wx_id(response["Data"]["WxId"])
    render json: response[:error] ?
                   { Success: false, Message: "检查登录状态失败" } :
                   response
  end

  private

  def fetch_contacts_in_background(wx_id)
    Thread.new do
      begin
        contact_service = ContactService.new(wx_id)
        contact_service.fetch_contacts
      rescue => e
        Rails.logger.error("获取联系人失败: #{e.message}")
        Rails.logger.error(e.backtrace.join("\n"))
      ensure
        ActiveRecord::Base.connection_pool.release_connection
      end
    end

  end
end