class User < ApplicationRecord
  has_secure_password
  has_many :sessions,   dependent: :destroy
  has_many :identities, dependent: :destroy

  # 声明顺序就是 dependent: :destroy 的销毁顺序。
  # websites 必须排在 categories 前面 —— 反过来的话，分类先没了，
  # 还引用着它们的网站会触发外键约束失败。
  has_many :websites,   dependent: :destroy
  has_many :categories, dependent: :destroy
  has_many :tags,       dependent: :destroy
  has_one  :setting,    dependent: :destroy

  normalizes :email_address, with: ->(e) { e.strip.downcase }

  # 生成器只建了数据库唯一索引，没有模型校验 ——
  # 少了这条，重复邮箱注册会抛 RecordNotUnique 变成 500，而不是表单报错
  validates :email_address, presence: true,
                            uniqueness: true,
                            format: { with: URI::MailTo::EMAIL_REGEXP, message: "格式不正确" }
  # has_secure_password 只校验 presence / confirmation / 72 字节上限，没有任何最小长度
  validates :password, length: { minimum: 12 }, allow_nil: true

  # 未分类是 builtin 行，不能删；找不到就补一个
  def uncategorized
    categories.find_by(builtin: true) ||
      categories.create!(name: Category::UNCATEGORIZED_NAME, icon: "fas fa-inbox", builtin: true)
  end
end
