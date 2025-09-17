// app/javascript/controllers/chat_room_controller.js
import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static targets = ["messageList", "input", "emptyMessage"];
  static values = { currentWxid: String };

  connect() {
    this.messages = [];
    this.loadMessages();
  }

  // 模拟获取消息列表
  loadMessages() {
    // 假设你用 fetch 请求已经成功返回消息
    fetch(`/chat_room/${this.data.get("chat-room-id")}/messages.json`)
        .then(res => res.json())
        .then(data => {
          this.messages = data;
          this.renderMessages();
        });
  }

  renderMessages() {
    if (!this.hasMessageListTarget) return;

    this.messageListTarget.innerHTML = "";

    if (this.messages.length === 0) {
      if (this.hasEmptyMessageTarget) {
        this.emptyMessageTarget.style.display = "block";
      }
      return;
    }

    if (this.hasEmptyMessageTarget) {
      this.emptyMessageTarget.style.display = "none";
    }

    this.messages.forEach(msg => {
      const isMine = msg.wx_message.from_user_name === this.currentWxidValue;
      const wrapper = document.createElement("div");
      wrapper.className = `flex ${isMine ? "justify-end" : "justify-start"}`;
      wrapper.innerHTML = `
        <div class="max-w-xs break-words px-4 py-2 rounded-lg ${isMine ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-800"}">
          ${msg.wx_message.content}
          <div class="text-xs mt-1 text-gray-500 text-right">${new Date(msg.message_time).toLocaleTimeString()}</div>
        </div>
      `;
      this.messageListTarget.appendChild(wrapper);
    });

    // 滚动到底部
    this.messageListTarget.scrollTop = this.messageListTarget.scrollHeight;
  }

  sendMessage() {
    const content = this.inputTarget.value.trim();
    if (!content) return;

    fetch(`/chat_room/${this.data.get("chat-room-id")}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content })
    })
        .then(res => res.json())
        .then(newMsg => {
          this.messages.push(newMsg);
          this.renderMessages();
          this.inputTarget.value = "";
        });
  }
}
