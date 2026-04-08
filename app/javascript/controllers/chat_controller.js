import { Controller } from "@hotwired/stimulus"
import { chatStorageKeys, readCache, writeCache } from "utils/chat_storage"
import { DEFAULT_BADGE_LABELS, badgeLabelFor, loadBadgeLabels } from "utils/chat_badges"

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
    "settingsList",
    "folderBar",
    "letterNav",
    "mobileHeader",
    "mobileTitle",
    "sidebarTitle",
    "resizer",
    "notificationPanel",
    "notificationButton",
    "notificationStatus",
    "notificationToggle",
    "notificationHiddenOnly",
    "groupBadgeInput",
    "officialBadgeInput"
  ]

  connect() {
    this.eventSource = null
    this.reconnectTimer = null
    this.eventSourceUrl = "/notion/message"
    this.eventSourceRetryDelay = 1500
    this.sessionBootstrapUrl = "/login/bootstrap_online_sessions"
    this.notificationServiceWorkerTimeoutMs = 1200
    this.chatRoomNames = {}
    this.chatRooms = this.cachedChatRooms()
    this.chatFolders = this.loadChatFolders()
    this.activeChatFolderId = this.loadActiveChatFolderId()
    this.activeChatSection = this.loadActiveChatSection()
    this.collapsedContactGroups = this.loadCollapsedContactGroups()
    this.notificationSettings = this.loadNotificationSettings()
    this.badgeLabels = loadBadgeLabels()
    this.currentRoomId = null
    this.sidebarSearchTimer = null
    this.sidebarSearchRequestId = 0
    this.originalContactsMarkup = this.hasContactsListTarget
      ? this.contactsListTarget.innerHTML
      : ""
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
    this.boundVisualViewportChange = this.updateViewportMetrics.bind(this)

    this.applyChatRoomNames(this.chatRooms)
    this.ensureActiveFolder()
    this.syncNotificationUi()
    this.syncBadgeLabelUi()
    this.applyContactGroupVisibility()
    this.renderFolderBar()
    this.refreshChatFolders()
    this.applyConfiguredBadgeLabels(this.element)

    const initialTab = this.sidebarTarget.querySelector(`[data-tab="${this.activeChatSection}"]`)
      || this.sidebarTarget.querySelector('[data-tab="messages"]')
    if (initialTab) {
      initialTab.click()
    }

    this.applySidebarState()
    this.syncMobileViewportLock()
    this.establishEventSource()
    this.bootstrapOnlineSessions()

    this.element.addEventListener("chat:open", this.boundHandleOpenChat)
    this.element.addEventListener("chat:sidebar:open", this.boundOpenSidebar)
    this.element.addEventListener("chat:sidebar:close", this.boundCloseSidebar)
    window.addEventListener("chat:local-message", this.boundLocalChatMessage)
    window.addEventListener("resize", this.boundHandleViewportChange)
    window.visualViewport?.addEventListener("resize", this.boundVisualViewportChange)
    window.visualViewport?.addEventListener("scroll", this.boundVisualViewportChange)
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", this.boundServiceWorkerMessage)
    }

    const requestedChatRoomId = this.chatRoomIdFromLocation()
    if (requestedChatRoomId) {
      this.openChatRoom(requestedChatRoomId)
    }
  }

  disconnect() {
    if (this.sidebarSearchTimer) {
      clearTimeout(this.sidebarSearchTimer)
      this.sidebarSearchTimer = null
    }
    this.teardownEventSource()
    this.element.removeEventListener("chat:open", this.boundHandleOpenChat)
    this.element.removeEventListener("chat:sidebar:open", this.boundOpenSidebar)
    this.element.removeEventListener("chat:sidebar:close", this.boundCloseSidebar)
    window.removeEventListener("chat:local-message", this.boundLocalChatMessage)
    window.removeEventListener("resize", this.boundHandleViewportChange)
    window.visualViewport?.removeEventListener("resize", this.boundVisualViewportChange)
    window.visualViewport?.removeEventListener("scroll", this.boundVisualViewportChange)
    document.removeEventListener("click", this.boundCloseNotificationPanel)
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.removeEventListener("message", this.boundServiceWorkerMessage)
    }
    this.releaseMobileViewportLock()
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

  persistBadgeLabels() {
    const [namespace, identifier] = chatStorageKeys.badgeLabels()
    writeCache(namespace, identifier, this.badgeLabels)
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

  loadActiveChatSection() {
    const [namespace, identifier] = chatStorageKeys.activeChatSection()
    return readCache(namespace, identifier, "messages") || "messages"
  }

  persistActiveChatSection() {
    const [namespace, identifier] = chatStorageKeys.activeChatSection()
    writeCache(namespace, identifier, this.activeChatSection)
  }

  loadCollapsedContactGroups() {
    const [namespace, identifier] = chatStorageKeys.collapsedContactGroups()
    const cached = readCache(namespace, identifier, {})
    return cached && typeof cached === "object" ? cached : {}
  }

  persistCollapsedContactGroups() {
    const [namespace, identifier] = chatStorageKeys.collapsedContactGroups()
    writeCache(namespace, identifier, this.collapsedContactGroups)
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
    this.renderFolderBar()
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

  secureNotificationContext() {
    return typeof window !== "undefined" && !!window.isSecureContext
  }

  isContactGroupCollapsed(groupKey) {
    return !!this.collapsedContactGroups?.[String(groupKey)]
  }

  applyContactGroupVisibility({ searching = false } = {}) {
    const groups = this.element.querySelectorAll("[data-chat-collapsible-group]")
    groups.forEach((group) => {
      const groupKey = String(group.dataset.groupKey || "")
      const body = group.querySelector("[data-chat-group-body]")
      const toggle = group.querySelector("[data-chat-group-toggle]")
      const chevron = group.querySelector("[data-chat-group-chevron]")

      if (!body || !toggle) {
        return
      }

      const hasVisibleContact = !!group.querySelector('[data-chat-target="contact"]:not(.hidden)')
      const collapsed = !searching && this.isContactGroupCollapsed(groupKey)

      body.classList.toggle("hidden", collapsed)
      toggle.setAttribute("aria-expanded", String(!collapsed))
      toggle.classList.toggle("opacity-70", !hasVisibleContact)

      if (chevron) {
        chevron.classList.toggle("rotate-180", !collapsed)
      }
    })
  }

  notificationPermissionLabel() {
    if (!this.notificationsSupported()) {
      return "当前浏览器不支持桌面通知"
    }

    if (!this.secureNotificationContext()) {
      return "通知需要 HTTPS 或 localhost"
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

  syncBadgeLabelUi() {
    if (this.hasGroupBadgeInputTarget) {
      this.groupBadgeInputTarget.value = badgeLabelFor("group", this.badgeLabels)
    }

    if (this.hasOfficialBadgeInputTarget) {
      this.officialBadgeInputTarget.value = badgeLabelFor("official", this.badgeLabels)
    }
  }

  updateGroupBadgeLabel(event) {
    this.updateBadgeLabel("group", event?.target?.value)
  }

  updateOfficialBadgeLabel(event) {
    this.updateBadgeLabel("official", event?.target?.value)
  }

  resetBadgeLabels() {
    this.badgeLabels = { ...DEFAULT_BADGE_LABELS }
    this.persistBadgeLabels()
    this.syncBadgeLabelUi()
    this.refreshBadgeLabels()
  }

  updateBadgeLabel(kind, value) {
    this.badgeLabels = {
      ...this.badgeLabels,
      [kind]: String(value || "").trim() || DEFAULT_BADGE_LABELS[kind]
    }
    this.persistBadgeLabels()
    this.refreshBadgeLabels()
  }

  refreshBadgeLabels() {
    this.applyConfiguredBadgeLabels(this.element)

    if (this.activeChatSection === "messages") {
      this.renderChatRoomList(this.chatRooms)
    }
  }

  applyConfiguredBadgeLabels(root) {
    if (!root) {
      return
    }

    root.querySelectorAll("[data-badge-kind]").forEach((element) => {
      const label = badgeLabelFor(element.dataset.badgeKind, this.badgeLabels)
      if (label) {
        element.textContent = label
      }
    })
  }

  typeBadgeLabel(kind) {
    return badgeLabelFor(kind, this.badgeLabels)
  }

  typeBadgeMarkup(kind, { large = false } = {}) {
    if (!kind) {
      return ""
    }

    const sizeClass = large ? " is-large" : ""
    return `<span class="tg-room-badge is-${this.escapeHtml(kind)}${sizeClass}" data-badge-kind="${this.escapeHtml(kind)}">${this.escapeHtml(this.typeBadgeLabel(kind))}</span>`
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

    this.syncMobileViewportLock()
    this.applySidebarState()
    this.updateMobileHeaderVisibility()
  }

  syncMobileViewportLock() {
    const mobile = this.isMobileViewport()
    document.documentElement.classList.toggle("tg-mobile-app", mobile)
    document.body.classList.toggle("tg-mobile-app", mobile)
    this.updateViewportMetrics()
  }

  releaseMobileViewportLock() {
    document.documentElement.classList.remove("tg-mobile-app")
    document.body.classList.remove("tg-mobile-app")
    document.documentElement.style.removeProperty("--tg-app-height")
    document.documentElement.style.removeProperty("--tg-keyboard-offset")
  }

  updateViewportMetrics() {
    const visualViewport = window.visualViewport
    const viewportHeight = visualViewport?.height || window.innerHeight
    if (!viewportHeight) {
      return
    }

    document.documentElement.style.setProperty("--tg-app-height", `${Math.round(viewportHeight)}px`)
    const keyboardOffset = Math.max(
      window.innerHeight - ((visualViewport?.height || window.innerHeight)
        + (visualViewport?.offsetTop || 0)),
      0
    )
    document.documentElement.style.setProperty("--tg-keyboard-offset", `${Math.round(keyboardOffset)}px`)
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
    this.updateMobileHeaderVisibility()
  }

  updateMobileHeaderVisibility() {
    if (!this.hasMobileHeaderTarget) {
      return
    }

    const shouldHide = this.isMobileViewport() && !!this.currentRoomId
    this.mobileHeaderTarget.classList.toggle("hidden", shouldHide)
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
      ? `<span class="text-xl leading-none text-slate-500" aria-hidden="true">&times;</span>`
      : `<img src="/icon/menu.svg" alt="" class="h-5 w-5 tg-ui-icon" aria-hidden="true">`

    this.toggleButtonTarget.innerHTML = icon
    this.toggleButtonTarget.setAttribute("aria-expanded", String(this.isSidebarOpen))
  }

  setMobileTitle(title) {
    if (this.hasMobileTitleTarget) {
      this.mobileTitleTarget.textContent = title || "消息"
    }
  }

  setSidebarTitle(title) {
    if (this.hasSidebarTitleTarget) {
      this.sidebarTitleTarget.textContent = title || "消息"
    }
  }

  syncSectionTabs() {
    this.sidebarTarget.querySelectorAll("[data-chat-section-tab]").forEach((tab) => {
      tab.dataset.active = String(tab.dataset.tab === this.activeChatSection)
    })
  }

  activateSection(section) {
    this.activeChatSection = section
    this.persistActiveChatSection()
    this.syncSectionTabs()

    const showMessages = section === "messages"
    const showContacts = section === "contacts"
    const showSettings = section === "settings"

    this.messagesListTarget.classList.toggle("hidden", !showMessages)
    this.contactsListTarget.classList.toggle("hidden", !showContacts)
    if (this.hasSettingsListTarget) {
      this.settingsListTarget.classList.toggle("hidden", !showSettings)
    }
    this.letterNavTarget.hidden = !showContacts

    if (showMessages) {
      this.setMobileTitle("消息")
      this.setSidebarTitle(this.currentChatFolder()?.name || "消息")
      this.refreshChatFolders()
      this.loadChatRooms()
      return
    }

    if (showContacts) {
      this.setMobileTitle("通讯录")
      this.setSidebarTitle("联系人")
      this.applyContactGroupVisibility({
        searching: !!document.getElementById("sidebar-search")?.value?.trim()
      })
      return
    }

    this.setMobileTitle("设置")
    this.setSidebarTitle("设置")
    this.syncNotificationUi()
    this.syncBadgeLabelUi()
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

    if (!this.secureNotificationContext()) {
      this.syncNotificationUi()
      if (typeof window.showErrorToast === "function") {
        window.showErrorToast("桌面通知需要 HTTPS 或 localhost，当前页面无法申请权限")
      }
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

    if (!this.secureNotificationContext()) {
      if (typeof window.showErrorToast === "function") {
        window.showErrorToast("桌面通知需要 HTTPS 或 localhost，当前页面无法发送测试通知")
      }
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
      this.bootstrapOnlineSessions({ force: true })
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
      badge: "/badge-50.png",
      renotify: true,
      data: {
        url: payload?.chat_room_id ? `/chat?chat_room_id=${payload.chat_room_id}` : "/chat"
      }
    }

    const browserOptions = {
      body: options.body,
      icon: options.icon,
      tag: options.tag,
      data: options.data
    }

    if (this.prefersWindowNotification()) {
      if (this.showWindowNotification(title, browserOptions)) {
        return
      }
    }

    const registration = await this.notificationServiceWorkerRegistration()
    if (registration?.showNotification) {
      try {
        await registration.showNotification(title, options)
        return
      } catch (error) {
        console.error("service worker notification failed", error)
      }
    }

    this.showWindowNotification(title, browserOptions)
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

  bootstrapOnlineSessions({ force = false } = {}) {
    const storageKey = "wechat-rails-session-bootstrap-at"
    const minIntervalMs = force ? 5000 : 15000
    const lastRunAt = Number(window.sessionStorage?.getItem(storageKey) || "0")
    if (lastRunAt && Date.now() - lastRunAt < minIntervalMs) {
      return Promise.resolve(null)
    }

    return fetch(this.sessionBootstrapUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-CSRF-Token": this.csrfToken()
      },
      body: JSON.stringify({ force })
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`启动补偿失败: ${response.status}`)
        }
        window.sessionStorage?.setItem(storageKey, String(Date.now()))
        return response.json()
      })
      .catch((error) => {
        console.error("在线会话启动补偿失败", error)
        return null
      })
  }

  prefersWindowNotification() {
    return /firefox/i.test(window.navigator?.userAgent || "")
  }

  serviceWorkerUrl() {
    return document.body?.dataset?.pwaInstallServiceWorkerUrlValue || "/service-worker.js"
  }

  async notificationServiceWorkerRegistration() {
    if (!("serviceWorker" in navigator)) {
      return null
    }

    try {
      const readyPromise = navigator.serviceWorker.ready
        .then((registration) => registration?.showNotification ? registration : null)
        .catch(() => null)
      const timeoutPromise = new Promise((resolve) => {
        window.setTimeout(() => resolve(null), this.notificationServiceWorkerTimeoutMs)
      })
      const registration = await Promise.race([readyPromise, timeoutPromise])
      if (registration) {
        return registration
      }
    } catch (error) {
      console.error("service worker ready failed", error)
    }

    try {
      const registration = await navigator.serviceWorker.getRegistration()
      if (registration?.showNotification) {
        return registration
      }
    } catch (error) {
      console.error("service worker lookup failed", error)
    }

    return null
  }

  showWindowNotification(title, options) {
    try {
      const notification = new Notification(title, options)
      notification.onclick = () => {
        try {
          notification.close()
        } catch (_) {
          // ignore
        }
        window.focus()
        const targetUrl = options?.data?.url
        if (targetUrl) {
          window.location.href = targetUrl
        }
      }
      return true
    } catch (error) {
      console.error("notification failed", error)
      return false
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
      <section class="tg-room-list" data-chat-room-section>
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
    this.renderFolderBar()

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
    this.updateMobileHeaderVisibility()
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
    this.updateMobileHeaderVisibility()
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
    this.activateSection(clicked.dataset.tab)
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
    const rawValue = event.target.value.trim()
    const value = rawValue.toLowerCase()
    const section = this.activeChatSection

    if (this.sidebarSearchTimer) {
      clearTimeout(this.sidebarSearchTimer)
      this.sidebarSearchTimer = null
    }

    if (section === "messages") {
      if (!rawValue) {
        this.renderChatRoomList(this.chatRooms)
        return
      }

      this.sidebarSearchTimer = setTimeout(() => {
        this.searchSidebarRemotely(rawValue, "messages")
      }, 180)
      return
    }

    if (section !== "contacts") {
      return
    }

    if (!rawValue) {
      this.restoreContactsMarkup()
      this.applyContactGroupVisibility({ searching: false })
      this.letterNavTarget.hidden = false
      return
    }

    this.sidebarSearchTimer = setTimeout(() => {
      this.searchSidebarRemotely(rawValue, "contacts")
    }, 180)
  }

  searchSidebarRemotely(query, section) {
    const requestId = ++this.sidebarSearchRequestId
    const params = new URLSearchParams({
      q: query,
      limit: section === "messages" ? "60" : "100"
    })

    fetch(`/chat/search?${params.toString()}`, {
      headers: {
        "Accept": "application/json"
      }
    })
      .then((resp) => {
        if (!resp.ok) {
          throw new Error(`搜索失败: ${resp.status}`)
        }
        return resp.json()
      })
      .then((payload) => {
        if (requestId !== this.sidebarSearchRequestId) {
          return
        }

        if (section === "messages") {
          this.renderChatRoomList(Array.isArray(payload?.rooms) ? payload.rooms : [])
          return
        }

        this.renderContactSearchResults(Array.isArray(payload?.contacts) ? payload.contacts : [])
      })
      .catch((error) => {
        console.error("侧边栏搜索失败", error)
        if (section === "messages") {
          this.renderChatRoomList(this.chatRooms)
          return
        }
        this.restoreContactsMarkup()
        this.applyContactGroupVisibility({ searching: true })
      })
  }

  restoreContactsMarkup() {
    if (!this.hasContactsListTarget || !this.originalContactsMarkup) {
      return
    }

    this.contactsListTarget.innerHTML = this.originalContactsMarkup
    this.applyConfiguredBadgeLabels(this.contactsListTarget)
  }

  renderContactSearchResults(contacts) {
    if (!this.hasContactsListTarget) {
      return
    }

    this.letterNavTarget.hidden = true
    if (!contacts.length) {
      this.contactsListTarget.innerHTML = `
        <div class="px-6 py-10 text-center text-sm text-slate-400">
          没有匹配的联系人或群聊
        </div>
      `
      return
    }

    this.contactsListTarget.innerHTML = `
      <div class="space-y-2 px-1">
        ${contacts.map((contact) => this.renderContactSearchRow(contact)).join("")}
      </div>
    `

    contacts.forEach((contact) => {
      const row = this.contactsListTarget.querySelector(`[data-contact-id="${contact.id}"]`)
      if (row) {
        row.addEventListener("click", (event) => this.selectContact(event))
      }
    })
  }

  renderContactSearchRow(contact) {
    const avatar = contact?.avatar_url
      ? `<img src="${this.escapeHtml(contact.avatar_url)}" class="w-full h-full object-cover" alt="${this.escapeHtml(contact.display_name || contact.user_name || "联系人")}">`
      : this.escapeHtml((contact?.display_name || contact?.user_name || "?").slice(0, 1))
    const badge = contact?.group_chat
      ? this.typeBadgeMarkup("group")
      : (contact?.official_account
        ? this.typeBadgeMarkup("official")
        : "")

    return `
      <div class="tg-contact-row flex cursor-pointer items-center px-4 py-3 transition hover:bg-slate-50"
           data-contact-id="${this.escapeHtml(String(contact.id))}"
           data-chat-target="contact">
        <div class="mr-3 flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-[1rem] bg-slate-200 text-sm font-medium text-slate-600">
          ${avatar}
        </div>
        <div class="flex-1 overflow-hidden">
          <div class="flex items-center gap-2">
            <div class="truncate font-medium text-slate-900">${this.escapeHtml(contact.display_name || contact.user_name || "联系人")}</div>
            ${badge}
          </div>
          <div class="truncate text-xs text-slate-400">${this.escapeHtml(contact.user_name || "")}</div>
        </div>
      </div>
    `
  }

  toggleContactGroup(event) {
    event.preventDefault()

    const groupKey = String(event.params?.groupKey || "")
    if (!groupKey) {
      return
    }

    this.collapsedContactGroups = {
      ...this.collapsedContactGroups,
      [groupKey]: !this.isContactGroupCollapsed(groupKey)
    }
    this.persistCollapsedContactGroups()
    const searchValue = document.getElementById("sidebar-search")?.value?.trim() || ""
    this.applyContactGroupVisibility({ searching: searchValue.length > 0 })
  }

  selectChatFolder(event) {
    event.preventDefault()
    const folderId = String(event.params?.folderId || "")
    if (!folderId || !this.chatFolders.some((folder) => folder.id === folderId)) {
      return
    }

    this.activeChatFolderId = folderId
    this.persistActiveChatFolderId()
    this.activateSection("messages")
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
        this.activateSection("messages")
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
      this.activateSection("messages")
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
      const activeClass = active ? "is-active" : ""
      const icon = this.folderRailIcon(folder)

      return `
        <button type="button"
                class="tg-folder-rail-item ${activeClass}"
                title="${this.escapeHtml(folder.name)}"
                aria-label="${this.escapeHtml(folder.name)}"
                data-action="click->chat#selectChatFolder"
                data-chat-folder-id-param="${this.escapeHtml(folder.id)}">
          <span class="tg-folder-rail-icon" aria-hidden="true">${icon}</span>
          ${count > 0 ? `<span class="tg-folder-rail-count">${count}</span>` : ""}
        </button>
      `
    }).join("")

    const deleteButton = currentFolder && !currentFolder.builtIn
      ? `
        <button type="button"
                class="tg-folder-rail-action is-danger"
                title="删除当前分组"
                aria-label="删除当前分组"
                data-action="click->chat#deleteActiveChatFolder">
          -
        </button>
      `
      : ""

    this.folderBarTarget.innerHTML = `
      <div class="flex h-full min-h-0 flex-col">
        <div class="tg-folder-rail-scroll">${folderButtons}</div>
        <div class="tg-folder-rail-actions">
          <button type="button"
                  class="tg-folder-rail-action"
                  title="新建分组"
                  aria-label="新建分组"
                  data-action="click->chat#createChatFolder">
            +
          </button>
          ${deleteButton}
        </div>
      </div>
    `
  }

  folderRailIcon(folder) {
    switch (folder?.kind) {
      case "groups":
        return `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" class="h-5 w-5">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 13.5c-2.2 0-4 1.46-4 3.25V18h8v-1.25c0-1.79-1.8-3.25-4-3.25Zm-5.5-.5c-1.65 0-3 1.1-3 2.45V17h3m11-4c1.65 0 3 1.1 3 2.45V17h-3M12 6.25a2.25 2.25 0 1 1 0 4.5 2.25 2.25 0 0 1 0-4.5Zm-5 1a1.75 1.75 0 1 1 0 3.5 1.75 1.75 0 0 1 0-3.5Zm10 0a1.75 1.75 0 1 1 0 3.5 1.75 1.75 0 0 1 0-3.5Z"/>
          </svg>
        `
      case "contacts":
        return `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" class="h-5 w-5">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 12.25a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5Zm-5.5 6c0-2.35 2.46-4.25 5.5-4.25s5.5 1.9 5.5 4.25V19h-11v-.75Z"/>
          </svg>
        `
      case "official_accounts":
        return `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" class="h-5 w-5">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6.25 8.25A2.25 2.25 0 0 1 8.5 6h7A2.25 2.25 0 0 1 17.75 8.25v4.5A2.25 2.25 0 0 1 15.5 15h-2.25l-2.75 3V15H8.5a2.25 2.25 0 0 1-2.25-2.25v-4.5Z"/>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.25 9.75h5.5M9.25 12.25h3.25"/>
          </svg>
        `
      default:
        return this.escapeHtml(String(folder?.name || "分组").slice(0, 1))
    }
  }

  renderChatRoomRow(room, folder) {
    const roomId = String(room.id)
    const activeClass = roomId === String(this.currentRoomId) ? "is-active" : ""
    const pinned = this.isRoomPinnedInFolder(roomId, folder)
    const typeBadge = room.official_account
      ? this.typeBadgeMarkup("official")
      : room.group_chat
        ? this.typeBadgeMarkup("group")
        : ""
    const preview = room.latest_wx_message?.preview_content || ""
    const timeLabel = this.formatRoomTimestamp(room.latest_wx_message?.message_time)

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
      <div class="tg-room-row ${activeClass}" data-chat-room-row>
        <button type="button"
                class="tg-room-button"
                data-chat-room-id="${this.escapeHtml(roomId)}">
          <div class="tg-room-avatar">
            ${room.avatar_base64
              ? `<img src="data:image/png;base64,${room.avatar_base64}" class="h-full w-full object-cover" alt="头像"/>`
              : `<span>${this.escapeHtml((room.name || "?").slice(0, 1))}</span>`}
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-start gap-3">
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <div class="truncate font-semibold text-slate-900">${this.escapeHtml(room.name || "未命名会话")}</div>
                  ${typeBadge}
                </div>
                <div class="mt-1 truncate text-sm text-slate-500">${this.escapeHtml(preview)}</div>
              </div>
              <div class="flex shrink-0 flex-col items-end gap-2">
                <div class="text-[11px] font-medium text-slate-400">${this.escapeHtml(timeLabel)}</div>
                ${pinned ? '<span class="tg-pin-pill">PIN</span>' : ""}
              </div>
            </div>
          </div>
        </button>
        <div class="flex items-center pr-3">
          <details class="relative">
            <summary class="tg-room-menu-trigger">
              <span aria-hidden="true">⋯</span>
            </summary>
            <div class="tg-room-menu">
              ${menuActions}
            </div>
          </details>
        </div>
      </div>
    `
  }

  formatRoomTimestamp(value) {
    if (!value) {
      return ""
    }

    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      return ""
    }

    const now = new Date()
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    }

    if (date.getFullYear() === now.getFullYear()) {
      return date.toLocaleDateString([], { month: "numeric", day: "numeric" })
    }

    return date.toLocaleDateString()
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
