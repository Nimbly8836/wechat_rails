Rails.application.routes.draw do
  # Define your application routes per the DSL in https://guides.rubyonrails.org/routing.html

  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check

  # Render dynamic PWA files from app/views/pwa/* (remember to link manifest in application.html.erb)
  # get "manifest" => "rails/pwa#manifest", as: :pwa_manifest
  # get "service-worker" => "rails/pwa#service_worker", as: :pwa_service_worker

  # Defines the root path route ("/")
  # root "posts#index"
  get "login" => "login#index"
  post "login" => "login#show_wechat_qrcode"
  post "check_login_status" => "login#check_login_status"
  post "re-login" => "login#reconnect_user"

  # chat
  get "chat" => "chat#index"

  # contact management
  get "contact" => "contact#index"
  get "contact/:id" => "contact#show"

  # chat room management
  resources :chat_room do
    resources :messages, only: [:index, :create]
    collection do
      get :list
    end
  end

  post "message/callback/:wxid" => "messages#callback"

  # mount ActionCable.server => "/cable"

end
