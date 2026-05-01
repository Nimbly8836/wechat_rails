import { Controller } from "@hotwired/stimulus"
import { badgeLabelFor, loadBadgeLabels } from "utils/chat_badges"

export default class extends Controller {
  static targets = ["details"]
  static values = {
    contact: Object,
  }

  connect() {
    this.applyBadgeLabels()
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
    fetch("/chat_room", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]').content
      },
      body: JSON.stringify({
        contact_id: this.contactValue.id
      })
    })
      .then((resp) => {
        if (!resp.ok) {
          throw new Error(`发起聊天失败: ${resp.status}`)
        }
        return resp.json()
      })
      .then((data) => {
        if (data?.id) {
          this.openChat(data.id)
        }
      })
      .catch((error) => {
        console.error("发起聊天失败", error)
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

  applyBadgeLabels() {
    const badgeLabels = loadBadgeLabels()

    this.element.querySelectorAll("[data-badge-kind]").forEach((element) => {
      const label = badgeLabelFor(element.dataset.badgeKind, badgeLabels)
      if (label) {
        element.textContent = label
      }
    })
  }
}
