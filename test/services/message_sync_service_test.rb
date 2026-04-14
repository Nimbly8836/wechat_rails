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
    fake_message_service.define_singleton_method(:query_local_messages) do |**_params|
      { "Success" => false, "Message" => "failed" }
    end

    MessageApiService.stub(:new, fake_message_service) do
      assert_raises(MessageSyncService::SyncError) do
        MessageSyncService.new(owner_wxid).sync_and_persist!
      end
    end
  end

  test "persist_payload can save messages inline for realtime callback" do
    owner_wxid = "owner-#{SecureRandom.hex(4)}"
    remote_wxid = "friend-#{SecureRandom.hex(4)}"
    payload = {
      "Success" => true,
      "Data" => {
        "AddMsgs" => [ {
          "MsgId" => 303,
          "NewMsgId" => 404,
          "MsgSeq" => 1,
          "CreateTime" => Time.current.to_i,
          "MsgType" => 1,
          "Content" => { "string" => "hello" },
          "FromUserName" => { "string" => remote_wxid },
          "ToUserName" => { "string" => owner_wxid }
        } ]
      }
    }

    save_now_calls = []

    SaveChatRoomMessageJob.stub(:perform_now, ->(*args) { save_now_calls << args }) do
      SaveChatRoomMessageJob.stub(:perform_later, ->(*) { flunk("expected inline save") }) do
        MessageSyncService.new(owner_wxid).persist_payload(payload, inline_save: true)
      end
    end

    assert_equal 1, save_now_calls.size
    assert_equal owner_wxid, save_now_calls.first[1]
  end

  test "sync_and_persist falls back to local query for target talker" do
    owner_wxid = "owner-#{SecureRandom.hex(4)}"
    talker_wxid = "room-#{SecureRandom.hex(4)}@chatroom"
    remote_wxid = "friend-#{SecureRandom.hex(4)}"

    contact = Contact.create!(
      user_name: talker_wxid,
      own_wxid: owner_wxid,
      nick_name: "测试会话"
    )
    ChatRoom.create!(
      wx_id: talker_wxid,
      name: "测试会话",
      contact: contact
    )

    fake_message_service = Object.new
    fake_message_service.define_singleton_method(:sync_messages) do |_wxid|
      { "Success" => false, "Message" => "failed" }
    end
    fake_message_service.define_singleton_method(:query_local_messages) do |**params|
      raise "unexpected talker #{params[:talker]}" unless params[:talker] == talker_wxid

      {
        "Success" => true,
        "Data" => {
          "Messages" => [ {
            "Talker" => talker_wxid,
            "SenderUserName" => remote_wxid,
            "MsgType" => 1,
            "Content" => "hello from local",
            "CreateTime" => Time.current.to_i
          } ]
        }
      }
    end

    result = nil

    MessageApiService.stub(:new, fake_message_service) do
      assert_difference("WxMessage.count", 1) do
        result = MessageSyncService.new(talker_wxid).sync_and_persist!(inline_save: true)
      end
    end

    assert_equal owner_wxid, result[:sync_wxid]
    assert_equal talker_wxid, result[:target_talker]
    assert_equal 1, result[:local_synced_count]
    assert_equal 1, result[:synced_count]
  end
end
