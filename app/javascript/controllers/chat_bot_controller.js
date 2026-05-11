import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["nameInput", "enabledInput", "timeoutInput", "codeInput", "status", "title", "deleteButton"]
  static values = { id: String }

  openSidebar() {
    this.element.dispatchEvent(new CustomEvent("chat:sidebar:open", { bubbles: true }))
  }

  newBot(event = null) {
    event?.preventDefault()
    this.idValue = ""
    if (this.hasNameInputTarget) this.nameInputTarget.value = ""
    if (this.hasEnabledInputTarget) this.enabledInputTarget.checked = true
    if (this.hasTimeoutInputTarget) this.timeoutInputTarget.value = "1000"
    if (this.hasCodeInputTarget) {
      this.codeInputTarget.value = `module.exports.onMessage = async function(ctx) {
  if (ctx.message.content === '/ping') {
    return { action: 'reply', content: '/pong' }
  }
  return { action: 'ignore' }
}`
    }
    if (this.hasTitleTarget) this.titleTarget.textContent = "新建 Bot"
    if (this.hasDeleteButtonTarget) this.deleteButtonTarget.classList.add("hidden")
    this.setStatus("填写信息后保存即可创建全局 Bot。")
  }

  save(event = null) {
    event?.preventDefault()
    const isUpdate = !!this.idValue
    const url = isUpdate ? `/chat_bots/${encodeURIComponent(this.idValue)}` : "/chat_bots"
    const method = isUpdate ? "PATCH" : "POST"

    this.setStatus("保存中…")
    fetch(url, {
      method,
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-CSRF-Token": this.csrfToken()
      },
      body: JSON.stringify({ bot: this.botPayload() })
    })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error((data.errors || [data.error || "保存失败"]).join("，"))
        this.applyBot(data)
        this.setStatus("已保存。")
        this.dispatchBotChanged(data)
      })
      .catch((error) => this.setStatus(`保存失败：${error.message}`))
  }

  deleteBot(event = null) {
    event?.preventDefault()
    if (!this.idValue) return
    if (!window.confirm("确定删除这个 Bot 吗？已加入房间的关联也会被移除。")) return

    this.setStatus("删除中…")
    fetch(`/chat_bots/${encodeURIComponent(this.idValue)}`, {
      method: "DELETE",
      headers: {
        "Accept": "application/json",
        "X-CSRF-Token": this.csrfToken()
      }
    })
      .then((res) => {
        if (!res.ok) throw new Error(`删除失败: ${res.status}`)
        const deletedId = this.idValue
        this.newBot()
        this.setStatus("Bot 已删除。")
        this.element.dispatchEvent(new CustomEvent("chat:bot-deleted", {
          bubbles: true,
          detail: { id: deletedId }
        }))
      })
      .catch((error) => this.setStatus(`删除失败：${error.message}`))
  }

  botPayload() {
    return {
      name: this.hasNameInputTarget ? this.nameInputTarget.value : "",
      enabled: this.hasEnabledInputTarget ? this.enabledInputTarget.checked : true,
      timeout_ms: this.hasTimeoutInputTarget ? this.timeoutInputTarget.value : 1000,
      code: this.hasCodeInputTarget ? this.codeInputTarget.value : ""
    }
  }

  applyBot(bot) {
    this.idValue = String(bot.id || "")
    if (this.hasNameInputTarget) this.nameInputTarget.value = bot.name || ""
    if (this.hasEnabledInputTarget) this.enabledInputTarget.checked = !!bot.enabled
    if (this.hasTimeoutInputTarget) this.timeoutInputTarget.value = bot.timeout_ms || 1000
    if (this.hasCodeInputTarget) this.codeInputTarget.value = bot.code || ""
    if (this.hasTitleTarget) this.titleTarget.textContent = bot.name || "未命名 Bot"
    if (this.hasDeleteButtonTarget) this.deleteButtonTarget.classList.toggle("hidden", !bot.id)
  }

  dispatchBotChanged(bot) {
    this.element.dispatchEvent(new CustomEvent("chat:bot-changed", {
      bubbles: true,
      detail: { bot }
    }))
  }

  setStatus(message) {
    if (this.hasStatusTarget) this.statusTarget.textContent = message
  }

  csrfToken() {
    return document.querySelector('meta[name="csrf-token"]')?.content || ""
  }
}
