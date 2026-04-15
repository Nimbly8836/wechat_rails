# frozen_string_literal: true

require "base64"
require "open3"
require "tempfile"

class AudioTranscodingService
  class TranscodingError < StandardError; end

  UPLOAD_EXTENSION = ".wav"
  UPLOAD_MIME_TYPE = "audio/wav"
  PREVIEW_EXTENSION = ".mp3"
  PREVIEW_MIME_TYPE = "audio/mpeg"

  def initialize(uploaded_file)
    @uploaded_file = uploaded_file
  end

  def transcode_voice_assets!
    ensure_file_present!

    upload_output = Tempfile.new([ "voice-upload-", UPLOAD_EXTENSION ])
    upload_output.close
    preview_output = Tempfile.new([ "voice-preview-", PREVIEW_EXTENSION ])
    preview_output.close

    transcode!(source_path, upload_output.path, "pcm_s16le", "16000")
    transcode!(source_path, preview_output.path, "libmp3lame", "24000")

    upload_binary = File.binread(upload_output.path)
    preview_binary = File.binread(preview_output.path)
    {
      upload_binary: upload_binary,
      upload_base64: Base64.strict_encode64(upload_binary),
      upload_mime_type: UPLOAD_MIME_TYPE,
      preview_binary: preview_binary,
      preview_mime_type: PREVIEW_MIME_TYPE
    }
  ensure
    upload_output.unlink if defined?(upload_output) && upload_output
    preview_output.unlink if defined?(preview_output) && preview_output
  end

  private

  def transcode!(input_path, output_path, codec, sample_rate)
    stdout, stderr, status = Open3.capture3(
      "ffmpeg", "-y",
      "-i", input_path,
      "-vn",
      "-acodec", codec,
      "-ar", sample_rate,
      "-ac", "1",
      output_path
    )

    Rails.logger.debug { "voice transcode stdout: #{stdout}" } unless stdout.blank?
    Rails.logger.warn { "voice transcode stderr: #{stderr}" } unless stderr.blank?

    raise TranscodingError, "ffmpeg exited with status #{status.exitstatus}" unless status.success?
    raise TranscodingError, "transcoded audio missing at #{output_path}" unless File.exist?(output_path) && File.size(output_path).positive?
  end

  def ensure_file_present!
    raise TranscodingError, "voice file missing" unless @uploaded_file.respond_to?(:tempfile)

    @uploaded_file.tempfile.rewind
  end

  def source_path
    @uploaded_file.tempfile.path
  end
end
