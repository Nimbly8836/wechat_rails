class ChatRoomController < ApplicationController

  def list
    ChatRoom.all
  end

  def show
  end

  def create
    contact_record = Contact.where(id: params[:contact_id])
    next if contact_record.exists?

    ChatRoom.create({
                      contact_id: params[:contact_id],
                      wx_id: contact_record.user_name,
                      name: contact_record.remark || contact_record.nick_name,
                      avatar: URI.open(contact_record.avatar_url).read
                    })
  end
end
