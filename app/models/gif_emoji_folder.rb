class GifEmojiFolder < ApplicationRecord
  DEFAULT_FOLDERS = [
    { kind: "favorites", name: "收藏", position: 0, built_in: true }
  ].freeze

  belongs_to :user
  has_many :gif_emoji_folder_memberships, -> { order(Arel.sql("position ASC NULLS LAST, created_at ASC")) }, dependent: :destroy
  has_many :gif_emojis, through: :gif_emoji_folder_memberships

  validates :name, presence: true
  validates :kind, presence: true

  scope :ordered, -> { order(:position, :id) }

  def self.ensure_defaults_for!(user)
    DEFAULT_FOLDERS.each do |attrs|
      folder = user.gif_emoji_folders.find_or_initialize_by(kind: attrs[:kind], built_in: true)
      folder.name = attrs[:name]
      folder.position = attrs[:position]
      folder.save! if folder.new_record? || folder.changed?
    end
  end

  def custom?
    !built_in?
  end

  def emoji_ids
    gif_emoji_folder_memberships.order(:position, :id).pluck(:gif_emoji_id).map(&:to_s)
  end
end
