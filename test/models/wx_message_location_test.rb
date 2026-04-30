require "test_helper"

class WxMessageLocationTest < ActiveSupport::TestCase
  test "parsed_message_payload extracts location xml attributes" do
    wx_message = WxMessage.new(
      msg_type: :location,
      real_msg_type: :location,
      content: <<~XML
        <?xml version="1.0"?>
        <msg>
          <location x="-17.646459" y="177.082248" scale="15" label="" maptype="roadmap" poiname="[Location]" poiid="" buildingId="" floorName="" poiCategoryTips="" poiBusinessHour="" poiPhone="" poiPriceTips="" isFromPoiList="false" adcode="0" cityname="" />
        </msg>
      XML
    )

    payload = wx_message.parsed_message_payload

    assert_equal "location", payload[:type]
    assert_equal "-17.646459", payload[:latitude]
    assert_equal "177.082248", payload[:longitude]
    assert_equal 15, payload[:scale]
    assert_equal "[Location]", payload[:title]
    assert_equal "https://maps.google.com/?q=-17.646459,177.082248", payload[:map_url]
  end

  test "preview_content uses location title" do
    wx_message = WxMessage.new(
      msg_type: :location,
      real_msg_type: :location,
      content: <<~XML
        <msg>
          <location x="31.2304" y="121.4737" label="上海市" poiname="人民广场" />
        </msg>
      XML
    )

    assert_equal "[位置] 人民广场", wx_message.preview_content
  end
end
