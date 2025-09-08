class ContactController < ApplicationController
  # 同步联系人
  def fetch_all_from_server
    contact_service = ContactApiService.new
    contact_service.fetch_contacts
  end

  def index
    @contacts = Contact.all.order(:user_name)
    respond_to do |format|
      format.html
      format.json { render json: @contacts }
    end
  end

  def show
    @contact = Contact.find_by(id: params[:id])

    if @contact
      respond_to do |format|
        format.html # Rails 会去 app/views/contact/show.html.erb 渲染
        format.json { render json: @contact.attributes }
      end
    else
      respond_to do |format|
        format.html { render plain: "联系人不存在", status: :not_found }
        format.json { render json: { error: "联系人不存在" }, status: :not_found }
      end
    end
  end

end
