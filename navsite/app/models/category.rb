class Category < ApplicationRecord
  UNCATEGORIZED_NAME = "未分类".freeze

  belongs_to :user
  # 不用 dependent: :destroy —— 删分类不该连带删光里面的网站。
  # 删除前把网站挪到「未分类」，这是用户预期的行为。
  has_many :websites, -> { order(:position) }, dependent: nil

  validates :name, presence: true, uniqueness: { scope: :user_id }
  validates :position, presence: true

  before_validation :assign_position, on: :create
  before_destroy :guard_builtin, prepend: true
  before_destroy :move_websites_to_uncategorized

  scope :ordered, -> { order(:position) }

  def deletable? = !builtin?

  private

  def assign_position
    self.position ||= (user&.categories&.maximum(:position) || -1) + 1
  end

  # destroyed_by_association 在「因 dependent: :destroy 被连带销毁」时有值。
  # 少了这个判断，删用户会卡在他自己的「未分类」上 —— guard_builtin 抛 :abort
  # 导致整条销毁链回滚，用户永远删不掉。
  def cascading_from_user? = destroyed_by_association.present?

  def guard_builtin
    return if cascading_from_user?
    return unless builtin?

    errors.add(:base, "内置分类不可删除")
    throw :abort
  end

  def move_websites_to_uncategorized
    return if cascading_from_user?   # 删用户时别再把「未分类」建回来

    fallback = user.uncategorized
    offset = fallback.websites.maximum(:position) || -1
    websites.order(:position).each_with_index do |site, index|
      site.update_columns(category_id: fallback.id, position: offset + 1 + index)
    end
  end
end
