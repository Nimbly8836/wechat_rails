import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["details"]
  static values = {
    contact: Object,
  }

  toggleDetails(event) {
    this.detailsTarget.classList.toggle("hidden")
    event.currentTarget.textContent = this.detailsTarget.classList.contains("hidden")
      ? "查看更多 ▾"
      : "收起信息 ▴"
  }

  openSidebar() {
    const inChatShell = this.element.closest('[data-controller~="chat"]')
    if (!inChatShell) {
      window.location.href = "/chat"
      return
    }

    const event = new CustomEvent("chat:sidebar:open", { bubbles: true })
    this.element.dispatchEvent(event)
  }

  toChatRoom() {
    fetch(`/chat_room/${this.contactValue.id}`)
      .then((resp) => {
        if (resp.ok) {
          this.openChat(this.contactValue.id)
          return null
        }

        return fetch("chat_room", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]').content
          },
          body: JSON.stringify({
            contact_id: this.contactValue.id,
            wx_id: this.contactValue.user_name,
            name: this.contactValue.remark || this.contactValue.nick_name,
            ...this.contactValue
          }),
        }).then((createResp) => createResp.json())
      })
      .then((data) => {
        if (data?.id) {
          this.openChat(data.id)
        }
      })
  }

  openChat(chatRoomId) {
    if (!chatRoomId) {
      return
    }

    const inChatShell = this.element.closest('[data-controller~="chat"]')
    const event = new CustomEvent("chat:open", {
      bubbles: true,
      detail: { chatRoomId }
    })
    this.element.dispatchEvent(event)

    if (!inChatShell) {
      window.location.href = `/chat_room/${chatRoomId}`
    }
  }
}
