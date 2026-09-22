class Website < ApplicationRecord
  belongs_to :category
  has_one :secret, dependent: :destroy
  has_many :taggings, dependent: :destroy
  has_many :tags, through: :taggings
  has_one_attached :custom_icon

  validates :title, presence: true
  validates :url, presence: true, format: { with: %r{\Ahttps?://}i, message: "必须以 http:// 或 https:// 开头" }

  before_validation :assign_position, on: :create

  scope :ordered,   -> { order(:position) }
  scope :visible,   -> { where(hidden: false) }          # 匿名访客可见
  scope :pinned,    -> { where(pinned: true) }
  scope :recent,    ->(limit = 12) { order(created_at: :desc).limit(limit) }
  scope :most_clicked, -> { order(clicks_count: :desc) }

  def has_secret? = secret.present?

  private

  def assign_position
    self.position ||= (category&.websites&.maximum(:position) || -1) + 1
  end
end
