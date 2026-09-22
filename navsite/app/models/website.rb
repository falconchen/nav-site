class Website < ApplicationRecord
  belongs_to :user
  belongs_to :category
  has_one :secret, dependent: :destroy
  has_many :taggings, dependent: :destroy
  has_many :tags, through: :taggings
  has_one_attached :custom_icon

  validates :title, presence: true
  validates :url, presence: true, format: { with: %r{\Ahttps?://}i, message: "必须以 http:// 或 https:// 开头" }
  # websites 冗余存了 user_id（见迁移里的说明），这条校验保证它和 category 的归属不会脱节 ——
  # 也顺带挡住「提交别人的 category_id」这种越权写入。
  validate :category_belongs_to_same_user

  before_validation :assign_position, on: :create

  scope :ordered,      -> { order(:position) }
  scope :pinned,       -> { where(pinned: true) }
  scope :recent,       ->(limit = 12) { order(created_at: :desc).limit(limit) }
  scope :most_clicked, -> { order(clicks_count: :desc) }

  def has_secret? = secret.present?

  private

  def assign_position
    self.position ||= (category&.websites&.maximum(:position) || -1) + 1
  end

  def category_belongs_to_same_user
    return if category.nil? || user_id.nil?
    return if category.user_id == user_id

    errors.add(:category, "不属于当前用户")
  end
end
