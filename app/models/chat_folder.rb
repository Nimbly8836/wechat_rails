class ChatFolder < ApplicationRecord
  DEFAULT_FOLDERS = [
    { kind: "groups", name: "群聊", position: 0, built_in: true },
    { kind: "contacts", name: "联系人", position: 1, built_in: true },
    { kind: "official_accounts", name: "公众号", position: 2, built_in: true }
  ].freeze

  belongs_to :user
  has_many :chat_folder_memberships, -> { order(Arel.sql("pinned_position ASC NULLS LAST, created_at ASC")) },
    dependent: :destroy
  has_many :chat_rooms, through: :chat_folder_memberships

  validates :name, presence: true
  validates :kind, presence: true

  scope :ordered, -> { order(:position, :id) }

  def self.ensure_defaults_for!(user)
    DEFAULT_FOLDERS.each do |attrs|
      folder = user.chat_folders.find_or_initialize_by(kind: attrs[:kind], built_in: true)
      folder.name = attrs[:name]
      folder.position = attrs[:position]
      folder.save! if folder.new_record? || folder.changed?
    end
  end

  def custom?
    !built_in?
  end

  def pinned_room_ids
    chat_folder_memberships.where.not(pinned_position: nil)
      .order(:pinned_position, :id)
      .pluck(:chat_room_id)
      .map(&:to_s)
  end

  def room_ids
    return [] unless custom?

    chat_folder_memberships.order(:id).pluck(:chat_room_id).map(&:to_s)
  end
end
