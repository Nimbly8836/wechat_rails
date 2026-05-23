Rails.application.routes.draw do
  resource :session
  resources :passwords, param: :token
  # Define your application routes per the DSL in https://guides.rubyonrails.org/routing.html

  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check

  # Render dynamic PWA files from app/views/pwa/* (remember to link manifest in application.html.erb)
  get "manifest" => "rails/pwa#manifest", as: :pwa_manifest
  get "service-worker" => "rails/pwa#service_worker", as: :pwa_service_worker

  # Defines the root path route ("/")
  root "chat#index"
  get "login" => "login#index"
  post "login" => "login#show_wechat_qrcode"
  post "check_login_status" => "login#check_login_status"
  post "re-login" => "login#reconnect_user"
  get "login/accounts" => "login#accounts"
  post "login/bootstrap_online_sessions" => "login#bootstrap_online_sessions"
  get "chat/search" => "chat#search"

  # chat
  get "chat" => "chat#index"
  resources :chat_folders, only: [ :index, :create, :destroy ] do
    collection do
      patch :reorder
    end
    member do
      patch :toggle_room
      patch :toggle_pin
    end
  end
  resources :gif_emojis, only: [ :index, :create, :destroy ] do
    member do
      patch :touch
    end
  end
  resources :gif_emoji_folders, only: [ :create, :destroy ] do
    member do
      patch :toggle_emoji
    end
  end
  resources :chat_bots, only: [ :index, :show, :create, :update, :destroy ]

  # contact management
  get "contact" => "contact#index"
  get "contact/:id" => "contact#show"

  # chat room management
  resources :chat_room do
    resource :hook, only: [ :show, :update ], controller: "chat_room_hooks"
    resources :messages, only: [:index, :show, :create] do
      collection do
        get :resolve_reference
      end
    end
    collection do
      get :list
    end
    member do
      put :sync_chat_members
      get :chat_members
      get :member_detail
      put :sync_chat_contact
      post :upload_background_image
      get "background_image/:filename",
          action: :background_image,
          as: :background_image,
          constraints: { filename: /[^\/]+/ }
    end
  end

  post "message/callback/:wxid" => "messages#callback"
  post "message/sync/:wxid" => "messages#sync"
  get "message/voice/:id" => "messages#download_voice"
  get "message/emoji/md5/:md5" => "messages#download_emoji_by_md5"
  get "message/emoji/:id" => "messages#download_emoji"
  get "message/image/:id" => "messages#download_image"
  get "message/video/:id" => "messages#download_video"
  get "message/file/:id" => "messages#download_file"
  get "message/chat_history/:id/attachment/:data_id" => "messages#download_chat_history_attachment"
  post "message/file" => "messages#upload_file"

  get "/notion/message", to: "message_events#events"

end
