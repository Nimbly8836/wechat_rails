class GifEmojiFolderMembership < ApplicationRecord
  belongs_to :gif_emoji_folder
  belongs_to :gif_emoji

  validates :gif_emoji_id, uniqueness: { scope: :gif_emoji_folder_id }
end
