# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.0].define(version: 2026_03_29_161000) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "chat_room_members", force: :cascade do |t|
    t.bigint "chat_room_id", null: false
    t.string "room_wxid", null: false
    t.string "user_name"
    t.string "nick_name"
    t.string "py_initial"
    t.string "quan_pin"
    t.integer "sex"
    t.string "remark"
    t.string "remark_py_initial"
    t.string "remark_quan_pin"
    t.string "signature"
    t.string "alias"
    t.string "sns_bg_img"
    t.string "country"
    t.string "big_head_img_url"
    t.string "small_head_img_url"
    t.string "card_img_url"
    t.string "province"
    t.string "city"
    t.string "phone_num_list"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["chat_room_id"], name: "index_chat_room_members_on_chat_room_id"
  end

  create_table "chat_rooms", force: :cascade do |t|
    t.string "wx_id", null: false
    t.string "name"
    t.binary "avatar"
    t.json "members", default: []
    t.bigint "contact_id", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["contact_id"], name: "index_chat_rooms_on_contact_id", unique: true
  end

  create_table "contacts", force: :cascade do |t|
    t.string "user_name", null: false
    t.string "own_wxid", null: false
    t.string "nick_name"
    t.string "py_initial"
    t.string "quan_pin"
    t.integer "sex"
    t.string "remark"
    t.string "remark_py_initial"
    t.string "remark_quan_pin"
    t.string "signature"
    t.string "alias"
    t.string "sns_bg_img"
    t.string "country"
    t.string "big_head_img_url"
    t.string "small_head_img_url"
    t.string "description"
    t.string "card_img_url"
    t.string "label_list"
    t.string "province"
    t.string "city"
    t.string "phone_num_list"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.jsonb "member_list"
    t.index ["user_name", "own_wxid"], name: "index_contacts_on_user_name_and_own_wxid", unique: true
  end

  create_table "login_infos", force: :cascade do |t|
    t.string "user_name", null: false
    t.string "nick_name"
    t.integer "bind_uin"
    t.string "bind_email"
    t.string "bind_mobile"
    t.string "alias"
    t.integer "status"
    t.integer "plugin_flag"
    t.integer "reg_type"
    t.integer "safe_device"
    t.string "official_user_name"
    t.string "official_nick_name"
    t.integer "push_mail_status"
    t.text "fs_url"
    t.boolean "online"
    t.datetime "last_login_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["user_name"], name: "index_login_infos_on_user_name", unique: true
  end

  create_table "messages", force: :cascade do |t|
    t.bigint "chat_room_id", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "wx_messages_id"
    t.datetime "message_time", precision: nil
    t.index ["chat_room_id"], name: "index_messages_on_chat_room_id"
    t.index ["wx_messages_id"], name: "index_messages_on_wx_messages_id"
  end

  create_table "sessions", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.string "ip_address"
    t.string "user_agent"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["user_id"], name: "index_sessions_on_user_id"
  end

  create_table "users", force: :cascade do |t|
    t.string "email_address", null: false
    t.string "password_digest", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["email_address"], name: "index_users_on_email_address", unique: true
  end

  create_table "wx_messages", force: :cascade do |t|
    t.bigint "msg_id"
    t.bigint "new_msg_id"
    t.bigint "msg_seq"
    t.datetime "msg_create_time", precision: nil
    t.integer "status"
    t.integer "msg_type"
    t.string "from_user_name"
    t.string "to_user_name"
    t.text "content"
    t.integer "img_status"
    t.text "msg_source"
    t.string "push_content"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "refer_new_msg_id"
    t.string "refer_title"
    t.boolean "self_send", default: false, null: false
    t.text "emoji_md5"
    t.text "emoji_file_md5"
    t.integer "real_msg_type"
    t.index ["emoji_file_md5"], name: "index_wx_messages_on_emoji_file_md5"
    t.index ["msg_id", "new_msg_id", "msg_seq"], name: "index_wx_messages_on_msg_id_and_new_msg_id_and_msg_seq", unique: true
  end

  create_table "wx_message_ingest_failures", force: :cascade do |t|
    t.string "fingerprint", null: false
    t.string "owner_wxid", null: false
    t.string "stage", null: false
    t.bigint "msg_id"
    t.bigint "new_msg_id"
    t.bigint "msg_seq"
    t.integer "msg_type"
    t.string "from_user_name"
    t.string "to_user_name"
    t.string "error_class", null: false
    t.text "error_message", null: false
    t.jsonb "payload", default: {}, null: false
    t.integer "failure_count", default: 0, null: false
    t.datetime "first_failed_at", null: false
    t.datetime "last_failed_at", null: false
    t.datetime "resolved_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["fingerprint"], name: "index_wx_message_ingest_failures_on_fingerprint", unique: true
    t.index ["last_failed_at"], name: "index_wx_message_ingest_failures_on_last_failed_at"
    t.index ["owner_wxid"], name: "index_wx_message_ingest_failures_on_owner_wxid"
    t.index ["resolved_at"], name: "index_wx_message_ingest_failures_on_resolved_at"
  end

  add_foreign_key "chat_room_members", "chat_rooms"
  add_foreign_key "chat_rooms", "contacts"
  add_foreign_key "messages", "chat_rooms"
  add_foreign_key "messages", "wx_messages", column: "wx_messages_id"
  add_foreign_key "sessions", "users"
end
