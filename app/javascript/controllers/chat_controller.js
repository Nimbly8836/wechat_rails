import { Controller } from "@hotwired/stimulus"
import { chatStorageKeys, readCache, writeCache } from "utils/chat_storage"

const DEFAULT_NOTIFICATION_SETTINGS = {
  enabled: true,
  onlyWhenHidden: true
}

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
    "resizer",
    "notificationPanel",
    "notificationButton",
    "notificationStatus",
    "notificationToggle",
    "notificationHiddenOnly"
  ]

  connect() {
    this.eventSource = null
    this.reconnectTimer = null
    this.eventSourceUrl = "/notion/message"
    this.eventSourceRetryDelay = 1500
    this.chatRoomNames = {}
    this.chatRooms = this.cachedChatRooms()
    this.notificationSettings = this.loadNotificationSettings()
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
    this.boundCloseNotificationPanel = this.closeNotificationPanel.bind(this)
    this.boundServiceWorkerMessage = this.handleServiceWorkerMessage.bind(this)

    this.applyChatRoomNames(this.chatRooms)
    this.syncNotificationUi()

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
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", this.boundServiceWorkerMessage)
    }

    const requestedChatRoomId = this.chatRoomIdFromLocation()
    if (requestedChatRoomId) {
      this.openChatRoom(requestedChatRoomId)
    }
  }

  disconnect() {
    this.teardownEventSource()
    this.element.removeEventListener("chat:open", this.boundHandleOpenChat)
    this.element.removeEventListener("chat:sidebar:open", this.boundOpenSidebar)
    this.element.removeEventListener("chat:sidebar:close", this.boundCloseSidebar)
    window.removeEventListener("resize", this.boundHandleViewportChange)
    document.removeEventListener("click", this.boundCloseNotificationPanel)
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.removeEventListener("message", this.boundServiceWorkerMessage)
    }
    this.stopResize()
  }

  loadNotificationSettings() {
    const [namespace, identifier] = chatStorageKeys.notificationSettings()
    return {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      ...(readCache(namespace, identifier, {}) || {})
    }
  }

  persistNotificationSettings() {
    const [namespace, identifier] = chatStorageKeys.notificationSettings()
    writeCache(namespace, identifier, this.notificationSettings)
  }

  cachedChatRooms() {
    const [namespace, identifier] = chatStorageKeys.chatRoomList()
    const cached = readCache(namespace, identifier, [])
    return Array.isArray(cached) ? cached : []
  }

  cacheChatRooms(chatRooms) {
    const [namespace, identifier] = chatStorageKeys.chatRoomList()
    this.chatRooms = Array.isArray(chatRooms) ? chatRooms : []
    writeCache(namespace, identifier, this.chatRooms)
  }

  chatRoomIdFromLocation() {
    try {
      return new URL(window.location.href).searchParams.get("chat_room_id")
    } catch (_) {
      return null
    }
  }

  notificationsSupported() {
    return typeof window !== "undefined" && "Notification" in window
  }

  notificationPermissionLabel() {
    if (!this.notificationsSupported()) {
      return "当前浏览器不支持桌面通知"
    }

    switch (Notification.permission) {
      case "granted":
        return "通知已授权"
      case "denied":
        return "通知已被浏览器拦截"
      default:
        return "通知尚未授权"
    }
  }

  syncNotificationUi() {
    if (this.hasNotificationStatusTarget) {
      this.notificationStatusTarget.textContent = this.notificationPermissionLabel()
    }

    if (this.hasNotificationToggleTarget) {
      this.notificationToggleTarget.checked = !!this.notificationSettings.enabled
    }

    if (this.hasNotificationHiddenOnlyTarget) {
      this.notificationHiddenOnlyTarget.checked = !!this.notificationSettings.onlyWhenHidden
      this.notificationHiddenOnlyTarget.disabled = !this.notificationSettings.enabled
    }

    if (this.hasNotificationButtonTarget) {
      const active = this.notificationSettings.enabled && this.notificationsSupported()
        && Notification.permission === "granted"
      this.notificationButtonTarget.classList.toggle("text-emerald-600", active)
      this.notificationButtonTarget.classList.toggle("border-emerald-200", active)
      this.notificationButtonTarget.classList.toggle("bg-emerald-50", active)
      this.notificationButtonTarget.classList.toggle("text-slate-500", !active)
      this.notificationButtonTarget.classList.toggle("border-slate-200", !active)
      this.notificationButtonTarget.classList.toggle("bg-white", !active)
    }
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

  toggleNotificationPanel(event) {
    event?.stopPropagation()
    if (!this.hasNotificationPanelTarget) {
      return
    }

    const shouldOpen = this.notificationPanelTarget.classList.contains("hidden")
    if (shouldOpen) {
      this.notificationPanelTarget.classList.remove("hidden")
      this.syncNotificationUi()
      document.addEventListener("click", this.boundCloseNotificationPanel)
    } else {
      this.closeNotificationPanel()
    }
  }

  closeNotificationPanel(event = null) {
    if (!this.hasNotificationPanelTarget) {
      return
    }

    if (event?.currentTarget === document) {
      const target = event.target
      if (this.notificationPanelTarget.contains(target)
        || (this.hasNotificationButtonTarget
          && this.notificationButtonTarget.contains(target))) {
        return
      }
    }

    this.notificationPanelTarget.classList.add("hidden")
    document.removeEventListener("click", this.boundCloseNotificationPanel)
  }

  updateNotificationsEnabled(event) {
    this.notificationSettings.enabled = !!event?.target?.checked
    this.persistNotificationSettings()
    this.syncNotificationUi()
  }

  updateNotificationsOnlyWhenHidden(event) {
    this.notificationSettings.onlyWhenHidden = !!event?.target?.checked
    this.persistNotificationSettings()
    this.syncNotificationUi()
  }

  async requestNotificationPermission(event = null) {
    event?.stopPropagation()

    if (!this.notificationsSupported()) {
      this.syncNotificationUi()
      return
    }

    try {
      await Notification.requestPermission()
      this.syncNotificationUi()
    } catch (error) {
      console.error("notification permission request failed", error)
    }
  }

  async sendTestNotification(event = null) {
    event?.stopPropagation()

    if (!this.notificationsSupported()) {
      return
    }

    if (Notification.permission !== "granted") {
      await this.requestNotificationPermission()
    }

    if (Notification.permission !== "granted") {
      if (typeof window.showErrorToast === "function") {
        window.showErrorToast("浏览器通知权限未开启")
      }
      return
    }

    await this.showDesktopNotification({
      chat_room_id: this.currentRoomId,
      chat_room_name: this.currentRoomId
        ? this.chatRoomNames[String(this.currentRoomId)] || "当前会话"
        : "Wechat Rails",
      content_preview: "这是一条测试通知",
      self_send: false
    }, { force: true })
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

  async handleEventSourceMessage(event) {
    try {
      const payload = JSON.parse(event.data)
      this.mergeChatRoomUpdate(payload)
      window.dispatchEvent(new CustomEvent("chat:notify", { detail: payload }))
      await this.showDesktopNotification(payload)
    } catch (error) {
      console.error("解析消息失败", error)
    }
  }

  async showDesktopNotification(payload, { force = false } = {}) {
    if (!this.notificationsSupported()) {
      return
    }

    if (!force) {
      if (!this.notificationSettings.enabled || payload?.self_send) {
        return
      }

      if (this.notificationSettings.onlyWhenHidden && document.visibilityState === "visible") {
        return
      }
    }

    if (Notification.permission !== "granted") {
      return
    }

    const roomName = payload?.chat_room_name
      || this.chatRoomNames[String(payload?.chat_room_id)]
      || (payload?.chat_room_id ? `聊天室 ${payload.chat_room_id}` : "Wechat Rails")
    const contentPreview = payload?.content_preview || "你有一条新消息"
    const title = force ? "通知测试" : "聊天室新消息"
    const options = {
      body: `${roomName}：${contentPreview}`,
      tag: payload?.chat_room_id ? `chat-room-${payload.chat_room_id}` : "wechat-rails-chat",
      icon: "/icon-192.png",
      badge: "/chat-50.png",
      renotify: true,
      data: {
        url: payload?.chat_room_id ? `/chat?chat_room_id=${payload.chat_room_id}` : "/chat"
      }
    }

    try {
      if ("serviceWorker" in navigator) {
        const registration = await navigator.serviceWorker.ready
        if (registration?.showNotification) {
          await registration.showNotification(title, options)
          return
        }
      }
    } catch (error) {
      console.error("service worker notification failed", error)
    }

    try {
      new Notification(title, options)
    } catch (error) {
      console.error("notification failed", error)
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

  applyChatRoomNames(chatRooms) {
    ;(chatRooms || []).forEach((room) => {
      if (!room?.id) {
        return
      }
      this.chatRoomNames[String(room.id)] = room.name || `聊天室 ${room.id}`
    })
  }

  renderChatRoomList(chatRooms) {
    const chatRoomList = document.getElementById("chat-room-list")
    if (!chatRoomList) {
      return
    }

    if (!chatRooms || chatRooms.length === 0) {
      chatRoomList.innerHTML = '<div class="px-6 py-8 text-center text-sm text-slate-400">暂无会话</div>'
      return
    }

    chatRoomList.innerHTML = chatRooms.map((room) => {
      const activeClass = String(room.id) === String(this.currentRoomId)
        ? " bg-slate-50"
        : ""
      return `
        <button type="button"
                class="flex w-full items-center border-b border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50${activeClass}"
                data-chat-room-id="${room.id}">
          <div class="mr-3 flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-200 text-lg font-medium text-slate-600">
            ${room.avatar_base64
              ? `<img src="data:image/png;base64,${room.avatar_base64}" class="h-full w-full object-cover" alt="头像"/>`
              : `<span>${(room.name || "?").slice(0, 1)}</span>`}
          </div>
          <div class="min-w-0 flex-1">
            <div class="truncate font-medium text-slate-900">${room.name || "未命名会话"}</div>
            <div class="truncate text-xs text-slate-500">${room.latest_wx_message?.preview_content || ""}</div>
          </div>
        </button>
      `
    }).join("")

    this.applyChatRoomNames(chatRooms)
    chatRooms.forEach((room) => {
      const element = chatRoomList.querySelector(`[data-chat-room-id="${room.id}"]`)
      if (element) {
        element.addEventListener("click", () => this.openChatRoom(room.id))
      }
    })
  }

  loadChatRooms({ force = false } = {}) {
    const cached = this.cachedChatRooms()
    if (!force && cached.length > 0) {
      this.chatRooms = cached
      this.renderChatRoomList(cached)
      return Promise.resolve(cached)
    }

    return fetch("/chat_room/list")
      .then((resp) => resp.json())
      .then((chatRooms) => {
        const normalizedRooms = Array.isArray(chatRooms) ? chatRooms : []
        this.cacheChatRooms(normalizedRooms)
        this.renderChatRoomList(normalizedRooms)
        return normalizedRooms
      })
      .catch((error) => {
        console.error("加载会话列表失败", error)
        if (cached.length) {
          this.chatRooms = cached
          this.renderChatRoomList(cached)
        } else {
          this.renderChatRoomList([])
        }
        return cached
      })
  }

  mergeChatRoomUpdate(payload) {
    const roomId = payload?.chat_room_id
    if (!roomId) {
      return
    }

    const roomKey = String(roomId)
    const nextRooms = [...this.cachedChatRooms()]
    const existingIndex = nextRooms.findIndex((room) => String(room.id) === roomKey)
    const nextPreview = payload?.content_preview || "你有一条新消息"
    const nextMessageTime = payload?.message_time || new Date().toISOString()

    if (existingIndex >= 0) {
      const existingRoom = nextRooms.splice(existingIndex, 1)[0]
      nextRooms.unshift({
        ...existingRoom,
        name: payload?.chat_room_name || existingRoom.name,
        latest_wx_message: {
          ...(existingRoom.latest_wx_message || {}),
          id: payload?.wx_messages_id || existingRoom.latest_wx_message?.id,
          preview_content: nextPreview,
          message_time: nextMessageTime
        }
      })
    } else {
      nextRooms.unshift({
        id: roomId,
        name: payload?.chat_room_name || `聊天室 ${roomId}`,
        avatar_base64: "",
        latest_wx_message: {
          id: payload?.wx_messages_id || null,
          preview_content: nextPreview,
          message_time: nextMessageTime
        }
      })
    }

    this.cacheChatRooms(nextRooms)

    if (!payload?.chat_room_name || existingIndex < 0) {
      this.loadChatRooms({ force: true })
      return
    }

    if (!this.messagesListTarget.classList.contains("hidden")) {
      this.renderChatRoomList(nextRooms)
    } else {
      this.applyChatRoomNames(nextRooms)
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
    this.renderChatRoomList(this.chatRooms)

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

  handleServiceWorkerMessage(event) {
    if (event?.data?.type !== "OPEN_CHAT_ROOM") {
      return
    }

    try {
      const targetUrl = new URL(event.data.url, window.location.origin)
      const chatRoomId = targetUrl.searchParams.get("chat_room_id")
      if (chatRoomId) {
        this.openChatRoom(chatRoomId)
      }
    } catch (error) {
      console.error("failed to handle notification navigation", error)
    }
  }

  openChatRoom(chatRoomId) {
    const roomTitle = this.chatRoomNames[String(chatRoomId)] || "聊天窗口"
    const [namespace, identifier] = chatStorageKeys.chatRoomShell(chatRoomId)
    const cachedHtml = readCache(namespace, identifier, "")
    const renderChatRoomHtml = (html) => {
      if (this.currentRoomId !== String(chatRoomId)) {
        return
      }

      writeCache(namespace, identifier, html)
      this.chatBoxTarget.innerHTML = html
      this.closeSidebar()
    }

    this.currentRoomId = String(chatRoomId)
    this.setMobileTitle(roomTitle)
    this.renderChatRoomList(this.chatRooms)

    if (cachedHtml) {
      this.chatBoxTarget.innerHTML = cachedHtml
      this.closeSidebar()
    } else {
      this.chatBoxTarget.innerHTML = '<div class="flex h-full items-center justify-center px-6 text-sm text-slate-400">加载中...</div>'
    }

    fetch(`/chat_room/${chatRoomId}`)
      .then((resp) => resp.text())
      .then((html) => {
        renderChatRoomHtml(html)
      })
      .catch(() => {
        if (this.currentRoomId !== String(chatRoomId)) {
          return
        }

        if (cachedHtml) {
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
      this.loadChatRooms()
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
