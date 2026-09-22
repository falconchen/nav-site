class AddUserToNavigation < ActiveRecord::Migration[8.1]
  def change
    add_reference :categories, :user, null: false, foreign_key: true
    add_reference :websites,   :user, null: false, foreign_key: true
    add_reference :tags,       :user, null: false, foreign_key: true

    # websites 上直接挂 user_id 是刻意的冗余：置顶/最近添加/按点击排序都直接查 Website，
    # 每次 join categories 既慢又容易在某个分支上漏掉归属过滤。
    # 代价由 Website#category_belongs_to_same_user 这条模型校验兜住。

    # 唯一性全部按用户隔离，否则先注册的人会占掉全局的名字
    remove_index :categories, :position
    remove_index :tags, :name
    add_index :categories, %i[user_id name],     unique: true
    add_index :categories, %i[user_id position]
    add_index :tags,       %i[user_id name],     unique: true

    add_index :websites, %i[user_id clicks_count]
    add_index :websites, %i[user_id pinned]
    remove_index :websites, :clicks_count
    remove_index :websites, :pinned

    # hidden 的语义是「对匿名访客隐藏」。现在全部私有、没有匿名访客，这个字段失去意义。
    # 读取侧本来就一处没用到（Website.visible 是死代码）。
    remove_column :websites, :hidden, :boolean, null: false, default: false
  end
end
