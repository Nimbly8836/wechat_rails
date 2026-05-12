import { Controller } from "@hotwired/stimulus"

const HOOK_SNIPPETS = [
  {
    label: "module.exports.beforeSend",
    detail: "发送前执行",
    apply: "module.exports.beforeSend = async function(ctx) {\n  return { action: 'allow' }\n}\n"
  },
  {
    label: "module.exports.onMessage",
    detail: "收到消息后执行",
    apply: "module.exports.onMessage = async function(ctx) {\n  return { action: 'ignore' }\n}\n"
  },
  {
    label: "module.exports.afterSend",
    detail: "发送后执行",
    apply: "module.exports.afterSend = async function(ctx) {\n  console.log('sent', ctx.result?.success)\n  return { action: 'ignore' }\n}\n"
  }
]

const ACTION_SNIPPETS = [
  { label: "{ action: 'allow' }", detail: "允许发送", apply: "{ action: 'allow' }" },
  { label: "{ action: 'modify' }", detail: "修改发送内容", apply: "{\n  action: 'modify',\n  message: { content: ctx.message.content }\n}" },
  { label: "{ action: 'block' }", detail: "拦截发送", apply: "{ action: 'block', message: '这条消息被 Bot 拦截' }" },
  { label: "{ action: 'reply' }", detail: "回复收到的消息", apply: "{ action: 'reply', content: '收到' }" },
  { label: "{ action: 'ignore' }", detail: "不做处理", apply: "{ action: 'ignore' }" }
]

const API_COMPLETIONS = [
  { label: "ctx.room", detail: "当前聊天室" },
  { label: "ctx.room.id", detail: "聊天室 ID" },
  { label: "ctx.room.wx_id", detail: "微信聊天室 ID" },
  { label: "ctx.room.name", detail: "聊天室名称" },
  { label: "ctx.message", detail: "当前消息" },
  { label: "ctx.message.content", detail: "消息文本内容" },
  { label: "ctx.message.msg_type", detail: "待发送消息类型" },
  { label: "ctx.message.extra", detail: "消息附加数据" },
  { label: "ctx.message.raw_content", detail: "收到消息的原始内容" },
  { label: "ctx.message.from_user_name", detail: "发送方微信 ID" },
  { label: "ctx.message.to_user_name", detail: "接收方微信 ID" },
  { label: "ctx.message.push_content", detail: "推送内容" },
  { label: "ctx.message.self_send", detail: "是否自己发送" },
  { label: "ctx.message.message_time", detail: "消息时间" },
  { label: "ctx.bot", detail: "当前 Bot 信息" },
  { label: "ctx.bot.id", detail: "Bot ID" },
  { label: "ctx.bot.name", detail: "Bot 名称" },
  { label: "ctx.result", detail: "afterSend 发送结果" },
  { label: "ctx.result.success", detail: "是否发送成功" },
  { label: "ctx.result.message", detail: "发送结果消息" },
  { label: "ctx.result.data", detail: "发送结果数据" },
  { label: "fetch", detail: "Node 原生 HTTP 请求" },
  { label: "fetch(url)", detail: "调用外部 HTTP(S) API", apply: "fetch('https://example.com/api')" },
  { label: "importPackage", detail: "加载 config/bot_node_packages.yml 中允许的 Node 包" },
  { label: "importPackage('openai')", detail: "加载构建期安装的白名单包", apply: "importPackage('openai')" }
]

const FETCH_SNIPPET = "const response = await fetch('https://example.com/api', {\n  method: 'POST',\n  headers: { 'Content-Type': 'application/json' },\n  body: JSON.stringify({ text: ctx.message.content })\n})\nconst data = await response.json()"
const IMPORT_PACKAGE_SNIPPET = "const OpenAI = await importPackage('openai')\nconst client = new OpenAI({ apiKey: 'YOUR_OPENAI_API_KEY' })"

export default class extends Controller {
  static targets = ["textarea", "mount"]

  connect() {
    this.syncFromTextarea = this.syncFromTextarea.bind(this)
    this.boundCloseContextMenu = this.closeContextMenu.bind(this)
    this.boundHandleContextMenuClick = this.handleContextMenuClick.bind(this)
    this.boundHandleContextMenuPointerDown = this.handleContextMenuPointerDown.bind(this)
    this.boundHandleDocumentKeydown = this.handleDocumentKeydown.bind(this)
    this.textareaTarget.addEventListener("input", this.syncFromTextarea)
    this.setupEditor()
  }

  disconnect() {
    this.textareaTarget.removeEventListener("input", this.syncFromTextarea)
    this.closeContextMenu()
    this.contextMenuElement?.remove()
    this.toastElement?.remove()
    if (this.editorView) {
      this.textareaTarget.value = this.editorView.state.doc.toString()
      this.editorView.destroy()
      this.editorView = null
    }
    if (this.hasMountTarget) this.mountTarget.classList.add("hidden")
    if (this.hasTextareaTarget) this.textareaTarget.classList.remove("hidden")
  }

