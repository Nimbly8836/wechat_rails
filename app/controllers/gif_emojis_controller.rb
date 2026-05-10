class GifEmojisController < ApplicationController
  before_action :set_library

  def index
    sync_cached_emojis!
    render json: library_payload
  end

  def create
    emoji = create_from_cached_md5(params.require(:file_md5))
    return if performed?

    add_to_folder(emoji, favorites_folder) if truthy_param?(params[:favorite])
    add_to_folder(emoji, @folders.find(params[:folder_id])) if params[:folder_id].present?

    render json: library_payload.merge(emoji: serialize_emoji(emoji.reload)), status: :created
  rescue ActionController::ParameterMissing
    render json: { error: "file md5 missing" }, status: :bad_request
  rescue ActiveRecord::RecordInvalid => e
    render json: { error: e.record.errors.full_messages.to_sentence }, status: :unprocessable_entity
  end

  def destroy
    emoji = Current.user.gif_emojis.find(params[:id])
    emoji.destroy!
    render json: library_payload
  end

  def touch
    emoji = Current.user.gif_emojis.find(params[:id])
    emoji.update!(last_used_at: Time.current)
    render json: { emoji: serialize_emoji(emoji.reload) }
  end

  private

  def set_library
    GifEmojiFolder.ensure_defaults_for!(Current.user)
    @folders = Current.user.gif_emoji_folders.includes(:gif_emoji_folder_memberships).ordered
    @emojis = Current.user.gif_emojis.includes(:gif_emoji_folders).recent_first
  end

  def create_from_cached_md5(raw_md5)
    cache_info = EmojiCache.info(raw_md5)
    unless cache_info
      render json: { error: "emoji cache not found" }, status: :not_found
      return
    end

    Current.user.gif_emojis.find_or_initialize_by(file_md5: cache_info[:file_md5]).tap do |emoji|
      emoji.total_len = cache_info[:total_len]
      emoji.name = params[:name].to_s.strip.presence || emoji.name
      emoji.last_used_at ||= Time.current
      emoji.save!
    end
  end

  def sync_cached_emojis!
    EmojiCache.all.each do |cache_info|
      Current.user.gif_emojis.find_or_initialize_by(file_md5: cache_info[:file_md5]).tap do |emoji|
        emoji.total_len = cache_info[:total_len]
        emoji.name ||= File.basename(cache_info[:path])
        emoji.save! if emoji.new_record? || emoji.changed?
      end
    end
    @emojis = Current.user.gif_emojis.includes(:gif_emoji_folders).recent_first
  end

  def add_to_folder(emoji, folder)
    return unless emoji && folder

    folder.gif_emoji_folder_memberships.find_or_create_by!(gif_emoji: emoji) do |membership|
      membership.position = next_position(folder)
    end
  end

  def next_position(folder)
    (folder.gif_emoji_folder_memberships.maximum(:position) || -1) + 1
  end

  def favorites_folder
    @folders.find { |folder| folder.kind == "favorites" && folder.built_in? }
  end

  def library_payload
    @folders = Current.user.gif_emoji_folders.includes(:gif_emoji_folder_memberships).ordered
    @emojis = Current.user.gif_emojis.includes(:gif_emoji_folders).recent_first
    {
      folders: @folders.map { |folder| serialize_folder(folder) },
      emojis: @emojis.map { |emoji| serialize_emoji(emoji) }
    }
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

  def serialize_emoji(emoji)
    folder_ids = emoji.gif_emoji_folders.map { |folder| folder.id.to_s }
    {
      id: emoji.id.to_s,
      file_md5: emoji.file_md5,
      total_len: emoji.total_len,
      name: emoji.name,
      preview_url: emoji.preview_url,
      folder_ids: folder_ids,
      favorite: emoji.favorite?
    }
  end

  def truthy_param?(value)
    ActiveModel::Type::Boolean.new.cast(value)
  end
end
