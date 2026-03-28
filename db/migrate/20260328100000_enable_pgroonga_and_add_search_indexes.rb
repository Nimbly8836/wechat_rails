class EnablePgroongaAndAddSearchIndexes < ActiveRecord::Migration[8.0]
  def change
    enable_extension "pgroonga" unless extension_enabled?("pgroonga")

    add_index :wx_messages, :content, using: :pgroonga
    add_index :wx_messages, :refer_title, using: :pgroonga
    add_index :wx_messages, :push_content, using: :pgroonga

    add_index :contacts, :user_name, using: :pgroonga
    add_index :contacts, :nick_name, using: :pgroonga
    add_index :contacts, :remark, using: :pgroonga
    add_index :contacts, :alias, using: :pgroonga
    add_index :contacts, :py_initial, using: :pgroonga
    add_index :contacts, :quan_pin, using: :pgroonga

    add_index :chat_rooms, :name, using: :pgroonga
    add_index :chat_rooms, :wx_id, using: :pgroonga

    add_index :chat_room_members, :user_name, using: :pgroonga
    add_index :chat_room_members, :nick_name, using: :pgroonga
    add_index :chat_room_members, :remark, using: :pgroonga
    add_index :chat_room_members, :alias, using: :pgroonga
    add_index :chat_room_members, :py_initial, using: :pgroonga
    add_index :chat_room_members, :quan_pin, using: :pgroonga
  end
end
