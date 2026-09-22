class CategoriesController < ApplicationController
  include ActionView::RecordIdentifier

  before_action :set_category, only: %i[edit update destroy item]

  def new
    @category = Category.new
  end

  # 取消新建：渲染回「添加分类」按钮
  def cancel_new
    render partial: "categories/new_button"
  end

  def create
    @category = Category.new(category_params)

    if @category.save
      render turbo_stream: [
        turbo_stream.append("categories_list", partial: "categories/sidebar_item", locals: { category: @category }),
        turbo_stream.append("content_area", partial: "websites/section",
                            locals: { anchor: "category_#{@category.id}", icon: @category.icon,
                                      title: @category.name, websites: [] }),
        turbo_stream.update("new_category", partial: "categories/new_button")
      ]
    else
      render :new, status: :unprocessable_entity
    end
  end

  def edit; end

  # 取消编辑
  def item; end

  def update
    if @category.update(category_params)
      render turbo_stream: [
        turbo_stream.replace(dom_id(@category, :sidebar), partial: "categories/sidebar_item", locals: { category: @category }),
        section_stream(@category)
      ]
    else
      render :edit, status: :unprocessable_entity
    end
  end

  def destroy
    if @category.destroy
      render turbo_stream: [
        turbo_stream.remove(dom_id(@category, :sidebar)),
        turbo_stream.remove("category_#{@category.id}_section"),
        # 里面的网站被挪到了「未分类」，那一段要重渲染
        section_stream(Category.uncategorized)
      ]
    else
      render turbo_stream: turbo_stream.replace(dom_id(@category, :sidebar),
                                                partial: "categories/sidebar_item",
                                                locals: { category: @category }),
             status: :unprocessable_entity
    end
  end

  private

  def set_category = @category = Category.find(params[:id])

  def category_params = params.expect(category: %i[name icon])

  def section_stream(category)
    turbo_stream.replace("category_#{category.id}_section",
                         partial: "websites/section",
                         locals: { anchor: "category_#{category.id}", icon: category.icon,
                                   title: category.name,
                                   websites: category.websites.ordered.with_attached_custom_icon })
  end
end
