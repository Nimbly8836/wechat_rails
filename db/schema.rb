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

ActiveRecord::Schema[8.0].define(version: 2025_09_06_142711) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

# Could not dump table "chat_rooms" because of following ActiveRecord::ConnectionFailed
#   PQconsumeInput() server closed the connection unexpectedly
	This probably means the server terminated abnormally
	before or while processing the request.


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
    t.string "from_wxid"
    t.text "text"
    t.string "from_user_name"
    t.string "wx_msg_id"
    t.string "wx_new_msg_id"
    t.boolean "deleted", default: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["chat_room_id"], name: "index_messages_on_chat_room_id"
    t.index ["from_wxid", "wx_msg_id", "wx_new_msg_id"], name: "index_messages_on_from_wxid_and_wx_msg_id_and_wx_new_msg_id", unique: true
  end

  add_foreign_key "chat_rooms", "contacts"
  add_foreign_key "messages", "chat_rooms"
end
