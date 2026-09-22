class WebsitesController < ApplicationController
  before_action :set_website, only: %i[edit update destroy card]

  def new
    @website = Website.new(category_id: params[:category_id] || Category.ordered.first&.id)
  end

  def create
    @website = Website.new(website_params)

    if @website.save
      render turbo_stream: [
        turbo_stream.append(grid_id_for(@website.category),
                            partial: "websites/website",
                            locals: { website: @website, anchor: category_anchor(@website) }),
        *derived_section_streams,
        turbo_stream.update("modal", "")
      ]
    else
      render :new, status: :unprocessable_entity
    end
  end

  def edit
    @anchor = anchor_param
  end

  # 取消编辑：把卡片渲染回它自己的 frame
  def card
    @anchor = anchor_param
  end

  def update
    previous_category_id = @website.category_id
    previous_pinned      = @website.pinned?

    if @website.update(website_params)
      render turbo_stream: update_streams(previous_category_id, previous_pinned)
    else
      @anchor = anchor_param
      render :edit, status: :unprocessable_entity
    end
  end

  def destroy
    @website.destroy
    render turbo_stream: [
      turbo_stream.remove_all(".website_frame_#{@website.id}"),
      *derived_section_streams
    ]
  end

  private

  def set_website = @website = Website.find(params[:id])

  # 注意不能用 :anchor 作为参数名 —— 那是 Rails URL helper 的保留字，
  # link_to(..., anchor: "x") 会生成 "#x" 片段而不是查询参数，服务端永远收不到。
  def anchor_param = params[:section].presence || category_anchor(@website)

  def website_params
    params.expect(website: %i[title url description icon category_id pinned hidden])
  end

  # 同一条网站会同时出现在「置顶」「最近添加」和它自己的分类里。
  # 没换分类也没改置顶时，按 .website_card_<id> 这个 CSS 选择器一次替换掉所有副本 ——
  # 这是整个响应唯一要传的 HTML，只有一张卡片。
  def update_streams(previous_category_id, previous_pinned)
    if @website.category_id != previous_category_id
      # 换了分类，DOM 位置要动，只改内容不够
      [
        turbo_stream.remove_all(".website_frame_#{@website.id}"),
        turbo_stream.append(grid_id_for(@website.category),
                            partial: "websites/website",
                            locals: { website: @website, anchor: category_anchor(@website) }),
        *derived_section_streams
      ]
    elsif @website.pinned? != previous_pinned
      [card_stream, *derived_section_streams]
    else
      [card_stream]
    end
  end

  def card_stream
    turbo_stream.replace_all(".website_card_#{@website.id}",
                             partial: "websites/card",
                             locals: { website: @website, anchor: category_anchor(@website) })
  end

  # 「置顶」和「最近添加」是派生视图，成员可能变，整段重渲染
  def derived_section_streams
    [
      section_stream("pinned", "fas fa-thumbtack", "置顶", Website.pinned.ordered.with_attached_custom_icon),
      section_stream("recent", "fas fa-clock", "最近添加", Website.recent.with_attached_custom_icon)
    ]
  end

  def section_stream(anchor, icon, title, websites)
    turbo_stream.replace("#{anchor}_section",
                         partial: "websites/section",
                         locals: { anchor:, icon:, title:, websites: })
  end

  def category_anchor(website) = "category_#{website.category_id}"
  def grid_id_for(category)    = "category_#{category.id}_grid"
end
