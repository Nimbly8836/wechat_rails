class AddMessageTimeFromMessages < ActiveRecord::Migration[8.0]
  def change
    add_column :messages, :message_time, :timestamp
  end
end
