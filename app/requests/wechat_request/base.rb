module WechatRequest
  class Base
    # 参数配置表
    PARAM_CONFIGS = {
      query_local: { defaults: { desc: false, limit: 200, offset: 0 }, required: [ :talker ] },
      sync: { defaults: { scene: 0, synckey: "" }, required: [] },
      send_text: { defaults: { at: "", type: 0 }, required: [ :toWxid, :content ] },
      send_app: { defaults: { type: 0 }, required: [ :toWxid, :xml ] },
      revoke: { defaults: {}, required: [ :clientMsgId, :createTime, :newMsgId, :toUserName ] },
      send_cdn_file: { defaults: {}, required: [ :toWxid, :content ] },
      send_cdn_img: { defaults: {}, required: [ :toWxid, :content ] },
      send_cdn_video: { defaults: {}, required: [ :toWxid, :content ] },
      send_emoji: { defaults: { base64: nil, md5: nil, totalLen: nil }, required: [ :toWxid ] },
      send_video: { defaults: {}, required: [ :toWxid, :content ] },
      send_voice: { defaults: {}, required: [ :toWxid, :content, :voiceType, :voiceTime ] },
      share_card: { defaults: {}, required: [ :toWxid, :cardWxId, :cardNickName, :cardAlias ] },
      share_link: { defaults: {}, required: [ :toWxid, :type, :desc, :xml ] },
      share_location: { defaults: {}, required: [ :toWxid, :location ] },
      share_video: { defaults: {}, required: [ :toWxid, :xml ] },
      upload_img: { defaults: {}, required: [ :toWxid, :base64 ] },

      # Tools 接口
      cdn_download_image: { defaults: {}, required: [ :url, :wxid ] },
      download_file: { defaults: {}, required: [ :appId, :attachId, :dataLen, :section, :userName ] },
      download_img: { defaults: {}, required: [ :toWxid, :section, :msgId, :dataLen, :compressType, :wxid ] },
      download_video: { defaults: {}, required: [ :toWxid, :section, :msgId, :dataLen, :compressType, :wxid ] },
      download_voice: { defaults: {}, required: [ :bufid, :fromUserName, :length, :msgId ] },
      generate_pay_qcode: { defaults: {}, required: [ :wxid ] },
      get_a8_key: { defaults: { opCode: 2, scene: 4, codeType: 19, codeVersion: 5 }, required: [ :wxid ] },
      get_band_card_list: { defaults: {}, required: [ :wxid ] },
      get_bound_hard_devices: { defaults: {}, required: [ :wxid ] },
      get_cdn_dns: { defaults: {}, required: [ :wxid ] },
      oauth_sdk_app: { defaults: {}, required: [ :appId, :wxid ] },
      third_app_grant: { defaults: {}, required: [ :appId, :authCode, :wxid ] },
      update_step_number_api: { defaults: {}, required: [ :step, :wxid ] },
      upload_file: { defaults: {}, required: [ :file, :wxid ] },
      upload_file_binary: { defaults: {}, required: [] },
      set_proxy: { defaults: {}, required: [ :proxy, :wxid ] },

    }.freeze

    def self.params(**optional, &block)
      required = block ? block.call : []
      @param_required = required.map(&:to_sym)
      @param_defaults = optional.transform_keys(&:to_sym)
      attr_reader(*@param_required, *@param_defaults.keys)

      define_method(:extra_params) do
        self.class.all_params.each_with_object({}) do |name, hash|
          value = send(name)
          next if value.nil?
          hash[self.class.api_key_for(name)] = value
        end
      end
    end

    def self.all_params
      @param_required + @param_defaults.keys
    end

    def initialize(wxid:, **kwargs)
      @wxid = wxid
      missing = self.class.instance_variable_get(:@param_required) - kwargs.keys.map(&:to_sym)
      raise ArgumentError, "Missing required params: #{missing.join(', ')}" if missing.any?
      merged = self.class.instance_variable_get(:@param_defaults).merge(kwargs.transform_keys(&:to_sym))
      merged.each do |key, value|
        instance_variable_set("@#{key}", value)
      end
    end

    # 默认把 snake_case 的 symbol -> API 风格 key，例如 :scene -> "Scene", :synckey -> "Synckey"
    def self.api_key_for(name)
      str = name.to_s
      if str.include?('_')
        # snake_case -> 驼峰 + 首字母大写
        str.split('_').map(&:capitalize).join
      else
        # 已经是驼峰，首字母大写
        str[0].upcase + str[1..-1]
      end
    end

    def to_h
      { Wxid: @wxid }.merge(extra_params)
    end
  end
end
