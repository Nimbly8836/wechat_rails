class RemoveTextAndFromWxidAddReadStatusFromMessages < ActiveRecord::Migration[8.0]
  def change
    remove_columns :messages, :text, :deleted, :from_wxid, :from_user_name
  end
end
