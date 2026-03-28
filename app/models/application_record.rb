class ApplicationRecord < ActiveRecord::Base
  primary_abstract_class

  class << self
    def pgroonga_query(query)
      query.to_s.strip
    end

    def pgroonga_search(columns, query)
      keyword = pgroonga_query(query)
      return none if keyword.blank?

      predicates = Array(columns).map { |column| "#{column} &@~ :keyword" }
      where(predicates.join(" OR "), keyword: keyword)
    end
  end
end
