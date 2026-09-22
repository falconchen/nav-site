# 新用户的初始导航。数据来自旧版 public/data.js 的 defaultCategories / defaultWebsites，
# 注册流程和 db/seeds.rb 共用这一份逻辑。
class NavigationTemplate
  # pinned / recent 在旧版是派生视图而非真实分类，跳过。
  # uncategorized 落成 builtin 行，对应新模型里不可删除的「未分类」。
  VIRTUAL = %w[pinned recent].freeze
  PATH = Rails.root.join("db/seeds/default_data.json")

  def self.apply_to(user) = new(user).apply

  def initialize(user, data: nil)
    @user = user
    @data = data || JSON.parse(PATH.read)
  end

  # 幂等：同名分类 / 同 URL 的网站不会重复创建，可反复执行
  def apply
    ActiveRecord::Base.transaction do
      by_legacy_id = create_categories
      create_websites(by_legacy_id)
      @user.uncategorized   # 确保 builtin 行存在
    end
    @user
  end

  private

  def create_categories
    @data["defaultCategories"].each_with_object({}) do |raw, map|
      next if VIRTUAL.include?(raw["id"])

      builtin = raw["id"] == "uncategorized"
      name    = builtin ? Category::UNCATEGORIZED_NAME : raw["name"]

      category = @user.categories.find_or_initialize_by(name: name)
      category.icon     = raw["icon"].presence || "fas fa-folder"
      category.position = raw["order"]
      category.builtin  = builtin
      category.save!

      map[raw["id"]] = category
    end
  end

  def create_websites(by_legacy_id)
    @data["defaultWebsites"].each do |legacy_id, sites|
      category = by_legacy_id[legacy_id]
      next if category.nil?   # pinned / recent

      sites.each_with_index do |raw, index|
        site = @user.websites.find_or_initialize_by(url: raw["url"])
        site.category    = category
        site.title       = raw["title"]
        site.description = raw["description"]
        site.icon        = raw["icon"].presence || "fas fa-globe"
        site.position    = index
        site.save!
      end
    end
  end
end
