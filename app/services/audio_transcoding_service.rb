# frozen_string_literal: true

require "base64"
require "open3"
require "tempfile"
require "fileutils"
require "digest/sha1"

class AudioTranscodingService
  class TranscodingError < StandardError; end

  SILK_DIR = Rails.root.join("lib", "silk2mp3", "silk").freeze
  BUILD_ROOT = Rails.root.join("tmp", "silk_encoder_build").freeze
  PCM_EXTENSION = ".pcm"
  UPLOAD_EXTENSION = ".silk"
  UPLOAD_MIME_TYPE = "audio/silk"
  PREVIEW_EXTENSION = ".mp3"
  PREVIEW_MIME_TYPE = "audio/mpeg"

  def initialize(uploaded_file)
    @uploaded_file = uploaded_file
  end

  def transcode_voice_assets!
    ensure_file_present!
    ensure_encoder_available!

    pcm_output = Tempfile.new([ "voice-pcm-", PCM_EXTENSION ])
    pcm_output.close
    upload_output = Tempfile.new([ "voice-upload-", UPLOAD_EXTENSION ])
    upload_output.close
    preview_output = Tempfile.new([ "voice-preview-", PREVIEW_EXTENSION ])
    preview_output.close

    transcode_to_pcm!(source_path, pcm_output.path)
    encode_silk!(pcm_output.path, upload_output.path)
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
    pcm_output.unlink if defined?(pcm_output) && pcm_output
    upload_output.unlink if defined?(upload_output) && upload_output
    preview_output.unlink if defined?(preview_output) && preview_output
  end

  private

  def ensure_encoder_available!
    return if File.exist?(compiled_encoder_path)

    prepare_build_workspace!
    stdout, stderr, status = Open3.capture3("make", "encoder", chdir: build_dir.to_s)
    Rails.logger.debug { "silk encoder build stdout: #{stdout}" } unless stdout.blank?
    Rails.logger.warn { "silk encoder build stderr: #{stderr}" } unless stderr.blank?

    raise TranscodingError, "silk encoder build failed" unless status.success? && File.exist?(compiled_encoder_path)
  end

  def transcode_to_pcm!(input_path, output_path)
    stdout, stderr, status = Open3.capture3(
      "ffmpeg", "-y",
      "-i", input_path,
      "-vn",
      "-f", "s16le",
      "-acodec", "pcm_s16le",
      "-ar", "24000",
      "-ac", "1",
      output_path
    )

    Rails.logger.debug { "voice pcm stdout: #{stdout}" } unless stdout.blank?
    Rails.logger.warn { "voice pcm stderr: #{stderr}" } unless stderr.blank?

    raise TranscodingError, "pcm conversion failed with status #{status.exitstatus}" unless status.success?
    raise TranscodingError, "pcm output missing at #{output_path}" unless File.exist?(output_path) && File.size(output_path).positive?
  end

  def encode_silk!(pcm_path, output_path)
    stdout, stderr, status = Open3.capture3(
      compiled_encoder_path.to_s,
      pcm_path,
      output_path,
      "-quiet",
      "-tencent",
      "-Fs_API", "24000",
      "-Fs_maxInternal", "24000",
      "-packetlength", "20",
      "-rate", "25000"
    )

    Rails.logger.debug { "silk encode stdout: #{stdout}" } unless stdout.blank?
    Rails.logger.warn { "silk encode stderr: #{stderr}" } unless stderr.blank?

    raise TranscodingError, "silk encode failed with status #{status.exitstatus}" unless status.success?
    raise TranscodingError, "silk output missing at #{output_path}" unless File.exist?(output_path) && File.size(output_path).positive?
  end

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

  def build_dir
    BUILD_ROOT.join(source_signature)
  end

  def compiled_encoder_path
    build_dir.join("encoder")
  end

  def source_signature
    @source_signature ||= begin
      digest = Digest::SHA1.new
      Dir.glob(SILK_DIR.join("**", "*")).sort.each do |path|
        next if File.directory?(path)

        digest.update(path.delete_prefix(SILK_DIR.to_s))
        digest.update(File.binread(path))
      end
      digest.hexdigest
    end
  end

  def prepare_build_workspace!
    return if build_dir.exist?

    FileUtils.mkdir_p(build_dir)

    Dir.children(SILK_DIR).each do |entry|
      source = SILK_DIR.join(entry)
      destination = build_dir.join(entry)
      FileUtils.cp_r(source, destination, preserve: true)
    end
  end
end
