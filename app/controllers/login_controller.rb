# frozen_string_literal: true

class LoginController < ActionController::Base
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
      api_service = WechatLoginService.new(wechat_protocol)
      result = api_service.get_qrcode

      if result[:error]
        render json: { status: 'error', message: result[:message] }, status: :service_unavailable
      else
        # 检查结果是否包含预期的数据结构
        Rails.logger.debug("API结果: #{result.inspect}")
        
        if result["Data"].present?
          # 将API返回的数据格式转换为我们自己的格式
          @qrcode_data = {
            qrcode_base64: result["Data"]["QrBase64"],
            qrcode_url: result["Data"]["QrUrl"],
            uuid: result["Data"]["Uuid"],
            expired_time: result["Data"]["ExpiredTime"],
            device_id: result["DeviceId"]
          }
          
          @protocol_type = wechat_protocol
          @protocol_label = WechatProtocol.label_for(wechat_protocol)

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
    protocol = params[:protocol]
    uuid = params[:uuid]
    device_id = params[:device_id]
    
    if protocol.blank? || uuid.blank?
      render json: { status: 'error', message: "参数不完整" }, status: :bad_request
      return
    end
    
    begin
      api_service = WechatLoginService.new(protocol)
      result = api_service.check_status(uuid, device_id)
      
      render json: result
    rescue => e
      Rails.logger.error("检查登录状态失败: #{e.message}")
      render json: { status: 'error', message: "服务暂时不可用" }, status: :internal_server_error
    end
  end
end
