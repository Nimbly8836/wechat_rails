class Contact < ApplicationRecord

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
