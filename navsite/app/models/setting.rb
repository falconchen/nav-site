class Setting < ApplicationRecord
  belongs_to :user

  # ai_api_key 服务端要拿去调 AI 接口，天然无法端到端加密，只能服务端加密。
  # 金库那边是另一套（E2EE，服务端只存密文），见阶段 6。
  encrypts :ai_api_key

  def ai_configured? = ai_api_key.present?
end
