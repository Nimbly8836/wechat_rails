import {Controller} from "@hotwired/stimulus"

// Connects to data-controller="chat"
export default class extends Controller {
    static targets = ["chatBox", "contact", "letter", "contactsList", "group", "toggleButton"]

    chatCache = {}
    chatRoomNames = {}
    currentRoomId = null

    connect() {
        this.eventSource = null;
        this.reconnectTimer = null;
        this.eventSourceUrl = "/notion/message";
        this.eventSourceRetryDelay = 1500;

        this.sidebar = document.getElementById("sidebar");
        this.resizer = document.getElementById("resizer");
        this.dragHandle = document.getElementById("drag-handle");
        this.startX = 0
        this.startWidth = 0
        this.minWidth = 50
        this.maxWidth = 500
        this.eventListenerAdded = false

        // 默认显示消息 tab
        const messageTab = this.sidebar.querySelector('[data-tab="messages"]');
        if (messageTab) {
            messageTab.click();
        }

        // 手机模式默认收起侧边栏
        if (window.innerWidth < 640) {
            this.isSidebarOpen = false;
            this.sidebar.classList.add("hidden");
            this.updateToggleButton();
        }

        this.establishEventSource();
        this.element.addEventListener("chat:open", this.handleOpenChat.bind(this));
        this.contactsListTarget.addEventListener("scroll", this.highlightLetter.bind(this));
        this.resizer.addEventListener("mousedown", this.startResize.bind(this));
        this.resizer.addEventListener("touchstart", this.startResize.bind(this), {passive: false});
        if (this.dragHandle) {
            this.dragHandle.addEventListener("mousedown", this.startResize.bind(this));
            this.dragHandle.addEventListener("touchstart", this.startResize.bind(this), {passive: false});
        }
    }

    disconnect() {
        this.teardownEventSource();
        this.element.removeEventListener("chat:open", this.handleOpenChat);
        this.contactsListTarget.removeEventListener("scroll", this.highlightLetter);
        this.resizer.removeEventListener("mousedown", this.startResize);
        this.resizer.removeEventListener("touchstart", this.startResize);
        if (this.dragHandle) {
            this.dragHandle.removeEventListener("mousedown", this.startResize);
            this.dragHandle.removeEventListener("touchstart", this.startResize);
        }
        document.removeEventListener("mousemove", this.resize);
        document.removeEventListener("touchmove", this.resize);
        document.removeEventListener("mouseup", this.stopResize);
        document.removeEventListener("touchend", this.stopResize);
    }

    handleOpenChat(event) {
        const chatRoomId = event.detail.chatRoomId;
        if (chatRoomId) {
            this.openChatRoom(chatRoomId);
        }
    }

    establishEventSource() {
        this.teardownEventSource();

        const source = new EventSource(this.eventSourceUrl);
        this.eventSource = source;

        source.onmessage = (event) => this.handleEventSourceMessage(event);
        source.addEventListener("ping", () => {
            // keep-alive event, no-op
        });
        source.onerror = () => {
            this.scheduleReconnect();
        };
    }

    handleEventSourceMessage(event) {
        try {
            const payload = JSON.parse(event.data);
            window.dispatchEvent(new CustomEvent("chat:notify", {detail: payload}));

            if (Notification.permission === "granted") {
                const roomName = this.chatRoomNames[payload.chat_room_id]
                    || `聊天室 ${payload.chat_room_id}`;
                new Notification("聊天室新消息", {
                    body: `${roomName}：${payload.content_preview}`
                });
            }
        } catch (error) {
            console.error("解析消息失败", error);
        }
    }

    scheduleReconnect() {
        this.teardownEventSource();
        if (this.reconnectTimer) {
            return;
        }
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.establishEventSource();
        }, this.eventSourceRetryDelay);
    }

    teardownEventSource() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.eventSource) {
            try {
                this.eventSource.close();
            } catch (_) {
                // ignore close errors
            }
            this.eventSource = null;
        }
    }

    // ====== 联系人点击 ======
    selectContact(event) {
        const contact = event.currentTarget
        const contactId = contact.dataset.contactId

        this.contactTargets.forEach(c => c.classList.remove("active"))
        contact.classList.add("active")

        // 点击联系人直接打开聊天室
        // this.openChatRoom(contactId)
        // 拉取聊天内容
        fetch(`/contact/${contactId}`)
            .then(resp => resp.text())
            .then(html => {
                this.chatBoxTarget.innerHTML = html
            })
    }

    // ====== 打开聊天室 ======
    openChatRoom(chatRoomId) {
        // 隐藏欢迎页
        const welcome = document.getElementById("chat-box").querySelector(
            ".flex-col.items-center")
        if (welcome) {
            welcome.style.display = "none"
        }

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
                  ${room.avatar_base64
                                ? `<img src="data:image/png;base64,${room.avatar_base64}" class="w-full h-full object-cover" alt="走丢了"/>`
                                : `<span>?</span>`}
                </div>
                <div class="flex-1 overflow-hidden">
                  <div class="font-medium truncate">${room.name || '未命名会话'}</div>
                  <span class="text-xs truncate text-inherit">${room.latest_wx_message?.preview_content || ""}</>
                </div>
              </div>`).join('')
                    }

                    // 缓存 id -> name
                    chatRooms.forEach(room => {
                        this.chatRoomNames[room.id] = room.name || '未命名会话'
                        const el = document.querySelector(
                            `[data-chat-room-id="${room.id}"]`)
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
        if (group) {
            group.scrollIntoView({behavior: "smooth", block: "start"})
        }
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
            letter.classList.toggle("active",
                letter.dataset.letter === currentInitial)
        })
    }

    // ====== 拖拽 Sidebar 宽度 ======
    startResize(event) {
        event.preventDefault();
        this.startX = event.clientX || (event.touches && event.touches[0].clientX);
        this.startWidth = this.sidebar.offsetWidth || this.minWidth;
        document.addEventListener("mousemove", this.resize, {passive: false});
        document.addEventListener("touchmove", this.resize, {passive: false});
        document.addEventListener("mouseup", this.stopResize);
        document.addEventListener("touchend", this.stopResize);
    }

    search(event) {
        const search_txt = event.target.value
        console.log("search_txt", search_txt)
    }

    resize = (event) => {
        const clientX = event.clientX || (event.touches && event.touches[0].clientX);
        let newWidth = this.startWidth + (clientX - this.startX);
        this.sidebar.classList.remove("hidden");
        this.isSidebarOpen = true;
        this.updateToggleButton();

        if (newWidth < this.minWidth) {
            newWidth = this.minWidth;

            this.sidebar.classList.add("hidden");
            this.isSidebarOpen = false;
            this.updateToggleButton();

        }
        if (newWidth > this.maxWidth) {
            newWidth = this.maxWidth;
        }
        this.sidebar.style.width = `${newWidth}px`;
    };

    stopResize = () => {
        document.removeEventListener("mousemove", this.resize);
        document.removeEventListener("touchmove", this.resize);
        document.removeEventListener("mouseup", this.stopResize);
        document.removeEventListener("touchend", this.stopResize);
    };

    toggleSidebar() {
        this.isSidebarOpen = !this.isSidebarOpen;
        this.sidebar.classList.toggle("hidden", !this.isSidebarOpen);
        this.updateToggleButton();
    }

    updateToggleButton() {
        if (this.toggleButtonTarget) {
            this.toggleButtonTarget.innerHTML = this.isSidebarOpen
                ? `<svg class="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>`
                : `<svg class="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>`;
        }
    }
}
