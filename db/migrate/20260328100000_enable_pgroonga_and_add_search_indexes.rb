class EnablePgroongaAndAddSearchIndexes < ActiveRecord::Migration[8.0]
  INDEX_TARGETS = [
    [ :wx_messages, :content ],
    [ :wx_messages, :refer_title ],
    [ :wx_messages, :push_content ],
    [ :contacts, :user_name ],
    [ :contacts, :nick_name ],
    [ :contacts, :remark ],
    [ :contacts, :alias ],
    [ :contacts, :py_initial ],
    [ :contacts, :quan_pin ],
    [ :chat_rooms, :name ],
    [ :chat_rooms, :wx_id ],
    [ :chat_room_members, :user_name ],
    [ :chat_room_members, :nick_name ],
    [ :chat_room_members, :remark ],
    [ :chat_room_members, :alias ],
    [ :chat_room_members, :py_initial ],
    [ :chat_room_members, :quan_pin ]
  ].freeze

  def up
    if extension_available?("pgroonga")
      enable_extension "pgroonga" unless extension_enabled?("pgroonga")
      add_search_indexes(using: :pgroonga)
    else
      enable_extension "pg_trgm" unless extension_enabled?("pg_trgm")
      add_search_indexes(using: :gin, opclass: :gin_trgm_ops)
    end
  end

  def down
    INDEX_TARGETS.each do |table_name, column_name|
      remove_index table_name, column_name if index_exists?(table_name, column_name)
    end
  end

  private

  def extension_available?(name)
    connection.select_values("SELECT name FROM pg_available_extensions").include?(name)
  end

  def add_search_indexes(using:, opclass: nil)
    INDEX_TARGETS.each do |table_name, column_name|
      options = { using: using }
      options[:opclass] = opclass if opclass
      add_index table_name, column_name, **options
    end
  end
end
