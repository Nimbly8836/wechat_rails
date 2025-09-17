class RemoveIndexAndMModifyWxFromMessages < ActiveRecord::Migration[8.0]
  def change
    remove_index :messages, name: "index_messages_on_from_wxid_and_wx_msg_id_and_wx_new_msg_id"
    remove_columns :messages, :wx_msg_id, :wx_new_msg_id
  end
end
