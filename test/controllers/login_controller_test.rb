require "test_helper"

class LoginControllerTest < ActionDispatch::IntegrationTest
  setup do
    post session_path, params: {
      email_address: users(:one).email_address,
      password: "password"
    }
  end

  test "bootstrap_online_sessions triggers async bootstrap" do
    called_force = nil

    WechatSessionBootstrapService.stub(:run_async, ->(force: false) {
      called_force = force
      true
    }) do
      post "/login/bootstrap_online_sessions", params: { force: "true" }
    end

    assert_response :success
    assert_equal true, called_force

    payload = JSON.parse(response.body)
    assert_equal true, payload["success"]
    assert_equal true, payload["started"]
  end
end
