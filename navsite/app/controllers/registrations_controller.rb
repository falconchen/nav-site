class RegistrationsController < ApplicationController
  allow_unauthenticated_access only: %i[new create]
  # 开放注册没有限流等于开放刷库
  rate_limit to: 5, within: 1.hour, only: :create,
             with: -> { redirect_to new_registration_path, alert: "注册过于频繁，请稍后再试。" }

  def new
    @user = User.new
  end

  def create
    @user = User.new(registration_params)

    created = ActiveRecord::Base.transaction do
      next false unless @user.save

      Setting.create!(user: @user)
      NavigationTemplate.apply_to(@user)
      true
    end

    if created
      start_new_session_for(@user)
      redirect_to root_path, notice: "欢迎。已经为你准备好一份初始导航。"
    else
      render :new, status: :unprocessable_entity
    end
  end

  private

  def registration_params = params.expect(user: %i[email_address password password_confirmation])
end
