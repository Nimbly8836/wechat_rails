class User < ApplicationRecord
  has_secure_password
  has_many :sessions, dependent: :destroy
  has_many :chat_folders, dependent: :destroy
  has_many :chat_bots, dependent: :nullify
  has_many :gif_emojis, dependent: :destroy
  has_many :gif_emoji_folders, dependent: :destroy

  normalizes :email_address, with: ->(e) { e.strip.downcase }
end
