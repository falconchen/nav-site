class Setting < ApplicationRecord
  encrypts :ai_api_key
  has_secure_password :vault_password, validations: false

  # 单行表
  def self.current = first || create!
  singleton_class.alias_method :instance, :current

  def ai_configured? = ai_api_key.present?
  def vault_configured? = vault_password_digest.present?
end
