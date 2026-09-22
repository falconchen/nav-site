class AddUserToSettings < ActiveRecord::Migration[8.1]
  def change
    add_reference :settings, :user, null: false, foreign_key: true, index: { unique: true }

    # E2EE 下服务端不该持有任何能验证金库主密码的东西 ——
    # 主密码对不对，由浏览器能否解密成功来判断（AES-GCM 的认证标签天然提供）。
    # 金库元数据（salt / wrapped_dek）留到阶段 6 单独建表。
    remove_column :settings, :vault_password_digest, :string
  end
end
