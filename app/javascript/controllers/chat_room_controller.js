import {Controller} from "@hotwired/stimulus";

export default class extends Controller {
  static targets = ["messageList", "input", "emptyMessage", "menu", "showMore"];
  static values = {currentWxid: String, id: Number, members: Array};

  connect() {
    this.debouncedLoadNewMessages = this.debounce(
        this.loadNewMessages.bind(this), 400);
    this.voiceBlobUrls = new Map();
    this.currentVoicePlayback = null;
    this.voicePlaybackRates = new Map();
    this.pendingVoiceSeeks = new Map();
    this.voicePlaybackOptions = [0.5, 1.0, 1.5, 2.0];
    this.highlightedRow = null;
    this.highlightTimer = null;
    this.stickyAvatarEl = null;
    this.stickyAvatarUpdateId = null;
    this._stickyScrollHandler = null;

    window.addEventListener("chat:notify", (e) => {
      const payload = e.detail;
      if (payload.chat_room_id === this.idValue) {
        this.debouncedLoadNewMessages(payload);
      }
    });

    if (this.isRoom()) {
      fetch(`/chat_room/${this.idValue}/chat_members`)
          .then(res => res.json())
          .then(data => {
            this.chatMembers = data;
            this.renderMessages();
          })
          .catch(error => console.error("加载room members 失败", error));
    }
    this.messages = [];
    this.loadMessages();

    this.inputTarget.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    this.messageListTarget.addEventListener("scroll",
        this.handleScroll.bind(this));

    this.inputTarget.addEventListener("input", this.autoResize.bind(this));
    this.autoResize();
  }

  debounce(fn, delay) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  disconnect() {
    if (this.highlightTimer) {
      clearTimeout(this.highlightTimer);
      this.highlightTimer = null;
    }
    if (this.stickyAvatarUpdateId) {
      cancelAnimationFrame(this.stickyAvatarUpdateId);
      this.stickyAvatarUpdateId = null;
    }
    if (this.stickyAvatarEl) {
      this.stickyAvatarEl.remove();
      this.stickyAvatarEl = null;
    }
    if (this._stickyScrollHandler) {
      this.messageListTarget.removeEventListener("scroll",
          this._stickyScrollHandler);
      this._stickyScrollHandler = null;
    }
  }

  isRoom() {
    return this.currentWxidValue.endsWith("@chatroom");
  }

  handleScroll() {
    if (!this.hasShowMoreTarget) {
      return;
    }

    if (this.messageListTarget.scrollTop <= 0 &&
        this.messageListTarget.scrollHeight >= 100) {
      this.showMoreTarget.style.display = "block";
    } else {
      this.showMoreTarget.style.display = "none";
    }

    this.scheduleStickyAvatarUpdate();
  }

  autoResize() {
    const el = this.inputTarget;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }

  loadMessages() {
    fetch(`/chat_room/${this.idValue}/messages`)
        .then(res => res.json())
        .then(data => {
          this.messages = data;
          this.renderMessages();
          this.setupStickyAvatar();
        })
        .catch(error => console.error("加载消息失败:", error));
  }

