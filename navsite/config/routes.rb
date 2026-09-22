Rails.application.routes.draw do
  root "home#index"

  resources :websites, except: %i[index show] do
    # 取消编辑：把卡片重新渲染回它自己的 frame
    get :card, on: :member
  end
  resources :categories, except: %i[index show] do
    get :item, on: :member          # 取消编辑
    get :cancel_new, on: :collection # 取消新建
  end

  get "up" => "rails/health#show", as: :rails_health_check
end
