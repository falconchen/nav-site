Rails.application.routes.draw do
  root "home#index"

  # 只有这两处对未登录开放，其余全部要求登录（见 Authentication concern）
  resource :session,      only: %i[new create destroy]
  resource :registration, only: %i[new create]

  resources :websites, except: %i[index show] do
    get :card, on: :member          # 取消编辑
  end
  resources :categories, except: %i[index show] do
    get :item, on: :member          # 取消编辑
    get :cancel_new, on: :collection # 取消新建
  end

  get "up" => "rails/health#show", as: :rails_health_check
end
