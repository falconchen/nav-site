class Secret < ApplicationRecord
  belongs_to :website

  encrypts :username, :password, :note

  def blank_content? = [username, password, note].all?(&:blank?)
end
