# frozen_string_literal: true

require "base64"
require "open3"
require "tempfile"
require "fileutils"

class AudioTranscodingService
  class TranscodingError < StandardError; end

  SILK_REPO_URL = "https://github.com/kn007/silk-v3-decoder.git"
  BUILD_ROOT = Rails.root.join("tmp", "silk_encoder_build", "silk-v3-decoder").freeze
  SAMPLE_RATE = 24_000
  BIT_RATE = 25_000
  PACKET_LENGTH_MS = 20
  UPLOAD_EXTENSION = ".silk"
  UPLOAD_MIME_TYPE = "audio/silk"
  PREVIEW_EXTENSION = ".mp3"
  PREVIEW_MIME_TYPE = "audio/mpeg"
  SILK_VOICE_FORMAT = 4

  def initialize(uploaded_file)
    @uploaded_file = uploaded_file
  end

  def transcode_voice_assets!
    ensure_file_present!
    ensure_encoder_available!

    with_tempfiles do |pcm_output, silk_output, preview_output|
      transcode_to_pcm!(source_path, pcm_output.path)
      encode_silk!(pcm_output.path, silk_output.path)
      transcode_preview!(source_path, preview_output.path)

      upload_binary = File.binread(silk_output.path)
      preview_binary = File.binread(preview_output.path)
      {
        upload_binary: upload_binary,
        upload_base64: Base64.strict_encode64(upload_binary),
        upload_mime_type: UPLOAD_MIME_TYPE,
        preview_binary: preview_binary,
        preview_mime_type: PREVIEW_MIME_TYPE,
        voice_format_type: SILK_VOICE_FORMAT
      }
    end
  end

  private

  def with_tempfiles
    pcm_output = Tempfile.new([ "voice-pcm-", ".pcm" ])
    silk_output = Tempfile.new([ "voice-upload-", UPLOAD_EXTENSION ])
    preview_output = Tempfile.new([ "voice-preview-", PREVIEW_EXTENSION ])
    [ pcm_output, silk_output, preview_output ].each(&:close)

    yield pcm_output, silk_output, preview_output
  ensure
    pcm_output&.unlink
    silk_output&.unlink
    preview_output&.unlink
  end

  def ensure_encoder_available!
    return if File.exist?(compiled_encoder_path)

    prepare_build_workspace!
    stdout, stderr, status = Open3.capture3("make", "lib", "encoder", chdir: build_dir.to_s)
    Rails.logger.debug { "silk encoder build stdout: #{stdout}" } if stdout.present?
    Rails.logger.warn { "silk encoder build stderr: #{stderr}" } if stderr.present?

    raise TranscodingError, "silk encoder build failed" unless status.success? && File.exist?(compiled_encoder_path)
  end

  def transcode_to_pcm!(input_path, output_path)
    stdout, stderr, status = Open3.capture3(
      "ffmpeg", "-y",
      "-i", input_path,
      "-vn",
      "-map_metadata", "-1",
      "-f", "s16le",
      "-acodec", "pcm_s16le",
      "-ar", SAMPLE_RATE.to_s,
      "-ac", "1",
      output_path
    )

    Rails.logger.debug { "voice pcm stdout: #{stdout}" } if stdout.present?
    Rails.logger.warn { "voice pcm stderr: #{stderr}" } if stderr.present?

    raise TranscodingError, "pcm conversion failed with status #{status.exitstatus}" unless status.success?
    ensure_non_empty_file!(output_path, "pcm output")
  end

  def encode_silk!(pcm_path, output_path)
    stdout, stderr, status = Open3.capture3(
      compiled_encoder_path.to_s,
      pcm_path,
      output_path,
      "-quiet",
      "-tencent",
      "-Fs_API", SAMPLE_RATE.to_s,
      "-Fs_maxInternal", SAMPLE_RATE.to_s,
      "-packetlength", PACKET_LENGTH_MS.to_s,
      "-rate", BIT_RATE.to_s
    )

    Rails.logger.debug { "silk encode stdout: #{stdout}" } if stdout.present?
    Rails.logger.warn { "silk encode stderr: #{stderr}" } if stderr.present?

    raise TranscodingError, "silk encode failed with status #{status.exitstatus}" unless status.success?
    ensure_non_empty_file!(output_path, "silk output")
    ensure_wechat_silk!(output_path)
  end

  def transcode_preview!(input_path, output_path)
    stdout, stderr, status = Open3.capture3(
      "ffmpeg", "-y",
      "-i", input_path,
      "-vn",
      "-map_metadata", "-1",
      "-acodec", "libmp3lame",
      "-ar", SAMPLE_RATE.to_s,
      "-ac", "1",
      output_path
    )

    Rails.logger.debug { "voice preview stdout: #{stdout}" } if stdout.present?
    Rails.logger.warn { "voice preview stderr: #{stderr}" } if stderr.present?

    raise TranscodingError, "preview conversion failed with status #{status.exitstatus}" unless status.success?
    ensure_non_empty_file!(output_path, "preview output")
  end

  def ensure_wechat_silk!(path)
    header = File.binread(path, 16)
    return if header.start_with?("\x02#!SILK_V3".b) || header.start_with?("#!SILK_V3".b)

    raise TranscodingError, "silk output has invalid header"
  end

  def ensure_non_empty_file!(path, label)
    raise TranscodingError, "#{label} missing at #{path}" unless File.exist?(path) && File.size(path).positive?
  end

  def ensure_file_present!
    raise TranscodingError, "voice file missing" unless @uploaded_file.respond_to?(:tempfile)

    @uploaded_file.tempfile.rewind
  end

  def source_path
    @uploaded_file.tempfile.path
  end

  def build_dir
    BUILD_ROOT.join("silk")
  end

  def compiled_encoder_path
    build_dir.join("encoder")
  end

  def prepare_build_workspace!
    return if build_dir.exist?

    FileUtils.rm_rf(BUILD_ROOT) if BUILD_ROOT.exist?
    FileUtils.mkdir_p(BUILD_ROOT.dirname)
    stdout, stderr, status = Open3.capture3("git", "clone", "--depth", "1", SILK_REPO_URL, BUILD_ROOT.to_s)
    Rails.logger.debug { "silk encoder clone stdout: #{stdout}" } if stdout.present?
    Rails.logger.warn { "silk encoder clone stderr: #{stderr}" } if stderr.present?

    raise TranscodingError, "silk encoder clone failed" unless status.success? && build_dir.exist?
  end
end
