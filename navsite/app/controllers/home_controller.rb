class HomeController < ApplicationController
  def index
    @categories = current_user.categories.ordered
    # 一次查出该用户全部网站再分组，避免按分类逐个查；
    # with_attached_custom_icon 必须带上，否则每张卡片都要单独查一次附件表。
    @websites_by_category = current_user.websites.ordered
                                        .with_attached_custom_icon
                                        .group_by(&:category_id)
    @pinned = current_user.websites.pinned.ordered.with_attached_custom_icon
    @recent = current_user.websites.recent.with_attached_custom_icon
  end
end
