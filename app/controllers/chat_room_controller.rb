require "open-uri"

class ChatRoomController < ApplicationController
  def index
  end

  def create
    Contact.find(params[:contact_id]).then do |contact|
      chat_room = ChatRoom.create({
                                    contact_id: contact.id,
                                    name: contact.remark || contact.nick_name,
                                    wx_id: contact.user_name,
                                    avatar: URI.open(contact.avatar_url).read,
                                    members: contact.member_list.as_json
                                  })
      SyncChatRoomMembersJob.perform_later(chat_room.id,
                                           contact.user_name,
                                           contact.own_wxid,
                                           contact.member_list.as_json)
      render json: chat_room.as_json(only: [:id, :name, :contact_id])
    end
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

  private

  def limit_param(default)
    value = params[:limit].to_i
    return default if value <= 0

    [ value, 500 ].min
  end

  def new_chat_room_params
    params.except(:contact_id, :name, :avatar_url, :wx_id)
  end
end