  async setupEditor() {
    try {
      const [
        { basicSetup, EditorView },
        { javascript },
        { oneDark },
        { autocompletion, acceptCompletion, startCompletion },
        { indentMore, indentLess },
        { keymap }
      ] = await Promise.all([
        import("codemirror"),
        import("@codemirror/lang-javascript"),
        import("@codemirror/theme-one-dark"),
        import("@codemirror/autocomplete"),
        import("@codemirror/commands"),
        import("@codemirror/view")
      ])

      if (!this.element.isConnected || !this.hasTextareaTarget || !this.hasMountTarget) return

      this.startCompletion = startCompletion

      this.editorView = new EditorView({
        doc: this.textareaTarget.value,
        parent: this.mountTarget,
        extensions: [
          basicSetup,
          javascript(),
          oneDark,
          EditorView.lineWrapping,
          autocompletion({
            override: [this.botCompletionSource.bind(this)],
            activateOnTyping: true,
            icons: true
          }),
          keymap.of([
            {
              key: "Tab",
              run: (view) => acceptCompletion(view) || indentMore(view)
            },
            {
              key: "Shift-Tab",
              run: indentLess
            },
            {
              key: "Ctrl-Space",
              run: startCompletion
            }
          ]),
          EditorView.domEventHandlers({
            contextmenu: (event, view) => {
              this.openContextMenu(event, view)
              return true
            }
          }),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return
            this.textareaTarget.value = update.state.doc.toString()
            this.textareaTarget.dispatchEvent(new Event("input", { bubbles: true }))
          })
        ]
      })

