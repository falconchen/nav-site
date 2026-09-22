class ApplicationController < ActionController::Base
  include Authentication

  # Only allow modern browsers supporting webp images, web push, badges, import maps, CSS nesting, and CSS :has.
  allow_browser versions: :modern

  # Changes to the importmap will invalidate the etag for HTML responses
  stale_when_importmap_changes

  private

  # 归属检查在这里收口。所有业务查询都从这里出发，绝不直接 Website.find / Category.find ——
  # 漏一个就是越权访问。查不到就是 404，不需要额外的权限判断分支。
  def current_user = Current.user
  helper_method :current_user
end
