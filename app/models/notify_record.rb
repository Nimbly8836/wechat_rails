class NotifyRecord < ApplicationRecord
  self.abstract_class = true
  connects_to database: { writing: :notify }
end
