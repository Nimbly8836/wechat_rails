require "open3"
require "fileutils"
require "base64"

class VoiceConversionService
  class ConversionError < StandardError; end

  CONVERTER_SCRIPT = Rails.root.join("lib", "silk2mp3", "converter.sh").freeze
  STORAGE_DIR = Rails.root.join("storage", "voices").freeze
  OUTPUT_EXTENSION = ".mp3".freeze
  OUTPUT_FORMAT = "mp3".freeze

  def initialize(identifier)
    raise ArgumentError, "identifier is required" if identifier.blank?

    @identifier = identifier.to_s
  end

  def cached_file_path
    STORAGE_DIR.join(@identifier + OUTPUT_EXTENSION)
  end

  def cached_source_path
    STORAGE_DIR.join(@identifier + ".silk")
  end

  def cached_file_available?
    File.exist?(cached_file_path)
  end

  def convert_and_store!(base64_buffer)
    ensure_converter_available!
    ensure_storage_directory!

    decoded = decode_buffer(base64_buffer)
    silk_path = cached_source_path

    File.binwrite(silk_path, decoded)

    stdout, stderr, status = Open3.capture3("bash", CONVERTER_SCRIPT.to_s, silk_path.to_s, OUTPUT_FORMAT)

    Rails.logger.debug { "silk2mp3 stdout: #{stdout}" } unless stdout.blank?
    Rails.logger.warn { "silk2mp3 stderr: #{stderr}" } unless stderr.blank?

    unless status.success?
      raise ConversionError,
            "silk2mp3 exited with status #{status.exitstatus} source=#{silk_path} output=#{cached_file_path}"
    end

    mp3_path = cached_file_path

    unless File.exist?(mp3_path)
      raise ConversionError,
            "conversion succeeded but output file missing source=#{silk_path} output=#{mp3_path} " \
            "stdout=#{stdout.to_s.strip.inspect} stderr=#{stderr.to_s.strip.inspect}"
    end

    File.delete(silk_path) if File.exist?(silk_path)

    mp3_path
  end

  def mime_type
    "audio/mpeg"
  end

  private

  def ensure_converter_available!
    return if File.exist?(CONVERTER_SCRIPT)

    raise ConversionError, "converter script not found at #{CONVERTER_SCRIPT}"
  end

  def ensure_storage_directory!
    FileUtils.mkdir_p(STORAGE_DIR)
  end

  def decode_buffer(base64_buffer)
    raise ConversionError, "empty voice buffer" if base64_buffer.blank?

    Base64.decode64(base64_buffer)
  rescue ArgumentError => e
    raise ConversionError, "invalid base64 voice buffer: #{e.message}"
  end
end
