class Tagging < ApplicationRecord
  belongs_to :tag
  belongs_to :website

  validates :tag_id, uniqueness: { scope: :website_id }
end
