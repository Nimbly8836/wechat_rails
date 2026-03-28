# frozen_string_literal: true

class WechatSessionBootstrapService
  MIN_INTERVAL = 15.seconds

  @mutex = Mutex.new
  @running = false
  @last_started_at = nil

  class << self
    def run_async(force: false)
      return false unless begin_run(force: force)

      Thread.new do
        begin
          new.run
        ensure
          finish_run
          ActiveRecord::Base.connection_pool.release_connection
        end
      end

      true
    end

    private

    def begin_run(force:)
      @mutex.synchronize do
        return false if @running
        return false if !force && @last_started_at.present? && @last_started_at > MIN_INTERVAL.ago

        @running = true
        @last_started_at = Time.current
        true
      end
    end

    def finish_run
      @mutex.synchronize do
        @running = false
      end
    end
  end

  def run
    ActiveRecord::Base.connection_pool.with_connection do
      LoginInfo.where(online: true).find_each do |login_info|
        bootstrap_user(login_info.user_name)
      end
    end
  end

  private

  def bootstrap_user(wxid)
    results = WechatLoginService.new.ensure_session(wxid, include_relogin: true)
    failed_steps = results.select { |_step, result| !result[:success] }
    return if failed_steps.empty?

    Rails.logger.warn("启动补偿失败 wxid=#{wxid}: #{failed_steps.inspect}")
  rescue => e
    Rails.logger.error("启动补偿异常 wxid=#{wxid}: #{e.class} #{e.message}")
  end
end
