class ChatController < ApplicationController
  def index
    # 只负责联系人列表数据
    @contacts = Contact.where.not(nick_name: nil)
    @official_contacts = @contacts.select(&:official_account?).sort_by(&:display_name)
    @group_chat_contacts = @contacts.select(&:group_chat?).sort_by(&:display_name)
    regular_contacts = @contacts.reject { |contact| contact.official_account? || contact.group_chat? }
    @grouped_contacts = regular_contacts.group_by(&:initial)
    @letters = [ "#" ] + ("A".."Z").to_a # 用于右侧导航
    @chat_bots = ChatBot.where(user: Current.user).order(:name, :id)

    @chat_rooms = ChatRoom.all.order_by_latest_message
  end

  def search
    query = params[:q].to_s.strip

    if query.blank?
      render json: { rooms: [], contacts: [] }
      return
    end

    matched_room_ids = ChatRoom.keyword_search(query).select(:id)
    rooms = ChatRoom.where(id: matched_room_ids)
                    .preload(:contact, messages: :wx_message)
                    .order_by_latest_message
                    .limit(limit_param(40))
    contacts = Contact.keyword_search(query)
                      .order(:remark, :nick_name, :user_name)
                      .limit(limit_param(60))

    render json: {
      rooms: serialize_chat_rooms(rooms),
      contacts: serialize_contacts(contacts)
    }
  end

  private

  def limit_param(default)
    value = params[:limit].to_i
    return default if value <= 0

    [ value, 100 ].min
  end

  def serialize_chat_rooms(chat_rooms)
    chat_rooms.as_json(
      only: [ :id, :name, :contact_id ],
      methods: [ :avatar_base64, :official_account, :group_chat ],
      include: {
        latest_wx_message: {
          only: [ :id, :real_msg_type, :message_time ],
          methods: [ :preview_content ]
        }
      }
    )
  end

  def serialize_contacts(contacts)
    contacts.as_json(
      only: [ :id, :user_name, :nick_name, :remark, :alias ],
      methods: [ :display_name, :avatar_url, :official_account, :group_chat ]
    )
  end
end
