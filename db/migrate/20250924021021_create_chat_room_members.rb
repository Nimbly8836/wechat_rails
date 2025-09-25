class CreateChatRoomMembers < ActiveRecord::Migration[8.0]
  def change
    create_table :chat_room_members do |t|
      t.references :chat_room, null: false, foreign_key: true
      t.string :room_wxid, null: false
      t.string :user_name
      t.string :nick_name
      t.string :py_initial
      t.string :quan_pin
      t.integer :sex
      t.string :remark
      t.string :remark_py_initial
      t.string :remark_quan_pin
      t.string :signature
      t.string :alias
      t.string :sns_bg_img
      t.string :country
      t.string :big_head_img_url
      t.string :small_head_img_url
      t.string :card_img_url
      t.string :province
      t.string :city
      t.string :phone_num_list
      t.timestamps
    end
  end
end
