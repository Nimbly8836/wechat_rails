class AddWxMessageIdToMessages < ActiveRecord::Migration[8.0]
  def change
    add_reference :messages, :wx_messages, foreign_key: true
  end
end
