import { Controller } from "@hotwired/stimulus"

// Connects to data-controller="chat"
export default class extends Controller {
  static targets = ["chatBox", "contact", "letter", "contactsList", "group"]

  chatCache = {}
  currentRoomId = null

  connect() {
    this.sidebar = document.getElementById("sidebar")
    this.resizer = document.getElementById("resizer")
    this.startX = 0
    this.startWidth = 0
    this.minWidth = 250
    this.maxWidth = 500
    this.eventListenerAdded = false

    // 默认显示消息 tab
    const messageTab = this.sidebar.querySelector('[data-tab="messages"]')
    if (messageTab) messageTab.click()
  }

  // ====== 联系人点击 ======
  selectContact(event) {
    const contact = event.currentTarget
    const contactId = contact.dataset.contactId

    this.contactTargets.forEach(c => c.classList.remove("active"))
    contact.classList.add("active")

    // 点击联系人直接打开聊天室
    this.openChatRoom(contactId)
  }

  // ====== 打开聊天室 ======
  openChatRoom(chatRoomId) {
    // 隐藏欢迎页
    const welcome = document.getElementById("chat-box").querySelector(".flex-col.items-center")
    if (welcome) welcome.style.display = "none"

    // 隐藏之前聊天室
    if (this.currentRoomId && this.chatCache[this.currentRoomId]) {
      this.chatCache[this.currentRoomId].classList.add("hidden")
    }

    // 如果已缓存，直接显示
    if (this.chatCache[chatRoomId]) {
      this.chatCache[chatRoomId].classList.remove("hidden")
    } else {
      // 创建容器
      const container = document.createElement("div")
      container.id = `chat-room-${chatRoomId}`
      container.className = "absolute inset-0 h-full w-full bg-[#f7f8fa]"
      container.innerHTML = '<div class="text-gray-400 text-center py-8">加载中...</div>'
      this.chatBoxTarget.appendChild(container)
      this.chatCache[chatRoomId] = container

      fetch(`/chat_room/${chatRoomId}`)
          .then(resp => resp.text())
          .then(html => {
            container.innerHTML = html
          })
          .catch(() => {
            container.innerHTML = '<div class="text-red-500 text-center py-8">加载失败</div>'
          })
    }

    this.currentRoomId = chatRoomId
  }

  // ====== Tab 切换 ======
  switchTab(event) {
    const clicked = event.currentTarget
    clicked.parentNode.querySelectorAll("[data-active]").forEach(tab => {
      tab.dataset.active = "false"
    })
    clicked.dataset.active = "true"

    const messageList = document.getElementById("message-list")
    const contactsList = document.getElementById("contacts-list")
    const letterNav = document.getElementById("letter-nav")

    if (clicked.dataset.tab === "messages") {
      messageList.classList.remove("hidden")
      contactsList.classList.add("hidden")
      letterNav.hidden = true

      // 拉取消息列表（可选，根据你的接口）
      fetch("/chat_room/list")
          .then(resp => resp.json())
          .then(chatRooms => {
            const chatRoomList = document.getElementById("chat-room-list")
            if (!chatRooms || chatRooms.length === 0) {
              chatRoomList.innerHTML = '<div class="text-gray-400 text-center py-8">暂无会话</div>'
            } else {
              chatRoomList.innerHTML = chatRooms.map(room =>
                  `<div class="flex items-center px-4 py-2 cursor-pointer border-b border-gray-100 hover:bg-gray-100"
                    data-chat-room-id="${room.id}">
                <div class="flex items-center justify-center w-12 h-12 mr-3 rounded-full bg-gray-300 text-gray-600 text-lg font-medium overflow-hidden flex-shrink-0">
                  ${room.avatar_base64 ? `<img src="data:image/png;base64,${room.avatar_base64}" class="w-full h-full object-cover"/>` : `<span>?</span>`}
                </div>
                <div class="flex-1 overflow-hidden">
                  <div class="font-medium truncate">${room.name || '未命名会话'}</div>
                </div>
              </div>`).join('')
            }

            // 给聊天室列表添加点击事件
            chatRooms.forEach(room => {
              const el = document.querySelector(`[data-chat-room-id="${room.id}"]`)
              if (el) {
                el.addEventListener("click", () => this.openChatRoom(room.id))
              }
            })
          })
    } else {
      messageList.classList.add("hidden")
      contactsList.classList.remove("hidden")
      letterNav.hidden = false
    }
  }

  // ====== 字母导航 ======
  scrollToGroup(event) {
    const initial = event.currentTarget.dataset.letter
    const group = this.groupTargets.find(g => g.id === `group-${initial}`)
    if (group) group.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  highlightLetter() {
    let currentInitial = "#"
    const containerTop = this.contactsListTarget.getBoundingClientRect().top
    this.groupTargets.forEach(group => {
      const rect = group.getBoundingClientRect()
      if (rect.top - containerTop <= 10) {
        currentInitial = group.id.replace("group-", "")
      }
    })

    this.letterTargets.forEach(letter => {
      letter.classList.toggle("active", letter.dataset.letter === currentInitial)
    })
  }

  // ====== 拖拽 Sidebar 宽度 ======
  startResize(event) {
    this.startX = event.clientX
    this.startWidth = this.sidebar.offsetWidth
    document.addEventListener("mousemove", this.resize)
    document.addEventListener("mouseup", this.stopResize)
  }

  resize = (event) => {
    let newWidth = this.startWidth + (event.clientX - this.startX)
    if (newWidth < this.minWidth) newWidth = this.minWidth
    if (newWidth > this.maxWidth) newWidth = this.maxWidth
    this.sidebar.style.width = `${newWidth}px`
  }

  stopResize = () => {
    document.removeEventListener("mousemove", this.resize)
    document.removeEventListener("mouseup", this.stopResize)
  }
}
