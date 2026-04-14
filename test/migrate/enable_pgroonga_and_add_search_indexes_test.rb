require "test_helper"
require Rails.root.join("db/migrate/20260328100000_enable_pgroonga_and_add_search_indexes")

class EnablePgroongaAndAddSearchIndexesTest < ActiveSupport::TestCase
  class FakeMigration < EnablePgroongaAndAddSearchIndexes
    attr_reader :enabled_extensions, :added_indexes

    def initialize(pgroonga_available:)
      super()
      @pgroonga_available = pgroonga_available
      @enabled_extensions = []
      @added_indexes = []
    end

    private

    def extension_available?(name)
      name == "pgroonga" ? @pgroonga_available : true
    end

    def extension_enabled?(_name)
      false
    end

    def enable_extension(name)
      @enabled_extensions << name
    end

    def add_index(table_name, column_name, **options)
      @added_indexes << [ table_name, column_name, options ]
    end
  end

  test "uses pgroonga indexes when pgroonga is available" do
    migration = FakeMigration.new(pgroonga_available: true)
    migration.up

    assert_equal [ "pgroonga" ], migration.enabled_extensions
    assert_equal 17, migration.added_indexes.length
    assert migration.added_indexes.all? { |(_table_name, _column_name, options)| options == { using: :pgroonga } }
  end

  test "falls back to pg_trgm indexes when pgroonga is unavailable" do
    migration = FakeMigration.new(pgroonga_available: false)
    migration.up

    assert_equal [ "pg_trgm" ], migration.enabled_extensions
    assert_equal 17, migration.added_indexes.length
    assert migration.added_indexes.all? do |(_table_name, _column_name, options)|
      options == { using: :gin, opclass: :gin_trgm_ops }
    end
  end
end
