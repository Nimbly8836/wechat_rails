require "test_helper"
require "securerandom"

class MessageSyncServiceTest < ActiveSupport::TestCase
  setup do
    ActiveJob::Base.queue_adapter = :test
  end

  test "persist_payload saves wx_messages and enqueues downstream jobs" do
    owner_wxid = "owner-#{SecureRandom.hex(4)}"
    remote_wxid = "friend-#{SecureRandom.hex(4)}"
    payload = {
      "Success" => true,
      "Data" => {
        "AddMsgs" => [ {
          "MsgId" => 101,
          "NewMsgId" => 202,
          "MsgSeq" => 1,
          "CreateTime" => Time.current.to_i,
          "MsgType" => 1,
          "Content" => { "string" => "hello" },
          "FromUserName" => { "string" => remote_wxid },
          "ToUserName" => { "string" => owner_wxid }
        } ]
      }
    }

    result = nil

    assert_difference("WxMessage.count", 1) do
      result = MessageSyncService.new(owner_wxid).persist_payload(payload, full_backfill: true)
    end

    assert_equal 1, result[:synced_count]

    save_job = ActiveJob::Base.queue_adapter.enqueued_jobs.find do |job|
      job[:job] == SaveChatRoomMessageJob
    end
    contacts_job = ActiveJob::Base.queue_adapter.enqueued_jobs.find do |job|
      job[:job] == SyncCreateContactsJob
    end
    backfill_job = ActiveJob::Base.queue_adapter.enqueued_jobs.find do |job|
      job[:job] == BackfillMissingMessagesJob
    end

    assert_not_nil save_job
    assert_not_nil contacts_job
    assert_not_nil backfill_job
    assert_equal owner_wxid, save_job[:args][1]
    assert_equal owner_wxid, contacts_job[:args][1]
    assert_equal owner_wxid, backfill_job[:args][0]
  end

  test "sync_and_persist raises on failed upstream sync" do
    owner_wxid = "owner-#{SecureRandom.hex(4)}"
    fake_message_service = Object.new
    fake_message_service.define_singleton_method(:sync_messages) do |_wxid|
      { "Success" => false, "Message" => "failed" }
    end

    MessageApiService.stub(:new, fake_message_service) do
      assert_raises(MessageSyncService::SyncError) do
        MessageSyncService.new(owner_wxid).sync_and_persist!
      end
    end
  end
end
