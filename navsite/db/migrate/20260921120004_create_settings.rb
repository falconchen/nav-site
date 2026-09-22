class CreateSettings < ActiveRecord::Migration[8.1]
  def change
    # 单行表：站点级设置
    create_table :settings do |t|
      t.string  :theme, null: false, default: "light"
      t.string  :accent
      t.boolean :sidebar_compact, null: false, default: false

      # AI 端点（OpenAI 兼容）
      t.string :ai_base_url, null: false, default: "https://api.deepseek.com"
      t.text   :ai_api_key                    # encrypts
      t.string :ai_model, null: false, default: "deepseek-flash"

      # 金库解锁密码（跟 OAuth 登录分开）
      t.string :vault_password_digest

      t.timestamps
    end
  end
end
