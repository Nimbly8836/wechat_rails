class AddFieldsToContact < ActiveRecord::Migration[8.0]
  def change
    add_column :contact, :own_wxid, :string
    add_column :contact, :user_type, :integer
  end
end
