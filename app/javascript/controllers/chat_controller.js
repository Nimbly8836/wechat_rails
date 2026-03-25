import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = [
    "chatBox",
    "contact",
    "letter",
    "contactsList",
    "group",
    "toggleButton",
    "sidebar",
    "overlay",
    "messagesList",
    "letterNav",
    "mobileTitle",
    "resizer"
  ]

  connect() {
    this.eventSource = null
    this.reconnectTimer = null
    this.eventSourceUrl = "/notion/message"
    this.eventSourceRetryDelay = 1500
    this.chatRoomNames = {}
    this.currentRoomId = null
    this.isSidebarOpen = !this.isMobileViewport()
    this.startX = 0
    this.startWidth = 0
    this.minWidth = 260
    this.maxWidth = 500

    this.boundHandleOpenChat = this.handleOpenChat.bind(this)
    this.boundOpenSidebar = this.openSidebar.bind(this)
    this.boundCloseSidebar = this.closeSidebar.bind(this)
    this.boundHandleViewportChange = this.handleViewportChange.bind(this)

    const messageTab = this.sidebarTarget.querySelector('[data-tab="messages"]')
    if (messageTab) {
      messageTab.click()
    }

    this.applySidebarState()
    this.establishEventSource()

    this.element.addEventListener("chat:open", this.boundHandleOpenChat)
    this.element.addEventListener("chat:sidebar:open", this.boundOpenSidebar)
    this.element.addEventListener("chat:sidebar:close", this.boundCloseSidebar)
    window.addEventListener("resize", this.boundHandleViewportChange)
  }

  disconnect() {
    this.teardownEventSource()
    this.element.removeEventListener("chat:open", this.boundHandleOpenChat)
    this.element.removeEventListener("chat:sidebar:open", this.boundOpenSidebar)
    this.element.removeEventListener("chat:sidebar:close", this.boundCloseSidebar)
    window.removeEventListener("resize", this.boundHandleViewportChange)
    this.stopResize()
  }

  isMobileViewport() {
    return window.innerWidth < 640
  }

  handleViewportChange() {
    if (this.isMobileViewport()) {
      this.isSidebarOpen = false
      this.sidebarTarget.style.width = ""
    } else {
      this.isSidebarOpen = true
    }

    this.applySidebarState()
  }

  applySidebarState() {
    if (this.isMobileViewport()) {
      this.sidebarTarget.classList.toggle("-translate-x-full", !this.isSidebarOpen)
      this.overlayTarget.classList.toggle("hidden", !this.isSidebarOpen)
      this.resizerTarget.classList.add("hidden")
    } else {
      this.sidebarTarget.classList.remove("-translate-x-full")
      this.overlayTarget.classList.add("hidden")
      this.resizerTarget.classList.remove("hidden")
    }

    this.updateToggleButton()
  }

  openSidebar(event = null) {
    event?.stopPropagation()
    if (!this.isMobileViewport()) {
      return
    }

    this.isSidebarOpen = true
    this.applySidebarState()
  }

  closeSidebar(event = null) {
    event?.stopPropagation()
    if (!this.isMobileViewport()) {
      return
    }

    this.isSidebarOpen = false
    this.applySidebarState()
  }

  toggleSidebar(event = null) {
    event?.stopPropagation()
    this.isSidebarOpen = !this.isSidebarOpen
    this.applySidebarState()
  }

  updateToggleButton() {
    if (!this.hasToggleButtonTarget) {
      return
    }

    const icon = this.isSidebarOpen
      ? `<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M6 18 18 6M6 6l12 12"></path></svg>`
      : `<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M4 7h16M4 12h16M4 17h16"></path></svg>`

    this.toggleButtonTarget.innerHTML = icon
    this.toggleButtonTarget.setAttribute("aria-expanded", String(this.isSidebarOpen))
  }

  setMobileTitle(title) {
    if (this.hasMobileTitleTarget) {
      this.mobileTitleTarget.textContent = title || "消息"
    }
  }

  establishEventSource() {
    this.teardownEventSource()

    const source = new EventSource(this.eventSourceUrl)
    this.eventSource = source

    source.onmessage = (event) => this.handleEventSourceMessage(event)
    source.addEventListener("ping", () => {})
    source.onerror = () => {
      this.scheduleReconnect()
    }
  }

  handleEventSourceMessage(event) {
    try {
      const payload = JSON.parse(event.data)
      window.dispatchEvent(new CustomEvent("chat:notify", { detail: payload }))

      if (window.Notification && Notification.permission === "granted") {
        const roomName = this.chatRoomNames[payload.chat_room_id]
          || `聊天室 ${payload.chat_room_id}`
        new Notification("聊天室新消息", {
          body: `${roomName}：${payload.content_preview}`
        })
      }
    } catch (error) {
      console.error("解析消息失败", error)
    }
  }

  scheduleReconnect() {
    this.teardownEventSource()
    if (this.reconnectTimer) {
      return
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.establishEventSource()
    }, this.eventSourceRetryDelay)
  }

  teardownEventSource() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.eventSource) {
      try {
        this.eventSource.close()
      } catch (_) {
        // ignore close errors
      }
      this.eventSource = null
    }
  }

  selectContact(event) {
    const contact = event.currentTarget
    const contactId = contact.dataset.contactId
    const contactName = contact.querySelector(".font-medium")?.textContent?.trim()

    this.contactTargets.forEach((item) => item.classList.remove("bg-slate-100"))
    contact.classList.add("bg-slate-100")
    this.currentRoomId = null
    this.setMobileTitle(contactName || "联系人")

    fetch(`/contact/${contactId}`)
      .then((resp) => resp.text())
      .then((html) => {
        this.chatBoxTarget.innerHTML = html
        this.closeSidebar()
      })
      .catch(() => {
        this.chatBoxTarget.innerHTML = '<div class="flex h-full items-center justify-center px-6 text-sm text-rose-500">联系人详情加载失败</div>'
      })
  }

  handleOpenChat(event) {
    const chatRoomId = event.detail?.chatRoomId
    if (chatRoomId) {
      this.openChatRoom(chatRoomId)
    }
  }

  openChatRoom(chatRoomId) {
    const roomTitle = this.chatRoomNames[chatRoomId] || "聊天窗口"
    this.currentRoomId = String(chatRoomId)
    this.setMobileTitle(roomTitle)
    this.chatBoxTarget.innerHTML = '<div class="flex h-full items-center justify-center px-6 text-sm text-slate-400">加载中...</div>'

    fetch(`/chat_room/${chatRoomId}`)
      .then((resp) => resp.text())
      .then((html) => {
        if (this.currentRoomId !== String(chatRoomId)) {
          return
        }

        this.chatBoxTarget.innerHTML = html
        this.closeSidebar()
      })
      .catch(() => {
        if (this.currentRoomId !== String(chatRoomId)) {
          return
        }

        this.chatBoxTarget.innerHTML = '<div class="flex h-full items-center justify-center px-6 text-sm text-rose-500">聊天窗口加载失败</div>'
      })
  }

  switchTab(event) {
    const clicked = event.currentTarget
    clicked.parentNode.querySelectorAll("[data-active]").forEach((tab) => {
      tab.dataset.active = "false"
    })
    clicked.dataset.active = "true"

    if (clicked.dataset.tab === "messages") {
      this.messagesListTarget.classList.remove("hidden")
      this.contactsListTarget.classList.add("hidden")
      this.letterNavTarget.hidden = true
      this.setMobileTitle("消息")

      fetch("/chat_room/list")
        .then((resp) => resp.json())
        .then((chatRooms) => {
          const chatRoomList = document.getElementById("chat-room-list")

          if (!chatRooms || chatRooms.length === 0) {
            chatRoomList.innerHTML = '<div class="px-6 py-8 text-center text-sm text-slate-400">暂无会话</div>'
            return
          }

          chatRoomList.innerHTML = chatRooms.map((room) => `
            <button type="button"
                    class="flex w-full items-center border-b border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50"
                    data-chat-room-id="${room.id}">
              <div class="mr-3 flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-200 text-lg font-medium text-slate-600">
                ${room.avatar_base64
                  ? `<img src="data:image/png;base64,${room.avatar_base64}" class="h-full w-full object-cover" alt="头像"/>`
                  : `<span>?</span>`}
              </div>
              <div class="min-w-0 flex-1">
                <div class="truncate font-medium text-slate-900">${room.name || "未命名会话"}</div>
                <div class="truncate text-xs text-slate-500">${room.latest_wx_message?.preview_content || ""}</div>
              </div>
            </button>
          `).join("")

          chatRooms.forEach((room) => {
            this.chatRoomNames[room.id] = room.name || "未命名会话"
            const element = chatRoomList.querySelector(`[data-chat-room-id="${room.id}"]`)
            if (element) {
              element.addEventListener("click", () => this.openChatRoom(room.id))
            }
          })
        })
    } else {
      this.messagesListTarget.classList.add("hidden")
      this.contactsListTarget.classList.remove("hidden")
      this.letterNavTarget.hidden = false
      this.setMobileTitle("通讯录")
    }
  }

  scrollToGroup(event) {
    const initial = event.currentTarget.dataset.letter
    const group = this.groupTargets.find((item) => item.id === `group-${initial}`)
    if (group) {
      group.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  highlightLetter() {
    let currentInitial = "#"
    const containerTop = this.contactsListTarget.getBoundingClientRect().top

    this.groupTargets.forEach((group) => {
      const rect = group.getBoundingClientRect()
      if (rect.top - containerTop <= 10) {
        currentInitial = group.id.replace("group-", "")
      }
    })

    this.letterTargets.forEach((letter) => {
      letter.classList.toggle("active", letter.dataset.letter === currentInitial)
    })
  }

  startResize(event) {
    if (this.isMobileViewport()) {
      return
    }

    event.preventDefault()
    this.startX = event.clientX || event.touches?.[0]?.clientX
    this.startWidth = this.sidebarTarget.offsetWidth || this.minWidth

    document.addEventListener("mousemove", this.resize, { passive: false })
    document.addEventListener("touchmove", this.resize, { passive: false })
    document.addEventListener("mouseup", this.stopResize)
    document.addEventListener("touchend", this.stopResize)
  }

  resize = (event) => {
    const clientX = event.clientX || event.touches?.[0]?.clientX
    let newWidth = this.startWidth + (clientX - this.startX)

    if (newWidth < this.minWidth) {
      newWidth = this.minWidth
    }
    if (newWidth > this.maxWidth) {
      newWidth = this.maxWidth
    }

    this.sidebarTarget.style.width = `${newWidth}px`
  }

  stopResize = () => {
    document.removeEventListener("mousemove", this.resize)
    document.removeEventListener("touchmove", this.resize)
    document.removeEventListener("mouseup", this.stopResize)
    document.removeEventListener("touchend", this.stopResize)
  }

  search(event) {
    const value = event.target.value.trim().toLowerCase()
    const contactsVisible = this.messagesListTarget.classList.contains("hidden")

    if (!contactsVisible) {
      const chatRooms = document.querySelectorAll("[data-chat-room-id]")
      chatRooms.forEach((chatRoom) => {
        const matched = chatRoom.textContent.toLowerCase().includes(value)
        chatRoom.classList.toggle("hidden", !matched)
      })
      return
    }

    const visibleContacts = this.contactTargets.filter((contact) => {
      const text = contact.textContent.toLowerCase()
      const matched = text.includes(value)
      contact.classList.toggle("hidden", !matched)
      return matched
    })

    this.groupTargets.forEach((group) => {
      const hasVisibleContact = group.querySelector('[data-chat-target="contact"]:not(.hidden)')
      group.classList.toggle("hidden", !hasVisibleContact && value.length > 0)
    })

    if (this.messagesListTarget.classList.contains("hidden")) {
      this.letterNavTarget.hidden = value.length > 0 || visibleContacts.length === 0
    }
  }
}
