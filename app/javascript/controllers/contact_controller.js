import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["details"]

  toggleDetails(event) {
    this.detailsTarget.classList.toggle("hidden")
    // 按钮文字切换
    event.currentTarget.textContent =
        this.detailsTarget.classList.contains("hidden")
            ? "查看更多信息 ▾"
            : "收起信息 ▴"
  }
}