  getMessageType(msg) {
    if (msg.msg_type === "voice") {
      return "voice";
    }
    if ((msg.content?.trim().startsWith("<") || msg.content?.trim().match(
        /(\w+:|.*)\n</)?.length > 0) && msg.content?.length > 250) {
      if (!this.isRoom()) {
        const parse = this.parseWxXmlMessage(msg.content);
        if (parse.msgType === "5") {
          return "card";
        }
        if (parse.msgType === "57") {
          return "refer";
        }
      }
      return "xml_unparsed";
    }
    if (this.currentWxidValue?.startsWith("gh_") &&
        msg.msg_type === "refer" && msg.content?.trim().startsWith("<msg")) {
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

  renderMessages(options = {}) {
    if (!this.hasMessageListTarget) {
      return;
    }
    const container = this.messageListTarget;
    container.innerHTML = "";

    let bottomOffset = null;
    if (typeof options.preserveBottomOffset === "number") {
      bottomOffset = options.preserveBottomOffset;
    }

    if (this.highlightTimer) {
      clearTimeout(this.highlightTimer);
      this.highlightTimer = null;
    }
    this.highlightedRow = null;

    if (this.messages.length === 0) {
      if (this.hasEmptyMessageTarget) {
        this.emptyMessageTarget.style.display = "block";
      }
      if (this.stickyAvatarEl) {
        this.stickyAvatarEl.classList.add("hidden");
      }
      return;
    }
    if (this.hasEmptyMessageTarget) {
      this.emptyMessageTarget.style.display = "none";
    }

    let lastSenderKey = null;

    this.messages.forEach((wrapper, index) => {
      const msg = wrapper.wx_message;
      msg.id = wrapper.id;
      msg.referenced_message = wrapper.referenced_message;

      const senderInfo = this.lookupSenderInfo(msg, msg.content);
      msg.sender_name = senderInfo?.name;
      msg.sender_avatar = senderInfo?.avatar;
      msg.sender_initial = senderInfo?.initial;
      msg.sender_key = senderInfo?.key;

      const senderKey = msg.sender_key || (msg.self_send
          ? `self:${msg.to_user_name || 'me'}` : msg.from_user_name || "");
      const isNewGroup = lastSenderKey === null || lastSenderKey !== senderKey;
      lastSenderKey = senderKey;

      const row = this.buildRow(isNewGroup, msg, senderInfo);
      const bubble = this.renderMessageBubble(msg, isNewGroup, senderInfo,
          index === 0);
      row.appendChild(bubble);
      container.appendChild(row);

      this.renderStatus(wrapper, bubble, msg);
      this.addTimestamp(bubble, wrapper);
    });

    if (bottomOffset !== null) {
      container.scrollTop = Math.max(container.scrollHeight - bottomOffset, 0);
    } else {
      container.scrollTop = container.scrollHeight;
    }

    this.setupStickyAvatar();
    this.scheduleStickyAvatarUpdate();
  }

  replaceRoomSenderWxid(msg) {
    if (this.chatMembers && msg.content) {
      const title_send_wxid = msg.content.match(/\w+:\n/)?.[0];
      if (title_send_wxid) {
        const wxid = title_send_wxid.slice(0, -2);
        const member_info = this.chatMembers.find(it => it.user_name === wxid);
        if (member_info) {
          msg.content = msg.content.replace(wxid + ":",
              member_info.remark || member_info.nick_name);
        }
      }
    }
  }

  buildRow(isNewGroup, msg, senderInfo) {
    const row = document.createElement("div");
    row.className = `w-full flex ${msg.self_send ? "justify-end"
        : "justify-start"} items-end`;
    if (msg.id) {
      row.dataset.messageId = msg.id;
    }

    if (!msg.self_send) {
      const wrapper = document.createElement("div");
      wrapper.className = "mr-2 flex justify-center items-start";
      wrapper.style.width = "3rem";

      const senderName = senderInfo?.name || msg.sender_name || "";
      const senderAvatar = senderInfo?.avatar || msg.sender_avatar || "";
      if (senderName) {
        row.dataset.senderName = senderName;
      }
      if (senderAvatar) {
        row.dataset.senderAvatar = senderAvatar;
      } else {
        delete row.dataset.senderAvatar;
      }

      if (isNewGroup) {
        const avatar = document.createElement("div");
        avatar.className = "w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden";
        if (!senderAvatar) {
          const initial = senderInfo?.initial || msg.sender_initial || "?";
          avatar.textContent = initial;
          avatar.classList.add("text-gray-600", "font-semibold");
        } else {
          const img = document.createElement("img");
          img.src = senderAvatar;
          img.alt = senderName;
          img.className = "w-full h-full object-cover";
          avatar.appendChild(img);
        }
        wrapper.appendChild(avatar);
      } else {
        wrapper.style.visibility = "hidden";
        wrapper.style.opacity = "0";
      }

      row.appendChild(wrapper);
    } else {
      row.dataset.senderName = "我";
      delete row.dataset.senderAvatar;
    }

    return row;
  }

  renderMessageBubble(msg, isNewGroup, senderInfo, isFirstMessage) {
    const bubble = document.createElement("div");
    const type = this.getMessageType(msg);

    if (type !== "refer") {
      this.replaceRoomSenderWxid(msg);
    }

    switch (type) {
      case "voice":
        return this.renderVoiceMessage(bubble, msg, isNewGroup, senderInfo,
            isFirstMessage);
      case "card":
        return this.renderCardMessage(bubble, msg, isNewGroup, senderInfo,
            isFirstMessage);
      case "xml_unparsed":
        return this.renderXmlMessage(bubble, msg, isNewGroup, senderInfo,
            isFirstMessage);
      case "emoji":
        return this.renderEmojiMessage(bubble, msg, isNewGroup, senderInfo,
            isFirstMessage);
      case "refer":
        return this.renderReferMessage(bubble, msg, isNewGroup, senderInfo,
            isFirstMessage);
      case "text":
      default:
        return this.renderTextMessage(bubble, msg, isNewGroup, senderInfo,
            isFirstMessage);
    }
  }

  renderCardMessage(bubble, msg, isNewGroup, senderInfo, isFirstMessage) {
    const template = this.cloneTemplate("message-template-card");
    const cardBubble = template || bubble;
    const parsed = this.parseWxXmlMessage(msg.content || "");
    const link = cardBubble.querySelector("[data-role='card-link']");
    const cover = cardBubble.querySelector("[data-role='card-cover']");
    const title = cardBubble.querySelector("[data-role='card-title']");
    const desc = cardBubble.querySelector("[data-role='card-desc']");
    const source = cardBubble.querySelector("[data-role='card-source']");

    if (link) {
      link.href = parsed.url || "#";
    }
    if (cover) {
      cover.innerHTML = parsed.cover
          ? `<img src="${parsed.cover}" class="max-h-48 w-full object-cover" referrerpolicy="no-referrer"/>`
          : "";
    }
    if (title) {
      title.textContent = parsed.title || "";
    }
    if (desc) {
      desc.textContent = parsed.desc || "";
    }
    if (source) {
      source.textContent = parsed.source ? `来自：${parsed.source}` : "";
    }

    return this.applyBubbleStyle(cardBubble, msg, isNewGroup, senderInfo,
        isFirstMessage);
  }

  renderXmlMessage(bubble, msg, isNewGroup, senderInfo, isFirstMessage) {
    const template = this.cloneTemplate("message-template-xml");
    const xmlBubble = template || bubble;
    const wrapper = xmlBubble.querySelector("[data-role='xml-content']");
    const toggle = xmlBubble.querySelector("[data-role='xml-toggle']");
    if (wrapper) {
      wrapper.textContent = msg.content || "";
    }
    if (toggle && wrapper) {
      toggle.addEventListener("click", () => {
        if (wrapper.style.maxHeight === "6rem") {
          wrapper.style.maxHeight = wrapper.scrollHeight + "px";
          toggle.textContent = "收起";
        } else {
          wrapper.style.maxHeight = "6rem";
          toggle.textContent = "展开";
        }
      });
    }
    return this.applyBubbleStyle(xmlBubble, msg, isNewGroup, senderInfo,
        isFirstMessage);
  }

  renderEmojiMessage(bubble, msg, isNewGroup, senderInfo, isFirstMessage) {
    const template = this.cloneTemplate("message-template-emoji");
    const emojiBubble = template || bubble;
    return this.applyBubbleStyle(emojiBubble, msg, isNewGroup, senderInfo,
        isFirstMessage);
  }

  renderTextMessage(bubble, msg, isNewGroup, senderInfo, isFirstMessage) {
    const template = this.cloneTemplate("message-template-text");
    const textBubble = template || bubble;
    const inner = textBubble.querySelector("[data-role='content']");
    const content = msg.refer_title || msg.content || "";
    if (inner) {
      inner.innerHTML = "";
      inner.appendChild(this.buildLinkedText(content));
    }
    return this.applyBubbleStyle(textBubble, msg, isNewGroup, senderInfo,
        isFirstMessage);
  }

  renderVoiceMessage(bubble, msg, isNewGroup, senderInfo, isFirstMessage) {
    const template = this.cloneTemplate("message-template-voice");
    const voiceBubble = template || bubble;
    const container = voiceBubble.querySelector(
        "[data-role='voice-container']");
    const label = voiceBubble.querySelector("[data-role='voice-label']");
    const wrapper = voiceBubble.querySelector("[data-role='voice-wrapper']");
    const progressBar = voiceBubble.querySelector(
        "[data-role='voice-progress']");
    const progressInner = voiceBubble.querySelector(
        "[data-role='voice-progress-inner']");
    const speedButton = voiceBubble.querySelector("[data-role='voice-speed']");
    const controls = voiceBubble.querySelector("[data-role='voice-controls']");

    const parser = new DOMParser();
    const xml = parser.parseFromString(msg.content, "application/xml");
    const fallbackDuration = Number(
            xml.querySelector("voicemsg")?.getAttribute("voicelength") || 0) / 1000
        || 10;

    if (label) {
      label.dataset.originalText = label.textContent;
    }

    if (speedButton) {
      speedButton.type = "button";
      speedButton.className = "px-1 py-1 border-1 border-dashed text-xs rounded";
      const rateIndex = this.voicePlaybackRates.get(msg.id) ?? 1;
      const rate = this.voicePlaybackOptions[rateIndex] ?? 1.0;
      speedButton.textContent = `${rate.toFixed(1)}x`;
    }

    const context = {
      messageId: msg.id,
      fallbackDuration,
      progressBar,
      progressInner,
      speedButton,
    };

    const pendingRatio = this.pendingVoiceSeeks.get(msg.id);
    if (typeof pendingRatio === "number") {
      progressInner.style.width = `${Math.min(Math.max(pendingRatio, 0), 1)
      * 100}%`;
    }

    if (controls && progressBar && speedButton) {
      controls.appendChild(progressBar);
      controls.appendChild(speedButton);
    }

    if (wrapper && controls) {
      wrapper.appendChild(controls);
    }

    if (voiceBubble && wrapper) {
      voiceBubble.appendChild(wrapper);
    }

    if (container && label) {
      container.addEventListener("click", () =>
          this.handleVoiceClick(msg.id, container, label, context));
    }

    if (progressBar) {
      progressBar.addEventListener("click", (event) => {
        event.stopPropagation();
        this.seekVoice(msg.id, context, event);
      });
    }

    if (speedButton) {
      speedButton.addEventListener("click", (event) => {
        event.stopPropagation();
        this.toggleSpeed(msg.id, context);
      });
    }

    return this.applyBubbleStyle(voiceBubble, msg, isNewGroup, senderInfo,
        isFirstMessage);
  }

  renderReferMessage(bubble, msg, isNewGroup, senderInfo, isFirstMessage) {
    const template = this.cloneTemplate("message-template-refer");
    const referBubble = template || bubble;
    const body = referBubble.querySelector("[data-role='refer-body']");
    const quoted = referBubble.querySelector("[data-role='refer-quoted']");
    const quotedMeta = referBubble.querySelector(
        "[data-role='refer-quoted-meta']");
    const quotedContent = referBubble.querySelector(
        "[data-role='refer-quoted-content']");

    const parsed = this.parseWxXmlMessage(msg.content || "");
    const title = (msg.refer_title || parsed.title || "引用的消息").trim();
    if (body) {
      body.textContent = title;
    }

    const referenced = msg.referenced_message;
    if (referenced && referenced.wx_message) {
      const refWx = referenced.wx_message;
      this.replaceRoomSenderWxid(refWx);

      if (quoted) {
        quoted.classList.remove("cursor-not-allowed", "opacity-60");
        if (referenced.id) {
          quoted.classList.add("cursor-pointer");
          quoted.dataset.referMessageId = referenced.id;
          quoted.addEventListener("click", (event) => {
            event.stopPropagation();
            this.focusMessageById(referenced.id);
          });
        } else {
          quoted.classList.remove("cursor-pointer");
          delete quoted.dataset.referMessageId;
        }
      }

      if (quotedMeta) {
        quotedMeta.textContent = `引用的${this.humanizeMessageType(
            refWx.msg_type)}消息`;
      }

      if (quotedContent) {
        quotedContent.innerHTML = "";
        if (refWx.msg_type === "text" && refWx.content) {
          quotedContent.appendChild(this.buildLinkedText(refWx.content));
        } else {
          quotedContent.textContent = `[${this.humanizeMessageType(
              refWx.msg_type)}]`;
        }
      }
    } else {
      if (quoted) {
        quoted.classList.add("cursor-not-allowed", "opacity-60");
        quoted.classList.remove("cursor-pointer");
        delete quoted.dataset.referMessageId;
      }
      if (quotedMeta) {
        quotedMeta.textContent = "引用的消息";
      }
      if (quotedContent) {
        quotedContent.textContent = "该消息尚未加载";
      }
    }

    return this.applyBubbleStyle(referBubble, msg, isNewGroup, senderInfo,
        isFirstMessage);
  }

  applyBubbleStyle(bubble, msg, isNewGroup = true, senderInfo = null,
      isFirstMessage = false) {
    if (!bubble) {
      return bubble;
    }

    bubble.classList.add("relative", "inline-block", "max-w-[75%]",
        "rounded-2xl", "shadow-sm", "message-bubble");
    bubble.style.marginTop = isNewGroup ? "12px" : "6px";

    bubble.classList.remove(
        "bg-blue-500", "text-white", "rounded-bl-2xl", "rounded-tr-2xl",
        "rounded-br-md", "bg-white", "text-gray-900", "border",
        "border-gray-200", "rounded-br-2xl", "rounded-tl-2xl",
        "rounded-bl-md");

    if (msg.self_send) {
      bubble.classList.add(
          "bg-blue-500", "text-white", "rounded-bl-2xl", "rounded-tr-2xl",
          "rounded-br-md");
    } else {
      bubble.classList.add(
          "bg-white", "text-gray-900", "border", "border-gray-200",
          "rounded-br-2xl", "rounded-tl-2xl", "rounded-bl-md");
    }

    const existingName = bubble.querySelector('[data-role="sender-name"]');
    if (existingName) {
      existingName.remove();
    }

    if (!msg.self_send && this.isRoom() && isNewGroup) {
      const name = senderInfo?.name || msg.sender_name || "";
      if (name) {
        const nameTag = document.createElement("div");
        nameTag.dataset.role = "sender-name";
        nameTag.className = "px-3 pt-1 text-xs font-semibold text-blue-500/80";
        nameTag.textContent = name;
        bubble.insertBefore(nameTag, bubble.firstChild);
      }
    }

    return bubble;
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

  addTimestamp(bubble, wrapper) {
    const time = document.createElement("span");
    time.className = "absolute bottom-1 right-2 text-[10px] leading-[10px] text-gray-400";
    const ts = wrapper.wx_message.message_time;
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

  sendMessage() {
    const content = this.inputTarget.value.trim();
    if (!content) {
      return;
    }

    const tempId = "temp-" + Date.now();
    const tempMsg = {
      id: tempId,
      chat_room_id: this.idValue,
      message_time: new Date().toISOString(),
      sending: true,
      send_failed: false,
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
      const msgType = xml.querySelector("type")?.textContent?.trim() || 0;
      return {type: "xml", title, desc, url, cover, source, msgType};
    } catch (e) {
      console.error("XML parse error:", e);
      return {type: "text", content: xmlString};
    }
  }

  toggleMenu(event) {
    event.stopPropagation();

    if (this.menuTarget.classList.contains("hidden")) {
      this.menuTarget.classList.remove("hidden");
      document.addEventListener("click", this.closeMenu);
    } else {
      this.closeMenu();
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
    });
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
    });
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

          this.messages = [...data, ...this.messages];

          data.forEach(m => {
            const msg = m.wx_message;
            const row = this.buildRow(true, msg);
            const bubble = this.renderMessageBubble(msg);
            row.appendChild(bubble);
            container.prepend(row);
            this.renderStatus(m, bubble, msg);
          });

          const newHeight = container.scrollHeight;
          container.scrollTop = newHeight - oldHeight;
        })
        .catch(console.error);
  }

  loadNewMessages(msg) {
    if (this.messages.length === 0) {
      return this.loadMessages();
    }

    const container = this.messageListTarget;
    const oldHeight = container.scrollHeight;

    fetch(
        `/chat_room/${this.idValue}/messages?after_id=${this.messages[this.messages.length
        - 1].id}`)
        .then(res => res.json())
        .then(data => {
          if (!data.length) {
            return;
          }

          this.messages = [...this.messages, ...data];
          this.renderMessages({
            preserveBottomOffset: container.scrollHeight - container.scrollTop
          });
        })
        .catch(console.error);
  }

  handleVoiceClick(messageId, container, label, context) {
    if (container.dataset.loading === "true") {
      return;
    }

    const original = label.dataset.originalText;
    const cachedUrl = this.voiceBlobUrls.get(messageId);

    if (cachedUrl) {
      this.playVoice(cachedUrl, container, label, context);
      return;
    }

    container.dataset.loading = "true";
    label.textContent = "加载中…";

    fetch(`/message/voice/${messageId}`)
        .then((res) => {
          if (!res.ok) {
            throw new Error(`请求失败: ${res.status}`);
          }
          return res.blob();
        })
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          this.voiceBlobUrls.set(messageId, url);
          this.playVoice(url, container, label, context);
        })
        .catch((err) => {
          console.error("语音下载失败:", err);
          label.textContent = "下载失败";
          setTimeout(() => {
            label.textContent = original;
          }, 1500);
        })
        .finally(() => {
          container.dataset.loading = "false";
        });
  }

  playVoice(url, container, label, context) {
    this.stopCurrentVoicePlayback();

    const audio = new Audio(url);
    const original = label.dataset.originalText;

    const {
      messageId,
      progressBar,
      progressInner,
      fallbackDuration,
      speedButton,
    } = context;

    const playbackState = {
      audio,
      progressBar,
      progressInner,
      speedButton,
      rateIndex: this.voicePlaybackRates.get(messageId) ?? 1,
      fallbackDuration,
      messageId,
      animationId: null,
      applyRate: null,
      cleanup: null,
    };

    const stopAnimation = () => {
      if (playbackState.animationId) {
        cancelAnimationFrame(playbackState.animationId);
        playbackState.animationId = null;
      }
    };

    const hideProgress = () => {
      const pending = this.pendingVoiceSeeks.get(messageId);
      const ratio = typeof pending === "number" ? pending : 0;
      progressInner.style.width = `${Math.min(Math.max(ratio, 0), 1) * 100}%`;
      stopAnimation();
    };

    const cleanup = () => {
      container.classList.remove("opacity-60");
      label.textContent = original;
      if (this.currentVoicePlayback?.audio === audio) {
        this.currentVoicePlayback = null;
      }
      hideProgress();
      this.pendingVoiceSeeks.delete(messageId);
    };

    playbackState.cleanup = cleanup;

    const updateProgress = () => {
      const duration = Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : fallbackDuration;
      if (duration > 0) {
        const percent = Math.min(1, audio.currentTime / duration) * 100;
        progressInner.style.width = `${percent}%`;
      }
      playbackState.animationId = requestAnimationFrame(updateProgress);
    };

    const applyPendingSeek = () => {
      const pending = this.pendingVoiceSeeks.get(messageId);
      if (typeof pending !== "number") {
        return;
      }
      const clamped = Math.min(Math.max(pending, 0), 1);
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        audio.currentTime = clamped * audio.duration;
        progressInner.style.width = `${clamped * 100}%`;
        this.pendingVoiceSeeks.delete(messageId);
      } else {
        progressInner.style.width = `${clamped * 100}%`;
      }
    };

    const startTracking = () => {
      if (this.currentVoicePlayback?.audio !== audio) {
        return;
      }
      applyPendingSeek();
      stopAnimation();
      playbackState.animationId = requestAnimationFrame(updateProgress);
    };

    const applyRate = () => {
      const rate = this.voicePlaybackOptions[playbackState.rateIndex] ?? 1.0;
      audio.playbackRate = rate;
      speedButton.textContent = `${rate.toFixed(1)}x`;
      this.voicePlaybackRates.set(messageId, playbackState.rateIndex);
    };

    playbackState.applyRate = applyRate;

    this.currentVoicePlayback = playbackState;
    applyRate();

    label.textContent = "播放中…";
    container.classList.add("opacity-60");

    audio.addEventListener("loadedmetadata", startTracking, {once: true});
    audio.addEventListener("play", startTracking, {once: true});
    audio.addEventListener("ended", cleanup, {once: true});

    let playResult;
    try {
      playResult = audio.play();
    } catch (err) {
      console.error("语音播放失败:", err);
      cleanup();
      label.textContent = "播放失败";
      setTimeout(() => {
        label.textContent = original;
      }, 2500);
      return;
    }

    if (playResult && typeof playResult.then === "function") {
      playResult.catch((err) => {
        console.error("语音播放失败:", err);
        cleanup();
        label.textContent = "播放失败";
        setTimeout(() => {
          label.textContent = original;
        }, 2500);
      });
    } else {
      startTracking();
    }
  }

  seekVoice(messageId, context, event) {
    const {progressBar, progressInner} = context;
    const rect = progressBar.getBoundingClientRect();
    if (!rect.width) {
      return;
    }

    const ratio = Math.min(
        Math.max((event.clientX - rect.left) / rect.width, 0), 1);
    progressInner.style.width = `${ratio * 100}%`;
    this.pendingVoiceSeeks.set(messageId, ratio);

    if (this.currentVoicePlayback?.messageId !== messageId) {
      return;
    }

    const activeState = this.currentVoicePlayback;
    const {audio} = activeState;
    const previousInner = activeState.progressInner;
    activeState.progressBar = progressBar;
    activeState.progressInner = progressInner;
    if (previousInner && previousInner !== progressInner) {
      previousInner.style.width = `${ratio * 100}%`;
    }

    const apply = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        audio.currentTime = ratio * audio.duration;
        this.pendingVoiceSeeks.delete(messageId);
      }
    };

    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      apply();
    } else {
      audio.addEventListener("loadedmetadata", apply, {once: true});
    }
  }

  toggleSpeed(messageId, context) {
    const currentIndex = this.voicePlaybackRates.get(messageId) ?? 1;
    const nextIndex = (currentIndex + 1) % this.voicePlaybackOptions.length;
    this.voicePlaybackRates.set(messageId, nextIndex);

    const rate = this.voicePlaybackOptions[nextIndex] ?? 1.0;
    context.speedButton.textContent = `${rate.toFixed(1)}x`;

    if (this.currentVoicePlayback?.messageId !== messageId) {
      return;
    }

    this.currentVoicePlayback.rateIndex = nextIndex;
    this.currentVoicePlayback.speedButton = context.speedButton;
    if (typeof this.currentVoicePlayback.applyRate === "function") {
      this.currentVoicePlayback.applyRate();
    } else {
      this.currentVoicePlayback.audio.playbackRate = rate;
    }
  }

  stopCurrentVoicePlayback() {
    if (!this.currentVoicePlayback) {
      return;
    }
    const {audio, cleanup} = this.currentVoicePlayback;
    audio.pause();
    audio.currentTime = 0;
    cleanup();
  }

  buildLinkedText(text) {
    const fragment = document.createDocumentFragment();
    if (!text) {
      fragment.appendChild(document.createTextNode(""));
      return fragment;
    }

    const anchorRegex = /<a\s+[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let lastIndex = 0;
    let match;

    while ((match = anchorRegex.exec(text)) !== null) {
      const preceding = text.slice(lastIndex, match.index);
      if (preceding) {
        this.appendPlainSegment(fragment, preceding);
      }

      const href = match[1];
      const labelHtml = match[2];
      const cleanHref = this.normalizeHref(href);

      if (cleanHref) {
        const anchor = this.createAnchor(cleanHref,
            this.decodeHtmlEntities(labelHtml));
        fragment.appendChild(anchor);
      } else {
        this.appendPlainSegment(fragment, match[0]);
      }

      lastIndex = anchorRegex.lastIndex;
    }

    const trailing = text.slice(lastIndex);
    if (trailing) {
      this.appendPlainSegment(fragment, trailing);
    }

    return fragment;
  }

  appendPlainSegment(fragment, text) {
    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    let lastIndex = 0;
    let match;

    while ((match = urlRegex.exec(text)) !== null) {
      const preceding = text.slice(lastIndex, match.index);
      if (preceding) {
        fragment.appendChild(document.createTextNode(preceding));
      }

      const url = match[0];
      const cleanHref = this.normalizeHref(url);
      if (cleanHref) {
        fragment.appendChild(this.createAnchor(cleanHref, url));
      } else {
        fragment.appendChild(document.createTextNode(url));
      }

      lastIndex = match.index + url.length;
    }

    const trailing = text.slice(lastIndex);
    if (trailing) {
      fragment.appendChild(document.createTextNode(trailing));
    }
  }

  createAnchor(href, label) {
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.textContent = label;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.className = "underline text-blue-500 hover:text-blue-600";
    return anchor;
  }

  decodeHtmlEntities(text) {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = text;
    return textarea.value;
  }

  normalizeHref(href) {
    if (!href) {
      return null;
    }
    const trimmed = href.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      return null;
    }
    return trimmed;
  }

  focusMessageById(messageId) {
    if (!messageId || !this.hasMessageListTarget) {
      return;
    }

    const row = this.messageListTarget.querySelector(
        `[data-message-id="${messageId}"]`);
    if (!row) {
      return;
    }

    if (this.highlightedRow && this.highlightedRow !== row) {
      this.highlightedRow.classList.remove("ring-2", "ring-blue-400",
          "ring-offset-2", "ring-offset-gray-100");
    }

    row.scrollIntoView({behavior: "smooth", block: "center"});
    row.classList.add("ring-2", "ring-blue-400", "ring-offset-2",
        "ring-offset-gray-100");
    this.highlightedRow = row;

    if (this.highlightTimer) {
      clearTimeout(this.highlightTimer);
    }
    this.highlightTimer = setTimeout(() => {
      row.classList.remove("ring-2", "ring-blue-400", "ring-offset-2",
          "ring-offset-gray-100");
      if (this.highlightedRow === row) {
        this.highlightedRow = null;
      }
    }, 2000);

    this.scheduleStickyAvatarUpdate();
  }

  scheduleStickyAvatarUpdate() {
    if (!this.stickyAvatarEl) {
      return;
    }
    if (this.stickyAvatarTimer) {
      return;
    }
    this.stickyAvatarTimer = requestAnimationFrame(() => {
      this.stickyAvatarTimer = null;
      this.updateStickyAvatar();
    });
  }

  updateStickyAvatar() {
    if (!this.stickyAvatarEl || !this.hasMessageListTarget) {
      return;
    }

    const rows = Array.from(
        this.messageListTarget.querySelectorAll('[data-message-id]'));
    if (!rows.length) {
      this.stickyAvatarEl.classList.add("hidden");
      return;
    }

    const listRect = this.messageListTarget.getBoundingClientRect();
    const targetY = listRect.bottom - 80;
    let candidate = null;
    let minDistance = Infinity;

    rows.forEach((row) => {
      const rect = row.getBoundingClientRect();
      if (rect.bottom < listRect.top || rect.top > listRect.bottom) {
        return;
      }
      const distance = Math.abs(rect.bottom - targetY);
      if (distance < minDistance) {
        minDistance = distance;
        candidate = row;
      }
    });

    if (!candidate) {
      this.stickyAvatarEl.classList.add("hidden");
      return;
    }

    const senderName = candidate.dataset.senderName
        || (candidate.classList.contains("justify-end") ? "我" : "");
    const senderAvatar = candidate.dataset.senderAvatar || "";

    const avatarWrap = this.stickyAvatarEl.querySelector(
        '[data-role="sticky-avatar"]');
    const avatarImg = avatarWrap?.querySelector("img");
    const initialsEl = avatarWrap?.querySelector('[data-sticky-initial]');
    const nameEl = this.stickyAvatarEl.querySelector('[data-sticky-name]');

    if (!avatarWrap || !avatarImg || !initialsEl || !nameEl) {
      return;
    }

    if (!senderName && !senderAvatar) {
      this.stickyAvatarEl.classList.add("hidden");
      return;
    }

    if (senderAvatar) {
      avatarImg.src = senderAvatar;
      avatarImg.classList.remove("hidden");
      initialsEl.classList.add("hidden");
    } else {
      avatarImg.classList.add("hidden");
      initialsEl.classList.remove("hidden");
      initialsEl.textContent = (senderName || "?").slice(0, 1).toUpperCase();
    }

    nameEl.textContent = senderName || "";
    this.stickyAvatarEl.classList.remove("hidden");
  }

  humanizeMessageType(msgType) {
    const mapping = {
      text: "文本",
      image: "图片",
      voice: "语音",
      video: "视频",
      emoji: "表情",
      refer: "引用",
      card: "卡片",
      html: "网页",
      micro_video: "小视频"
    };
    return mapping[msgType] || "消息";
  }

  cloneTemplate(templateId) {
    const template = document.getElementById(templateId);
    if (!template || !template.content || !template.content.firstElementChild) {
      return null;
    }
    return template.content.firstElementChild.cloneNode(true);
  }

}