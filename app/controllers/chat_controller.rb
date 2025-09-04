class ChatController < ApplicationController
  def index
    # Mock data for UI development
    @contacts = mock_contacts
  end

  private

  def mock_contacts
    [
      {
        id: 1,
        name: "张三",
        avatar_url: nil,
        last_message: {
          content: "好的，周天见！",
          created_at: Time.current - 10.minutes
        },
        unread_count: 2
      },
      {
        id: 2,
        name: "李四",
        avatar_url: nil,
        last_message: {
          content: "文档已发送",
          created_at: Time.current - 2.hours
        },
        unread_count: 0
      },
      {
        id: 3,
        name: "王五",
        avatar_url: nil,
        last_message: {
          content: "项目进展如何？",
          created_at: Time.current - 1.day
        },
        unread_count: 1
      },
      {
        id: 4,
        name: "前端开发群",
        avatar_url: nil,
        last_message: {
          content: "大家对新框架有什么看法？",
          created_at: Time.current - 2.days
        },
        unread_count: 3
      },
      {
        id: 5,
        name: "设计团队",
        avatar_url: nil,
        last_message: {
          content: "UI稿已更新",
          created_at: Time.current - 3.days
        },
        unread_count: 0
      }
    ].map(&:with_indifferent_access)
  end
end
