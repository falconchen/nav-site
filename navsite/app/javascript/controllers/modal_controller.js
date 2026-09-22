import { Controller } from "@hotwired/stimulus"

// 弹窗内容渲染在 #modal 这个 turbo-frame 里，清空 frame 就等于关闭。
export default class extends Controller {
  connect() {
    this.onKeydown = (e) => { if (e.key === "Escape") this.close() }
    document.addEventListener("keydown", this.onKeydown)
  }

  disconnect() {
    document.removeEventListener("keydown", this.onKeydown)
  }

  closeOnBackdrop(event) {
    if (event.target === this.element) this.close()
  }

  close() {
    document.getElementById("modal")?.replaceChildren()
  }
}
