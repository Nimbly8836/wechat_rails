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

    console.log("renderMessages", this.messages)
    this.messages.forEach(m => {
      const msg = m.wx_message;
      const isMine = msg.from_user_name === this.currentWxidValue;
      const wrapper = document.createElement("div");
      wrapper.className = `flex ${isMine ? "justify-end" : "justify-start"}`;
      wrapper.innerHTML = `
        <div class="max-w-xs break-words px-4 py-2 rounded-lg ${isMine
          ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-800"}">
          ${msg.content}
          <div class="text-xs mt-1 text-gray-500 text-right">
          ${new Date(m.message_time).toLocaleString("zh-Hans-CN")}
          </div>
        </div>
      `;
      this.messageListTarget.appendChild(wrapper);
    });

    // 滚动到底部
    this.messageListTarget.scrollTop = this.messageListTarget.scrollHeight;
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
