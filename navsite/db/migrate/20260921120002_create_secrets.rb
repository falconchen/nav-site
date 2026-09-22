class CreateSecrets < ActiveRecord::Migration[8.1]
  def change
    # 独立表：公开只读页面渲染 Website 时根本不 join 这里，
    # 任何 select */to_json/误加的 partial 都不可能把密文带出去。
    create_table :secrets do |t|
      t.references :website, null: false, foreign_key: true, index: { unique: true }
      t.text :username
      t.text :password
      t.text :note

      t.timestamps
    end
  end
end
