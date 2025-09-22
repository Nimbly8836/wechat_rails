class AddWxMessageReferNewMsgId < ActiveRecord::Migration[8.0]
  def change
    # 引用消息解析出来的原始消息的 new_msg_id
    add_column :wx_messages, :refer_new_msg_id, :bigint
  end
end
