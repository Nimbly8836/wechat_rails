import {Controller} from "@hotwired/stimulus";
// import consumer from "../channels/consumer"

export default class extends Controller {
  static targets = ["messageList", "input", "emptyMessage", "menu", "showMore"]
  static values = {currentWxid: String, id: Number, members: Array};

  connect() {
    this.debouncedLoadNewMessages = this.debounce(
        this.loadNewMessages.bind(this), 400);

    window.addEventListener("chat:notify", (e) => {
      const payload = e.detail;
      if (payload.chat_room_id === this.idValue) {
        this.debouncedLoadNewMessages(payload);
      }
    });

    // room 需要加载 members
    if (this.isRoom()) {
      fetch(`chat_room/${this.idValue}/chat_members`).then(
          res => res.json()).then(data => {
        this.chatMembers = data
        this.renderMessages()
      }).catch(error => console.error("加载room members 失败", error))
    }
    this.messages = [];
    this.loadMessages();
    // 回车发送、Shift+Enter换行
    this.inputTarget.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();   // 阻止默认换行
        this.sendMessage();   // 调用发送
      }
      // Shift+Enter 默认就是换行，不拦截
    }), this.currentWxidValue;

    // 监听滚动
    this.messageListTarget.addEventListener("scroll",
        this.handleScroll.bind(this));

    // 自动高度调整
    this.inputTarget.addEventListener("input", this.autoResize.bind(this));

    // 初始化时也调整一次
    this.autoResize();
  }

  // 防抖函数
  debounce(fn, delay) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  disconnect() {
  }

  isRoom() {
    return this.currentWxidValue.endsWith("@chatroom")
  }

  handleScroll() {
    if (!this.hasShowMoreTarget) {
      return;
    }

    // 到顶部并且滚动高度大于等于100才显示
    if (this.messageListTarget.scrollTop <= 0 &&
        this.messageListTarget.scrollHeight >= 100) {
      this.showMoreTarget.style.display = "block";
    } else {
      this.showMoreTarget.style.display = "none";
    }
  }

  autoResize() {
    const el = this.inputTarget;
    el.style.height = "auto";  // 重置高度
    el.style.height = el.scrollHeight + "px";  // 设置为内容高度
  }

  // 获取消息列表
  loadMessages() {
    console.log("loadMessages")
    fetch(`/chat_room/${this.idValue}/messages`)
        .then(res => res.json())
        .then(data => {
          this.messages = data;
          this.renderMessages();
        })
        .catch(error => {
          console.error("加载消息失败:", error)
        });
  }

  getMessageType(msg) {
    if (msg.msg_type === "voice") {
      return "voice";
    }
    if ((msg.content?.trim().startsWith("<") || msg.content?.trim().match(
        /(\w+:|.*)\n</)?.length > 0) && msg.content?.length > 250) {
      // 这里线解析一下， 已知 type 5 一般是 card，57 是引用消息
      if (!this.isRoom()) {
        const parse = this.parseWxXmlMessage(msg.content)
        if (parse.msgType === "5") {
          return "card"
        }
        if (parse.msgType === "57") {
          return "refer"
        }
      }
      return "xml_unparsed";
    }
    // 公众号判断，并没用
    if (this.currentWxidValue?.startsWith("gh_")
        && msg.msg_type === "refer" && msg.content?.trim().startsWith("<msg")) {
      return "card";
    }
    if (msg.msg_type === "refer") {
      return "refer";
    }
    if (msg.msg_type === "emoji") {
      return "emoji";
    }
    return "text";
  }

  renderMessages() {
    if (!this.hasMessageListTarget) {
      return;
    }
    const container = this.messageListTarget;
    container.innerHTML = "";

    if (this.messages.length === 0) {
      if (this.hasEmptyMessageTarget) {
        this.emptyMessageTarget.style.display = "block";
      }
      return;
    }
    if (this.hasEmptyMessageTarget) {
      this.emptyMessageTarget.style.display = "none";
    }

    let lastSender = null;

    this.messages.forEach((m) => {
      const msg = m.wx_message;
      msg.id = m.id;
      const sender = msg.from_user_name || "";
      const isNewGroup = lastSender !== null && lastSender !== sender;
      lastSender = sender;

      const row = this.buildRow(isNewGroup, msg);
      const bubble = this.renderMessageBubble(msg);
      row.appendChild(bubble);
      container.appendChild(row);

      // 渲染发送状态
      this.renderStatus(m, bubble, msg);
      // 时间
      this.addTimestamp(bubble, m)
    });

    container.scrollTop = container.scrollHeight;
  }

  replaceRoomSenderWxid(msg) {
    if (this.chatMembers && msg.content) {
      const title_send_wxid = msg.content.match(/\w+:\n/)?.[0]
      if (title_send_wxid) {
        const wxid = title_send_wxid.slice(0, -2);
        const member_info = this.chatMembers.find(it => it.user_name === wxid)
        if (member_info) {
          msg.content = msg.content.replace(wxid + ":",
              member_info.remark || member_info.nick_name)
        }
      }
    }
  }

  buildRow(isNewGroup, msg) {
    const row = document.createElement("div");
    row.className = `w-full flex ${msg.self_send ? "justify-end"
        : "justify-start"} ${isNewGroup ? "mt-3" : "mt-1"} items-end`;

    // 如果不是我自己，并且是群聊，显示头像
    if (!msg.self_send && this.isRoom()) {
      const senderWxid = msg.content.match(/\w+:\n/)?.[0]?.slice(0, -2);
      const member = this.chatMembers?.find(m => m.user_name === senderWxid);
      const avatarUrl = member?.small_head_img_url
          || "https://img.icons8.com/ios/100/user-male-circle--v1.png";

      const avatar = document.createElement("img");
      avatar.src = avatarUrl;
      avatar.className = "w-12 h-12 rounded-full mr-2"; // tailwind，可自定义
      avatar.alt = member?.nick_name || senderWxid;

      row.appendChild(avatar);
    }

    return row;
  }

  renderMessageBubble(msg) {
    const bubble = document.createElement("div");
    bubble.className = `relative inline-block max-w-[75%] rounded-2xl shadow-sm ${msg.self_send
        ? "bg-blue-500 text-white rounded-bl-2xl rounded-tr-2xl rounded-br-md"
        : "bg-white text-gray-900 border border-gray-200 rounded-br-2xl rounded-tl-2xl rounded-bl-md"
    }`;
    const type = this.getMessageType(msg);

    this.replaceRoomSenderWxid(msg)

    switch (type) {
      case "voice":
        return this.renderVoiceMessage(bubble, msg);
      case "card":
        return this.renderCardMessage(bubble, msg);
      case "xml_unparsed":
        return this.renderXmlMessage(bubble, msg);
      case "emoji":
        return this.renderEmojiMessage(bubble);
      case "text":
      default:
        return this.renderTextMessage(bubble, msg);
    }
  }

  /** ========== 各种消息渲染 ========== */
  renderCardMessage(bubble, msg) {
    bubble.className = `
      relative inline-block rounded-2xl shadow-lg
      w-1/2 bg-white text-gray-900 border border-gray-200
      rounded-br-2xl rounded-tl-2xl rounded-bl-md
    `;
    bubble.style.width = "50%";
    bubble.style.minWidth = "165px";

    const parsed = this.parseWxXmlMessage(msg.content);
    const inner = document.createElement("a");
    inner.href = parsed.url || "#";
    inner.target = "_blank";
    inner.className = "block rounded-2xl overflow-hidden hover:bg-gray-50 transition";
    inner.innerHTML = `
      ${parsed.cover
        ? `<img src="${parsed.cover}" class="max-h-48 w-full object-cover" referrerpolicy="no-referrer"/>`
        : ""}
      <div style="padding:5px; margin-left:2px">
        <h3 class="font-semibold text-sm text-gray-900 line-clamp-2">${parsed.title}</h3>
        <p class="text-xs text-gray-500 mt-1 line-clamp-2">${parsed.desc}</p>
        ${parsed.source
        ? `<div class="text-[10px] text-gray-400 mt-1">来自：${parsed.source}</div>`
        : ""}
      </div>
    `;
    bubble.appendChild(inner);

    // this.addTimestamp(bubble, msg);
    return bubble;
  }

  renderXmlMessage(bubble, msg) {
    bubble.className = "p-3 relative inline-block max-w-[75%] rounded-2xl shadow-sm bg-white text-gray-900 border border-gray-200";
    const wrapper = document.createElement("div");
    wrapper.className = "px-3 py-2 pr-14 pb-4 whitespace-pre-wrap break-words overflow-hidden";
    wrapper.style.maxHeight = "6rem";
    wrapper.textContent = msg.content || "";

    const toggle = document.createElement("button");
    toggle.className = "mt-1 text-xs hover:underline ml-3";
    toggle.textContent = "展开";
    toggle.addEventListener("click", () => {
      if (wrapper.style.maxHeight === "6rem") {
        wrapper.style.maxHeight = wrapper.scrollHeight + "px";
        toggle.textContent = "收起";
      } else {
        wrapper.style.maxHeight = "6rem";
        toggle.textContent = "展开";
      }
    });

    bubble.appendChild(wrapper);
    bubble.appendChild(toggle);
    // this.addTimestamp(bubble, msg);
    return bubble;
  }

  renderEmojiMessage(bubble) {
    bubble.className = "px-3 py-2 pr-14 pb-4 whitespace-pre-wrap break-words bg-white border border-gray-200 rounded-2xl";
    bubble.textContent = "Emoji 替代符，TODO";
    return bubble;
  }

  renderTextMessage(bubble, msg) {
    bubble.className = `relative inline-block max-w-[75%] rounded-2xl shadow-sm ${msg.self_send
        ? "bg-blue-500 text-white rounded-bl-2xl rounded-tr-2xl rounded-br-md"
        : "bg-white text-gray-900 border border-gray-200 rounded-br-2xl rounded-tl-2xl rounded-bl-md"
    }`;
    const inner = document.createElement("div");
    inner.className = "px-3 py-2 pr-14 pb-4 whitespace-pre-wrap break-words";
    inner.textContent = msg.refer_title || msg.content || "";
    bubble.appendChild(inner);
    // this.addTimestamp(bubble, msg);
    return bubble;
  }

  /** ========== 附加功能 ========== */
  addTimestamp(bubble, msg) {
    const time = document.createElement("span");
    time.className = "absolute bottom-1 right-2 text-[10px] leading-[10px] text-gray-400";
    const ts = msg.message_time;
    time.textContent = ts
        ? new Date(ts).toLocaleString("zh-Hans-CN", {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit"
        })
        : "";
    bubble.appendChild(time);
  }

  renderStatus(m, bubble, msg) {
    if (!msg.self_send) {
      return;
    }
    if (m.sending) {
      const loader = document.createElement("div");
      loader.className = "absolute bottom-1 left-2 flex space-x-1";
      loader.innerHTML = `
        <span class="w-1 h-1 bg-blue-300 rounded-full animate-tg-dot"></span>
        <span class="w-1 h-1 bg-blue-300 rounded-full animate-tg-dot" style="animation-delay:0.2s"></span>
        <span class="w-1 h-1 bg-blue-300 rounded-full animate-tg-dot" style="animation-delay:0.4s"></span>
      `;
      bubble.appendChild(loader);
    } else if (m.send_failed) {
      const retry = document.createElement("button");
      retry.className = "absolute bottom-1 left-2 text-[10px] text-red-500 underline";
      retry.textContent = "重试";
      retry.addEventListener("click", () => {
        this.inputTarget.value = msg.content;
        this.autoResize();
        this.sendMessage();
      });
      bubble.appendChild(retry);
    }
  }

  sendMessage() {
    const content = this.inputTarget.value.trim();
    if (!content) {
      return;
    }

    // 生成一个临时消息（pending 状态）
    const tempId = "temp-" + Date.now();
    const tempMsg = {
      id: tempId,
      chat_room_id: this.idValue,
      message_time: new Date().toISOString(),
      sending: true,          // 标记发送中
      send_failed: false,     // 标记是否失败
      wx_message: {
        msg_type: "self_send",
        content: content,
        to_user_name: this.currentWxidValue,
        self_send: true,
      }
    };

    this.messages.push(tempMsg);
    this.renderMessages();
    this.inputTarget.value = "";
    this.autoResize();

    // 发起请求
    fetch(`/chat_room/${this.idValue}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": document.querySelector(
            'meta[name="csrf-token"]').content
      },
      body: JSON.stringify({
        chat_room_id: this.idValue,
        content: content,
        msg_type: 0,
        extra: {}
      })
    })
        .then(res => res.json())
        .then(newMsg => {
          // 替换临时消息
          const index = this.messages.findIndex(m => m.id === tempId);
          if (index !== -1) {
            this.messages[index] = {
              ...newMsg.result,
              sending: false,
              send_failed: false
            };
            this.renderMessages();
          }
        })
        .catch(error => {
          console.error("发送消息失败:", error);
          // 更新临时消息为失败状态
          const index = this.messages.findIndex(m => m.id === tempId);
          if (index !== -1) {
            this.messages[index].sending = false;
            this.messages[index].send_failed = true;
            this.renderMessages();
          }
        });
  }

  parseWxXmlMessage(xmlString) {
    try {
      const parser = new DOMParser();
      const xml = parser.parseFromString(xmlString, "application/xml");

      const title = xml.querySelector("title")?.textContent?.trim() || "";
      const desc = xml.querySelector("des")?.textContent?.trim() || "";
      const url = xml.querySelector("url")?.textContent?.trim() || "";
      const cover = xml.querySelector("thumburl")?.textContent?.trim()
          || xml.querySelector("cover")?.textContent?.trim();
      const source = xml.querySelector(
              "publisher > nickname")?.textContent?.trim()
          || xml.querySelector("appname")?.textContent?.trim();
      const msgType = xml.querySelector("type")?.textContent?.trim() || 0
      return {type: "xml", title, desc, url, cover, source, msgType};
    } catch (e) {
      console.error("XML parse error:", e);
      return {type: "text", content: xmlString}; // fallback
    }
  }

  toggleMenu(event) {
    event.stopPropagation()

    if (this.menuTarget.classList.contains("hidden")) {
      this.menuTarget.classList.remove("hidden")
      // 点击页面其他地方时关闭
      document.addEventListener("click", this.closeMenu)
    } else {
      this.closeMenu()
    }
  }

  syncMembers() {
    fetch(`/chat_room/${this.idValue}/sync_chat_members`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": document.querySelector(
            'meta[name="csrf-token"]').content
      },
      body: JSON.stringify({
        chat_room_id: this.idValue,
      })
    }).then()
  }

  syncContact() {
    fetch(`/chat_room/${this.idValue}/sync_chat_contact`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": document.querySelector(
            'meta[name="csrf-token"]').content
      },
      body: JSON.stringify({
        chat_room_id: this.idValue,
      })
    }).then()
  }

  loadMore() {
    if (this.messages.length === 0) {
      return;
    }

    const firstMsgId = this.messages[0].id;
    const container = this.messageListTarget;
    const oldHeight = container.scrollHeight;

    fetch(`/chat_room/${this.idValue}/messages?before_id=${firstMsgId}`)
        .then(res => res.json())
        .then(data => {
          if (!data.length) {
            return;
          }

          // prepend 消息到数组
          this.messages = [...data, ...this.messages];

          // 只渲染新增消息
          data.forEach(m => {
            const msg = m.wx_message;
            const lastSender = null; // loadMore 时每条消息都显示头像
            const row = this.buildRow(true, msg);
            const bubble = this.renderMessageBubble(msg);
            row.appendChild(bubble);
            container.prepend(row);
            this.renderStatus(m, bubble, msg);
          });

          // 维持滚动位置
          const newHeight = container.scrollHeight;
          container.scrollTop = newHeight - oldHeight;
        })
        .catch(console.error);
  }

// 拉取新的消息
  loadNewMessages(msg) {
    if (this.messages.length === 0) {
      return this.loadMessages();
    }

    const container = this.messageListTarget;

    fetch(`/chat_room/${this.idValue}/messages?after_id=${msg.message_id}`)
        .then(res => res.json())
        .then(data => {
          if (!data.length) {
            return;
          }

          // 用 Set 做去重
          const existingIds = new Set(this.messages.map(m => m.id));

          const newOnes = data.filter(m => !existingIds.has(m.id));

          if (!newOnes.length) {
            return;
          }

          this.messages.push(...newOnes);

          // 渲染新增消息
          newOnes.forEach(m => {
            const wxMsg = m.wx_message;
            const row = this.buildRow(true, wxMsg); // true 表示新分组
            const bubble = this.renderMessageBubble(wxMsg);
            row.appendChild(bubble);
            container.appendChild(row);
            this.renderStatus(m, bubble, wxMsg);
          });

          // 滚动到底部
          container.scrollTop = container.scrollHeight;
        })
        .catch(console.error);
  }

  closeMenu = () => {
    this.menuTarget.classList.add("hidden")
    document.removeEventListener("click", this.closeMenu)
  }

  renderVoiceMessage(bubble, msg) {
    const parser = new DOMParser();
    const xml = parser.parseFromString(msg.content, "application/xml");

    const voiceNode = xml.querySelector("voicemsg");
    const voiceLengthMs = parseInt(
        voiceNode?.getAttribute("voicelength") || "0", 10);
    const voiceLengthSec = Math.floor(voiceLengthMs / 1000);
    // 先展示一个占位 UI，点击再去请求后端下载
    const container = document.createElement("div");
    container.className = "px-3 py-2 pr-14 pb-4 whitespace-pre-wrap break-words";
    container.classList.add("flex", "items-center", "space-x-2",
        "cursor-pointer");

    const icon = document.createElement("img");
    icon.src = "voice-svgrepo-com.svg";
    icon.width = 16;
    icon.height = 16;

    const label = document.createElement("span");
    label.textContent = `${voiceLengthSec}"         `;

    container.appendChild(icon);
    container.appendChild(label);

    container.addEventListener("click", () => {
      // 点击后去请求后端接口下载/播放
      fetch(`/message/voice/${msg.id}`)
          .then((res) => res.blob())
          .then((blob) => {
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            audio.play();
          })
          .catch((err) => console.error("语音下载失败:", err));
    });

    bubble.appendChild(container);
    return bubble;
  }
}
