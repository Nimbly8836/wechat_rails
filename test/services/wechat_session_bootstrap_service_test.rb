require "test_helper"

class WechatSessionBootstrapServiceTest < ActiveSupport::TestCase
  test "bootstrap_user syncs messages after session recovery succeeds" do
    wxid = "wxid_owner"
    login_service = Object.new
    sync_service = Object.new
    sync_called = false

    login_service.define_singleton_method(:ensure_session) do |_candidate_wxid, include_relogin:|
      raise "expected include_relogin=true" unless include_relogin

      {
        re_login: { success: true },
        auto_heart_beat: { success: true },
        heart_beat: { success: true },
        heart_beat_long: { success: true }
      }
    end

    sync_service.define_singleton_method(:sync_and_persist!) do |full_backfill: true|
      sync_called = full_backfill
    end

    WechatLoginService.stub(:new, login_service) do
      MessageSyncService.stub(:new, sync_service) do
        WechatSessionBootstrapService.new.send(:bootstrap_user, wxid)
      end
    end

    assert_equal true, sync_called
  end
end
