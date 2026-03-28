class ChatRoomMember < ApplicationRecord
  belongs_to :chat_room

  scope :keyword_search, ->(query) {
    pgroonga_search(
      %w[
        chat_room_members.user_name
        chat_room_members.nick_name
        chat_room_members.remark
        chat_room_members.alias
        chat_room_members.py_initial
        chat_room_members.quan_pin
      ],
      query
    )
  }

  def display_name
    remark.presence || nick_name.presence || user_name
  end
end
