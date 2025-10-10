# frozen_string_literal: true

module WechatApis
  # app/models/wechat_api_paths.rb
  # 基础API路径
  module Base
    def self.qrcode(protocol)
      "/Login/#{get_protocol_path(protocol)}"
    end

    def self.check_status(uuid)
      "/Login/LoginCheckQR?uuid=#{uuid}"
    end

    # 心跳
    def self.auto_heart_beat
      "/Login/AutoHeartBeat"
    end

    # 二次登录
    def self.re_login(wxid)
      "/Login/LoginTwiceAutoAuth?wxid=#{wxid}"
    end

    private

    def self.get_protocol_path(protocol)
      case protocol
      when "iPad"
        "LoginGetQR"
      when "Car"
        "LoginGetQRCar"
      when "APad"
        "LoginGetQRPad"
      when "Mac"
        "LoginGetQRMac"
      when "Windows"
        "LoginGetQRWin"
      when "WindowsUwp"
        "LoginGetQRWinUnified"
      when "iPadX"
        "LoginGetQRx"
      when "APadX"
        "LoginGetQRPadx"
      when "WindowsUwpX"
        "LoginGetQRWinUwp"
      else
        "default"
      end
    end
  end

  # 消息相关API路径
  module Message

    def self.revoke
      "/Msg/Revoke"
    end

    def self.sync
      "/Msg/Sync"
    end

    def self.send_text
      "/Msg/SendTxt"
    end

    def self.send_image
      "/Msg/UploadImg"
    end
  end

  # 联系人相关API路径
  module Contact
    def self.list
      "/Friend/GetContractList"
    end

    def self.details
      "/Friend/GetContractDetail"
    end

    def self.add
      "/"
    end
  end

  # 群组相关API路径
  module Group
    def self.list(protocol)
      "/group/list/#{Base.get_protocol_path(protocol)}"
    end

    def self.details(protocol)
      "/group/details/#{Base.get_protocol_path(protocol)}"
    end

    def self.create(protocol)
      "/group/create/#{Base.get_protocol_path(protocol)}"
    end
  end

  module Tools
    # 返回 Tools 模块对应的接口路径
    def self.cdn_download_image
      "/Tools/CdnDownloadImage"
    end

    def self.download_file
      "/Tools/DownloadFile"
    end

    def self.download_img
      "/Tools/DownloadImg"
    end

    def self.download_video
      "/Tools/DownloadVideo"
    end

    def self.download_voice
      "/Tools/DownloadVoice"
    end

    def self.generate_pay_qcode
      "/Tools/GeneratePayQCode"
    end

    def self.get_a8_key
      "/Tools/GetA8Key"
    end

    def self.get_band_card_list
      "/Tools/GetBandCardList"
    end

    def self.get_bound_hard_devices
      "/Tools/GetBoundHardDevices"
    end

    def self.get_cdn_dns
      "/Tools/GetCdnDns"
    end

    def self.oauth_sdk_app
      "/Tools/OauthSdkApp"
    end

    def self.third_app_grant
      "/Tools/ThirdAppGrant"
    end

    def self.update_step_number_api
      "/Tools/UpdateStepNumberApi"
    end

    def self.upload_file
      "/Tools/UploadFile"
    end

    def self.upload_file_binary
      "/Tools/UploadFileBinary"
    end

    def self.set_proxy
      "/Tools/setproxy"
    end
  end
end
