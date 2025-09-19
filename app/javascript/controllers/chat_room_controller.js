import {Controller} from "@hotwired/stimulus";

export default class extends Controller {
  static targets = ["messageList", "input", "emptyMessage"];
  static values = {currentWxid: String, id: Number};

  connect() {
    console.log("connect chat room controller", this.currentWxidValue)
    this.messages = [];
    this.loadMessages();
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

    const container = this.messageListTarget
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
    let debugCount = 0;
    this.messages.forEach(m => {
      const msg = m.wx_message;
      const sender = msg.from_user_name || msg.from_wxid || null

      const isMine = msg.msg_type === "self_send"

      const isNewGroup = lastSender !== null && lastSender !== sender;
      lastSender = sender;

      // 每行：左右对齐 + 底对齐
      const row = document.createElement("div")
      row.className = `w-full flex ${isMine ? "justify-end"
          : "justify-start"} ${isNewGroup ? "mt-3" : "mt-1"} items-end`

      // 气泡
      const bubble = document.createElement("div")
      bubble.className = `relative inline-block max-w-[75%] rounded-2xl shadow-sm ${isMine
          ? "bg-blue-500 text-white rounded-bl-2xl rounded-tr-2xl rounded-br-md"
          : "bg-white text-gray-900 border border-gray-200 rounded-br-2xl rounded-tl-2xl rounded-bl-md"}`

      // 文本内容，预留时间空间
      const content = document.createElement("div")
      content.className = "px-3 py-2 pr-14 pb-4 whitespace-pre-wrap break-words"
      content.textContent = msg.content || msg.text || ""

      // 时间
      const time = document.createElement("span")
      time.className = `absolute bottom-1 right-2 text-[10px] leading-[10px] ${isMine
          ? "text-blue-100" : "text-gray-400"}`
      const ts = m.message_time || msg.created_at
      time.textContent = ts ? new Date(ts).toLocaleTimeString("zh-Hans-CN",
          {hour: "2-digit", minute: "2-digit"}) : ""

      bubble.appendChild(content)
      bubble.appendChild(time)
      row.appendChild(bubble)
      container.appendChild(row)
    })

    container.scrollTop = container.scrollHeight
  }

  sendMessage() {
    const content = this.inputTarget.value.trim();
    console.log("sendMessage", content)
    if (!content) {
      return;
    }

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
          this.messages.push(newMsg);
          this.renderMessages();
          this.inputTarget.value = "";
        })
        .catch(error => {
          console.error("发送消息失败:", error)
        });
  }
}
