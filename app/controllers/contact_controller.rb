class ContactController < ApplicationController
  # 同步联系人
  def fetch_all_from_server
    contact_service = ContactApiService.new
    contact_service.fetch_contacts
  end

  def index
    @contacts = Contact.all.order(:username)
    respond_to do |format|
      format.html
      format.json { render json: @contacts }
    end
  end

  def show
    @contact = Contact.find_by(user_name: params[:user_name])

    if @contact
      respond_to do |format|
        format.html
        format.json { render json: @contact }
      end
    else
      render json: { error: "联系人不存在" }, status: :not_found
    end
  end

end
