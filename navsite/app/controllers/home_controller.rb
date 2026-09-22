class HomeController < ApplicationController
  def index
    # with_attached_custom_icon 必须带上：卡片会问 custom_icon.attached?，
    # 只 includes(:websites) 的话每张卡片都要单独查一次 active_storage_attachments。
    @categories = Category.ordered.includes(websites: { custom_icon_attachment: :blob })
    @pinned     = Website.pinned.ordered.with_attached_custom_icon
    @recent     = Website.recent.with_attached_custom_icon
  end
end
