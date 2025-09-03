# app/services/base_api_service.rb
require "net/http"
require "uri"
require "json"
require "singleton"

class BaseApiService
  include Singleton
  attr_reader :config
  attr_accessor :protocol_type

  @@wx_id = nil

  def self.wx_id
    @@wx_id
  end

  def self.wx_id=(value)
    @@wx_id = value
  end

  # 实例方法获取 wx_id
  def wx_id
    @@wx_id
  end

  # Singleton 模式下的 initialize 不能接受参数
  def initialize
    @config = WechatApiConfigLoader.config
    @protocol_type = nil
  end

  # 获取基础URL
  def base_url
    @config[:base_url]
  end

  # 获取回调URL
  def callback_url
    @config[:callback_url]
  end

  # 发送GET请求
  def get(path, params = {})
    make_request(path, params, :get)
  end

  # 发送POST请求
  def post(path, params = { Wxid: @@wx_id })
    make_request(path, params, :post)
  end

  # 发送PUT请求
  def put(path, params = {})
    make_request(path, params, :put)
  end

  # 发送DELETE请求
  def delete(path, params = {})
    make_request(path, params, :delete)
  end

  protected

  # 构建完整的URL
  def build_url(path)
    path.start_with?("http") ? path : "#{base_url}#{path}"
  end

  # 处理响应
  def handle_response(response)
    case response
    when Net::HTTPSuccess
      begin
        JSON.parse(response.body)
      rescue JSON::ParserError
        { body: response.body }
      end
    else
      { error: true, status: response.code, message: response.message, body: response.body }
    end
  end

  # 设置请求头
  def set_headers(request)
    request["User-Agent"] = get_user_agent
    request["Accept"] = "application/json"
    request["Content-Type"] = "application/json" if request.method != "GET"
    request
  end

  # 获取User-Agent
  def get_user_agent
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.82 Safari/537.36"
  end

  private

  # 发送HTTP请求
  def make_request(path, params = {}, method = :get)
    url = build_url(path)
    uri = URI.parse(url)

    # 构建请求对象
    case method
    when :get
      uri.query = URI.encode_www_form(params) if params.any?
      request = Net::HTTP::Get.new(uri)
    when :post
      request = Net::HTTP::Post.new(uri)
      request.body = params.to_json
    when :put
      request = Net::HTTP::Put.new(uri)
      request.body = params.to_json
    when :delete
      request = Net::HTTP::Delete.new(uri)
      request.body = params.to_json if params.any?
    else
      raise "不支持的HTTP方法: #{method}"
    end

    # 设置请求头
    set_headers(request)

    # 发送请求
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = (uri.scheme == "https")
    http.read_timeout = @config[:timeout] || 30

    # 重试机制
    tries = 0
    max_tries = @config[:retry_count] || 3

    begin
      tries += 1
      response = http.request(request)
      handle_response(response)
    rescue => e
      if tries < max_tries
        sleep(1)
        retry
      else
        Rails.logger.error("API请求失败 (#{url}): #{e.message}")
        { error: true, message: "请求失败: #{e.message}" }
      end
    end
  end
end
