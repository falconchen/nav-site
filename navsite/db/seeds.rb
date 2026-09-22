# 默认数据来自旧版 public/data.js 的 defaultCategories / defaultWebsites。
# 幂等：用 find_or_initialize_by 定位，可反复执行。
require "json"

data = JSON.parse(Rails.root.join("db/seeds/default_data.json").read)

# pinned / recent 在旧版是派生视图而非真实分类，跳过。
# uncategorized 落成 builtin 行，对应新模型里不可删除的「未分类」。
VIRTUAL = %w[pinned recent].freeze

legacy_to_category = {}

data["defaultCategories"].each do |raw|
  next if VIRTUAL.include?(raw["id"])

  builtin = raw["id"] == "uncategorized"
  name    = builtin ? Category::UNCATEGORIZED_NAME : raw["name"]

  category = Category.find_or_initialize_by(name: name)
  category.icon     = raw["icon"].presence || "fas fa-folder"
  category.position = raw["order"]
  category.builtin  = builtin
  category.save!

  legacy_to_category[raw["id"]] = category
end

data["defaultWebsites"].each do |legacy_id, sites|
  category = legacy_to_category[legacy_id]
  next if category.nil?   # pinned / recent

  sites.each_with_index do |raw, index|
    site = Website.find_or_initialize_by(category: category, url: raw["url"])
    site.title       = raw["title"]
    site.description = raw["description"]
    site.icon        = raw["icon"].presence || "fas fa-globe"
    site.position    = index
    site.save!
  end
end

Setting.current

puts "分类 #{Category.count} 个，网站 #{Website.count} 条"
