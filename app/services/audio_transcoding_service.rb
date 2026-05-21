# frozen_string_literal: true

require "base64"
require "open3"
require "tempfile"

class AudioTranscodingService
  class TranscodingError < StandardError; end

  ENCODER_PATH = Rails.root.join("vendor", "silk", "encoder").freeze
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
<<<<<<< HEAD
    raise TranscodingError, "silk encoder missing at #{ENCODER_PATH}" unless File.executable?(ENCODER_PATH)
=======
    return if File.exist?(compiled_encoder_path) && File.exist?(compiled_library_path)

    prepare_build_workspace!

    clean_stdout, clean_stderr, = Open3.capture3("make", "clean", chdir: build_dir.to_s)
    Rails.logger.debug { "silk encoder clean stdout: #{clean_stdout}" } unless clean_stdout.blank?
    Rails.logger.warn { "silk encoder clean stderr: #{clean_stderr}" } unless clean_stderr.blank?

    stdout, stderr, status = Open3.capture3("make", "lib", "encoder", chdir: build_dir.to_s)
    Rails.logger.debug { "silk encoder build stdout: #{stdout}" } unless stdout.blank?
    Rails.logger.warn { "silk encoder build stderr: #{stderr}" } unless stderr.blank?

    raise TranscodingError, "silk encoder build failed" unless status.success? && File.exist?(compiled_library_path) && File.exist?(compiled_encoder_path)
>>>>>>> c8d6d78 (Rebuild silk library before encoder link)
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
      ENCODER_PATH.to_s,
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

<<<<<<< HEAD
=======
  def build_dir
    BUILD_ROOT.join(source_signature)
  end

  def compiled_encoder_path
    build_dir.join("encoder")
  end

  def compiled_library_path
    build_dir.join("libSKP_SILK_SDK.a")
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
    return if workspace_prepared?

    FileUtils.rm_rf(build_dir) if build_dir.exist?

    FileUtils.mkdir_p(build_dir)

    Dir.children(SILK_DIR).each do |entry|
      source = SILK_DIR.join(entry)
      destination = build_dir.join(entry)
      FileUtils.cp_r(source, destination, preserve: true)
    end
  end

  def workspace_prepared?
    build_dir.join("Makefile").exist? &&
      build_dir.join("src").directory? &&
      build_dir.join("test").directory? &&
      build_dir.join("interface").directory?
  end
>>>>>>> c8d6d78 (Rebuild silk library before encoder link)
end
