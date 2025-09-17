# frozen_string_literal: true

class WxMessage < ApplicationRecord
  has_many :messages, -> { order(message_time: :desc) }

  def self.save_to_chat_room(messages)
    messages.map do |message|
      Message.new({})
    end

  end

  enum :msg_type,
       text: 1, # 文本消息
       image: 3, # 图片消息
       card: 42, # 名片
       refer: 49, # 引用
       status_notify: 51, # 状态通知
       system_msg: 10002 # 系统消息


end
