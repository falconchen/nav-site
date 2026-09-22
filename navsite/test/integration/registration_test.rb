require "test_helper"

class RegistrationTest < ActionDispatch::IntegrationTest
  PASSWORD = "a-long-enough-password".freeze

  test "注册页对未登录开放" do
    get new_registration_path
    assert_response :success
  end

  test "注册成功会建账号、建设置、套用初始导航模板，并直接登录" do
    assert_difference ->{ User.count } => 1, ->{ Setting.count } => 1, ->{ Session.count } => 1 do
      post registration_path, params: {
        user: { email_address: "newcomer@example.com", password: PASSWORD, password_confirmation: PASSWORD }
      }
    end

    assert_redirected_to root_path
    assert cookies[:session_id]

    user = User.find_by(email_address: "newcomer@example.com")
    template = JSON.parse(Rails.root.join("db/seeds/default_data.json").read)
    expected_sites = template["defaultWebsites"].values.flatten.size
    # defaultCategories 去掉 pinned / recent 两个派生视图
    expected_categories = template["defaultCategories"].count { |c| !%w[pinned recent].include?(c["id"]) }

    assert_equal expected_categories, user.categories.count
    assert_equal expected_sites, user.websites.count
    assert user.categories.exists?(builtin: true), "应当有一个不可删的「未分类」"
    # 模板数据必须归属到新用户，不能串到别人
    assert_equal [user.id], user.websites.pluck(:user_id).uniq
  end

  test "新用户看到的是自己的模板数据，不是别人的" do
    post registration_path, params: {
      user: { email_address: "newcomer@example.com", password: PASSWORD, password_confirmation: PASSWORD }
    }

    get root_path
    assert_response :success
    assert_no_match(/BobPrivateBookmark/, response.body)
  end

  test "邮箱重复被拒且不建任何附属记录" do
    assert_no_difference ["User.count", "Setting.count", "Category.count"] do
      post registration_path, params: {
        user: { email_address: users(:alice).email_address, password: PASSWORD, password_confirmation: PASSWORD }
      }
    end

    assert_response :unprocessable_entity
  end

  test "密码太短被拒" do
    assert_no_difference "User.count" do
      post registration_path, params: {
        user: { email_address: "short@example.com", password: "tooshort", password_confirmation: "tooshort" }
      }
    end

    assert_response :unprocessable_entity
  end

  test "两次密码不一致被拒" do
    assert_no_difference "User.count" do
      post registration_path, params: {
        user: { email_address: "mismatch@example.com", password: PASSWORD, password_confirmation: "#{PASSWORD}x" }
      }
    end

    assert_response :unprocessable_entity
  end

  test "注册页明确告知密码无法找回" do
    get new_registration_path
    assert_match(/无法找回/, response.body)
  end
end
