# app/services/base_api_service.rb
require "net/http"
require "uri"
require "json"
require "singleton"
require "net/http/post/multipart"
require "fileutils"

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
  def post(path, params = {})
    params_with_wxid = { Wxid: @@wx_id }.merge(params.compact)
    make_request(path, params_with_wxid, :post)
  end

  def post_binary_to_file(path, params = {}, file_path:)
    params_with_wxid = { Wxid: @@wx_id }.merge(params.compact)
    make_binary_request(path, params_with_wxid, file_path: file_path)
  end

  # 发送PUT请求
  def put(path, params = {})
    make_request(path, params, :put)
  end

  # 发送DELETE请求
  def delete(path, params = {})
    make_request(path, params, :delete)
  end

  # 处理错误并抛出异常
  def handle_error(message, status: nil, body: nil)
    Rails.logger.error("API调用错误: #{message}, 状态: #{status}, 响应体: #{body}")
    raise ApiError.new(message, status: status, body: body)
  end

  # 上传文件（multipart/form-data）
  def upload_file(path, file, extra_params = {})
    url = build_url(path)
    uri = URI.parse(url)

    # 上传的文件包装
    upload_io = if file.is_a?(ActionDispatch::Http::UploadedFile)
                  UploadIO.new(file.tempfile, file.content_type, file.original_filename)
    else
                  UploadIO.new(file, "application/octet-stream", File.basename(file.path))
    end

    # 组合 FormData 参数
    form_data = { wxid: self.class.wx_id, file: upload_io }.merge(extra_params.compact)

    request = Net::HTTP::Post::Multipart.new(uri.path, form_data)
    request["User-Agent"] = get_user_agent
    request["Accept"] = "application/json"

    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = (uri.scheme == "https")
    http.read_timeout = @config[:timeout] || 30

    response = http.request(request)
    handle_response(response)
  rescue => e
    Rails.logger.error("文件上传失败: #{e.message}")
    { error: true, message: "文件上传失败: #{e.message}" }
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

  def make_binary_request(path, params = {}, file_path:)
    url = build_url(path)
    uri = URI.parse(url)
    request = Net::HTTP::Post.new(uri)
    request.body = params.to_json
    set_headers(request)

    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = (uri.scheme == "https")
    http.read_timeout = @config[:timeout] || 30

    tries = 0
    max_tries = @config[:retry_count] || 3

    begin
      tries += 1
      FileUtils.mkdir_p(File.dirname(file_path))
      File.open(file_path, "wb") do |file|
        http.request(request) do |response|
          unless response.is_a?(Net::HTTPSuccess)
            body = response.read_body
            return { error: true, status: response.code, message: response.message, body: body }
          end

          response.read_body { |chunk| file.write(chunk) }
          return {
            success: true,
            path: file_path.to_s,
            content_type: response["content-type"],
            filename: response["content-disposition"]
          }
        end
      end
    rescue => e
      FileUtils.rm_f(file_path)
      if tries < max_tries
        sleep(1)
        retry
      end
      Rails.logger.error("API二进制请求失败 (#{url}): #{e.message}")
      { error: true, message: "请求失败: #{e.message}" }
    end
  end

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
