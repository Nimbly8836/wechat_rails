import { Controller } from "@hotwired/stimulus";
import {
  get_file_base64,
  replaceEmojis,
  setupEmojiInputPreview,
  hideAllEmojiPreviews,
  MessageSet
} from "utils/file_utils";

export default class extends Controller {
  static targets = ["messageList", "input", "emptyMessage", "menu",
    "showMore", "themePanel", "backgroundInput", "bubbleInput",
    "backgroundImageInput", "fileInput", "uploadStatus",
    "fontSelect", "fontCustomInput", "attachmentSelect"];
  static values = { currentWxid: String, id: Number, members: Array };

  connect() {
    // hideAllEmojiPreviews();
    const defaultTheme = {
      backgroundColor: "var(--color-gray-100)",
      backgroundImage: "",
      selfBubbleColor: "#6387f2",
      selfBubbleTextColor: "#ffffff",
      otherBubbleColor: "rgba(255,255,255,0.92)",
      otherBubbleBorderColor: "rgba(148,163,184,0.45)",
      fontFamily: "inherit"
    };
    this.theme = { ...defaultTheme, ...(this.theme || {}) };

    this.boundCloseMenu = this.closeMenu.bind(this);
    this.boundCloseThemePanel = this.closeThemePanel.bind(this);
    this.boundCloseAttachmentSelect = this.mouseleaveAttachment.bind(this);
    this.boundPreventMenuHide = (event) => event.stopPropagation();
    this.boundPreventThemeHide = (event) => event.stopPropagation();
    this.boundCloseAttachmentSelectHide = (event) => event.stopPropagation();

    if (this.hasMenuTarget) {
      this.menuTarget.addEventListener("click", this.boundPreventMenuHide);
    }

    if (this.hasThemePanelTarget) {
      this.themePanelTarget.addEventListener("click",
        this.boundPreventThemeHide);
    }

    if (this.hasAttachmentSelectTarget) {
      this.attachmentSelectTarget.addEventListener("mouseleave",
        this.boundCloseAttachmentSelect);
    }

    // 防止重复绑定
    if (!this._boundHideAttachmentSelect) {
      this._boundHideAttachmentSelect = this.hideAttachmentSelect.bind(this);
    }

    this.debouncedLoadNewMessages = this.debounce(
      this.loadNewMessages.bind(this), 400);
    this.voiceBlobUrls = new Map();
    this.currentVoicePlayback = null;
    this.voicePlaybackRates = new Map();
    this.pendingVoiceSeeks = new Map();
    this.voicePlaybackOptions = [0.5, 1.0, 1.5, 2.0];
    this.highlightedRow = null;
    this.highlightTimer = null;

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
    // Initialize messages as a Set
    this.messages = new MessageSet();
    this.loadMessages();

    this.applyTheme({ refreshBubbles: false });
    this.syncThemeInputs();

    this.inputTarget.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage("text");
      }
    });

    this.messageListTarget.addEventListener("scroll",
      this.handleScroll.bind(this));

    this.inputTarget.addEventListener("input", this.autoResize.bind(this));
    this.autoResize();

    // 设置 emoji 预览功能
    if (this.hasInputTarget) {
      this.cleanupEmojiPreview = setupEmojiInputPreview(this.inputTarget,
        this.idValue);
    }
  }

  debounce(fn, delay) {
    let timer = null;
    return function(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  disconnect() {

    if (this.highlightTimer) {
      clearTimeout(this.highlightTimer);
      this.highlightTimer = null;
    }

    document.removeEventListener("click", this.boundCloseMenu);
    document.removeEventListener("click", this.boundCloseThemePanel);

    if (this.hasMenuTarget) {
      this.menuTarget.removeEventListener("click", this.boundPreventMenuHide);
    }

    if (this.hasThemePanelTarget) {
      this.themePanelTarget.removeEventListener("click",
        this.boundPreventThemeHide);
    }

    if (this.hasAttachmentSelectTarget) {
      this.attachmentSelectTarget.removeEventListener("mouseleave",
        this.boundCloseAttachmentSelect);
    }

    // 清理 emoji 预览
    if (this.cleanupEmojiPreview) {
      this.cleanupEmojiPreview();
    }

    document.removeEventListener("click", this._boundHideAttachmentSelect);


  }

  isRoom() {
    return this.currentWxidValue.endsWith("@chatroom");
  }

  handleScroll() {
    if (!this.hasShowMoreTarget) {
      return;
    }

    if (this.messageListTarget.scrollTop <= 0
      && this.messageListTarget.scrollHeight >= 100) {
      this.showMoreTarget.style.display = "block";
    } else {
      this.showMoreTarget.style.display = "none";
    }
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
        // Clear existing messages and add new ones to the Set
        // this.messages.clear();
        // data.forEach(msg => this.messages.add(msg));
        this.messages.merge(data)
        this.renderMessages();
      })
      .catch(error => console.error("加载消息失败:", error));
  }

  getMessageType(msg) {
    return msg.real_msg_type;
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
      return;
    }
    if (this.hasEmptyMessageTarget) {
      this.emptyMessageTarget.style.display = "none";
    }

    let lastSenderKey = null;

    // Convert Set to array and sort by message_time to maintain order
    // 这里在干嘛？
    // const sortedMessages = [...this.messages].sort((a, b) => {
    //   const timeA = a.message_time || a.created_at || a.wx_message?.message_time
    //     || 0;
    //   const timeB = b.message_time || b.created_at || b.wx_message?.message_time
    //     || 0;
    //   return new Date(timeA) - new Date(timeB);
    // });

    const sortedMessages = this.messages.all
    sortedMessages.forEach((wrapper) => {
      const msg = wrapper.wx_message;
      msg.id = wrapper.id;
      msg._messageId = wrapper.id;
      msg._cacheKey = wrapper.updated_at || wrapper.message_time
        || wrapper.created_at || msg.message_time;
      msg.referenced_message = wrapper.referenced_message;
      msg._sending = wrapper.sending;
      msg.extra = wrapper.extra;

      const senderInfo = this.lookupSenderInfo(msg, msg.content);
      msg.sender_name = senderInfo?.name;
      msg.sender_avatar = senderInfo?.avatar;
      msg.sender_initial = senderInfo?.initial;
      msg.sender_key = senderInfo?.key;

      const senderKey = msg.sender_key || (msg.self_send
        ? `self:${msg.to_user_name || 'me'}` : msg.from_user_name || "");
      const isNewGroup = lastSenderKey === null || lastSenderKey !== senderKey;
      lastSenderKey = senderKey;

      if (msg.real_msg_type == "file_transfer_start") {
        return
      }
      const row = this.buildRow(isNewGroup, msg, senderInfo);
      const bubble = this.renderMessageBubble(msg, isNewGroup, senderInfo,
        sortedMessages[0] === wrapper);
      row.appendChild(bubble);
      container.appendChild(row);

      this.renderStatus(wrapper, bubble, msg);
      this.addTimestamp(bubble, wrapper, msg);
    });

    if (bottomOffset !== null) {
      container.scrollTop = Math.max(container.scrollHeight - bottomOffset, 0);
    } else {
      container.scrollTop = container.scrollHeight;
    }
  }

  replaceRoomSenderWxid(msg) {
    if (this.chatMembers && msg.content) {
      const title_send_wxid = msg.content.match(/\w+:\n/)?.[0];
      if (title_send_wxid) {
        const wxid = title_send_wxid.slice(0, -2);
        const member_info = this.chatMembers.find(it => it.user_name === wxid);
        if (member_info) {
          msg.content = msg.content.replace(wxid + ":\n", "");
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

    if (!msg.self_send && this.isRoom()) {
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
    } else if (!msg.self_send) {
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
    } else {
      row.dataset.senderName = "我";
      delete row.dataset.senderAvatar;
    }

    return row;
  }

  renderMessageBubble(msg, isNewGroup, senderInfo, isFirstMessage) {
    const bubble = document.createElement("div");
    const type = this.getMessageType(msg);

    this.replaceRoomSenderWxid(msg);

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
      case "image":
        return this.renderImageMessage(bubble, msg, isNewGroup, senderInfo,
          isFirstMessage);
      case "video":
        return this.renderVideoMessage(bubble, msg, isNewGroup, senderInfo,
          isFirstMessage);
      case "file_message":
        return this.renderFileMessage(bubble, msg, isNewGroup, senderInfo,
          isFirstMessage);
      case "quote":
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

  renderImageMessage(bubble, msg, isNewGroup, senderInfo, isFirstMessage) {
    const template = this.cloneTemplate("message-template-image");
    const imageBubble = template || bubble;
    const wrapper = imageBubble.querySelector("[data-role='image-wrapper']");
    const placeholder = imageBubble.querySelector(
      "[data-role='image-placeholder']");
    const image = imageBubble.querySelector("[data-role='image']");

    if (wrapper && placeholder && image) {
      const resetPlaceholder = (message = "图片加载中…") => {
        placeholder.textContent = message;
        placeholder.classList.remove("hidden");
        image.classList.add("hidden");
        image.dataset.loaded = "false";
        wrapper.classList.remove("cursor-zoom-in");
      };

      resetPlaceholder();
      image.removeAttribute("src");

      const showImage = () => {
        placeholder.classList.add("hidden");
        image.classList.remove("hidden");
        image.dataset.loaded = "true";
        wrapper.classList.add("cursor-zoom-in");
      };

      const showFallback = (message) => {
        resetPlaceholder(message);
        image.removeAttribute("src");
      };

      image.addEventListener("load", showImage, { once: true });
      image.addEventListener("error", () => {
        showFallback("[图片加载失败]");
      }, { once: true });
      let imageUrl
      if (msg.self_send && msg._sending) {
        console.log("onSendImage Message: ", msg)
        imageUrl = msg.extra?.base64;
      } else {
        imageUrl = this.attachmentUrl("image", msg);
      }
      if (imageUrl) {
        requestAnimationFrame(() => {
          image.dataset.sourceUrl = imageUrl;
          image.src = imageUrl;
        });
      } else {
        showFallback("[暂不支持的图片]");
      }

      wrapper.addEventListener("click", (event) => {
        if (image.dataset.loaded === "true" && image.src) {
          event.stopPropagation();
          window.open(image.dataset.sourceUrl || image.src, "_blank",
            "noopener");
        }
      });
    }

    const applied = this.applyBubbleStyle(imageBubble, msg, isNewGroup,
      senderInfo, isFirstMessage);
    applied.dataset.bubbleType = "image";
    applied.style.background = "transparent";
    applied.style.border = "none";
    applied.style.boxShadow = "none";
    applied.style.padding = "6px";
    applied.style.paddingBottom = "32px";
    applied.classList.remove("text-white");
    applied.classList.add("inline-block");

    const senderName = applied.querySelector('[data-role="sender-name"]');
    if (senderName && wrapper) {
      wrapper.classList.add("mt-2");
    }

    return applied;
  }

  renderFileMessage(bubble, msg, isNewGroup, senderInfo, isFirstMessage) {
    const template = this.cloneTemplate("message-template-file");
    const fileBubble = template || bubble;
    const titleEl = fileBubble.querySelector("[data-role='file-title']");
    const metaEl = fileBubble.querySelector("[data-role='file-meta']");
    const extEl = fileBubble.querySelector("[data-role='file-ext']");
    const downloadLink = fileBubble.querySelector(
      "[data-role='file-download']");

    const fileInfo = this.parseWxFileAttachment(msg.content || "") || {};
    const title = fileInfo.title || msg.refer_title || msg.content || "文件";
    const sizeLabel = fileInfo.totallen ? this.formatFileSize(fileInfo.totallen)
      : "";
    const extLabel = fileInfo.fileext ? fileInfo.fileext.toUpperCase() : "FILE";

    if (titleEl) {
      titleEl.textContent = title;
    }
    if (metaEl) {
      metaEl.textContent = sizeLabel;
      metaEl.classList.toggle("hidden", !sizeLabel);
    }
    if (extEl) {
      extEl.textContent = extLabel;
    }

    const downloadUrl = this.attachmentUrl("file", msg);
    if (downloadLink && downloadUrl) {
      downloadLink.addEventListener("click", (event) => {
        event.preventDefault();
        this.downloadFile(downloadUrl, title);
      });
    } else if (downloadLink) {
      downloadLink.classList.add("opacity-60", "pointer-events-none");
    }

    return this.applyBubbleStyle(fileBubble, msg, isNewGroup, senderInfo,
      isFirstMessage);
  }

  renderVideoMessage(bubble, msg, isNewGroup, senderInfo, isFirstMessage) {
    const template = this.cloneTemplate("message-template-video");
    const videoBubble = template || bubble;
    const durationBadge = videoBubble.querySelector(
      "[data-role='video-duration']");
    const messageId = msg._messageId || msg.id;

    const videoInfo = this.parseWxVideoMessage(msg.content || "");
    if (durationBadge) {
      if (videoInfo?.playLength) {
        durationBadge.textContent = this.formatVideoDuration(
          videoInfo.playLength);
        durationBadge.classList.remove("hidden");
      } else {
        durationBadge.classList.add("hidden");
      }
    }

    const videoUrl = this.attachmentUrl("video", msg);
    if (videoUrl) {
      const videoElement = document.createElement("video");

      const video_a = document.createElement("a");
      video_a.href = videoUrl;
      video_a.textContent = "下载视频";

      videoElement.src = videoUrl;
      videoElement.controls = true;
      videoElement.style.maxWidth = "250px";
      videoElement.style.display = "block";
      videoElement.dataset.messageId = messageId;

      const thumbWrapper = videoBubble.querySelector(
        "[data-role='video-thumbnail']");
      if (thumbWrapper) {
        thumbWrapper.innerHTML = "";
        thumbWrapper.appendChild(videoElement);
      }

      videoElement.addEventListener("click", (event) => {
        event.stopPropagation();
        videoElement.play();
      });
    }

    const applied = this.applyBubbleStyle(videoBubble, msg, isNewGroup,
      senderInfo, isFirstMessage);
    applied.dataset.bubbleType = "video";
    applied.style.background = "transparent";
    applied.style.border = "none";
    applied.style.boxShadow = "none";
    applied.style.padding = "6px";
    applied.style.paddingBottom = "32px";
    applied.classList.remove("text-white");
    applied.classList.add("inline-block");

    return applied;
  }

  downloadFile(url, filename) {
    fetch(url, {
      headers: {
        "X-CSRF-Token": document.querySelector(
          'meta[name="csrf-token"]').content
      }
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`下载失败: ${res.statusText}`);
        }
        return res.blob();
      })
      .then((blob) => {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
      })
      .catch((err) => {
        console.error("下载文件失败:", err);
        alert("下载失败，请稍后重试");
      });
  }

  renderEmojiMessage(bubble, msg, isNewGroup, senderInfo, isFirstMessage) {
    const template = this.cloneTemplate("message-template-emoji");
    const emojiBubble = template || bubble;
    const content = emojiBubble.querySelector("[data-role='emoji-content']");

    if (content) {
      content.innerHTML = "";
      content.classList.add("flex", "items-center", "justify-center", "p-1");

      const placeholder = document.createElement("div");
      placeholder.className = "min-w-[3.75rem] min-h-[3.75rem] flex items-center justify-center text-[11px] text-slate-400 px-2";
      placeholder.textContent = "加载表情…";
      content.appendChild(placeholder);

      const image = document.createElement("img");
      image.loading = "lazy";
      image.decoding = "async";
      image.alt = "表情";
      image.referrerPolicy = "no-referrer";
      image.className = "max-w-[208px] max-h-[208px] object-contain select-none";
      image.style.userSelect = "none";
      image.classList.add("hidden");
      content.appendChild(image);

      const showImage = () => {
        placeholder.remove();
        image.classList.remove("hidden");
      };

      const showFallback = (message) => {
        image.remove();
        placeholder.textContent = message;
      };

      image.addEventListener("load", showImage, { once: true });
      image.addEventListener("error", () => {
        showFallback("[表情加载失败]");
      });

      const messageId = msg._messageId || msg.id;
      const cacheKey = msg._cacheKey;

      if (messageId) {
        const url = cacheKey
          ? `/message/emoji/${messageId}?t=${encodeURIComponent(cacheKey)}`
          : `/message/emoji/${messageId}`;
        requestAnimationFrame(() => {
          image.src = url;
        });
      } else {
        showFallback("[暂不支持的表情]");
      }
    }

    const applied = this.applyBubbleStyle(emojiBubble, msg, isNewGroup,
      senderInfo, isFirstMessage);
    applied.dataset.bubbleType = "emoji";
    applied.style.background = "transparent";
    applied.style.border = "none";
    applied.style.boxShadow = "none";
    applied.style.padding = "4px";
    applied.style.paddingBottom = "32px";
    applied.classList.remove("text-white", "text-gray-900", "border",
      "inline-flex", "items-center", "justify-center");
    applied.classList.add("inline-block");

    const senderName = applied.querySelector('[data-role="sender-name"]');
    if (senderName) {
      content.classList.add("mt-1");
    }
    return applied;
  }

  renderTextMessage(bubble, msg, isNewGroup, senderInfo, isFirstMessage) {
    const template = this.cloneTemplate("message-template-text");
    const textBubble = template || bubble;
    const inner = textBubble.querySelector("[data-role='content']");
    const content = msg.refer_title || msg.content || "";
    if (inner) {
      inner.innerHTML = "";

      // 先处理链接（如果 buildLinkedText 有链接处理功能）
      const tempDiv = document.createElement('div');
      tempDiv.appendChild(this.buildLinkedText(content));
      const linkProcessedContent = tempDiv.innerHTML;

      // 然后处理 emoji
      // 直接设置 HTML 内容
      inner.innerHTML = replaceEmojis(linkProcessedContent);
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

    if (progressBar) {
      progressBar.classList.remove("hidden");
      progressBar.style.background = "rgba(148,163,184,0.35)";
    }

    if (progressInner) {
      progressInner.style.background = msg.self_send
        ? this.theme.selfBubbleTextColor || "#ffffff" : "#6366f1";
      progressInner.style.transition = "width 120ms ease-out";
    }

    if (label) {
      const durationLabel = this.formatVoiceDuration(fallbackDuration);
      label.dataset.originalText = durationLabel;
      label.textContent = durationLabel;
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
    if (typeof pendingRatio === "number" && progressInner) {
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
      container.addEventListener("click",
        () => this.handleVoiceClick(msg.id, container, label, context));
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
      if (parsed.refContent) {
        quotedContent.textContent = parsed.refContent;
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
    }

    return this.applyBubbleStyle(referBubble, msg, isNewGroup, senderInfo,
      isFirstMessage);
  }

  applyBubbleStyle(bubble, msg, isNewGroup = true, senderInfo = null,
    isFirstMessage = false) {
    if (!bubble) {
      return bubble;
    }

    bubble.classList.add("relative", "inline-block", "rounded-2xl", "shadow-sm",
      "message-bubble");

    bubble.style.marginTop = isNewGroup ? "6px" : "";
    bubble.style.paddingBottom = "";

    bubble.classList.remove("bg-blue-500", "text-white", "rounded-bl-2xl",
      "rounded-tr-2xl", "rounded-br-md", "bg-white", "text-gray-900",
      "border", "border-gray-200", "rounded-br-2xl", "rounded-tl-2xl",
      "rounded-bl-md");

    bubble.style.background = "";
    bubble.style.color = "";
    bubble.style.border = "";
    bubble.style.boxShadow = "";
    delete bubble.dataset.senderType;

    if (msg.self_send) {
      bubble.dataset.senderType = "self";
      bubble.classList.add("text-white", "rounded-bl-2xl", "rounded-tr-2xl",
        "rounded-br-md");
      bubble.classList.remove("rounded-br-2xl", "rounded-tl-2xl",
        "rounded-bl-md");
      bubble.style.background = this.theme.selfBubbleColor;
      bubble.style.color = this.theme.selfBubbleTextColor;
      bubble.style.border = "none";
      bubble.style.boxShadow = "0 14px 32px -20px rgba(99,102,241,0.65)";
    } else {
      bubble.dataset.senderType = "other";
      bubble.classList.add("text-gray-900", "border", "rounded-br-2xl",
        "rounded-tl-2xl", "rounded-bl-md");
      bubble.classList.remove("rounded-bl-2xl", "rounded-tr-2xl",
        "rounded-br-md");
      bubble.style.background = this.theme.otherBubbleColor;
      bubble.style.color = "#111827";
      bubble.style.border = `1px solid ${this.theme.otherBubbleBorderColor}`;
      bubble.style.boxShadow = "0 12px 28px -22px rgba(2,6,23,0.45)";
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
    if (m.sending || msg._sending) {
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
        this.sendMessage("text");
      });
      bubble.appendChild(retry);
    }
  }

  addTimestamp(bubble, wrapper, msg = null) {
    const time = document.createElement("span");
    time.className = "absolute bottom-2 right-3 text-[10px] leading-none tracking-wide";
    const ts = wrapper.message_time || wrapper.created_at
      || wrapper.wx_message?.message_time;
    time.textContent = ts ? this.formatTimestamp(ts) : "";

    if (!bubble.dataset.timestampPrepared) {
      bubble.style.minWidth = bubble.style.minWidth || "140px";
      bubble.style.minHeight = bubble.style.minHeight || "52px";
      bubble.style.paddingBottom = bubble.style.paddingBottom || "28px";
      bubble.dataset.timestampPrepared = "true";
    }

    const isSelf = msg?.self_send;
    time.style.padding = "3px 8px";
    time.style.borderRadius = "9999px";
    time.style.background = isSelf ? "rgba(255,255,255,0.18)"
      : "rgba(15,23,42,0.08)";
    time.style.color = isSelf ? "rgba(255,255,255,0.85)"
      : "rgba(100,116,139,0.95)";
    time.style.boxShadow = isSelf ? "0 4px 12px -8px rgba(15,23,42,0.45)"
      : "0 4px 10px -8px rgba(15,23,42,0.25)";

    bubble.appendChild(time);
  }

  formatTimestamp(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }

    const now = new Date();
    const sameDay = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const sameYear = date.getFullYear() === now.getFullYear();

    const timePart = date.toLocaleTimeString("zh-Hans-CN", {
      hour: "2-digit", minute: "2-digit"
    });

    if (sameDay) {
      return timePart;
    }

    if (date.toDateString() === yesterday.toDateString()) {
      return `昨 ${timePart}`;
    }

    if (sameYear) {
      return date.toLocaleDateString("zh-Hans-CN", {
        month: "2-digit", day: "2-digit"
      }) + ` ${timePart}`;
    }

    return date.toLocaleDateString("zh-Hans-CN", {
      year: "2-digit", month: "2-digit", day: "2-digit"
    }) + ` ${timePart}`;
  }

  createSendMessage(type, message) {
    const tempId = "temp-" + Date.now();

    let tempMsg = {
      id: tempId,
      chat_room_id: this.idValue,
      message_time: new Date().toISOString(),
      sending: true,
      send_failed: false,
      wx_message: {
        msg_type: type,
        content: "",
        to_user_name: this.currentWxidValue,
        self_send: true,
        real_msg_type: type,
      }
    };

    if (type === "text") {
      const content = this.inputTarget.value
      tempMsg.wx_message.content = content;
      tempMsg.msg_type = 1;
      this.inputTarget.value = "";
    }
    if (type === "image") {
      tempMsg.msg_type = 3;
      tempMsg.wx_message.extra = {
        base64: message.extra?.base64,
      }
    }
    if (type === "file") {
      tempMsg.msg_type = 6;
      tempMsg.wx_message.real_msg_type = "file_message"
    }
    this.renderMessages();
    this.messages.add(tempMsg);
    this.autoResize();
    return tempMsg;

  }

  sendMessage(type, message) {
    const msg = this.createSendMessage(type, message);

    let body;
    let headers;
    if (type === "file") {
      const formData = new FormData();
      formData.append("chat_room_id", this.idValue);
      formData.append("msg_type", msg.msg_type);
      formData.append("content", msg.wx_message.content || "");
      formData.append("extra", JSON.stringify(msg.wx_message.extra || {}));
      formData.append("file", message.file);
      body = formData

      headers = {
        "X-CSRF-Token": document.querySelector(
          'meta[name="csrf-token"]').content
      }
    } else {
      body = JSON.stringify({
        chat_room_id: this.idValue,
        content: msg.wx_message.content,
        msg_type: msg.msg_type,
        extra: msg.wx_message.extra || {},
      })
      headers = {
        "Content-Type": "application/json",
        "X-CSRF-Token": document.querySelector(
          'meta[name="csrf-token"]').content
      }
    }

    fetch(`/chat_room/${this.idValue}/messages`, {
      method: "POST", headers: headers, body: body
    })
      .then(res => res.json())
      .then(newMsg => {
        if (newMsg?.data) {
          this.messages.remove(msg);
          this.messages.add(
            { ...newMsg.data, sending: false, send_failed: false });
          this.renderMessages();
        }
      })
      .catch(error => {
        this.messages.remove(msg);
        this.messages.add({ ...msg, sending: false, send_failed: true });
        this.renderMessages();
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
        "publisher > nickname")?.textContent?.trim() || xml.querySelector(
          "appname")?.textContent?.trim();
      const msgType = xml.querySelector("type")?.textContent?.trim() || 0;
      const refContent = xml.querySelector("refermsg")?.querySelector(
        "content")?.textContent.trim();
      return {
        type: "xml",
        title,
        desc,
        url,
        cover,
        source,
        msgType,
        refContent
      };
    } catch (e) {
      console.error("XML parse error:", e);
      return { type: "text", content: xmlString };
    }
  }

  parseWxVideoMessage(xmlString) {
    try {
      const parser = new DOMParser();
      const xml = parser.parseFromString(xmlString, "application/xml");
      const videoNode = xml.querySelector("videomsg");
      if (!videoNode) {
        return null;
      }
      return {
        playLength: Number(videoNode.getAttribute("playlength") || 0),
        thumbWidth: Number(videoNode.getAttribute("cdnthumbwidth") || 0),
        thumbHeight: Number(videoNode.getAttribute("cdnthumbheight") || 0)
      };
    } catch (error) {
      console.error("Video XML parse error:", error);
      return null;
    }
  }

  parseWxFileAttachment(xmlString) {
    try {
      const parser = new DOMParser();
      const xml = parser.parseFromString(xmlString, "application/xml");
      const appmsg = xml.querySelector("appmsg");
      if (!appmsg) {
        return null;
      }
      const type = Number(appmsg.querySelector("type")?.textContent || 0);
      if (type !== 6) {
        return null;
      }
      const attach = appmsg.querySelector("appattach");
      return {
        title: appmsg.querySelector("title")?.textContent?.trim() || "",
        totallen: Number(attach?.querySelector("totallen")?.textContent || 0),
        fileext: attach?.querySelector("fileext")?.textContent?.trim() || ""
      };
    } catch (error) {
      console.error("File XML parse error:", error);
      return null;
    }
  }

  attachmentUrl(type, msg, { cacheKey } = {}) {
    if (!msg) {
      return null;
    }
    const messageId = msg._messageId || msg.id;
    if (!messageId) {
      return null;
    }
    const resolvedKey = cacheKey === undefined ? msg._cacheKey : cacheKey;
    const base = `/message/${type}/${messageId}`;
    return resolvedKey ? `${base}?t=${encodeURIComponent(resolvedKey)}` : base;
  }

  toggleMenu(event) {
    event.stopPropagation();

    if (!this.hasMenuTarget) {
      return;
    }

    const shouldShow = this.menuTarget.classList.contains("hidden");
    if (shouldShow) {
      this.menuTarget.classList.remove("hidden");
      document.addEventListener("click", this.boundCloseMenu);
    } else {
      this.closeMenu();
    }
  }

  mouseenterAttachment(event) {
    event.stopPropagation(); // 防止冒泡导致其他事件触发

    if (this.attachmentSelectTarget.classList.contains("hidden")) {
      // 显示附件选择框
      this.attachmentSelectTarget.classList.remove("hidden");

      // 添加文档点击监听器
      setTimeout(() => {
        document.addEventListener("click", this._boundHideAttachmentSelect);
      }, 0);
    }
  }

  mouseleaveAttachment() {
    // 隐藏附件选择框
    if (!this.attachmentSelectTarget.classList.contains("hidden")) {
      this.attachmentSelectTarget.classList.add("hidden");

      // 移除文档点击监听器
      document.removeEventListener("click", this._boundHideAttachmentSelect);
    }
  }

  hideAttachmentSelect(event) {
    // 检查点击目标是否在附件选择框内，如果不在，则关闭附件选择框
    if (!this.attachmentSelectTarget.contains(event.target)) {
      this.mouseleaveAttachment();
    }
  }

  closeMenu(event = null) {
    if (!this.hasMenuTarget) {
      return;
    }

    if (event) {
      const target = event.target;
      if (this.menuTarget.contains(target)) {
        return;
      }
      if (this.hasThemePanelTarget && this.themePanelTarget.contains(target)) {
        return;
      }
    }

    if (!this.menuTarget.classList.contains("hidden")) {
      this.menuTarget.classList.add("hidden");
    }

    document.removeEventListener("click", this.boundCloseMenu);
  }

  handleMenuClose(event = null) {
    event?.stopPropagation();
    this.closeMenu();
  }

  openAppearanceSettings(event) {
    event.stopPropagation();
    this.closeMenu();

    if (!this.hasThemePanelTarget) {
      return;
    }

    this.themePanelTarget.classList.remove("hidden");
    this.syncThemeInputs();
    document.addEventListener("click", this.boundCloseThemePanel);
  }

  closeThemePanel(event = null) {
    if (!this.hasThemePanelTarget) {
      return;
    }
    if (!this.themePanelTarget.classList.contains("hidden")) {
      this.themePanelTarget.classList.add("hidden");
    }

    document.removeEventListener("click", this.boundCloseThemePanel);
  }

  updateBackgroundColor(event) {
    const value = event?.target?.value;
    if (!value) {
      return;
    }
    this.theme.backgroundColor = value;
    this.applyTheme();
  }

  updateBubbleColor(event) {
    const value = event?.target?.value;
    if (!value) {
      return;
    }
    this.theme.selfBubbleColor = value;
    this.applyTheme();
  }

  updateBackgroundImage(event) {
    const value = event?.target?.value ?? "";
    this.theme.backgroundImage = value.trim();
    this.applyTheme();
  }

  clearBackgroundImage(event) {
    event?.preventDefault();
    this.theme.backgroundImage = "";
    this.applyTheme();
    this.syncThemeInputs();
  }

  updateFontFamily(event) {
    const value = event?.target?.value ?? "inherit";
    if (value === "custom") {
      if (this.hasFontCustomInputTarget) {
        this.fontCustomInputTarget.focus();
      }
      return;
    }

    this.theme.fontFamily = value || "inherit";
    this.applyTheme({ refreshBubbles: false });
    if (this.hasFontCustomInputTarget) {
      this.fontCustomInputTarget.value = "";
    }
  }

  updateCustomFont(event) {
    const rawValue = event?.target?.value ?? "";
    const value = rawValue.trim();
    if (!value) {
      this.theme.fontFamily = "inherit";
      if (this.hasFontSelectTarget) {
        this.fontSelectTarget.value = "inherit";
      }
    } else {
      this.theme.fontFamily = value;
      if (this.hasFontSelectTarget) {
        this.fontSelectTarget.value = "custom";
      }
    }
    this.applyTheme({ refreshBubbles: false });
  }

  applyTheme({ refreshBubbles = true } = {}) {
    const backgroundColor = this.theme.backgroundColor || "#ffffff";
    const backgroundImage = this.theme.backgroundImage || "";
    const fontFamily = this.theme.fontFamily || "inherit";

    const resolveBackgroundImage = (image) => {
      if (!image) {
        return "";
      }
      const trimmed = image.trim();
      if (!trimmed) {
        return "";
      }
      if (/^url\(/i.test(trimmed)) {
        return trimmed;
      }
      const sanitized = trimmed.replace(/"/g, "'");
      return `url("${sanitized}")`;
    };

    const backgroundImageValue = resolveBackgroundImage(backgroundImage);

    if (this.element) {
      this.element.style.backgroundColor = backgroundColor;
      if (backgroundImageValue) {
        this.element.style.backgroundImage = backgroundImageValue;
        this.element.style.backgroundSize = "cover";
        this.element.style.backgroundRepeat = "no-repeat";
        this.element.style.backgroundPosition = "center";
      } else {
        this.element.style.backgroundImage = "";
      }
      this.element.style.fontFamily = fontFamily;
    }

    if (this.hasMessageListTarget) {
      const list = this.messageListTarget;
      if (backgroundImageValue) {
        list.style.backgroundColor = "transparent";
        list.style.backgroundImage = backgroundImageValue;
        list.style.backgroundSize = "cover";
        list.style.backgroundRepeat = "no-repeat";
        list.style.backgroundAttachment = "fixed";
        list.style.backgroundPosition = "center";
      } else {
        list.style.backgroundColor = backgroundColor;
        list.style.backgroundImage = "";
        list.style.backgroundAttachment = "";
        list.style.backgroundSize = "";
        list.style.backgroundRepeat = "";
        list.style.backgroundPosition = "";
      }
      list.style.fontFamily = fontFamily;
    }

    if (refreshBubbles) {
      this.refreshBubbleStyles();
    }
  }

  refreshBubbleStyles() {
    if (!this.hasMessageListTarget) {
      return;
    }
    const bubbles = this.messageListTarget.querySelectorAll(".message-bubble");
    bubbles.forEach((bubble) => {
      if (["emoji", "image", "video"].includes(bubble.dataset.bubbleType)) {
        bubble.style.background = "transparent";
        bubble.style.border = "none";
        bubble.style.boxShadow = "none";
        bubble.classList.remove("text-white");
        return;
      }
      const senderType = bubble.dataset.senderType;
      if (senderType === "self") {
        bubble.style.background = this.theme.selfBubbleColor;
        bubble.style.color = this.theme.selfBubbleTextColor;
        bubble.style.border = "none";
        bubble.classList.add("text-white");
        const progressInner = bubble.querySelector(
          '[data-role="voice-progress-inner"]');
        if (progressInner) {
          progressInner.style.background = this.theme.selfBubbleTextColor
            || "#ffffff";
        }
      } else {
        bubble.style.background = this.theme.otherBubbleColor;
        bubble.style.color = "#111827";
        bubble.style.border = `1px solid ${this.theme.otherBubbleBorderColor}`;
        bubble.classList.remove("text-white");
        const progressInner = bubble.querySelector(
          '[data-role="voice-progress-inner"]');
        if (progressInner) {
          progressInner.style.background = "#6366f1";
        }
      }
    });
  }

  syncThemeInputs() {
    if (this.hasBackgroundInputTarget && this.backgroundInputTarget.value
      !== this.theme.backgroundColor) {
      this.backgroundInputTarget.value = this.theme.backgroundColor;
    }
    if (this.hasBubbleInputTarget && this.bubbleInputTarget.value
      !== this.theme.selfBubbleColor) {
      this.bubbleInputTarget.value = this.theme.selfBubbleColor;
    }
    if (this.hasBackgroundImageInputTarget) {
      this.backgroundImageInputTarget.value = this.theme.backgroundImage || "";
    }
    const fontValue = this.theme.fontFamily || "inherit";
    const presetFonts = new Set(["inherit",
      '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
      '"Source Han Serif SC", "Songti SC", serif', '"LXGW WenKai", cursive',
      '"JetBrains Mono", monospace']);
    if (this.hasFontSelectTarget) {
      if (presetFonts.has(fontValue)) {
        this.fontSelectTarget.value = fontValue;
      } else {
        this.fontSelectTarget.value = "custom";
      }
    }
    if (this.hasFontCustomInputTarget) {
      this.fontCustomInputTarget.value = presetFonts.has(fontValue) || fontValue
        === "inherit" ? "" : fontValue;
    }
  }

  syncMembers(event = null) {
    event?.stopPropagation();
    this.closeMenu();
    fetch(`/chat_room/${this.idValue}/sync_chat_members`, {
      method: "PUT", headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": document.querySelector(
          'meta[name="csrf-token"]').content
      },
      body: JSON.stringify({
        chat_room_id: this.idValue,
      })
    });
  }

  syncContact(event = null) {
    event?.stopPropagation();
    fetch(`/chat_room/${this.idValue}/sync_chat_contact`, {
      method: "PUT", headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": document.querySelector(
          'meta[name="csrf-token"]').content
      }, body: JSON.stringify({
        chat_room_id: this.idValue,
      })
    });
  }

  loadMore() {
    if (this.messages.length === 0) {
      return;
    }

    // Get the earliest message by sorting and taking the first
    // const sortedMessages = [...this.messages].sort((a, b) => {
    //   const timeA = a.message_time || a.created_at || a.wx_message?.message_time
    //     || 0;
    //   const timeB = b.message_time || b.created_at || b.wx_message?.message_time
    //     || 0;
    //   return new Date(timeA) - new Date(timeB);
    // });
    const firstMsg = this.messages.at(0);
    const firstMsgId = firstMsg.id;
    const container = this.messageListTarget;
    const preserveBottomOffset = container.scrollHeight - container.scrollTop;

    fetch(`/chat_room/${this.idValue}/messages?before_id=${firstMsgId}`)
      .then(res => res.json())
      .then(data => {
        if (!data.length) {
          return;
        }

        // Add new messages to the Set
        data.forEach(msg => this.messages.add(msg));
        this.renderMessages({ preserveBottomOffset });
      })
      .catch(console.error);
  }

  loadNewMessages(msg) {
    if (this.messages.size === 0) {
      return this.loadMessages();
    }

    const container = this.messageListTarget;
    const oldHeight = container.scrollHeight;

    // Get the latest message by sorting and taking the last
    // const sortedMessages = [...this.messages].sort((a, b) => {
    //   const timeA = a.message_time || a.created_at || a.wx_message?.message_time
    //     || 0;
    //   const timeB = b.message_time || b.created_at || b.wx_message?.message_time
    //     || 0;
    //   return new Date(timeA) - new Date(timeB);
    // });
    const sortedMessages = this.messages
    const lastMsg = sortedMessages.at(sortedMessages.length - 1);
    const lastMsgId = lastMsg.id;

    fetch(`/chat_room/${this.idValue}/messages?after_id=${lastMsgId}`)
      .then(res => res.json())
      .then(data => {
        if (!data.length) {
          return;
        }

        // Add new messages to the Set
        this.messages.merge(data)
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
      messageId, progressBar, progressInner, fallbackDuration, speedButton,
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
      if (progressInner) {
        progressInner.style.width = `${Math.min(Math.max(ratio, 0), 1) * 100}%`;
      }
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
        ? audio.duration : fallbackDuration;
      if (duration > 0 && progressInner) {
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
        if (progressInner) {
          progressInner.style.width = `${clamped * 100}%`;
        }
        this.pendingVoiceSeeks.delete(messageId);
      } else {
        if (progressInner) {
          progressInner.style.width = `${clamped * 100}%`;
        }
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

    audio.addEventListener("loadedmetadata", startTracking, { once: true });
    audio.addEventListener("play", startTracking, { once: true });
    audio.addEventListener("ended", cleanup, { once: true });

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
    const { progressBar, progressInner } = context;
    const rect = progressBar.getBoundingClientRect();
    if (!rect.width) {
      return;
    }

    const ratio = Math.min(
      Math.max((event.clientX - rect.left) / rect.width, 0), 1);
    if (progressInner) {
      progressInner.style.width = `${ratio * 100}%`;
    }
    this.pendingVoiceSeeks.set(messageId, ratio);

    if (this.currentVoicePlayback?.messageId !== messageId) {
      return;
    }

    const activeState = this.currentVoicePlayback;
    const { audio } = activeState;
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
      audio.addEventListener("loadedmetadata", apply, { once: true });
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

  formatVoiceDuration(seconds) {
    const safe = Math.max(1, Math.round(Number(seconds) || 0));
    if (safe >= 60) {
      const minutes = Math.floor(safe / 60);
      const remaining = safe % 60;
      return `${minutes}:${String(remaining).padStart(2, "0")}`;
    }
    return `${safe}″`;
  }

  formatVideoDuration(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const minutes = Math.floor(total / 60);
    const remaining = total % 60;
    return minutes > 0 ? `${minutes}:${String(remaining).padStart(2, "0")}`
      : `${remaining}s`;
  }

  formatFileSize(bytes) {
    const size = Number(bytes);
    if (!Number.isFinite(size) || size <= 0) {
      return "";
    }
    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = size;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }
    const precision = value >= 10 || unitIndex === 0 ? 0 : 1;
    return `${value.toFixed(precision)}${units[unitIndex]}`;
  }

  stopCurrentVoicePlayback() {
    if (!this.currentVoicePlayback) {
      return;
    }
    const { audio, cleanup } = this.currentVoicePlayback;
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

    row.scrollIntoView({ behavior: "smooth", block: "center" });
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
  }

  humanizeMessageType(msgType) {
    const mapping = {
      text: "文本",
      image: "图片",
      voice: "语音",
      video: "视频",
      file: "文件",
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

  lookupSenderInfo(msg, rawContent = "") {
    if (msg.sender_key && msg.sender_name) {
      return {
        key: msg.sender_key,
        name: msg.sender_name,
        avatar: msg.sender_avatar || "",
        initial: (msg.sender_initial || msg.sender_name.slice(0, 1)
          || "?").toUpperCase()
      };
    }

    if (msg.self_send) {
      return {
        key: `self:${msg.to_user_name || 'me'}`,
        name: "我",
        avatar: null,
        initial: "我"
      };
    }

    if (this.isRoom()) {
      let wxid = null;
      if (msg.from_user_name && !msg.from_user_name.endsWith("@chatroom")) {
        wxid = msg.from_user_name;
      }
      if (!wxid) {
        const match = (rawContent || msg.content || "").match(/^([^:\n]+):\n/);
        wxid = match ? match[1] : null;
      }
      wxid = wxid || msg.to_user_name || msg.from_user_name;
      const member = this.chatMembers?.find(m => m.user_name === wxid);
      const name = member?.remark || member?.nick_name || wxid;
      const avatar = member?.small_head_img_url || "";
      const initial = (name || wxid || "?").slice(0, 1).toUpperCase();
      return {
        key: `room:${wxid}`, name, avatar, initial
      };
    }

    const wxid = msg.from_user_name || msg.to_user_name || "contact";
    const name = wxid;
    return {
      key: `direct:${wxid}`,
      name,
      avatar: null,
      initial: (name || "?").slice(0, 1).toUpperCase()
    };
  }

  openFilePicker(event) {
    const uploadType = event.currentTarget.dataset.uploadTypeParam; // 获取按钮上的参数
    console.debug("openFilePicker:", event.currentTarget, uploadType);
    this.currentUploadType = uploadType;
    let acceptTypes;

    // 根据 uploadType 设置文件类型
    if (uploadType === "image") {
      acceptTypes = "image/*";
    } else if (uploadType === "document") {
      acceptTypes = "application/pdf,application/msword";
    }

    this.fileInputTarget.accept = acceptTypes;
    this.fileInputTarget.click();
  }

  async handleFileSelect(event) {
    const uploadType = this.currentUploadType
    const file = event.target.files[0];
    if (file) {
      let sendMsg = { extra: {} }
      if (uploadType === "image") {
        sendMsg.extra.base64 = await get_file_base64(file);
      }
      if (uploadType === "file") {
        sendMsg.file = file
      }
      console.debug("handleFileSelect", uploadType, sendMsg)
      this.sendMessage(uploadType, sendMsg)
    }

  }

}
