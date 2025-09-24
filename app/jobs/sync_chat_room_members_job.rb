class SyncChatRoomMembersJob < ApplicationJob
  queue_as :default

  def perform(owner_wxid, chat_room_wxid)
    # 需要去同步群里的人的信息
  end
end
