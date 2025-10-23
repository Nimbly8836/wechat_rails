# frozen_string_literal: true

class ApiError < StandardError
  attr_reader :status, :body

  def initialize(message, status: nil, body: nil)
    super(message)
    @status = status
    @body   = body
  end
end
