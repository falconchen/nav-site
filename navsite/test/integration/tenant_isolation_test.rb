require "test_helper"

# 多租户最容易出事的地方：漏一个不经 current_user 的查询就是越权。
# 这些测试的作用是把那类回归钉死。
class TenantIsolationTest < ActionDispatch::IntegrationTest
  setup do
    sign_in_as users(:alice)
    @bob_site     = websites(:bob_secret_site)
    @bob_category = categories(:bob_stuff)
  end

  test "alice 的首页不含 bob 的任何网站" do
    get root_path

    assert_response :success
    assert_no_match(/BobPrivateBookmark/, response.body)
    assert_no_match(/bob-private\.example\.com/, response.body)
    assert_no_match(/鲍勃的收藏/, response.body)
  end

  test "新增网站的分类下拉只列出自己的分类" do
    get new_website_path, headers: { "Turbo-Frame" => "modal" }

    assert_response :success
    assert_select "select[name=?] option", "website[category_id]" do |options|
      names = options.map(&:text)
      assert_includes names, "实用工具"
      assert_not_includes names, "鲍勃的收藏"
    end
  end

  # 查不到就是 404，不需要单独的权限判断分支。
  # 断言 404 响应而不是 assert_raises —— test 环境 show_exceptions = :rescuable
  # （config/environments/test.rb:26），RecordNotFound 会被中间件渲染成 404，
  # 这也正是线上的真实行为。
  test "读不到 bob 的网站" do
    get edit_website_path(@bob_site, section: "category_#{@bob_category.id}")
    assert_response :not_found
  end

  test "改不动 bob 的网站" do
    patch website_path(@bob_site), params: { website: { title: "被 alice 改了" } }

    assert_response :not_found
    assert_equal "BobPrivateBookmark", @bob_site.reload.title
  end

  test "删不掉 bob 的网站" do
    assert_no_difference "Website.count" do
      delete website_path(@bob_site)
    end
    assert_response :not_found
  end

  test "读不到也改不动删不掉 bob 的分类" do
    get edit_category_path(@bob_category)
    assert_response :not_found

    patch category_path(@bob_category), params: { category: { name: "被 alice 改了" } }
    assert_response :not_found

    assert_no_difference "Category.count" do
      delete category_path(@bob_category)
    end
    assert_response :not_found

    assert_equal "鲍勃的收藏", @bob_category.reload.name
  end

  # 直接提交别人的 category_id，靠 Website#category_belongs_to_same_user 挡住
  test "不能把网站建到 bob 的分类下" do
    assert_no_difference "Website.count" do
      post websites_path,
           params: { website: { title: "越权", url: "https://evil.example.com",
                                category_id: @bob_category.id } },
           headers: { "Accept" => "text/vnd.turbo-stream+html, text/html" }
    end

    assert_response :unprocessable_entity
  end

  test "不能把自己的网站移到 bob 的分类下" do
    site = websites(:google)

    patch website_path(site), params: { website: { category_id: @bob_category.id } },
          headers: { "Accept" => "text/vnd.turbo-stream+html, text/html" }

    assert_response :unprocessable_entity
    assert_equal categories(:tools).id, site.reload.category_id
  end

  test "未登录时所有写操作都被挡下" do
    sign_out
    site = websites(:google)

    assert_no_difference "Website.count" do
      delete website_path(site)
    end
    assert_redirected_to new_session_path

    patch website_path(site), params: { website: { title: "匿名改的" } }
    assert_redirected_to new_session_path
    assert_equal "Google", site.reload.title
  end
end
