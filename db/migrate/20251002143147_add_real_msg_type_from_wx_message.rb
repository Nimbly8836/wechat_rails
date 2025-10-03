class AddRealMsgTypeFromWxMessage < ActiveRecord::Migration[8.0]
  def change
    add_column(:wx_messages, :real_msg_type, :integer)
  end
end
