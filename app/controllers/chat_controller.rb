class ChatController < ApplicationController
  def index
    # 只负责联系人列表数据
    @contacts = Contact.where.not(nick_name: nil)
    @official_contacts = @contacts.select(&:official_account?).sort_by(&:display_name)
    @group_chat_contacts = @contacts.select(&:group_chat?).sort_by(&:display_name)
    regular_contacts = @contacts.reject { |contact| contact.official_account? || contact.group_chat? }
    @grouped_contacts = regular_contacts.group_by(&:initial)
    @letters = [ "#" ] + ("A".."Z").to_a # 用于右侧导航

    @chat_rooms = ChatRoom.all.order_by_latest_message
  end

  private
end
