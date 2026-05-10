# frozen_string_literal: true

require "base64"
require "digest/md5"
require "fileutils"

class EmojiCache
  MD5_PATTERN = /\A[0-9a-f]{32}\z/i

  class << self
    def normalize_md5(value)
      md5 = value.to_s.strip.downcase
      return nil unless md5.match?(MD5_PATTERN)

      md5
    end

    def storage_dir
      Rails.root.join("storage", "emojis").tap { |path| FileUtils.mkdir_p(path) }
    end

    def locate(file_md5)
      md5 = normalize_md5(file_md5)
      return nil if md5.blank?

      Dir.glob(storage_dir.join("#{md5}.*")).first || begin
        path = storage_dir.join(md5)
        path.to_s if File.exist?(path)
      end
    end

    def info(file_md5)
      path = locate(file_md5)
      return nil unless path

      {
        file_md5: normalize_md5(file_md5),
        path: path,
        total_len: File.size(path)
      }
    end

    def all
      Dir.glob(storage_dir.join("*"))
        .filter_map { |path| info_from_path(path) }
        .sort_by { |item| [ -File.mtime(item[:path]).to_i, item[:file_md5] ] }
    end

    def info_from_path(path)
      return nil unless File.file?(path)

      basename = File.basename(path, File.extname(path))
      file_md5 = normalize_md5(basename)
      file_md5 ||= Digest::MD5.hexdigest(File.binread(path))
      {
        file_md5: file_md5,
        path: path.to_s,
        total_len: File.size(path)
      }
    end

    def store_gif(data)
      file_md5 = Digest::MD5.hexdigest(data)
      path = storage_dir.join("#{file_md5}.gif")
      File.binwrite(path, data) unless File.exist?(path)
      {
        file_md5: file_md5,
        path: path.to_s,
        total_len: data.bytesize
      }
    end

    def data_uri(path)
      "data:image/gif;base64,#{Base64.strict_encode64(File.binread(path))}"
    end
  end
end
