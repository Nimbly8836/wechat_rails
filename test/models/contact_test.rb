require "test_helper"

class ContactTest < ActiveSupport::TestCase
  test "official account uses description nullability" do
    contact = Contact.new(user_name: "wxid_example", own_wxid: "owner")
    refute contact.official_account?

    contact.description = ""
    assert contact.official_account?
  end
end
