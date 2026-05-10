class ChatRoomHook < ApplicationRecord
  MIN_TIMEOUT_MS = 100
  MAX_TIMEOUT_MS = 5_000
  MAX_CODE_LENGTH = 20_000

  belongs_to :chat_room

  validates :code, length: { maximum: MAX_CODE_LENGTH }
  validates :timeout_ms, numericality: {
    only_integer: true,
    greater_than_or_equal_to: MIN_TIMEOUT_MS,
    less_than_or_equal_to: MAX_TIMEOUT_MS
  }

  before_validation do
    self.code = code.to_s
    self.timeout_ms = timeout_ms.to_i.clamp(MIN_TIMEOUT_MS, MAX_TIMEOUT_MS)
  end

  def active?
    enabled? && code.present?
  end
end
