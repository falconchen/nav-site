require "test_helper"

class CategoryEditingTest < ActionDispatch::IntegrationTest
  setup do
    sign_in_as users(:alice)
    @category = categories(:tools)
    @frame    = "sidebar_category_#{@category.id}"
  end

  test "重命名后同时更新侧边栏和对应段落" do
    patch category_path(@category), params: { category: { name: "工具箱" } },
          headers: { "Accept" => "text/vnd.turbo-stream+html" }

    assert_response :success
    assert_equal "工具箱", @category.reload.name

    targets = response.body.scan(/targets?="([^"]+)"/).flatten
    assert_includes targets, @frame
    assert_includes targets, "category_#{@category.id}_section"
  end

  test "新建分类会插入侧边栏和一个空段落" do
    assert_difference "Category.count", 1 do
      post categories_path, params: { category: { name: "新分类", icon: "fas fa-star" } },
           headers: { "Accept" => "text/vnd.turbo-stream+html" }
    end

    assert_response :success
    created = Category.find_by(name: "新分类")
    targets = response.body.scan(/targets?="([^"]+)"/).flatten
    assert_includes targets, "categories_list"
    assert_includes targets, "content_area"
    assert_includes targets, "new_category"   # 表单换回「添加分类」按钮
    assert_includes response.body, "sidebar_category_#{created.id}"
  end

  # 关键行为：删分类不能把里面的网站一起删掉
  test "删除分类时把网站挪到未分类而不是删掉" do
    site = websites(:google)
    assert_equal @category, site.category
    fallback = categories(:uncategorized)

    assert_no_difference "Website.count" do
      assert_difference "Category.count", -1 do
        delete category_path(@category), headers: { "Accept" => "text/vnd.turbo-stream+html" }
      end
    end

    assert_response :success
    assert_equal fallback, site.reload.category

    targets = response.body.scan(/targets?="([^"]+)"/).flatten
    assert_includes targets, @frame
    assert_includes targets, "category_#{@category.id}_section"
    assert_includes targets, "category_#{fallback.id}_section"
  end

  test "内置分类不可删除" do
    builtin = categories(:uncategorized)

    assert_no_difference "Category.count" do
      delete category_path(builtin), headers: { "Accept" => "text/vnd.turbo-stream+html" }
    end

    assert_response :unprocessable_entity
    assert_includes response.body, "内置分类不可删除"
  end

  test "编辑表单渲染回同一个 frame，取消能回到原样" do
    get edit_category_path(@category), headers: { "Turbo-Frame" => @frame }
    assert_response :success
    assert_select "turbo-frame##{@frame} input[name=?]", "category[name]"

    get item_category_path(@category), headers: { "Turbo-Frame" => @frame }
    assert_response :success
    assert_select "turbo-frame##{@frame} .category-name"
    assert_select "input[name=?]", "category[name]", false
  end

  test "重名会被拒绝" do
    patch category_path(@category), params: { category: { name: categories(:design).name } },
          headers: { "Accept" => "text/vnd.turbo-stream+html, text/html" }

    assert_response :unprocessable_entity
    assert_equal "实用工具", @category.reload.name
  end
end
