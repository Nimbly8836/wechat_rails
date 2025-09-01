# config/initializers/wechat_api_config.rb
module WechatApiConfigLoader
  class << self
    def config
      @config ||= load_config
    end

    private

    def load_config
      config_file = Rails.root.join('config', 'wechat_api.yml')
      if File.exist?(config_file)
        yaml = YAML.load_file(config_file, aliases: true)
        config = yaml[Rails.env] || yaml['default']
        config.deep_symbolize_keys
      else
        raise "微信API配置文件不存在: #{config_file}"
      end
    end
  end
end