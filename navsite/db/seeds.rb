# 开发用账号。业务逻辑在 NavigationTemplate 里，注册流程共用同一份。
email    = ENV.fetch("SEED_EMAIL", "dev@example.com")
password = ENV.fetch("SEED_PASSWORD", "devpassword123")

user = User.find_or_initialize_by(email_address: email)
user.password = password if user.new_record?
user.save!

Setting.find_or_create_by!(user: user)
NavigationTemplate.apply_to(user)

puts "#{user.email_address}：分类 #{user.categories.count} 个，网站 #{user.websites.count} 条"
