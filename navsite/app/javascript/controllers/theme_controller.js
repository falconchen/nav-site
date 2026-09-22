import { Controller } from "@hotwired/stimulus"

// 主题、强调色、侧边栏模式。
// 这些是纯浏览器端偏好，不进数据库，所以留在 localStorage，
// 和 layout 里那段防闪烁 inline script 读的是同一批 key。
const ACCENTS = ["", "cadetblue", "blue-1772f6", "pink-ff1365"]

export default class extends Controller {
  static targets = ["themeIcon"]

  connect() {
    this.#syncThemeIcon()
  }

  toggleTheme() {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark"
    document.documentElement.setAttribute("data-theme", next)
    this.#store("theme", next)
    this.#syncThemeIcon()
  }

  cycleAccent() {
    const current = document.documentElement.getAttribute("data-accent") || ""
    const next = ACCENTS[(ACCENTS.indexOf(current) + 1) % ACCENTS.length]
    if (next) {
      document.documentElement.setAttribute("data-accent", next)
    } else {
      document.documentElement.removeAttribute("data-accent")
    }
    this.#store("accent", next)
  }

  toggleSidebar() {
    const compact = document.documentElement.getAttribute("data-sidebar") === "compact"
    document.documentElement.setAttribute("data-sidebar", compact ? "normal" : "compact")
    this.#store("categoriesCompactMode", String(!compact))
  }

  #syncThemeIcon() {
    if (!this.hasThemeIconTarget) return
    const dark = document.documentElement.getAttribute("data-theme") === "dark"
    this.themeIconTarget.className = dark ? "fas fa-sun" : "fas fa-moon"
  }

  // 隐私模式 / 禁用站点数据时 localStorage 会抛异常，偏好丢失不影响页面可用
  #store(key, value) {
    try { localStorage.setItem(key, value) } catch (e) {}
  }
}
