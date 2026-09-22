require "test_helper"

class WebsiteEditingTest < ActionDispatch::IntegrationTest
  setup do
    sign_in_as users(:alice)
    @website  = websites(:google)
    @category = categories(:tools)
    @anchor   = "category_#{@category.id}"
    @frame    = "#{@anchor}_website_#{@website.id}"
  end

  # 这条是整次重构的核心诉求：旧版改一个字段要整包 gzip 上传 + 服务端再写一份全量快照。
  test "改一个字段只回一张卡片的 HTML" do
    get root_path
    full_page = response.body.bytesize

    patch website_path(@website), params: { website: { title: "新标题" } },
          headers: { "Accept" => "text/vnd.turbo-stream+html" }

    assert_response :success
    assert_equal "新标题", @website.reload.title

    # 只有一条 stream，且按 CSS 选择器命中该网站的所有副本
    streams = response.body.scan(/<turbo-stream action="([^"]+)" targets?="([^"]+)"/)
    assert_equal [["replace", ".website_card_#{@website.id}"]], streams

    assert response.body.bytesize < full_page * 0.1,
           "响应 #{response.body.bytesize} 字节，应远小于整页 #{full_page} 字节"
  end

  test "同一条网站在多个 section 里的 frame id 不重复" do
    get root_path
    ids = response.body.scan(/<turbo-frame id="([^"]+)"/).flatten
    assert_equal ids.uniq.size, ids.size, "存在重复的 turbo-frame id"
  end

  # 空段落靠 CSS 的 .category-section:has(> .cards-grid:empty) 隐藏，
  # 而 :empty 连空白文本节点都算数 —— grid 里只要有换行缩进就隐藏不掉。
  test "没有内容的段落，grid 里不能有任何空白" do
    users(:alice).websites.update_all(pinned: false)

    get root_path

    grid = response.body[%r{<div class="cards-grid" id="pinned_grid">(.*?)</div>}m, 1]
    assert_equal "", grid, "空 grid 里残留了空白，CSS :empty 会失效"
  end

  test "编辑表单渲染回同一个 frame" do
    get edit_website_path(@website, anchor: @anchor), headers: { "Turbo-Frame" => @frame }

    assert_response :success
    assert_select "turbo-frame##{@frame}"
    assert_select "form[action=?]", website_path(@website)
    # 编辑态也要带 .website_card_<id>，否则保存时 replace_all 替换不到正在编辑的这份
    assert_select ".website_card_#{@website.id}"
  end

  test "取消编辑把卡片渲染回原 frame" do
    get card_website_path(@website, anchor: @anchor), headers: { "Turbo-Frame" => @frame }

    assert_response :success
    assert_select "turbo-frame##{@frame} .website_card_#{@website.id}"
    # 卡片上的删除按钮本身就是一个 action=/websites/:id 的表单（button_to），
    # 所以这里要断言的是「编辑字段不在」，不能按 form action 判断
    assert_select "input[name=?]", "website[title]", false
  end

  # 这条专门盯住一个易犯的错：用 :anchor 当参数名会被 Rails 当成 URL 片段，
  # 服务端收不到，于是「最近添加」里的编辑会回错 frame id，编辑静默失效。
  test "从最近添加里编辑时回的是 recent 那个 frame" do
    frame = "recent_website_#{@website.id}"

    get edit_website_path(@website, section: "recent"), headers: { "Turbo-Frame" => frame }

    assert_response :success
    assert_select "turbo-frame##{frame}"
    assert_select "turbo-frame##{@frame}", false, "不应回退到分类 frame"
  end

  test "换分类时移除旧 frame 并插入新分类" do
    target = categories(:design)

    patch website_path(@website), params: { website: { category_id: target.id } },
          headers: { "Accept" => "text/vnd.turbo-stream+html" }

    assert_response :success
    assert_equal target.id, @website.reload.category_id

    actions = response.body.scan(/<turbo-stream action="([^"]+)" targets?="([^"]+)"/)
    assert_includes actions, ["remove", ".website_frame_#{@website.id}"]
    assert_includes actions, ["append", "category_#{target.id}_grid"]
  end

  test "切换置顶会重渲染置顶段" do
    patch website_path(@website), params: { website: { pinned: "1" } },
          headers: { "Accept" => "text/vnd.turbo-stream+html" }

    assert_response :success
    assert_predicate @website.reload, :pinned?
    assert_includes response.body.scan(/targets?="([^"]+)"/).flatten, "pinned_section"
  end

  test "新建后插入对应分类并关闭弹窗" do
    assert_difference "Website.count", 1 do
      post websites_path,
           params: { website: { title: "新站点", url: "https://example.com", category_id: @category.id } },
           headers: { "Accept" => "text/vnd.turbo-stream+html" }
    end

    assert_response :success
    targets = response.body.scan(/targets?="([^"]+)"/).flatten
    assert_includes targets, "#{@anchor}_grid"
    assert_includes targets, "modal"   # 清空 modal frame = 关闭弹窗
  end

  test "删除移除该网站的所有副本" do
    assert_difference "Website.count", -1 do
      delete website_path(@website), headers: { "Accept" => "text/vnd.turbo-stream+html" }
    end

    assert_response :success
    assert_includes response.body.scan(/targets?="([^"]+)"/).flatten, ".website_frame_#{@website.id}"
  end

  test "校验失败时回显表单和错误" do
    patch website_path(@website), params: { website: { title: "", url: "不是网址" } },
          headers: { "Accept" => "text/vnd.turbo-stream+html, text/html" }

    assert_response :unprocessable_entity
    assert_select ".form-errors"
    assert_equal "Google", @website.reload.title
  end
end
