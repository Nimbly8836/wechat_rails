class CreateGifEmojiFolderMemberships < ActiveRecord::Migration[8.0]
  def change
    create_table :gif_emoji_folder_memberships do |t|
      t.references :gif_emoji_folder, null: false, foreign_key: true
      t.references :gif_emoji, null: false, foreign_key: true
      t.integer :position

      t.timestamps
    end

    add_index :gif_emoji_folder_memberships,
      [ :gif_emoji_folder_id, :gif_emoji_id ],
      unique: true,
      name: "idx_gif_emoji_folder_memberships_unique"
    add_index :gif_emoji_folder_memberships,
      [ :gif_emoji_folder_id, :position ],
      name: "idx_gif_emoji_folder_memberships_position"
  end
end
