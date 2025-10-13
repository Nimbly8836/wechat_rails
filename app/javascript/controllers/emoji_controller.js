// app/javascript/controllers/emoji_controller.js
import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
    static targets = ["panel", "input"]

    connect() {
        console.log("emoji controller connected")
        this.hideTimer = null

        if (!this.hasPanelTarget) {
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

    // 鼠标移入按钮时打开面板
    mouseenter(event) {
        event.preventDefault()

        // 取消任何待执行的隐藏操作
        if (this.hideTimer) {
            clearTimeout(this.hideTimer)
            this.hideTimer = null
        }

        let panel = this.element.querySelector(".emoji-panel")
        if (!panel) {
            const template = document.querySelector("#emoji-select")
            if (!template) return console.error("emoji template missing")
            this.element.appendChild(template.content.cloneNode(true))
            panel = this.element.querySelector(".emoji-panel")
        }

        panel.classList.remove("hidden")
    }

    // 鼠标离开按钮或面板时延迟关闭
    mouseleave(event) {
        event.preventDefault()

        // 延迟关闭，给用户时间移动鼠标到面板
        this.hideTimer = setTimeout(() => {
            const panel = this.element.querySelector(".emoji-panel")
            if (panel) {
                panel.classList.add("hidden")
            }
        }, 300) // 300ms延迟
    }

    // 鼠标进入面板时取消关闭
    panelMouseenter(event) {
        event.preventDefault()

        if (this.hideTimer) {
            clearTimeout(this.hideTimer)
            this.hideTimer = null
        }
    }

    // 鼠标离开面板时关闭
    panelMouseleave(event) {
        event.preventDefault()

        this.hideTimer = setTimeout(() => {
            const panel = this.element.querySelector(".emoji-panel")
            if (panel) {
                panel.classList.add("hidden")
            }
        }, 300) // 300ms延迟
    }

    insert(event) {
        const emoji = event.currentTarget.dataset.emojiName
        const input = document.querySelector('[data-chat-room-target="input"]')
        if (input) {
            // 在光标位置插入emoji
            const cursorPos = input.selectionStart
            const textBefore = input.value.substring(0, cursorPos)
            const textAfter = input.value.substring(input.selectionEnd)

            input.value = textBefore + `[${emoji}]` + textAfter

            // 设置光标位置到插入内容之后
            const newCursorPos = cursorPos + emoji.length + 2
            input.setSelectionRange(newCursorPos, newCursorPos)

            // 触发input事件
            input.dispatchEvent(new Event('input', { bubbles: true }))
            input.focus()
        }

        // 插入后关闭面板
        const panel = this.element.querySelector(".emoji-panel")
        if (panel) {
            panel.classList.add("hidden")
        }
    }
}