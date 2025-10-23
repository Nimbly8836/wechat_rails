class CreateLoginInfos < ActiveRecord::Migration[8.0]
  def change
    create_table :login_infos do |t|
      t.string :user_name, null: false
      t.string :nick_name
      t.integer :bind_uin
      t.string :bind_email
      t.string :bind_mobile
      t.string :alias
      t.integer :status
      t.integer :plugin_flag
      t.integer :reg_type
      t.integer :safe_device
      t.string :official_user_name
      t.string :official_nick_name
      t.integer :push_mail_status
      t.text :fs_url
      t.boolean :online
      t.datetime :last_login_at

      t.timestamps
    end
    add_index :login_infos, :user_name, unique: true
  end
end
