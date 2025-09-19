import {Controller} from "@hotwired/stimulus"
// Connects to data-controller="chat"
export default class extends Controller {
  static targets = ["chatBox", "contact", "letter", "contactsList", "group"]

  connect() {
    this.sidebar = document.getElementById("sidebar")
    this.resizer = document.getElementById("resizer")
    this.startX = 0
    this.startWidth = 0
    this.minWidth = 250
    this.maxWidth = 500
    this.eventListenerAdded = false
  }

  // 点击联系人
  selectContact(event) {
    const contact = event.currentTarget
    const contactId = contact.dataset.contactId

    // 左侧样式切换
    this.contactTargets.forEach(c => c.classList.remove("active"))
    contact.classList.add("active")

    // 拉取聊天内容
    fetch(`/contact/${contactId}`)
        .then(resp => resp.text())
        .then(html => {
          this.chatBoxTarget.innerHTML = html
        })
  }

  // 点击字母导航
  scrollToGroup(event) {
    const initial = event.currentTarget.dataset.letter
    const group = this.groupTargets.find(g => g.id === `group-${initial}`)
    if (group) {
      group.scrollIntoView({behavior: "smooth", block: "start"})
    }
  }

  // 滚动监听，自动高亮字母
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
      letter.classList.toggle("active",
          letter.dataset.letter === currentInitial)
    })
  }

  // ========== 拖拽 Sidebar 宽度 ==========
  startResize(event) {
    this.startX = event.clientX
    this.startWidth = this.sidebar.offsetWidth
    document.addEventListener("mousemove", this.resize)
    document.addEventListener("mouseup", this.stopResize)
  }

  resize = (event) => {
    let newWidth = this.startWidth + (event.clientX - this.startX)
    if (newWidth < this.minWidth) {
      newWidth = this.minWidth
    }
    if (newWidth > this.maxWidth) {
      newWidth = this.maxWidth
    }
    this.sidebar.style.width = `${newWidth}px`
  }

  stopResize = () => {
    document.removeEventListener("mousemove", this.resize)
    document.removeEventListener("mouseup", this.stopResize)
  }

  // ========== Tab 切换 ==========
  switchTab(event) {
    const clicked = event.currentTarget
    clicked.parentNode.querySelectorAll("[data-active]").forEach(tab => {
      tab.dataset.active = "false"
    })
    clicked.dataset.active = "true"

    // tab 切换显示/隐藏容器
    const messageList = document.getElementById("message-list")
    const contactsList = document.getElementById("contacts-list")
    if (clicked.dataset.tab === "messages") {
      messageList.classList.remove("hidden")
      contactsList.classList.add("hidden")
      // 拉取消息
      fetch(`/chat_room/list`)
          .then(resp => resp.json())
          .then(chatRooms => {
            const chatRoomList = document.getElementById("chat-room-list")
            if (chatRooms.length === 0) {
              chatRoomList.innerHTML = '<div class="text-gray-400 text-center py-8">暂无会话</div>'
            } else {
              chatRoomList.innerHTML = chatRooms.map(room =>
                `<div class="flex items-center px-4 py-2 cursor-pointer border-b border-gray-100 hover:bg-gray-100"
                     data-chat-room-id="${room.id}"
                     onclick="window.dispatchEvent(new CustomEvent('open-chat-room',{detail:{id:${room.id}}}))">
                  <div class="flex items-center justify-center w-12 h-12 mr-3 rounded-full bg-gray-300 text-gray-600 text-lg font-medium overflow-hidden flex-shrink-0">
                    ${room.avatar_base64 ? `<img src='data:image/png;base64,${room.avatar_base64}' class='w-full h-full object-cover' alt='avatar'/>` : `<span>?</span>`}
                  </div>
                  <div class="flex-1 overflow-hidden">
                    <div class="font-medium truncate">${room.name || '未命名会话'}</div>
                    <div class="text-xs text-gray-500">ID: ${room.id} | 联系人ID: ${room.contact_id}</div>
                  </div>
                </div>`
              ).join('')
            }
          })

            // 添加事件监听器，在右侧显示聊天界面
            if (!this.eventListenerAdded) {
              window.addEventListener('open-chat-room', (e) => {
                const chatRoomId = e.detail.id
                fetch(`/chat_room/${chatRoomId}`)
                  .then(resp => resp.text())
                  .then(html => {
                    const chatBox = document.getElementById('chat-box')
                    chatBox.innerHTML = html
                  })
              })
              this.eventListenerAdded = true
            }
    } else {
      messageList.classList.add("hidden")
      contactsList.classList.remove("hidden")
    }
  }


}
