# OAuth 身份。阶段 3 只建表不使用，阶段 3b 接 omniauth 时填充。
class Identity < ApplicationRecord
  belongs_to :user

  validates :provider, presence: true
  validates :uid, presence: true, uniqueness: { scope: :provider }
end
