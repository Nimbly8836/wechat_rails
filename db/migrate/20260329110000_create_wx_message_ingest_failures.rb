class CreateWxMessageIngestFailures < ActiveRecord::Migration[8.0]
  def change
    create_table :wx_message_ingest_failures do |t|
      t.string :fingerprint, null: false
      t.string :owner_wxid, null: false
      t.string :stage, null: false
      t.bigint :msg_id
      t.bigint :new_msg_id
      t.bigint :msg_seq
      t.integer :msg_type
      t.string :from_user_name
      t.string :to_user_name
      t.string :error_class, null: false
      t.text :error_message, null: false
      t.jsonb :payload, null: false, default: {}
      t.integer :failure_count, null: false, default: 0
      t.datetime :first_failed_at, null: false
      t.datetime :last_failed_at, null: false
      t.datetime :resolved_at
      t.timestamps
    end

    add_index :wx_message_ingest_failures, :fingerprint, unique: true
    add_index :wx_message_ingest_failures, :owner_wxid
    add_index :wx_message_ingest_failures, :resolved_at
    add_index :wx_message_ingest_failures, :last_failed_at
  end
end
