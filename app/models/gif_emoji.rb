class GifEmoji < ApplicationRecord
  belongs_to :user
  has_many :gif_emoji_folder_memberships, dependent: :destroy
  has_many :gif_emoji_folders, through: :gif_emoji_folder_memberships

  validates :file_md5, presence: true, format: { with: EmojiCache::MD5_PATTERN }
  validates :file_md5, uniqueness: { scope: :user_id }

  before_validation do
    self.file_md5 = EmojiCache.normalize_md5(file_md5) if file_md5.present?
  end

  scope :recent_first, -> { order(Arel.sql("last_used_at DESC NULLS LAST, created_at DESC")) }

  def preview_url
    "/message/emoji/md5/#{ERB::Util.url_encode(file_md5)}"
  end

  def favorite?
    gif_emoji_folders.any? { |folder| folder.kind == "favorites" && folder.built_in? }
  end
end
