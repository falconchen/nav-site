class CreateWebsites < ActiveRecord::Migration[8.1]
  def change
    create_table :websites do |t|
      t.references :category, null: false, foreign_key: true
      t.string   :title, null: false
      t.string   :url, null: false
      t.text     :description
      t.string   :icon                                    # Font Awesome class 或图标 URL
      t.integer  :position, null: false
      t.boolean  :pinned, null: false, default: false
      # hidden 而非 private：private 会和 Module#private 冲突
      t.boolean  :hidden, null: false, default: false     # 对匿名访客隐藏
      t.integer  :clicks_count, null: false, default: 0
      t.datetime :last_clicked_at

      t.timestamps
    end

    add_index :websites, [:category_id, :position]
    add_index :websites, :clicks_count
    add_index :websites, :pinned
  end
end
