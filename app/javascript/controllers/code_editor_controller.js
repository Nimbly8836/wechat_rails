import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["textarea", "mount"]

  connect() {
    this.syncFromTextarea = this.syncFromTextarea.bind(this)
    this.textareaTarget.addEventListener("input", this.syncFromTextarea)
    this.setupEditor()
  }

  disconnect() {
    this.textareaTarget.removeEventListener("input", this.syncFromTextarea)
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
      const [{ basicSetup, EditorView }, { javascript }, { oneDark }] = await Promise.all([
        import("codemirror"),
        import("@codemirror/lang-javascript"),
        import("@codemirror/theme-one-dark")
      ])

      if (!this.element.isConnected || !this.hasTextareaTarget || !this.hasMountTarget) return

      this.editorView = new EditorView({
        doc: this.textareaTarget.value,
        parent: this.mountTarget,
        extensions: [
          basicSetup,
          javascript(),
          oneDark,
          EditorView.lineWrapping,
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
}
