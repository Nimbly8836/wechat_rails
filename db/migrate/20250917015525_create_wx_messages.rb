class CreateWxMessages < ActiveRecord::Migration[8.0]
  def change
    create_table :wx_messages do |t|
      t.bigint :msg_id
      t.bigint :new_msg_id
      t.bigint :msg_seq
      t.timestamp :msg_create_time
      t.integer :status
      t.integer :msg_type
      t.string :from_user_name
      t.string :to_user_name
      t.text :content
      t.integer :img_status
      t.text :msg_source
      t.string :push_content
      t.timestamps

      t.index [:msg_id, :new_msg_id, :msg_seq], unique: true
    end
  end

end
