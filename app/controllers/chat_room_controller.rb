require 'open-uri'

class ChatRoomController < ApplicationController
  def index
  end

  def create
    Contact.find(params[:contact_id]).then do |contact|
      ChatRoom.create({
                        contact_id: contact.id,
                        name: contact.remark || contact.nick_name,
                        wx_id: contact.user_name,
                        avatar: URI.open(contact.avatar_url).read,
                      })
    end
  end

  def new
    @chat_room = ChatRoom.create(new_chat_room_params)
  end

  def show
    chat_room = ChatRoom.where(id: params[:id]).first
    if !chat_room
      response.error("ChatRoom not found")
    end
  end

  def edit

  end

  def list
    chat_rooms = ChatRoom.all.order(:created_at)
    render json: chat_rooms.as_json(only: [:id, :name, :contact_id], methods: [:avatar_base64])
  end

  private

  def new_chat_room_params
    params.except(:contact_id, :name, :avatar_url, :wx_id)
  end
end
