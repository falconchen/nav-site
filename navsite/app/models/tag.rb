class Tag < ApplicationRecord
  belongs_to :user
  has_many :taggings, dependent: :destroy
  has_many :websites, through: :taggings

  validates :name, presence: true, uniqueness: { scope: :user_id }

  scope :by_usage, -> { left_joins(:taggings).group(:id).order("COUNT(taggings.id) DESC") }
end
