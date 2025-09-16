import {Controller} from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["details"]
  static values = {
    contact: Object,
  }

  toggleDetails(event) {
    this.detailsTarget.classList.toggle("hidden")
    // 按钮文字切换
    event.currentTarget.textContent =
        this.detailsTarget.classList.contains("hidden")
            ? "查看更多 ▾"
            : "收起信息 ▴"
  }

  toChatRoom() {
    fetch(`/chat_room/${this.contactValue.id}`).then(resp => {
      if (resp.ok) {
        window.location.href = `/chat_room/${this.contactValue.id}`
      } else {
        console.error("Failed to create chat room")
        fetch("chat_room", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "X-CSRF-Token": document.querySelector(
                'meta[name="csrf-token"]').content
          },
          body: JSON.stringify({
            contact_id: this.contactValue.id,
            wx_id: this.contactValue.user_name,
            name: this.contactValue.remark || this.contactValue.nick_name,
            ...this.contactValue
          }),
        }).then(resp => {
          console.log("resp", resp)
        })
      }
    })
  }
}
