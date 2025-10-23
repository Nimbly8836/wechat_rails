class AddWxMessageReferTitle < ActiveRecord::Migration[8.0]
  def change
    add_column :wx_messages, :refer_title, :string
  end
end
