class SyncChatRoomMembersJob < ApplicationJob
  queue_as :default

  def perform(chat_room_wxid, owner_wxid, members)
    # 需要去同步群里的人的信息
  end
end
