class ChatController < ApplicationController
  def index
    # Mock data for UI development
    @contacts = Contact.where.not(nick_name: nil)
    @grouped_contacts = @contacts.group_by(&:initial)
    @letters = [ "#" ] + ("A".."Z").to_a # 用于右侧导航
  end

  private
end
