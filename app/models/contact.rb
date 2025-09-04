class Contact < ApplicationRecord
  self.primary_key = :user_name
  self.table_name = :contact

  validates :user_name, presence: true


  # 获取头像
  def avatar_url
    small_head_img_url.presence || big_head_img_url
  end

  # 获取显示名称（优先显示备注，其次昵称）
  def display_name
    remark.presence || nick_name.presence || user_name
  end


end
