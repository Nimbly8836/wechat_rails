# frozen_string_literal: true

require "base64"
require "open3"
require "tempfile"

class AudioTranscodingService
  class TranscodingError < StandardError; end

  OUTPUT_EXTENSION = ".mp3"
  OUTPUT_MIME_TYPE = "audio/mpeg"

  def initialize(uploaded_file)
    @uploaded_file = uploaded_file
  end

  def transcode_to_mp3!
    ensure_file_present!

    output = Tempfile.new([ "voice-send-", OUTPUT_EXTENSION ])
    output.close

    stdout, stderr, status = Open3.capture3(
      "ffmpeg", "-y",
      "-i", source_path,
      "-vn",
      "-acodec", "libmp3lame",
      "-ar", "24000",
      "-ac", "1",
      output.path
    )

    Rails.logger.debug { "voice transcode stdout: #{stdout}" } unless stdout.blank?
    Rails.logger.warn { "voice transcode stderr: #{stderr}" } unless stderr.blank?

    raise TranscodingError, "ffmpeg exited with status #{status.exitstatus}" unless status.success?
    raise TranscodingError, "transcoded mp3 missing" unless File.exist?(output.path) && File.size(output.path).positive?

    binary = File.binread(output.path)
    {
      binary: binary,
      base64: Base64.strict_encode64(binary),
      mime_type: OUTPUT_MIME_TYPE
    }
  ensure
    output.unlink if defined?(output) && output
  end

  private

  def ensure_file_present!
    raise TranscodingError, "voice file missing" unless @uploaded_file.respond_to?(:tempfile)

    @uploaded_file.tempfile.rewind
  end

  def source_path
    @uploaded_file.tempfile.path
  end
end
