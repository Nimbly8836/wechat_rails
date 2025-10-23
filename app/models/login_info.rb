class LoginInfo < ApplicationRecord
  validates :user_name, presence: true, uniqueness: true

  # 标记为在线并更新时间
  def mark_as_online!
    update!(online: true, last_login_at: Time.current)
  end

  # 如果你还需要下线方法，可以加上
  def mark_as_offline!
    update!(online: false)
  end
end
