class ChatController < ApplicationController
  def index
    # 只负责联系人列表数据
    @contacts = Contact.where.not(nick_name: nil)
    @grouped_contacts = @contacts.group_by(&:initial)
    @letters = [ "#" ] + ("A".."Z").to_a # 用于右侧导航
  end

  private
end
