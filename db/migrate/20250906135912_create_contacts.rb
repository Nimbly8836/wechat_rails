class CreateContacts < ActiveRecord::Migration[8.0]
  def change
    create_table :contacts do |t|
      t.string :user_name, null: false
      t.string :own_wxid, null: false
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
      t.string :description
      t.string :card_img_url
      t.string :label_list
      t.string :province
      t.string :city
      t.string :phone_num_list
      t.timestamps
    end
    add_index :contacts, [ :user_name, :own_wxid ], unique: true
  end
end
