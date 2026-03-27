class Contact < ApplicationRecord
  has_many :chat_rooms, foreign_key: :contact_id
  validates :user_name, presence: true
  validates :own_wxid, presence: true

  # 获取头像
  def avatar_url
    big_head_img_url.presence || small_head_img_url
  end

  # 获取显示名称（优先显示备注，其次昵称）
  def display_name
    remark.presence || nick_name.presence || user_name
  end

  def official_account?
    user_name.to_s.start_with?("gh_")
  end

  def official_account
    official_account?
  end

  def group_chat?
    user_name.to_s.end_with?("@chatroom")
  end

  def group_chat
    group_chat?
  end

  def contact_kind
    return "official_account" if official_account?
    return "group_chat" if group_chat?

    "contact"
  end

  # 获取首字母（大写），非字母归为 #
  def initial
    first_char = ((
      if remark_py_initial
        remark_py_initial
      else
        py_initial
      end)).to_s[0]&.upcase
    ("A".."Z").include?(first_char) ? first_char : "#"
  end

end
