class CreateGifEmojis < ActiveRecord::Migration[8.0]
  def change
    create_table :gif_emojis do |t|
      t.references :user, null: false, foreign_key: true
      t.string :file_md5, null: false
      t.bigint :total_len
      t.string :name
      t.datetime :last_used_at

      t.timestamps
    end

    add_index :gif_emojis, [ :user_id, :file_md5 ], unique: true
    add_index :gif_emojis, [ :user_id, :last_used_at ]
  end
end
