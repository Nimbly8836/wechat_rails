require "fileutils"
require "marcel"
require "open-uri"
require "pathname"
require "securerandom"

class ChatRoomController < ApplicationController
  BACKGROUND_IMAGE_EXTENSIONS = {
    "image/png" => ".png",
    "image/jpeg" => ".jpg",
    "image/webp" => ".webp",
    "image/gif" => ".gif"
  }.freeze

  def index
  end

  def create
    contact = Contact.find(params[:contact_id])
    chat_room = ChatRoom.find_or_initialize_by(contact_id: contact.id)
    created = chat_room.new_record?

    if created
      chat_room.assign_attributes(
        name: contact.display_name,
        wx_id: contact.user_name,
        avatar: contact_avatar_bytes(contact),
        members: contact.member_list.as_json
      )
      chat_room.save!

      SyncChatRoomMembersJob.perform_later(chat_room.id,
                                           contact.user_name,
                                           contact.own_wxid,
                                           contact.member_list.as_json)
    end

    render json: chat_room.as_json(only: [ :id, :name, :contact_id, :wx_id ])
  end

  def new
    @chat_room = ChatRoom.create(new_chat_room_params)
  end

  def show
    @chat_room = ChatRoom.includes(:contact).find(params[:id])
    unless @chat_room
      render json: { status: "error", message: "聊天室不存在" }, status: :not_found
    end
  end

  def edit
  end

  def list
    chat_rooms = if params[:q].present?
                   matched_room_ids = ChatRoom.keyword_search(params[:q]).select(:id)
                   ChatRoom.where(id: matched_room_ids)
                 else
                   ChatRoom.all
                 end
    chat_rooms = chat_rooms.preload(:contact, messages: :wx_message)
    chat_rooms = chat_rooms.order_by_latest_message
    render json: chat_rooms.as_json(only: [ :id, :name, :contact_id ],
                                    methods: [ :avatar_base64, :official_account, :group_chat ],
                                    include: { latest_wx_message: { only: [ :id, :real_msg_type, :message_time ],
                                               methods: [ :preview_content ]
                                    } })
  end

  def sync_chat_members
    chat_room = ChatRoom.includes(:contact).find(params[:chat_room_id])
    SyncChatRoomMembersJob.perform_later(chat_room.id,
                                         chat_room.contact.user_name,
                                         chat_room.contact.own_wxid,
                                         chat_room.members.as_json)
  end

  def sync_chat_contact
    chat_room = ChatRoom.includes(:contact).find(params[:id])
    return unless chat_room

    api_service = ContactApiService.new(chat_room.contact.own_wxid)
    detail_res = api_service.fetch_contacts_detail(chat_room.contact.user_name)

    return unless detail_res&.dig("Success")

    raw_contact = detail_res.dig("Data", "ContactList")&.first
    return unless raw_contact

    parse_contact_data = api_service.parse_contact_data(raw_contact)

    contact = chat_room.contact
    parse_contact_data[:own_wxid] = contact.own_wxid
    parse_contact_data[:user_name] ||= raw_contact.dig("UserName", "string")

    contact.assign_attributes(parse_contact_data)
    contact.save! if contact.changed?
    render json: { success: true }
  end

  def chat_members
    members = ChatRoomMember.where(chat_room_id: params[:id])
    members = members.keyword_search(params[:q]) if params[:q].present?
    members = members.order(:remark, :nick_name, :user_name).limit(limit_param(200))
    render json: members.as_json(methods: [ :display_name ])
  end

  def member_detail
    member = ChatRoomMember.find_by(chat_room_id: params[:id], user_name: params[:user_name])

    unless member
      render json: { error: "member not found" }, status: :not_found and return
    end

    render json: member.as_json(
      only: [
        :id, :chat_room_id, :room_wxid, :user_name, :nick_name, :remark,
        :alias, :signature, :country, :province, :city, :sex,
        :phone_num_list, :big_head_img_url, :small_head_img_url
      ],
      methods: [ :display_name, :avatar_url ]
    )
  end

  def upload_background_image
    chat_room = ChatRoom.find(params[:id])
    image = params[:image]
    mime_type = background_upload_mime_type(image)

    unless background_upload_shape?(image) && BACKGROUND_IMAGE_EXTENSIONS.key?(mime_type)
      render json: { success: false, error: "请选择图片文件" }, status: :unprocessable_entity
      return
    end

    filename = background_filename(mime_type)
    directory = background_directory(chat_room)
    path = directory.join(filename)

    begin
      FileUtils.mkdir_p(directory)
      image.tempfile.rewind if image.tempfile.respond_to?(:rewind)
      File.open(path, "wb") do |file|
        IO.copy_stream(image.tempfile, file)
      end
    rescue SystemCallError, IOError => e
      Rails.logger.error("chat background upload failed chat_room_id=#{chat_room.id}: #{e.class} #{e.message}")
      render json: { success: false, error: "背景图片保存失败" }, status: :internal_server_error
      return
    end

    render json: {
      success: true,
      url: background_image_chat_room_path(chat_room, filename: filename)
    }
  end

  def background_image
    chat_room = ChatRoom.find(params[:id])
    filename = params[:filename].to_s

    unless filename.present? && filename == File.basename(filename)
      head :not_found
      return
    end

    directory = background_directory(chat_room).expand_path
    path = directory.join(filename).expand_path
    unless path.to_s.start_with?("#{directory}#{File::SEPARATOR}")
      head :not_found
      return
    end

    unless File.file?(path)
      head :not_found
      return
    end

    send_file path, disposition: "inline", type: Marcel::MimeType.for(path, name: filename)
  end

  private

  def limit_param(default)
    value = params[:limit].to_i
    return default if value <= 0

    [ value, 500 ].min
  end

  def new_chat_room_params
    params.except(:contact_id, :name, :avatar_url, :wx_id)
  end

  def contact_avatar_bytes(contact)
    avatar_url = contact.avatar_url.to_s.strip
    return nil if avatar_url.blank?

    URI.open(avatar_url, read_timeout: 3).read
  rescue OpenURI::HTTPError, SocketError, IOError, SystemCallError, URI::InvalidURIError => e
    Rails.logger.warn(
      "chat room avatar fetch failed contact_id=#{contact.id}: #{e.class} #{e.message}"
    )
    nil
  end

  def background_upload_shape?(image)
    image.respond_to?(:content_type) &&
      image.respond_to?(:tempfile) &&
      image.tempfile.present? &&
      image.tempfile.respond_to?(:path) &&
      image.tempfile.path.present?
  end

  def background_directory(chat_room)
    Rails.root.join("storage", "chat_backgrounds", chat_room.id.to_s)
  end

  def background_filename(mime_type)
    "#{SecureRandom.hex(16)}#{BACKGROUND_IMAGE_EXTENSIONS.fetch(mime_type)}"
  end

  def background_upload_mime_type(image)
    return unless background_upload_shape?(image)

    Marcel::MimeType.for(Pathname.new(image.tempfile.path))
  end
end
