// app/javascript/controllers/emoji_controller.js
import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["emojiPane", "stickersPane", "stickerFolders", "stickerGrid", "stickerEmpty", "stickerStatus", "stickerFileInput"]

  connect() {
    this.hideTimer = null
    this.activeTab = "emoji"
    this.activeStickerFolder = "favorites"
    this.stickerLibraryLoaded = false
    this.stickerFolders = []
    this.stickers = []

    if (!this.element.querySelector(".emoji-panel")) {
      const template = document.querySelector("#emoji-select")
      if (template) {
        this.element.appendChild(template.content.cloneNode(true))
      } else {
        console.error("emoji template not found")
      }
    }
  }

  disconnect() {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer)
    }
  }

  mouseenter(event) {
    event.preventDefault()

    if (this.hideTimer) {
      clearTimeout(this.hideTimer)
      this.hideTimer = null
    }

    this.ensurePanel()
    const panel = this.panelElement()
    if (panel) panel.classList.remove("hidden")
  }

  mouseleave(event) {
    event.preventDefault()
    this.scheduleHide()
  }

  panelMouseenter(event) {
    event.preventDefault()

    if (this.hideTimer) {
      clearTimeout(this.hideTimer)
      this.hideTimer = null
    }
  }

  panelMouseleave(event) {
    event.preventDefault()
    this.scheduleHide()
  }

  switchTab(event) {
    const tab = event.params.tab || "emoji"
    this.activeTab = tab
    this.syncTabs()
    if (tab === "stickers") this.loadStickers()
  }

  insert(event) {
    const emoji = event.currentTarget.dataset.emojiName
    const input = this.findChatInput()
    if (!input) return

    const cursorPos = input.selectionStart || 0
    const textBefore = input.value.substring(0, cursorPos)
    const textAfter = input.value.substring(input.selectionEnd || cursorPos)

    input.value = textBefore + `[${emoji}]` + textAfter
    const newCursorPos = cursorPos + emoji.length + 2
    input.setSelectionRange(newCursorPos, newCursorPos)
    input.dispatchEvent(new Event("input", { bubbles: true, cancelable: true, composed: true }))
    input.focus()
  }

  openStickerUpload() {
    this.stickerFileInputTarget?.click()
  }

  uploadSticker(event) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    if (file.type !== "image/gif" && !file.name.toLowerCase().endsWith(".gif")) {
      this.setStickerStatus("仅支持 GIF")
      return
    }

    const formData = new FormData()
    formData.append("file", file)
    formData.append("favorite", "true")
    if (this.activeStickerFolderId() && this.activeStickerFolderId() !== this.favoritesFolder()?.id) {
      formData.append("folder_id", this.activeStickerFolderId())
    }

    this.setStickerStatus("上传中…")
    fetch("/gif_emojis", {
      method: "POST",
      headers: { "X-CSRF-Token": this.csrfToken() },
      body: formData
    })
      .then((res) => res.json().then((json) => ({ ok: res.ok, json })))
      .then(({ ok, json }) => {
        if (!ok) throw new Error(json?.error || "上传失败")
        this.applyStickerPayload(json)
        this.setStickerStatus("已保存")
      })
      .catch((error) => this.setStickerStatus(error.message || "上传失败"))
  }

  createStickerFolder() {
    const name = window.prompt("文件夹名称")
    if (!name || !name.trim()) return

    fetch("/gif_emoji_folders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": this.csrfToken()
      },
      body: JSON.stringify({ name: name.trim() })
    })
      .then((res) => res.json().then((json) => ({ ok: res.ok, json })))
      .then(({ ok, json }) => {
        if (!ok) throw new Error(json?.error || "创建失败")
        this.stickerFolders = json.folders || []
        this.activeStickerFolder = String(json.folder?.id || this.activeStickerFolder)
        this.renderStickers()
      })
      .catch((error) => this.setStickerStatus(error.message || "创建失败"))
  }

  selectSticker(event) {
    const sticker = this.stickers.find((item) => String(item.id) === String(event.currentTarget.dataset.stickerId))
    if (!sticker) return

    this.element.dispatchEvent(new CustomEvent("gif-emoji:select", {
      bubbles: true,
      detail: {
        fileMd5: sticker.file_md5,
        totalLen: sticker.total_len,
        previewUrl: sticker.preview_url
      }
    }))
    this.touchSticker(sticker.id)
    this.hidePanel()
  }

  toggleStickerFavorite(event) {
    event.preventDefault()
    event.stopPropagation()
    this.toggleStickerFolder(event.currentTarget.dataset.folderId, event.currentTarget.dataset.stickerId)
  }

  toggleStickerInActiveFolder(event) {
    event.preventDefault()
    event.stopPropagation()
    const folderId = this.activeStickerFolderId()
    if (!folderId) return
    this.toggleStickerFolder(folderId, event.currentTarget.dataset.stickerId)
  }

  switchStickerFolder(event) {
    this.activeStickerFolder = event.currentTarget.dataset.folderId
    this.renderStickers()
  }

  addStickerToFolder(event) {
    event.preventDefault()
    event.stopPropagation()
    const folders = this.customFolders()
    if (folders.length === 0) return
    const names = folders.map((folder, index) => `${index + 1}. ${folder.name}`).join("\n")
    const choice = window.prompt(`加入哪个文件夹？\n${names}`)
    const folder = folders[Number(choice) - 1]
    if (!folder) return
    this.toggleStickerFolder(folder.id, event.currentTarget.dataset.stickerId)
  }

  ensurePanel() {
    if (this.panelElement()) return
    const template = document.querySelector("#emoji-select")
    if (template) this.element.appendChild(template.content.cloneNode(true))
  }

  panelElement() {
    return this.element.querySelector(".emoji-panel")
  }

  scheduleHide() {
    this.hideTimer = setTimeout(() => this.hidePanel(), 500)
  }

  hidePanel() {
    const panel = this.panelElement()
    if (panel) panel.classList.add("hidden")
  }

  syncTabs() {
    if (this.hasEmojiPaneTarget) this.emojiPaneTarget.classList.toggle("hidden", this.activeTab !== "emoji")
    if (this.hasStickersPaneTarget) this.stickersPaneTarget.classList.toggle("hidden", this.activeTab !== "stickers")
    this.element.querySelectorAll(".emoji-panel-tab").forEach((tab) => {
      tab.classList.toggle("is-active", tab.dataset.emojiTabParam === this.activeTab)
    })
  }

  loadStickers() {
    if (this.stickerLibraryLoaded) return
    this.setStickerStatus("加载中…")
    fetch("/gif_emojis", { headers: { Accept: "application/json" } })
      .then((res) => res.json().then((json) => ({ ok: res.ok, json })))
      .then(({ ok, json }) => {
        if (!ok) throw new Error(json?.error || "加载失败")
        this.stickerLibraryLoaded = true
        this.applyStickerPayload(json)
        this.setStickerStatus("")
      })
      .catch((error) => this.setStickerStatus(error.message || "加载失败"))
  }

  applyStickerPayload(payload) {
    this.stickerFolders = payload.folders || []
    this.stickers = payload.emojis || []
    if (this.activeStickerFolder === "favorites") {
      this.activeStickerFolder = String(this.favoritesFolder()?.id || "all")
    }
    this.renderStickers()
  }

  renderStickers() {
    this.renderStickerFolders()
    this.renderStickerGrid()
  }

  renderStickerFolders() {
    if (!this.hasStickerFoldersTarget) return
    this.stickerFoldersTarget.innerHTML = ""

    const allButton = this.folderButton({ id: "all", name: "全部" })
    this.stickerFoldersTarget.appendChild(allButton)
    this.stickerFolders.forEach((folder) => this.stickerFoldersTarget.appendChild(this.folderButton(folder)))
  }

  folderButton(folder) {
    const button = document.createElement("button")
    button.type = "button"
    button.className = "gif-sticker-folder"
    button.textContent = folder.name
    button.dataset.folderId = String(folder.id)
    button.classList.toggle("is-active", String(folder.id) === String(this.activeStickerFolder))
    button.addEventListener("click", (event) => this.switchStickerFolder(event))
    return button
  }

  renderStickerGrid() {
    if (!this.hasStickerGridTarget) return
    this.stickerGridTarget.innerHTML = ""
    const stickers = this.filteredStickers()

    stickers.forEach((sticker) => {
      const button = document.createElement("button")
      button.type = "button"
      button.className = "gif-sticker-item"
      button.dataset.stickerId = sticker.id
      button.addEventListener("click", (event) => this.selectSticker(event))

      const img = document.createElement("img")
      img.src = sticker.preview_url
      img.alt = sticker.name || "GIF 表情"
      img.loading = "lazy"
      img.referrerPolicy = "no-referrer"
      button.appendChild(img)

      const actions = document.createElement("span")
      actions.className = "gif-sticker-actions"
      const favorite = this.actionButton(sticker.favorite ? "已收藏" : "收藏")
      favorite.dataset.folderId = this.favoritesFolder()?.id || ""
      favorite.dataset.stickerId = sticker.id
      favorite.addEventListener("click", (event) => this.toggleStickerFavorite(event))
      actions.appendChild(favorite)

      const folderId = this.activeStickerFolderId()
      if (folderId && folderId !== favorite.dataset.folderId) {
        const folderAction = this.actionButton("移出")
        folderAction.dataset.stickerId = sticker.id
        folderAction.addEventListener("click", (event) => this.toggleStickerInActiveFolder(event))
        actions.appendChild(folderAction)
      } else if (this.customFolders().length > 0) {
        const addToFolder = this.actionButton("加入文件夹")
        addToFolder.dataset.stickerId = sticker.id
        addToFolder.addEventListener("click", (event) => this.addStickerToFolder(event))
        actions.appendChild(addToFolder)
      }

      button.appendChild(actions)
      this.stickerGridTarget.appendChild(button)
    })

    if (this.hasStickerEmptyTarget) this.stickerEmptyTarget.classList.toggle("hidden", stickers.length > 0)
  }

  actionButton(label) {
    const button = document.createElement("button")
    button.type = "button"
    button.className = "gif-sticker-action"
    button.textContent = label
    return button
  }

  filteredStickers() {
    if (this.activeStickerFolder === "all") return this.stickers
    const folder = this.currentStickerFolder() || this.favoritesFolder()
    if (!folder) return this.stickers
    const ids = new Set((folder.emoji_ids || []).map(String))
    return this.stickers.filter((sticker) => ids.has(String(sticker.id)))
  }

  currentStickerFolder() {
    return this.stickerFolders.find((folder) => String(folder.id) === String(this.activeStickerFolder))
  }

  favoritesFolder() {
    return this.stickerFolders.find((folder) => folder.kind === "favorites" && folder.built_in)
  }

  customFolders() {
    return this.stickerFolders.filter((folder) => !folder.built_in)
  }

  activeStickerFolderId() {
    return this.activeStickerFolder === "all" ? null : this.activeStickerFolder
  }

  toggleStickerFolder(folderId, stickerId) {
    if (!folderId || !stickerId) return
    fetch(`/gif_emoji_folders/${encodeURIComponent(folderId)}/toggle_emoji`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": this.csrfToken()
      },
      body: JSON.stringify({ gif_emoji_id: stickerId })
    })
      .then((res) => res.json().then((json) => ({ ok: res.ok, json })))
      .then(({ ok, json }) => {
        if (!ok) throw new Error(json?.error || "更新失败")
        this.stickerFolders = json.folders || []
        const sticker = this.stickers.find((item) => String(item.id) === String(stickerId))
        if (sticker) {
          const folder = this.stickerFolders.find((item) => String(item.id) === String(folderId))
          sticker.folder_ids = this.stickerFolders.filter((item) => (item.emoji_ids || []).map(String).includes(String(stickerId))).map((item) => String(item.id))
          if (folder?.kind === "favorites") sticker.favorite = sticker.folder_ids.includes(String(folderId))
        }
        this.renderStickers()
      })
      .catch((error) => this.setStickerStatus(error.message || "更新失败"))
  }

  touchSticker(stickerId) {
    fetch(`/gif_emojis/${encodeURIComponent(stickerId)}/touch`, {
      method: "PATCH",
      headers: { "X-CSRF-Token": this.csrfToken() }
    }).catch(() => {})
  }

  findChatInput() {
    const inputs = document.querySelectorAll('[data-chat-room-target="input"]')
    for (const input of inputs) {
      const rect = input.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) return input
    }
    return this.element.closest('[data-controller*="chat-room"]')?.querySelector('[data-chat-room-target="input"]') || document.querySelector('[data-chat-room-target="input"]')
  }

  setStickerStatus(message) {
    if (this.hasStickerStatusTarget) this.stickerStatusTarget.textContent = message
  }

  csrfToken() {
    return document.querySelector('meta[name="csrf-token"]')?.content || ""
  }
}
