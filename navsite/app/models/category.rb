class Category < ApplicationRecord
  UNCATEGORIZED_NAME = "未分类".freeze

  # 不用 dependent: :destroy —— 删分类不该连带删光里面的网站。
  # 删除前把网站挪到「未分类」，这是用户预期的行为。
  has_many :websites, -> { order(:position) }, dependent: nil

  validates :name, presence: true, uniqueness: true
  validates :position, presence: true

  before_validation :assign_position, on: :create
  before_destroy :guard_builtin, prepend: true
  before_destroy :move_websites_to_uncategorized

  scope :ordered, -> { order(:position) }

  # 「未分类」是真实行而非虚拟分类，这样 websites.category_id 能保持 NOT NULL
  def self.uncategorized
    find_by(builtin: true) || create!(name: UNCATEGORIZED_NAME, icon: "fas fa-inbox", builtin: true)
  end

  def deletable? = !builtin?

  private

  def assign_position
    self.position ||= (self.class.maximum(:position) || -1) + 1
  end

  def guard_builtin
    return unless builtin?

    errors.add(:base, "内置分类不可删除")
    throw :abort
  end

  def move_websites_to_uncategorized
    fallback = self.class.uncategorized
    offset = fallback.websites.maximum(:position) || -1
    websites.order(:position).each_with_index do |site, index|
      site.update_columns(category_id: fallback.id, position: offset + 1 + index)
    end
  end
end
