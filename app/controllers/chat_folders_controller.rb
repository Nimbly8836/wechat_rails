class ChatFoldersController < ApplicationController
  before_action :set_chat_folders
  before_action :set_chat_folder, only: [ :destroy, :toggle_room, :toggle_pin ]

  def index
    render json: folders_payload
  end

  def create
    folder = Current.user.chat_folders.create!(
      name: params.require(:name).to_s.strip,
      kind: "custom",
      built_in: false,
      position: next_custom_position
    )

    render json: {
      folder: serialize_folder(folder),
      folders: folders_payload
    }, status: :created
  end

  def destroy
    return render json: { error: "built-in folders cannot be deleted" }, status: :unprocessable_entity if @chat_folder.built_in?

    @chat_folder.destroy!
    render json: { folders: folders_payload }
  end

  def toggle_room
    return render json: { error: "built-in folders cannot manually manage rooms" }, status: :unprocessable_entity if @chat_folder.built_in?

    chat_room = ChatRoom.find(params.require(:chat_room_id))
    membership = @chat_folder.chat_folder_memberships.find_by(chat_room_id: chat_room.id)

    if membership
      membership.destroy!
    else
      @chat_folder.chat_folder_memberships.create!(chat_room: chat_room)
    end

    render json: { folders: folders_payload }
  end

  def toggle_pin
    chat_room = ChatRoom.find(params.require(:chat_room_id))
    membership = @chat_folder.chat_folder_memberships.find_or_initialize_by(chat_room_id: chat_room.id)

    if membership.pinned_position.present?
      if @chat_folder.built_in?
        membership.destroy! if membership.persisted?
      else
        membership.update!(pinned_position: nil)
      end
    else
      membership.pinned_position = next_pinned_position(@chat_folder)
      membership.save!
    end

    render json: { folders: folders_payload }
  end

  private

  def set_chat_folders
    ChatFolder.ensure_defaults_for!(Current.user)
    @chat_folders = Current.user.chat_folders.includes(:chat_folder_memberships).ordered
  end

  def set_chat_folder
    @chat_folder = @chat_folders.find(params[:id])
  end

  def next_custom_position
    (@chat_folders.maximum(:position) || -1) + 1
  end

  def next_pinned_position(folder)
    (folder.chat_folder_memberships.maximum(:pinned_position) || -1) + 1
  end

  def folders_payload
    Current.user.chat_folders.includes(:chat_folder_memberships).ordered.map do |folder|
      serialize_folder(folder)
    end
  end

  def serialize_folder(folder)
    {
      id: folder.id.to_s,
      name: folder.name,
      kind: folder.kind,
      built_in: folder.built_in?,
      room_ids: folder.room_ids,
      pinned_room_ids: folder.pinned_room_ids
    }
  end
end
