class CreateChatBots < ActiveRecord::Migration[8.0]
  def change
    create_table :chat_bots do |t|
      t.references :user, foreign_key: true
      t.string :name, null: false
      t.boolean :enabled, null: false, default: true
      t.text :code, null: false, default: ""
      t.integer :timeout_ms, null: false, default: 1000
      t.datetime :last_error_at
      t.text :last_error

      t.timestamps
    end

    add_index :chat_bots, [ :user_id, :name ], unique: true
  end
end
