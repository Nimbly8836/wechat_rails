require "test_helper"

class WechatModelsSyncMessageModelTest < ActiveSupport::TestCase
  test "parse_refer_app_msg extracts metadata from group-prefixed xml content" do
    referenced_new_msg_id = 3_404_025_882_978_823_795
    content = <<~XML
      wxid_3gs9e3fkynja12:
      <?xml version="1.0"?>
      <msg>
        <appmsg>
          <title>这笔订单，是没有收到吗？</title>
          <type>57</type>
          <refermsg>
            <chatusr>Like_peng</chatusr>
            <type>3</type>
            <displayname>小枫</displayname>
            <svrid>#{referenced_new_msg_id}</svrid>
            <content>Like_peng:
      &lt;?xml version="1.0"?&gt;
      &lt;msg&gt;&lt;img md5="abc" /&gt;&lt;/msg&gt;</content>
          </refermsg>
        </appmsg>
      </msg>
    XML

    parsed = WechatModels::SyncMessageModel.parse_refer_app_msg(content)

    assert_equal "这笔订单，是没有收到吗？", parsed[:title]
    assert_equal referenced_new_msg_id, parsed[:srv_id]
    assert_equal "Like_peng", parsed[:sender_user_name]
    assert_equal "小枫", parsed[:display_name]
    assert_equal 3, parsed[:refer_type]
    assert_equal "[图片]", parsed[:preview_content]
  end

  test "parse fills refer fields for group-prefixed quote messages" do
    referenced_new_msg_id = 3_404_025_882_978_823_795
    raw = {
      "MsgId" => 370_519_749,
      "NewMsgId" => 6_297_960_406_975_598_093,
      "MsgSeq" => 1,
      "CreateTime" => Time.current.to_i,
      "MsgType" => 49,
      "Content" => {
        "string" => <<~XML
          wxid_3gs9e3fkynja12:
          <?xml version="1.0"?>
          <msg>
            <appmsg>
              <title>这笔订单，是没有收到吗？</title>
              <type>57</type>
              <refermsg>
                <chatusr>Like_peng</chatusr>
                <type>1</type>
                <displayname>小枫</displayname>
                <svrid>#{referenced_new_msg_id}</svrid>
                <content>原消息</content>
              </refermsg>
            </appmsg>
          </msg>
        XML
      },
      "FromUserName" => { "string" => "wxid_3gs9e3fkynja12" },
      "ToUserName" => { "string" => "18479154916@chatroom" }
    }

    wx_message = WechatModels::SyncMessageModel.parse(raw, "wxid_owner")

    assert_equal referenced_new_msg_id, wx_message.refer_new_msg_id
    assert_equal "这笔订单，是没有收到吗？", wx_message.refer_title
    assert_equal :quote, wx_message.real_msg_type.to_sym
  end

  test "parse_saves records failed wx_messages and continues with remaining rows" do
    owner_wxid = "wxid_owner"
    failing_raw = build_raw_message(msg_id: 101, new_msg_id: 201, content: "bad")
    valid_raw = build_raw_message(msg_id: 102, new_msg_id: 202, content: "good")
    payload = {
      "Success" => true,
      "Data" => {
        "AddMsgs" => [ failing_raw, valid_raw ]
      }
    }

    WechatModels::SyncMessageModel.stub(:parse, lambda { |msg_hash, current_wxid|
      raise ArgumentError, "broken payload" if msg_hash["MsgId"] == 101

      build_wx_message(msg_hash, current_wxid)
    }) do
      saved = WechatModels::SyncMessageModel.parse_saves(payload, owner_wxid)

      assert_equal 1, saved.count
      assert_equal [102], saved.pluck(:msg_id)
    end

    failure = WxMessageIngestFailure.find_by(owner_wxid: owner_wxid)
    assert_not_nil failure
    assert_equal "parse", failure.stage
    assert_equal "ArgumentError", failure.error_class
    assert_equal "broken payload", failure.error_message
    assert_equal 101, failure.msg_id
    assert_equal 1, failure.failure_count
    assert_nil failure.resolved_at

    WechatModels::SyncMessageModel.stub(:parse, lambda { |msg_hash, current_wxid|
      build_wx_message(msg_hash, current_wxid)
    }) do
      saved = WechatModels::SyncMessageModel.parse_saves(payload, owner_wxid)

      assert_equal 2, saved.count
    end

    failure.reload
    assert_equal 1, failure.failure_count
    assert_not_nil failure.resolved_at
    assert_equal [101, 102], WxMessage.order(:msg_id).pluck(:msg_id)
  end

  private

  def build_raw_message(msg_id:, new_msg_id:, content:)
    {
      "MsgId" => msg_id,
      "NewMsgId" => new_msg_id,
      "MsgSeq" => 1,
      "CreateTime" => Time.current.to_i,
      "MsgType" => 1,
      "Content" => { "string" => content },
      "FromUserName" => { "string" => "friend_wxid" },
      "ToUserName" => { "string" => "wxid_owner" }
    }
  end

  def build_wx_message(raw_message, current_wxid)
    WxMessage.new(
      msg_id: raw_message["MsgId"],
      new_msg_id: raw_message["NewMsgId"],
      msg_seq: raw_message["MsgSeq"],
      msg_create_time: Time.at(raw_message["CreateTime"]),
      msg_type: :text,
      real_msg_type: :text,
      from_user_name: raw_message.dig("FromUserName", "string"),
      to_user_name: raw_message.dig("ToUserName", "string"),
      content: raw_message.dig("Content", "string"),
      self_send: raw_message.dig("FromUserName", "string") == current_wxid
    )
  end
end
