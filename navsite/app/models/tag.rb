class Tag < ApplicationRecord
  has_many :taggings, dependent: :destroy
  has_many :websites, through: :taggings

  validates :name, presence: true, uniqueness: true

  scope :by_usage, -> { left_joins(:taggings).group(:id).order("COUNT(taggings.id) DESC") }
end
