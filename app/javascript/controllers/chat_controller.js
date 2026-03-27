import { Controller } from "@hotwired/stimulus"
import { chatStorageKeys, readCache, writeCache } from "utils/chat_storage"

const DEFAULT_NOTIFICATION_SETTINGS = {
  enabled: true,
  onlyWhenHidden: true
}

const DEFAULT_CHAT_FOLDERS = [
  {
    id: "groups",
    name: "群聊",
    kind: "groups",
    builtIn: true,
    pinned_room_ids: []
  },
  {
    id: "contacts",
    name: "联系人",
    kind: "contacts",
    builtIn: true,
    pinned_room_ids: []
  },
  {
    id: "official_accounts",
    name: "公众号",
    kind: "official_accounts",
    builtIn: true,
    pinned_room_ids: []
  }
]

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
    "folderBar",
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
    this.chatFolders = this.loadChatFolders()
    this.activeChatFolderId = this.loadActiveChatFolderId()
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
    this.boundLocalChatMessage = this.handleLocalChatMessage.bind(this)

    this.applyChatRoomNames(this.chatRooms)
    this.ensureActiveFolder()
    this.syncNotificationUi()
    this.refreshChatFolders()

    const messageTab = this.sidebarTarget.querySelector('[data-tab="messages"]')
    if (messageTab) {
      messageTab.click()
    }

    this.applySidebarState()
    this.establishEventSource()

    this.element.addEventListener("chat:open", this.boundHandleOpenChat)
    this.element.addEventListener("chat:sidebar:open", this.boundOpenSidebar)
    this.element.addEventListener("chat:sidebar:close", this.boundCloseSidebar)
    window.addEventListener("chat:local-message", this.boundLocalChatMessage)
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
    window.removeEventListener("chat:local-message", this.boundLocalChatMessage)
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

  loadChatFolders() {
    return DEFAULT_CHAT_FOLDERS.map((folder) => ({
      ...folder,
      room_ids: [],
      pinned_room_ids: []
    }))
  }

  loadActiveChatFolderId() {
    const [namespace, identifier] = chatStorageKeys.activeChatFolder()
    return readCache(namespace, identifier, DEFAULT_CHAT_FOLDERS[0].id)
      || DEFAULT_CHAT_FOLDERS[0].id
  }

  persistActiveChatFolderId() {
    const [namespace, identifier] = chatStorageKeys.activeChatFolder()
    writeCache(namespace, identifier, this.activeChatFolderId)
  }

  ensureActiveFolder() {
    if (!this.chatFolders.some((folder) => folder.id === this.activeChatFolderId)) {
      this.activeChatFolderId = String(this.chatFolders[0]?.id || DEFAULT_CHAT_FOLDERS[0].id)
      this.persistActiveChatFolderId()
    }
  }

  csrfToken() {
    return document.querySelector('meta[name="csrf-token"]')?.content || ""
  }

  normalizeFolder(folder) {
    return {
      id: String(folder?.id || ""),
      name: String(folder?.name || "未命名分组"),
      kind: folder?.kind || "custom",
      builtIn: !!folder?.built_in || !!folder?.builtIn,
      room_ids: Array.isArray(folder?.room_ids) ? folder.room_ids.map((id) => String(id)) : [],
      pinned_room_ids: Array.isArray(folder?.pinned_room_ids)
        ? folder.pinned_room_ids.map((id) => String(id))
        : []
    }
  }

  applyServerFolders(folders) {
    if (!Array.isArray(folders) || folders.length === 0) {
      return
    }

    this.chatFolders = folders.map((folder) => this.normalizeFolder(folder))
    this.ensureActiveFolder()
    if (this.hasMessagesListTarget && !this.messagesListTarget.classList.contains("hidden")) {
      this.renderChatRoomList(this.chatRooms)
    }
  }

  refreshChatFolders() {
    return fetch("/chat_folders", {
      headers: {
        "Accept": "application/json"
      }
    })
      .then((resp) => {
        if (!resp.ok) {
          throw new Error(`加载分组失败: ${resp.status}`)
        }
        return resp.json()
      })
      .then((folders) => {
        this.applyServerFolders(folders)
        return folders
      })
      .catch((error) => {
        console.error("加载分组失败", error)
        return this.chatFolders
      })
  }

  submitFolderRequest(url, { method = "POST", body } = {}) {
    return fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-CSRF-Token": this.csrfToken()
      },
      body: body ? JSON.stringify(body) : undefined
    })
      .then((resp) => {
        if (!resp.ok) {
          throw new Error(`分组操作失败: ${resp.status}`)
        }
        return resp.json()
      })
      .then((payload) => {
        if (Array.isArray(payload)) {
          this.applyServerFolders(payload)
          return payload
        }
        if (Array.isArray(payload?.folders)) {
          this.applyServerFolders(payload.folders)
        }
        return payload
      })
      .catch((error) => {
        console.error("分组操作失败", error)
        return null
      })
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

    this.renderFolderBar()

    if (!chatRooms || chatRooms.length === 0) {
      chatRoomList.innerHTML = '<div class="px-6 py-8 text-center text-sm text-slate-400">暂无会话</div>'
      return
    }

    const activeFolder = this.currentChatFolder()
    const visibleRooms = this.visibleRoomsForFolder(activeFolder, chatRooms)

    if (visibleRooms.length === 0) {
      chatRoomList.innerHTML = `
        <div class="px-6 py-10 text-center">
          <div class="text-sm font-medium text-slate-500">${this.escapeHtml(activeFolder?.name || "分组")}</div>
          <div class="mt-2 text-xs text-slate-400">${activeFolder?.kind === "custom" ? "这个分组还没有会话" : "当前分组暂无会话"}</div>
        </div>
      `
      return
    }

    chatRoomList.innerHTML = `
      <section data-chat-room-section>
        ${visibleRooms.map((room) => this.renderChatRoomRow(room, activeFolder)).join("")}
      </section>
    `

    this.applyChatRoomNames(chatRooms)
    visibleRooms.forEach((room) => {
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
      requestAnimationFrame(() => this.loadChatRooms({ force: true }))
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

  currentChatFolder() {
    return this.chatFolders.find((folder) => folder.id === this.activeChatFolderId)
      || this.chatFolders[0]
      || DEFAULT_CHAT_FOLDERS[0]
  }

  visibleRoomsForFolder(folder, rooms = this.chatRooms) {
    const targetFolder = folder || this.currentChatFolder()
    const allRooms = Array.isArray(rooms) ? rooms : []
    const matchedRooms = allRooms.filter((room) => this.roomInFolder(room, targetFolder))
    const pinnedIds = new Set((targetFolder?.pinned_room_ids || []).map((id) => String(id)))
    const pinnedRooms = []
    const normalRooms = []

    matchedRooms.forEach((room) => {
      if (pinnedIds.has(String(room.id))) {
        pinnedRooms.push(room)
      } else {
        normalRooms.push(room)
      }
    })

    const pinnedOrder = new Map((targetFolder?.pinned_room_ids || [])
      .map((id, index) => [String(id), index]))
    pinnedRooms.sort((a, b) => {
      return (pinnedOrder.get(String(a.id)) ?? Number.MAX_SAFE_INTEGER)
        - (pinnedOrder.get(String(b.id)) ?? Number.MAX_SAFE_INTEGER)
    })

    return [...pinnedRooms, ...normalRooms]
  }

  roomInFolder(room, folder) {
    if (!room || !folder) {
      return false
    }

    switch (folder.kind) {
      case "groups":
        return !!room.group_chat
      case "contacts":
        return !room.group_chat && !room.official_account
      case "official_accounts":
        return !!room.official_account
      case "custom":
        return Array.isArray(folder.room_ids)
          && folder.room_ids.includes(String(room.id))
      default:
        return false
    }
  }

  isRoomPinnedInFolder(roomId, folder = this.currentChatFolder()) {
    return (folder?.pinned_room_ids || []).includes(String(roomId))
  }

  handleLocalChatMessage(event) {
    const payload = event?.detail
    if (!payload?.chat_room_id) {
      return
    }
    this.mergeChatRoomUpdate(payload)
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
        official_account: !!payload?.official_account,
        group_chat: !!payload?.group_chat,
        latest_wx_message: {
          id: payload?.wx_messages_id || null,
          preview_content: nextPreview,
          message_time: nextMessageTime
        }
      })
    }

    this.cacheChatRooms(nextRooms)

    if (!payload?.chat_room_name || existingIndex < 0
      || (existingIndex >= 0 && nextRooms[0]
        && typeof nextRooms[0].official_account === "undefined")) {
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
      this.refreshChatFolders()
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
      if (!group.dataset.letter) {
        return
      }
      const rect = group.getBoundingClientRect()
      if (rect.top - containerTop <= 10) {
        currentInitial = group.dataset.letter
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
      document.querySelectorAll("[data-chat-room-section]").forEach((section) => {
        const hasVisibleRoom = section.querySelector('[data-chat-room-id]:not(.hidden)')
        section.classList.toggle("hidden", !hasVisibleRoom)
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

  selectChatFolder(event) {
    event.preventDefault()
    const folderId = String(event.params?.folderId || "")
    if (!folderId || !this.chatFolders.some((folder) => folder.id === folderId)) {
      return
    }

    this.activeChatFolderId = folderId
    this.persistActiveChatFolderId()
    this.renderChatRoomList(this.chatRooms)
  }

  createChatFolder(event = null) {
    event?.preventDefault()
    event?.stopPropagation()

    const folderName = window.prompt("输入新的分组名称")
    if (!folderName) {
      return
    }

    const name = folderName.trim()
    if (!name) {
      return
    }

    this.submitFolderRequest("/chat_folders", {
      method: "POST",
      body: { name }
    }).then((payload) => {
      const createdId = payload?.folder?.id
      if (createdId) {
        this.activeChatFolderId = String(createdId)
        this.persistActiveChatFolderId()
        this.renderChatRoomList(this.chatRooms)
      }
    })
  }

  deleteActiveChatFolder(event = null) {
    event?.preventDefault()
    event?.stopPropagation()

    const activeFolder = this.currentChatFolder()
    if (!activeFolder || activeFolder.builtIn) {
      return
    }

    const shouldDelete = window.confirm(`删除分组“${activeFolder.name}”？`)
    if (!shouldDelete) {
      return
    }

    this.submitFolderRequest(`/chat_folders/${activeFolder.id}`, {
      method: "DELETE"
    }).then(() => {
      this.activeChatFolderId = DEFAULT_CHAT_FOLDERS[0].id
      this.persistActiveChatFolderId()
      this.renderChatRoomList(this.chatRooms)
    })
  }

  togglePinInCurrentFolder(event) {
    event.preventDefault()
    event.stopPropagation()

    const roomId = String(event.params?.roomId || "")
    const folder = this.currentChatFolder()
    if (!roomId || !folder) {
      return
    }

    this.submitFolderRequest(`/chat_folders/${folder.id}/toggle_pin`, {
      method: "PATCH",
      body: { chat_room_id: roomId }
    })
  }

  toggleCustomFolderMembership(event) {
    event.preventDefault()
    event.stopPropagation()

    const roomId = String(event.params?.roomId || "")
    const folderId = String(event.params?.folderId || "")
    if (!roomId || !folderId) {
      return
    }

    this.submitFolderRequest(`/chat_folders/${folderId}/toggle_room`, {
      method: "PATCH",
      body: { chat_room_id: roomId }
    })
  }

  renderFolderBar() {
    if (!this.hasFolderBarTarget) {
      return
    }

    const currentFolder = this.currentChatFolder()
    const folderButtons = this.chatFolders.map((folder) => {
      const active = folder.id === currentFolder?.id
      const count = this.visibleRoomsForFolder(folder).length
      const activeClass = active
        ? "border-slate-900 bg-slate-900 text-white"
        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"

      return `
        <button type="button"
                class="inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium transition ${activeClass}"
                data-action="click->chat#selectChatFolder"
                data-chat-folder-id-param="${this.escapeHtml(folder.id)}">
          <span>${this.escapeHtml(folder.name)}</span>
          <span class="rounded-full ${active ? "bg-white/15 text-white" : "bg-slate-100 text-slate-500"} px-2 py-0.5 text-[10px]">${count}</span>
        </button>
      `
    }).join("")

    const deleteButton = currentFolder && !currentFolder.builtIn
      ? `
        <button type="button"
                class="inline-flex shrink-0 items-center rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600 transition hover:bg-rose-100"
                data-action="click->chat#deleteActiveChatFolder">
          删除分组
        </button>
      `
      : ""

    this.folderBarTarget.innerHTML = `
      ${folderButtons}
      <button type="button"
              class="inline-flex shrink-0 items-center rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
              data-action="click->chat#createChatFolder">
        + 新建分组
      </button>
      ${deleteButton}
    `
  }

  renderChatRoomRow(room, folder) {
    const roomId = String(room.id)
    const activeClass = roomId === String(this.currentRoomId)
      ? "bg-slate-50"
      : "bg-white"
    const pinned = this.isRoomPinnedInFolder(roomId, folder)
    const typeBadge = room.official_account
      ? '<span class="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">公众号</span>'
      : room.group_chat
        ? '<span class="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-700">群聊</span>'
        : ""

    const customFolderActions = this.chatFolders
      .filter((item) => item.kind === "custom")
      .map((item) => {
        const joined = (item.room_ids || []).includes(roomId)
        return `
          <button type="button"
                  class="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs text-slate-600 transition hover:bg-slate-50"
                  data-action="click->chat#toggleCustomFolderMembership"
                  data-chat-room-id-param="${this.escapeHtml(roomId)}"
                  data-chat-folder-id-param="${this.escapeHtml(item.id)}">
            <span>${joined ? "移出" : "加入"} ${this.escapeHtml(item.name)}</span>
            <span class="text-slate-400">${joined ? "已加入" : "未加入"}</span>
          </button>
        `
      }).join("")

    const menuActions = `
      <button type="button"
              class="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs text-slate-600 transition hover:bg-slate-50"
              data-action="click->chat#togglePinInCurrentFolder"
              data-chat-room-id-param="${this.escapeHtml(roomId)}">
        <span>${pinned ? "取消置顶" : "置顶到当前分组"}</span>
        <span class="text-slate-400">${pinned ? "Pinned" : "Pin"}</span>
      </button>
      ${customFolderActions || '<div class="px-3 py-2 text-xs text-slate-400">暂无自定义分组</div>'}
    `

    return `
      <div class="group flex items-stretch border-b border-slate-100 ${activeClass}" data-chat-room-row>
        <button type="button"
                class="flex min-w-0 flex-1 items-center px-4 py-3 text-left transition hover:bg-slate-50"
                data-chat-room-id="${this.escapeHtml(roomId)}">
          <div class="mr-3 flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-200 text-lg font-medium text-slate-600">
            ${room.avatar_base64
              ? `<img src="data:image/png;base64,${room.avatar_base64}" class="h-full w-full object-cover" alt="头像"/>`
              : `<span>${this.escapeHtml((room.name || "?").slice(0, 1))}</span>`}
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <div class="truncate font-medium text-slate-900">${this.escapeHtml(room.name || "未命名会话")}</div>
              ${typeBadge}
              ${pinned ? '<span class="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-medium text-white">PIN</span>' : ""}
            </div>
            <div class="truncate text-xs text-slate-500">${this.escapeHtml(room.latest_wx_message?.preview_content || "")}</div>
          </div>
        </button>
        <div class="flex items-center pr-2">
          <details class="relative">
            <summary class="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
              <span aria-hidden="true">⋯</span>
            </summary>
            <div class="absolute right-0 top-11 z-30 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl">
              ${menuActions}
            </div>
          </details>
        </div>
      </div>
    `
  }

  escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
  }
}
