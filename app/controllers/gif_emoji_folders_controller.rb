class GifEmojiFoldersController < ApplicationController
  before_action :set_library
  before_action :set_folder, only: [ :destroy, :toggle_emoji ]

  def create
    folder = Current.user.gif_emoji_folders.create!(
      name: params.require(:name).to_s.strip,
      kind: "custom",
      built_in: false,
      position: next_folder_position
    )

    render json: { folder: serialize_folder(folder), folders: folders_payload }, status: :created
  end

  def destroy
    return render json: { error: "built-in folders cannot be deleted" }, status: :unprocessable_entity if @folder.built_in?

    @folder.destroy!
    render json: { folders: folders_payload }
  end

  def toggle_emoji
    emoji = Current.user.gif_emojis.find(params.require(:gif_emoji_id))
    membership = @folder.gif_emoji_folder_memberships.find_by(gif_emoji: emoji)

    if membership
      membership.destroy!
    else
      @folder.gif_emoji_folder_memberships.create!(gif_emoji: emoji, position: next_emoji_position(@folder))
    end

    render json: { folders: folders_payload }
  end

  private

  def set_library
    GifEmojiFolder.ensure_defaults_for!(Current.user)
    @folders = Current.user.gif_emoji_folders.includes(:gif_emoji_folder_memberships).ordered
  end

  def set_folder
    @folder = @folders.find(params[:id])
  end

  def next_folder_position
    (@folders.maximum(:position) || -1) + 1
  end

  def next_emoji_position(folder)
    (folder.gif_emoji_folder_memberships.maximum(:position) || -1) + 1
  end

  def folders_payload
    Current.user.gif_emoji_folders.includes(:gif_emoji_folder_memberships).ordered.map do |folder|
      serialize_folder(folder)
    end
  end

  def serialize_folder(folder)
    {
      id: folder.id.to_s,
      name: folder.name,
      kind: folder.kind,
      built_in: folder.built_in?,
      emoji_ids: folder.emoji_ids
    }
  end
end
