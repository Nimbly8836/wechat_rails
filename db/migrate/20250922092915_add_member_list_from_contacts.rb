class AddMemberListFromContacts < ActiveRecord::Migration[8.0]
  def change
    add_column :contacts, :member_list, :jsonb
  end
end
