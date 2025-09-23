import {Controller} from "@hotwired/stimulus";

export default class extends Controller {
  static targets = ["messageList", "input", "emptyMessage", "menu"];
  static values = {currentWxid: String, id: Number};

  connect() {
    console.log("connect chat room controller", this.currentWxidValue)
    this.messages = [];
    this.loadMessages();
    // 回车发送、Shift+Enter换行
    this.inputTarget.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();   // 阻止默认换行
        this.sendMessage();   // 调用发送
      }
      // Shift+Enter 默认就是换行，不拦截
    });

    // 自动高度调整
    this.inputTarget.addEventListener("input", this.autoResize.bind(this));

    // 初始化时也调整一次
    this.autoResize();
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

    this.messages.forEach(m => {
      const msg = m.wx_message;
      const sender = msg.from_user_name || msg.from_wxid || null;
      const isMine = msg.to_user_name === this.currentWxidValue;
      const isNewGroup = lastSender !== null && lastSender !== sender;
      lastSender = sender;

      // 每行容器
      const row = document.createElement("div");
      if (msg.content?.trim().startsWith("<msg")) {
        // XML 卡片消息居中
        row.className = `flex justify-center ${isNewGroup ? "mt-3"
            : "mt-1"} items-start`;
      } else if (isMine) {
        row.className = `flex justify-end ${isNewGroup ? "mt-3"
            : "mt-1"} items-end`;
      } else {
        row.className = `flex justify-start ${isNewGroup ? "mt-3"
            : "mt-1"} items-end`;
      }

      row.className = `w-full flex ${isMine ? "justify-end"
          : "justify-start"} ${isNewGroup ? "mt-3" : "mt-1"} items-end`;

      // 气泡容器
      const bubble = document.createElement("div");
      bubble.className = `p-3 relative inline-block max-w-[75%] rounded-2xl shadow-sm ${
          isMine
              ? "bg-blue-500 text-white rounded-bl-2xl rounded-tr-2xl rounded-br-md"
              : "bg-white text-gray-900 border border-gray-200 rounded-br-2xl rounded-tl-2xl rounded-bl-md"
      }`;
      bubble.style.maxWidth = "65%"

      let inner;

      if (msg.content?.trim().startsWith("<msg")) {
        // === 文章 / 卡片消息 ===
        bubble.className = `
        relative inline-block rounded-2xl shadow-lg
        w-1/2
        bg-white text-gray-900 border border-gray-200
        rounded-br-2xl rounded-tl-2xl rounded-bl-md
      `;
        bubble.style.width = "50%"
        bubble.style.minWidth = "165px"

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

      } else if (msg.content?.trim().startsWith("<") && msg.content.length
          > 250) {

        // 未解析 XML 消息折叠
        const wrapper = document.createElement("div");
        wrapper.className = "px-3 py-2 pr-14 pb-4 whitespace-pre-wrap break-words overflow-hidden";
        wrapper.style.maxHeight = "6rem"; // 初始折叠高度
        // wrapper.style.maxWidth = "35%";

        wrapper.textContent = msg.content || "";

        const toggle = document.createElement("button");
        toggle.className = "mt-1 text-xs hover:underline ml-3";
        toggle.textContent = "展开";
        // toggle.style.maxWidth = "35%";

        toggle.addEventListener("click", () => {
          if (wrapper.style.maxHeight === "6rem") {
            wrapper.style.maxHeight = wrapper.scrollHeight + "px"; // 展开
            toggle.textContent = "收起";
          } else {
            wrapper.style.maxHeight = "6rem"; // 折叠
            toggle.textContent = "展开";
          }
        });

        bubble.appendChild(wrapper);
        bubble.appendChild(toggle);

      } else if (msg.msg_type === "emoji") {
        // === Emoji 消息 ===
        bubble.className = `relative inline-block max-w-[75%] rounded-2xl shadow-sm ${
            isMine
                ? "bg-blue-500 text-white rounded-bl-2xl rounded-tr-2xl rounded-br-md"
                : "bg-white text-gray-900 border border-gray-200 rounded-br-2xl rounded-tl-2xl rounded-bl-md"
        }`;

        const inner = document.createElement("div");
        inner.className = "px-3 py-2 pr-14 pb-4 whitespace-pre-wrap break-words";
        inner.textContent = "Emoji 替代符，TODO";
        bubble.appendChild(inner);
      } else {
        // === 普通文本消息 ===
        bubble.className = `relative inline-block max-w-[75%] rounded-2xl shadow-sm ${
            isMine
                ? "bg-blue-500 text-white rounded-bl-2xl rounded-tr-2xl rounded-br-md"
                : "bg-white text-gray-900 border border-gray-200 rounded-br-2xl rounded-tl-2xl rounded-bl-md"
        }`;

        const inner = document.createElement("div");
        inner.className = "px-3 py-2 pr-14 pb-4 whitespace-pre-wrap break-words";
        inner.textContent = msg.refer_title || msg.content || "";
        bubble.appendChild(inner);
      }
      // 时间戳
      const time = document.createElement("span");
      time.className = `absolute bottom-1 right-2 text-[10px] leading-[10px] ${
          isMine ? "text-blue-100" : "text-gray-400"
      }`;
      const ts = m.message_time || msg.created_at;
      time.textContent = ts
          ? new Date(ts).toLocaleString("zh-Hans-CN",
              {
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit"
              })
          : "";

      bubble.appendChild(time);
      row.appendChild(bubble);
      container.appendChild(row);

      if (isMine) {
        if (m.sending) {
          const loader = document.createElement("div");
          loader.className = "absolute bottom-1 left-2 flex space-x-1";

          loader.innerHTML = `
      <span class="w-1 h-1 bg-blue-300 rounded-full animate-tg-dot" style="animation-delay:0s"></span>
      <span class="w-1 h-1 bg-blue-300 rounded-full animate-tg-dot" style="animation-delay:0.2s"></span>
      <span class="w-1 h-1 bg-blue-300 rounded-full animate-tg-dot" style="animation-delay:0.4s"></span>
    `;
          bubble.appendChild(loader);
        } else if (m.send_failed) {
          const retry = document.createElement("button");
          retry.className =
              "absolute bottom-1 left-2 text-[10px] text-red-500 underline";
          retry.textContent = "重试";
          retry.addEventListener("click", () => {
            this.inputTarget.value = msg.content;
            this.autoResize();
            this.sendMessage();
          });
          bubble.appendChild(retry);
        }
      }

    });

    container.scrollTop = container.scrollHeight;
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

      return {type: "xml", title, desc, url, cover, source};
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

  closeMenu = () => {
    this.menuTarget.classList.add("hidden")
    document.removeEventListener("click", this.closeMenu)
  }
}
