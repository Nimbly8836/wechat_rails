class ApplicationController < ActionController::Base
  include Authentication
  # Only allow modern browsers supporting webp images, web push, badges, import maps, CSS nesting, and CSS :has.
  allow_browser versions: :modern

  rescue_from ApiError do |exception|
    Rails.logger.error("ApiError: #{exception.message}")

    render json: {
      status: "error",
      message: exception.message,
      details: exception.body
    }, status: (exception.status || :internal_server_error)
  end
end
