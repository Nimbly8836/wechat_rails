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

    private

    def self.get_protocol_path(protocol)
      case protocol
      when 'iPad'
        'LoginGetQR'
      when 'Car'
        'LoginGetQRCar'
      when 'APad'
        'LoginGetQRPad'
      when 'Mac'
        'LoginGetQRMac'
      when 'Windows'
        'LoginGetQRWin'
      when 'WindowsUwp'
        'LoginGetQRWinUnified'
      when 'iPadX'
        'LoginGetQRx'
      when 'APadX'
        'LoginGetQRPadx'
      when 'WindowsUwpX'
        'LoginGetQRWinUwp'
      else
        'default'
      end
    end
  end

  # 消息相关API路径
  module Message
    def self.send(protocol)
      "/message/send/#{Base.get_protocol_path(protocol)}"
    end

    def self.receive(protocol)
      "/message/receive/#{Base.get_protocol_path(protocol)}"
    end

    def self.history(protocol)
      "/message/history/#{Base.get_protocol_path(protocol)}"
    end
  end

  # 联系人相关API路径
  module Contact
    def self.list(protocol)
      "/contact/list/#{Base.get_protocol_path(protocol)}"
    end

    def self.details(protocol)
      "/contact/details/#{Base.get_protocol_path(protocol)}"
    end

    def self.add(protocol)
      "/contact/add/#{Base.get_protocol_path(protocol)}"
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
end
