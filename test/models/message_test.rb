require "test_helper"

class MessageTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
  test "fill real msg type" do
    WxMessage.all.each do |msg|
      if msg.real_type.blank?
        msg.real_type = msg.get_real_msg_type
        msg.save
      end
    end
  end
end