      this.textareaTarget.classList.add("hidden")
      this.mountTarget.classList.remove("hidden")
    } catch (error) {
      console.warn("Code editor failed to load", error)
      if (this.hasMountTarget) this.mountTarget.classList.add("hidden")
      if (this.hasTextareaTarget) this.textareaTarget.classList.remove("hidden")
    }
  }

  syncFromTextarea() {
    if (!this.editorView) return

    const value = this.textareaTarget.value
    const currentValue = this.editorView.state.doc.toString()
    if (value === currentValue) return

    this.editorView.dispatch({
      changes: { from: 0, to: this.editorView.state.doc.length, insert: value }
    })
  }

  botCompletionSource(context) {
    const token = context.matchBefore(/[A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)*\.?|\{?\s*action:?\s*['\"]?[A-Za-z_]*/)
    if (!context.explicit && !token) return null

    const prefix = token?.text || ""
    if (!context.explicit && prefix.length < 2 && !prefix.endsWith(".")) return null

    return {
      from: token ? token.from : context.pos,
      options: this.completionOptions(),
      validFor: /^[\w$?.{}:'"\s]*$/
    }
  }

  completionOptions() {
    const hooks = HOOK_SNIPPETS.map((item) => ({ ...item, type: "function", boost: 80 }))
    const actions = ACTION_SNIPPETS.map((item) => ({ ...item, type: "constant", boost: 70 }))
    const apis = API_COMPLETIONS.map((item) => ({ ...item, type: "variable", boost: 60, apply: item.apply || item.label }))
    const fetchSnippet = {
      label: "fetch POST JSON",
      detail: "HTTP(S) 请求示例",
      type: "function",
      apply: FETCH_SNIPPET,
      boost: 90
    }
    const importPackageSnippet = {
      label: "importPackage openai",
      detail: "加载白名单 Node 包示例",
      type: "function",
      apply: IMPORT_PACKAGE_SNIPPET,
      boost: 85
    }

    return [...hooks, ...actions, ...apis, fetchSnippet, importPackageSnippet]
  }

  openContextMenu(event, view) {
    event.preventDefault()
    event.stopPropagation()

    const position = view.posAtCoords({ x: event.clientX, y: event.clientY })
    if (position !== null) {
      view.dispatch({ selection: { anchor: position } })
    }

    const menu = this.contextMenu()
    menu.classList.remove("hidden")
    menu.style.left = `${event.clientX}px`
    menu.style.top = `${event.clientY}px`

    document.addEventListener("click", this.boundCloseContextMenu)
    document.addEventListener("keydown", this.boundHandleDocumentKeydown)
    window.addEventListener("resize", this.boundCloseContextMenu)

    requestAnimationFrame(() => this.fitContextMenuInViewport(menu))
  }

  contextMenu() {
    if (this.contextMenuElement) return this.contextMenuElement

    const menu = document.createElement("div")
    menu.className = "tg-code-editor-context-menu tg-room-actions-menu hidden"
    menu.setAttribute("role", "menu")
    menu.addEventListener("click", this.boundHandleContextMenuClick)
    menu.addEventListener("pointerdown", this.boundHandleContextMenuPointerDown)

    this.appendMenuButton(menu, "格式化代码", "format")
    this.appendMenuGroup(menu, "插入片段", [
      ...HOOK_SNIPPETS.map((item) => [item.detail, "insert", item.apply]),
      ...ACTION_SNIPPETS.map((item) => [item.label, "insert", item.apply])
    ])
    this.appendMenuGroup(menu, "插入可用 API", [
      ["ctx.message.content", "insert", "ctx.message.content"],
      ["ctx.message.msg_type", "insert", "ctx.message.msg_type"],
      ["ctx.message.extra", "insert", "ctx.message.extra"],
      ["ctx.result?.success", "insert", "ctx.result?.success"],
      ["fetch POST JSON", "insert", FETCH_SNIPPET],
      ["importPackage openai", "insert", IMPORT_PACKAGE_SNIPPET]
    ])
    this.appendMenuButton(menu, "触发补全", "complete")

    document.body.appendChild(menu)
    this.contextMenuElement = menu
    return menu
  }

  appendMenuButton(parent, label, action, value = "") {
    const button = document.createElement("button")
    button.type = "button"
    button.className = "tg-room-actions-menu-item tg-code-editor-menu-item"
    button.dataset.codeEditorCommand = action
    if (value) button.dataset.codeEditorValue = value
    button.setAttribute("role", "menuitem")
    button.textContent = label
    parent.appendChild(button)
  }

  appendMenuGroup(parent, label, items) {
    const group = document.createElement("div")
    group.className = "tg-code-editor-menu-group"

    const button = document.createElement("button")
    button.type = "button"
    button.className = "tg-room-actions-menu-item tg-code-editor-menu-item tg-code-editor-menu-parent"
    button.setAttribute("role", "menuitem")
    button.setAttribute("aria-haspopup", "true")
    button.textContent = label

    const submenu = document.createElement("div")
    submenu.className = "tg-code-editor-submenu tg-room-actions-menu"
    submenu.setAttribute("role", "menu")

    items.forEach(([itemLabel, action, value]) => this.appendMenuButton(submenu, itemLabel, action, value))

    group.appendChild(button)
    group.appendChild(submenu)
    parent.appendChild(group)
  }

  handleContextMenuPointerDown(event) {
    event.preventDefault()
  }

  handleContextMenuClick(event) {
    const item = event.target.closest("[data-code-editor-command]")
    if (!item) return

    event.preventDefault()
    event.stopPropagation()

    const action = item.dataset.codeEditorCommand
    const value = item.dataset.codeEditorValue || ""
    this.closeContextMenu()

    if (action === "insert") {
      this.insertText(value)
    } else if (action === "format") {
      this.formatCode()
    } else if (action === "complete") {
      this.editorView?.focus()
      this.startCompletion?.(this.editorView)
    }
  }

  handleDocumentKeydown(event) {
    if (event.key === "Escape") this.closeContextMenu()
  }

  closeContextMenu(event = null) {
    if (event && this.contextMenuElement?.contains(event.target)) return

    this.contextMenuElement?.classList.add("hidden")
    document.removeEventListener("click", this.boundCloseContextMenu)
    document.removeEventListener("keydown", this.boundHandleDocumentKeydown)
    window.removeEventListener("resize", this.boundCloseContextMenu)
  }

  fitContextMenuInViewport(menu) {
    const rect = menu.getBoundingClientRect()
    const margin = 8
    const left = Math.min(rect.left, window.innerWidth - rect.width - margin)
    const top = Math.min(rect.top, window.innerHeight - rect.height - margin)
    menu.style.left = `${Math.max(margin, left)}px`
    menu.style.top = `${Math.max(margin, top)}px`
  }

  insertText(text) {
    if (!this.editorView || !text) return

    const { from, to } = this.editorView.state.selection.main
    this.editorView.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: from + text.length },
      scrollIntoView: true
    })
    this.editorView.focus()
  }

  async formatCode() {
    if (!this.editorView) return

    try {
      const [prettier, babelPlugin, estreePlugin] = await Promise.all([
        import("prettier/standalone"),
        import("prettier/plugins/babel"),
        import("prettier/plugins/estree")
      ])
      const currentValue = this.editorView.state.doc.toString()
      const prettierApi = prettier.default || prettier
      const formatted = await prettierApi.format(currentValue, {
        parser: "babel",
        plugins: [babelPlugin.default || babelPlugin, estreePlugin.default || estreePlugin],
        semi: false,
        singleQuote: true
      })

      if (formatted === currentValue) return

      this.editorView.dispatch({
        changes: { from: 0, to: this.editorView.state.doc.length, insert: formatted },
        selection: { anchor: Math.min(formatted.length, this.editorView.state.selection.main.head) },
        scrollIntoView: true
      })
      this.editorView.focus()
      this.showToast("代码已格式化")
    } catch (error) {
      console.warn("Code formatting failed", error)
      this.showToast("格式化失败，请检查 JavaScript 语法")
    }
  }

  showToast(message) {
    if (!this.hasMountTarget) return

    if (!this.toastElement) {
      this.toastElement = document.createElement("div")
      this.toastElement.className = "tg-code-editor-toast"
      this.mountTarget.appendChild(this.toastElement)
    }

    this.toastElement.textContent = message
    this.toastElement.classList.add("is-visible")
    clearTimeout(this.toastTimer)
    this.toastTimer = setTimeout(() => {
      this.toastElement?.classList.remove("is-visible")
    }, 1800)
  }
}
