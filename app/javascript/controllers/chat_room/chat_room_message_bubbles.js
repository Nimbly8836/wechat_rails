import { replaceEmojis } from "utils/file_utils";

const EMOJI_REQUEST_VERSION = "20260330b";

export function buildMessageGroup(controller, msg, senderInfo) {
  const group = document.createElement("div");
  if (controller.isSystemNoticeMessage(msg)) {
    group.className = "tg-message-group w-full flex justify-center";
    group.style.marginTop = "10px";

    const stack = document.createElement("div");
    stack.className = "tg-message-group-stack flex w-full min-w-0 flex-col items-center";
    group.appendChild(stack);
    return { group, stack };
  }

  group.className = `tg-message-group w-full flex ${msg.self_send ? "justify-end" : "justify-start"} items-end`;
  group.style.marginTop = msg._startsGroup ? "8px" : "2px";

  const stack = document.createElement("div");
  stack.className = "tg-message-group-stack flex min-w-0 flex-col";

  if (!msg.self_send && controller.isRoom()) {
    const avatarLane = document.createElement("div");
    avatarLane.className = "tg-message-avatar-lane mr-2 flex justify-center";
    avatarLane.style.width = "3rem";

    const senderName = senderInfo?.name || msg.sender_name || "";
    const senderAvatar = senderInfo?.avatar || msg.sender_avatar || "";
    group.dataset.senderName = senderName;
    if (senderAvatar) {
      group.dataset.senderAvatar = senderAvatar;
    } else {
      delete group.dataset.senderAvatar;
    }

    const avatar = document.createElement("div");
    avatar.className = "tg-message-avatar-sticky w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden";

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

    avatarLane.appendChild(avatar);
    group.appendChild(avatarLane);
    group.appendChild(stack);
    return { group, stack };
  }

  const senderName = senderInfo?.name || msg.sender_name || (msg.self_send ? "我" : "");
  const senderAvatar = senderInfo?.avatar || msg.sender_avatar || "";
  if (senderName) {
    group.dataset.senderName = senderName;
  }
  if (senderAvatar) {
    group.dataset.senderAvatar = senderAvatar;
  } else {
    delete group.dataset.senderAvatar;
  }

  group.appendChild(stack);
  return { group, stack };
}

export function buildRow(controller, msg, senderInfo) {
  const row = document.createElement("div");
  if (controller.isSystemNoticeMessage(msg)) {
    row.className = "group w-full flex justify-center";
    if (msg.id) {
      row.dataset.messageId = msg.id;
    }
    row.dataset.senderName = "系统通知";
    delete row.dataset.senderAvatar;
    return row;
  }

  row.className = `group w-full flex ${msg.self_send ? "justify-end" : "justify-start"} items-end gap-2`;
  if (msg.id) {
    row.dataset.messageId = msg.id;
  }

  if (!msg.self_send) {
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

export function buildQuoteActionButton(controller, wrapper, msg, senderInfo) {
  if (!wrapper?.id || String(wrapper.id).startsWith("temp-") || msg?._sending || controller.isSystemNoticeMessage(msg)) {
    return null;
  }

  const button = document.createElement("button");
  button.type = "button";
  button.className = "pointer-events-none opacity-0 transition rounded-full border border-slate-200 bg-white/95 px-2 py-1 text-[11px] text-slate-500 shadow-sm group-hover:pointer-events-auto group-hover:opacity-100 hover:border-sky-200 hover:text-sky-700";
  button.textContent = "引用";
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    controller.startQuoteMessage(wrapper, msg, senderInfo);
  });
  return button;
}

export function renderMessageBubble(controller, msg, isNewGroup, senderInfo, isFirstMessage) {
  const bubble = document.createElement("div");
  const type = controller.getMessageType(msg);

  controller.replaceRoomSenderWxid(msg);

  switch (type) {
    case "voice":
      return renderVoiceMessage(controller, bubble, msg, isNewGroup, senderInfo, isFirstMessage);
    case "voip":
      return renderVoipMessage(controller, bubble, msg, isNewGroup, senderInfo, isFirstMessage);
    case "video_account":
      return renderVideoAccountMessage(controller, bubble, msg, isNewGroup, senderInfo, isFirstMessage);
    case "chat_history":
      return renderChatHistoryMessage(controller, bubble, msg, isNewGroup, senderInfo, isFirstMessage);
    case "card":
      return renderCardMessage(controller, bubble, msg, isNewGroup, senderInfo, isFirstMessage);
    case "refer": {
      const parsed = controller.parseWxXmlMessage(msg.content || "");
      if (parsed.title || parsed.desc || parsed.cover || parsed.url) {
        return renderCardMessage(controller, bubble, msg, isNewGroup, senderInfo, isFirstMessage);
      }
      return renderXmlMessage(controller, bubble, msg, isNewGroup, senderInfo, isFirstMessage);
    }
    case "xml_unparsed":
      return renderXmlMessage(controller, bubble, msg, isNewGroup, senderInfo, isFirstMessage);
    case "emoji":
      return renderEmojiMessage(controller, bubble, msg, isNewGroup, senderInfo, isFirstMessage);
    case "image":
      return renderImageMessage(controller, bubble, msg, isNewGroup, senderInfo, isFirstMessage);
    case "video":
      return renderVideoMessageAttachment(controller, bubble, msg, isNewGroup, senderInfo, isFirstMessage);
    case "file_message":
      return renderFileMessage(controller, bubble, msg, isNewGroup, senderInfo, isFirstMessage);
    case "quote":
      return renderReferMessage(controller, bubble, msg, isNewGroup, senderInfo, isFirstMessage);
    case "system_notice":
      return renderSystemNoticeMessage(controller, bubble, msg, isNewGroup, senderInfo, isFirstMessage);
    case "text":
    default:
      return renderTextMessage(controller, bubble, msg, isNewGroup, senderInfo, isFirstMessage);
  }
}

export function renderCardMessage(controller, bubble, msg, isNewGroup, senderInfo, isFirstMessage) {
  const template = controller.cloneTemplate("message-template-card");
  const cardBubble = template || bubble;
  const parsed = controller.cardPayloadFor(msg);
  const link = cardBubble.querySelector("[data-role='card-link']");
  const cover = cardBubble.querySelector("[data-role='card-cover']");
  const title = cardBubble.querySelector("[data-role='card-title']");
  const desc = cardBubble.querySelector("[data-role='card-desc']");
  const source = cardBubble.querySelector("[data-role='card-source']");
  const parsedUrl = controller.payloadValue(parsed, "url");
  const parsedCover = controller.payloadValue(parsed, "cover");
  const parsedTitle = controller.payloadValue(parsed, "title");
  const parsedDesc = controller.payloadValue(parsed, "desc");
  const parsedSource = controller.payloadValue(parsed, "source");

  if (link) {
    if (parsedUrl) {
      link.href = parsedUrl;
    } else {
      link.removeAttribute("href");
      link.classList.add("pointer-events-none");
    }
  }
  if (cover) {
    cover.innerHTML = parsedCover ? `<img src="${parsedCover}" class="max-h-48 w-full object-cover" referrerpolicy="no-referrer"/>` : "";
  }
  if (title) title.textContent = parsedTitle || "";
  if (desc) desc.textContent = parsedDesc || "";
  if (source) source.textContent = parsedSource ? `来自：${parsedSource}` : "";

  return controller.applyBubbleStyle(cardBubble, msg, isNewGroup, senderInfo, isFirstMessage);
}

export function renderVoipMessage(controller, bubble, msg, isNewGroup, senderInfo, isFirstMessage) {
  const template = controller.cloneTemplate("message-template-voip");
  const voipBubble = template || bubble;
  const parsed = controller.voipPayloadFor(msg);
  const title = voipBubble.querySelector("[data-role='voip-title']");
  const meta = voipBubble.querySelector("[data-role='voip-meta']");

  if (title) title.textContent = parsed.title || "微信通话";
  if (meta) meta.textContent = parsed.summary || "通话消息";

  return controller.applyBubbleStyle(voipBubble, msg, isNewGroup, senderInfo, isFirstMessage);
}

export function renderVideoAccountMessage(controller, bubble, msg, isNewGroup, senderInfo, isFirstMessage) {
  const template = controller.cloneTemplate("message-template-video-account");
  const accountBubble = template || bubble;
  const parsed = controller.cardPayloadFor(msg);
  const link = accountBubble.querySelector("[data-role='video-account-link']");
  const coverShell = accountBubble.querySelector("[data-role='video-account-cover-shell']");
  const cover = accountBubble.querySelector("[data-role='video-account-cover']");
  const title = accountBubble.querySelector("[data-role='video-account-title']");
  const desc = accountBubble.querySelector("[data-role='video-account-desc']");
  const source = accountBubble.querySelector("[data-role='video-account-source']");
  const duration = accountBubble.querySelector("[data-role='video-account-duration']");

  const targetUrl = controller.payloadValue(parsed, "url") || controller.payloadValue(parsed, "media_url", "mediaUrl") || "";
  if (link) {
    if (targetUrl) link.href = targetUrl;
    else {
      link.removeAttribute("href");
      link.classList.add("pointer-events-none");
    }
  }

  if (coverShell && cover) {
    const parsedCover = controller.payloadValue(parsed, "cover");
    if (parsedCover) {
      cover.addEventListener("load", () => controller.stickToBottomIfNeeded(), { once: true });
      cover.src = parsedCover;
      cover.classList.remove("hidden");
    } else {
      coverShell.classList.add("hidden");
    }
  }

  if (title) title.textContent = controller.payloadValue(parsed, "title") || "视频号分享";
  if (desc) {
    const parsedDesc = controller.payloadValue(parsed, "desc") || "";
    desc.textContent = parsedDesc;
    desc.classList.toggle("hidden", !parsedDesc);
  }
  if (source) source.textContent = controller.payloadValue(parsed, "source") || "视频号";
  if (duration) {
    const durationSeconds = Number(controller.payloadValue(parsed, "duration_seconds", "durationSeconds") || 0);
    if (durationSeconds) {
      duration.textContent = controller.formatVideoDuration(durationSeconds);
      duration.classList.remove("hidden");
    } else {
      duration.classList.add("hidden");
    }
  }

  return controller.applyBubbleStyle(accountBubble, msg, isNewGroup, senderInfo, isFirstMessage);
}

export function renderChatHistoryMessage(controller, bubble, msg, isNewGroup, senderInfo, isFirstMessage) {
  const template = controller.cloneTemplate("message-template-chat-history");
  const historyBubble = template || bubble;
  const title = historyBubble.querySelector("[data-role='history-title']");
  const desc = historyBubble.querySelector("[data-role='history-desc']");
  const items = historyBubble.querySelector("[data-role='history-items']");
  const footer = historyBubble.querySelector("[data-role='history-footer']");
  const parsed = controller.chatHistoryPayloadFor(msg);

  if (title) title.textContent = parsed.title || "聊天记录";
  if (desc) {
    desc.textContent = parsed.desc || "";
    desc.classList.toggle("hidden", !parsed.desc);
  }
  if (items) {
    items.innerHTML = "";
    parsed.items.slice(0, 4).forEach((item) => {
      const row = document.createElement("div");
      row.className = "rounded-xl bg-slate-50 px-3 py-2";
      const meta = document.createElement("div");
      meta.className = "text-[11px] text-slate-500";
      meta.textContent = item.senderName ? `${item.senderName}${item.time ? ` · ${item.time}` : ""}` : (item.time || "");
      const content = document.createElement("div");
      content.className = "mt-0.5 text-sm text-slate-800 whitespace-pre-wrap break-words";
      content.textContent = item.content || `[${controller.humanizeMessageType(item.type)}]`;
      if (meta.textContent) row.appendChild(meta);
      row.appendChild(content);
      items.appendChild(row);
    });
    items.classList.toggle("hidden", parsed.items.length === 0);
  }
  if (footer) {
    const extraCount = parsed.count > parsed.items.length ? `等 ${parsed.count} 条记录` : (parsed.count > 0 ? `共 ${parsed.count} 条记录` : "");
    footer.textContent = extraCount;
    footer.classList.toggle("hidden", !extraCount);
  }

  return controller.applyBubbleStyle(historyBubble, msg, isNewGroup, senderInfo, isFirstMessage);
}

export function renderXmlMessage(controller, bubble, msg, isNewGroup, senderInfo, isFirstMessage) {
  const template = controller.cloneTemplate("message-template-xml");
  const xmlBubble = template || bubble;
  const wrapper = xmlBubble.querySelector("[data-role='xml-content']");
  const toggle = xmlBubble.querySelector("[data-role='xml-toggle']");
  if (wrapper) wrapper.textContent = msg.content || "";
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
  return controller.applyBubbleStyle(xmlBubble, msg, isNewGroup, senderInfo, isFirstMessage);
}

export function renderImageMessage(controller, bubble, msg, isNewGroup, senderInfo, isFirstMessage) {
  const template = controller.cloneTemplate("message-template-image");
  const imageBubble = template || bubble;
  const wrapper = imageBubble.querySelector("[data-role='image-wrapper']");
  const placeholder = imageBubble.querySelector("[data-role='image-placeholder']");
  const image = imageBubble.querySelector("[data-role='image']");

  if (wrapper && placeholder && image) {
    const resetPlaceholder = (message = "图片加载中…") => {
      placeholder.textContent = message;
      placeholder.classList.remove("hidden");
      image.classList.add("hidden");
      image.dataset.loaded = "false";
      image.dataset.sourceUrl = "";
      wrapper.classList.remove("cursor-zoom-in");
      wrapper.removeAttribute("role");
      wrapper.removeAttribute("tabindex");
    };
    resetPlaceholder();
    image.removeAttribute("src");
    const showImage = () => {
      placeholder.classList.add("hidden");
      image.classList.remove("hidden");
      image.dataset.loaded = "true";
      controller.stickToBottomIfNeeded();
    };
    const showFallback = (message) => { resetPlaceholder(message); image.removeAttribute("src"); };
    image.addEventListener("load", showImage, { once: true });
    image.addEventListener("error", () => { showFallback("[图片加载失败]"); }, { once: true });
    const openPreview = () => {
      if (image.dataset.loaded !== "true") return;
      const previewUrl = image.dataset.sourceUrl || image.currentSrc || image.src;
      if (!previewUrl) return;
      controller.openMediaPreview({ src: previewUrl, title: controller.buildMediaPreviewTitle(msg, "图片预览"), meta: "Esc 关闭" });
    };
    wrapper.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); openPreview(); });
    wrapper.addEventListener("keydown", (event) => { if (event.key !== "Enter" && event.key !== " ") return; event.preventDefault(); openPreview(); });
    let imageUrl;
    if (msg.self_send && msg._sending) imageUrl = msg.extra?.base64;
    else imageUrl = controller.attachmentUrl("image", msg);
    if (imageUrl) {
      wrapper.classList.add("cursor-zoom-in");
      wrapper.setAttribute("role", "button");
      wrapper.setAttribute("tabindex", "0");
      requestAnimationFrame(() => { image.dataset.sourceUrl = imageUrl; image.src = imageUrl; });
    } else {
      showFallback("[暂不支持的图片]");
    }
  }

  const applied = controller.applyBubbleStyle(imageBubble, msg, isNewGroup, senderInfo, isFirstMessage);
  applied.dataset.bubbleType = "image";
  applied.dataset.tail = "false";
  applied.style.background = "transparent";
  applied.style.border = "none";
  applied.style.boxShadow = "none";
  applied.style.padding = "6px";
  applied.style.paddingBottom = "32px";
  applied.classList.remove("text-white");
  applied.classList.add("inline-block");
  const senderName = applied.querySelector('[data-role="sender-name"]');
  if (senderName && wrapper) wrapper.classList.add("mt-2");
  return applied;
}

export function renderFileMessage(controller, bubble, msg, isNewGroup, senderInfo, isFirstMessage) {
  const template = controller.cloneTemplate("message-template-file");
  const fileBubble = template || bubble;
  const titleEl = fileBubble.querySelector("[data-role='file-title']");
  const metaEl = fileBubble.querySelector("[data-role='file-meta']");
  const extEl = fileBubble.querySelector("[data-role='file-ext']");
  const downloadLink = fileBubble.querySelector("[data-role='file-download']");
  const fileInfo = controller.filePayloadFor(msg);
  const title = fileInfo.title || msg.refer_title || msg.content || "文件";
  const sizeLabel = fileInfo.totallen ? controller.formatFileSize(fileInfo.totallen) : "";
  const extLabel = fileInfo.fileext ? fileInfo.fileext.toUpperCase() : "FILE";
  if (titleEl) titleEl.textContent = title;
  if (metaEl) { metaEl.textContent = sizeLabel; metaEl.classList.toggle("hidden", !sizeLabel); }
  if (extEl) extEl.textContent = extLabel;
  const downloadUrl = controller.attachmentUrl("file", msg);
  if (downloadLink && downloadUrl) {
    downloadLink.addEventListener("click", (event) => { event.preventDefault(); controller.downloadFile(downloadUrl, title); });
  } else if (downloadLink) {
    downloadLink.classList.add("opacity-60", "pointer-events-none");
  }
  return controller.applyBubbleStyle(fileBubble, msg, isNewGroup, senderInfo, isFirstMessage);
}

export function renderVideoMessageAttachment(controller, bubble, msg, isNewGroup, senderInfo, isFirstMessage) {
  const template = controller.cloneTemplate("message-template-video");
  const videoBubble = template || bubble;
  const durationBadge = videoBubble.querySelector("[data-role='video-duration']");
  const messageId = msg._messageId || msg.id;
  const videoInfo = controller.parseWxVideoMessage(msg.content || "");
  if (durationBadge) {
    if (videoInfo?.playLength) {
      durationBadge.textContent = controller.formatVideoDuration(videoInfo.playLength);
      durationBadge.classList.remove("hidden");
    } else {
      durationBadge.classList.add("hidden");
    }
  }

  const videoUrl = controller.attachmentUrl("video", msg);
  if (videoUrl) {
    const videoElement = document.createElement("video");
    videoElement.src = videoUrl;
    videoElement.controls = true;
    videoElement.playsInline = true;
    videoElement.disablePictureInPicture = true;
    videoElement.style.maxWidth = "250px";
    videoElement.style.display = "block";
    videoElement.dataset.messageId = messageId;
    const thumbWrapper = videoBubble.querySelector("[data-role='video-thumbnail']");
    if (thumbWrapper) {
      thumbWrapper.innerHTML = "";
      thumbWrapper.appendChild(videoElement);
    }
    videoElement.addEventListener("click", (event) => { event.stopPropagation(); videoElement.play(); });
    videoElement.addEventListener("loadedmetadata", () => { controller.stickToBottomIfNeeded(); }, { once: true });
  }

  const applied = controller.applyBubbleStyle(videoBubble, msg, isNewGroup, senderInfo, isFirstMessage);
  applied.dataset.bubbleType = "video";
  applied.dataset.tail = "false";
  applied.style.background = "transparent";
  applied.style.border = "none";
  applied.style.boxShadow = "none";
  applied.style.padding = "6px";
  applied.style.paddingBottom = "32px";
  applied.classList.remove("text-white");
  applied.classList.add("inline-block");
  return applied;
}

export function downloadFile(controller, url, filename) {
  fetch(url, { headers: { "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]').content } })
    .then((res) => { if (!res.ok) throw new Error(`下载失败: ${res.statusText}`); return res.blob(); })
    .then((blob) => {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    })
    .catch((err) => { console.error("下载文件失败:", err); alert("下载失败，请稍后重试"); });
}

export function renderEmojiMessage(controller, bubble, msg, isNewGroup, senderInfo, isFirstMessage) {
  const template = controller.cloneTemplate("message-template-emoji");
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
    image.loading = "eager";
    image.decoding = "async";
    image.alt = "表情";
    image.referrerPolicy = "no-referrer";
    image.className = "max-w-[208px] max-h-[208px] object-contain select-none opacity-0 transition-opacity duration-150";
    image.style.userSelect = "none";
    image.style.cursor = "zoom-in";
    image.setAttribute("role", "button");
    image.setAttribute("tabindex", "0");
    content.appendChild(image);
    const showImage = () => { placeholder.remove(); image.classList.remove("opacity-0"); };
    const showFallback = (message) => { image.remove(); placeholder.textContent = message; };
    image.addEventListener("load", showImage, { once: true });
    image.addEventListener("click", (event) => { event.stopPropagation(); const previewUrl = image.currentSrc || image.src; if (!previewUrl) return; controller.openMediaPreview({ src: previewUrl, title: controller.buildMediaPreviewTitle(msg, "表情预览"), meta: "Esc 关闭" }); });
    image.addEventListener("keydown", (event) => { if (event.key !== "Enter" && event.key !== " ") return; event.preventDefault(); image.click(); });
    const sources = emojiRenderSourcesFor(controller, msg);
    let currentSourceIndex = -1;
    const loadNextSource = () => { currentSourceIndex += 1; const nextSource = sources[currentSourceIndex]; if (!nextSource) { showFallback("[表情加载失败]"); return; } image.src = nextSource; };
    image.addEventListener("error", () => { loadNextSource(); });
    if (sources.length > 0) requestAnimationFrame(() => { loadNextSource(); }); else showFallback("[暂不支持的表情]");
  }
  const applied = controller.applyBubbleStyle(emojiBubble, msg, isNewGroup, senderInfo, isFirstMessage);
  applied.dataset.bubbleType = "emoji";
  applied.dataset.tail = "false";
  applied.style.background = "transparent";
  applied.style.border = "none";
  applied.style.boxShadow = "none";
  applied.style.padding = "4px";
  applied.style.paddingBottom = "32px";
  applied.classList.remove("text-white", "text-gray-900", "border", "inline-flex", "items-center", "justify-center");
  applied.classList.add("inline-block");
  const senderName = applied.querySelector('[data-role="sender-name"]');
  if (senderName) content.classList.add("mt-1");
  return applied;
}

export function emojiRenderSourcesFor(controller, msg) {
  const sources = [];
  const pushSource = (value, { cacheKey = null } = {}) => {
    const raw = String(value || "").trim();
    if (!raw) return;
    const source = cacheKey ? appendCacheKey(controller, raw, cacheKey) : raw;
    if (!sources.includes(source)) sources.push(source);
  };
  const previewUrl = msg._sending ? msg.extra?.preview_url : "";
  const serializedEmojiUrl = msg.emoji_url || "";
  const messageId = msg._messageId || msg._wxMessageId || msg.id;
  const cacheKey = msg._cacheKey;
  const emojiCacheMd5 = (msg.emoji_file_md5 || msg.emoji_md5 || msg.extra?.file_md5 || msg.extra?.md5 || "").trim();
  const cdnUrl = extractEmojiCdnUrl(controller, msg.content || "");
  pushSource(previewUrl);
  pushSource(serializedEmojiUrl, { cacheKey });
  if (emojiCacheMd5) pushSource(`/message/emoji/md5/${encodeURIComponent(emojiCacheMd5)}`, { cacheKey });
  if (messageId) pushSource(`/message/emoji/${messageId}`, { cacheKey });
  pushSource(cdnUrl);
  return sources;
}

export function appendCacheKey(_controller, url, cacheKey) {
  const rawUrl = String(url || "").trim();
  if (!rawUrl) return rawUrl;
  const params = [];
  if (cacheKey) params.push(`t=${encodeURIComponent(cacheKey)}`);
  params.push(`emoji_v=${encodeURIComponent(EMOJI_REQUEST_VERSION)}`);
  return `${rawUrl}${rawUrl.includes("?") ? "&" : "?"}${params.join("&")}`;
}

export function extractEmojiCdnUrl(controller, xmlString = "") {
  const xml = controller.parseXmlDocument(xmlString);
  if (!xml) return "";
  return xml.querySelector("emoji")?.getAttribute("cdnurl") || xml.querySelector("emoji > cdnurl")?.textContent?.trim() || "";
}

export function renderTextMessage(controller, bubble, msg, isNewGroup, senderInfo, isFirstMessage) {
  const template = controller.cloneTemplate("message-template-text");
  const textBubble = template || bubble;
  const inner = textBubble.querySelector("[data-role='content']");
  const content = msg.refer_title || msg.content || "";
  if (inner) {
    inner.innerHTML = "";
    const tempDiv = document.createElement("div");
    tempDiv.appendChild(controller.buildLinkedText(content));
    inner.innerHTML = replaceEmojis(tempDiv.innerHTML);
  }
  return controller.applyBubbleStyle(textBubble, msg, isNewGroup, senderInfo, isFirstMessage);
}

export function renderVoiceMessage(controller, bubble, msg, isNewGroup, senderInfo, isFirstMessage) {
  const template = controller.cloneTemplate("message-template-voice");
  const voiceBubble = template || bubble;
  const container = voiceBubble.querySelector("[data-role='voice-container']");
  const label = voiceBubble.querySelector("[data-role='voice-label']");
  const wrapper = voiceBubble.querySelector("[data-role='voice-wrapper']");
  const progressBar = voiceBubble.querySelector("[data-role='voice-progress']");
  const progressInner = voiceBubble.querySelector("[data-role='voice-progress-inner']");
  const speedButton = voiceBubble.querySelector("[data-role='voice-speed']");
  const controls = voiceBubble.querySelector("[data-role='voice-controls']");
  const parser = new DOMParser();
  const xml = parser.parseFromString(msg.content, "application/xml");
  const fallbackDuration = Number(xml.querySelector("voicemsg")?.getAttribute("voicelength") || 0) / 1000 || 10;
  if (progressBar) { progressBar.classList.remove("hidden"); progressBar.style.background = "rgba(148,163,184,0.35)"; }
  if (progressInner) { progressInner.style.background = msg.self_send ? controller.theme.selfBubbleTextColor || "#ffffff" : "#6366f1"; progressInner.style.transition = "width 120ms ease-out"; }
  if (label) { const durationLabel = controller.formatVoiceDuration(fallbackDuration); label.dataset.originalText = durationLabel; label.textContent = durationLabel; }
  if (speedButton) { speedButton.type = "button"; speedButton.className = "px-1 py-1 border-1 border-dashed text-xs rounded"; const rateIndex = controller.voicePlaybackRates.get(msg.id) ?? 1; const rate = controller.voicePlaybackOptions[rateIndex] ?? 1.0; speedButton.textContent = `${rate.toFixed(1)}x`; }
  const context = { messageId: msg.id, fallbackDuration, progressBar, progressInner, speedButton };
  const pendingRatio = controller.pendingVoiceSeeks.get(msg.id);
  if (typeof pendingRatio === "number" && progressInner) progressInner.style.width = `${Math.min(Math.max(pendingRatio, 0), 1) * 100}%`;
  if (controls && progressBar && speedButton) { controls.appendChild(progressBar); controls.appendChild(speedButton); }
  if (wrapper && controls) wrapper.appendChild(controls);
  if (voiceBubble && wrapper) voiceBubble.appendChild(wrapper);
  if (container && label) container.addEventListener("click", () => controller.handleVoiceClick(msg.id, container, label, context));
  if (progressBar) progressBar.addEventListener("click", (event) => { event.stopPropagation(); controller.seekVoice(msg.id, context, event); });
  if (speedButton) speedButton.addEventListener("click", (event) => { event.stopPropagation(); controller.toggleSpeed(msg.id, context); });
  return controller.applyBubbleStyle(voiceBubble, msg, isNewGroup, senderInfo, isFirstMessage);
}

export function renderReferMessage(controller, bubble, msg, isNewGroup, senderInfo, isFirstMessage) {
  const template = controller.cloneTemplate("message-template-refer");
  const referBubble = template || bubble;
  const body = referBubble.querySelector("[data-role='refer-body']");
  const quoted = referBubble.querySelector("[data-role='refer-quoted']");
  const quotedMeta = referBubble.querySelector("[data-role='refer-quoted-meta']");
  const quotedContent = referBubble.querySelector("[data-role='refer-quoted-content']");
  const parsed = controller.parseWxXmlMessage(msg.content || "");
  const quotePayload = controller.quotePayloadFor(msg);
  const quotePreview = quotePayload.quotePreview || null;
  const title = (msg.refer_title || quotePayload.title || parsed.title || "引用的消息").trim();
  const referNewMsgId = controller.normalizeReferenceId(msg.refer_new_msg_id) || quotePayload.referNewMsgId || controller.normalizeReferenceId(parsed.refServerId) || quotePreview?.serverId || controller.normalizeReferenceId(msg.referenced_message?.wx_message?.new_msg_id);
  if (body) body.textContent = title;

  const referenced = msg.referenced_message;
  if (referenced && referenced.wx_message) {
    const refWx = referenced.wx_message;
    controller.replaceRoomSenderWxid(refWx);
    const preview = controller.buildMessagePreview(refWx);
    const referenceSender = controller.lookupSenderInfo(refWx, refWx.content);
    if (quoted) {
      quoted.classList.remove("cursor-not-allowed", "opacity-60");
      if (referNewMsgId) {
        quoted.classList.add("cursor-pointer");
        quoted.dataset.referNewMsgId = String(referNewMsgId);
        delete quoted.dataset.referMessageId;
        quoted.onclick = async (event) => { event.stopPropagation(); const resolvedId = await controller.resolveReferencedMessageId(referNewMsgId); if (resolvedId) controller.focusMessageById(resolvedId); };
      } else if (referenced.id) {
        quoted.classList.add("cursor-pointer");
        quoted.dataset.referMessageId = String(referenced.id);
        delete quoted.dataset.referNewMsgId;
        quoted.onclick = (event) => { event.stopPropagation(); controller.focusMessageById(referenced.id); };
      } else {
        quoted.classList.remove("cursor-pointer"); delete quoted.dataset.referMessageId; delete quoted.dataset.referNewMsgId; quoted.onclick = null;
      }
    }
    if (quotedMeta) {
      const typeLabel = controller.humanizeMessageType(preview.type);
      quotedMeta.textContent = referenceSender?.name ? `${referenceSender.name} · ${typeLabel}` : `引用的${typeLabel}消息`;
    }
    if (quotedContent) {
      quotedContent.innerHTML = "";
      if (preview.asLinkedText) quotedContent.appendChild(controller.buildLinkedText(preview.content));
      else quotedContent.textContent = preview.content;
    }
  } else {
    if (quoted && referNewMsgId) {
      quoted.classList.remove("cursor-not-allowed", "opacity-60");
      quoted.classList.add("cursor-pointer");
      quoted.dataset.referNewMsgId = String(referNewMsgId);
      quoted.onclick = async (event) => { event.stopPropagation(); const resolvedId = await controller.resolveReferencedMessageId(referNewMsgId); if (resolvedId) controller.focusMessageById(resolvedId); };
    }
    if (quotedMeta) {
      const previewType = controller.normalizeParsedMessageType(quotePreview?.type) || quotePreview?.type || "quote";
      const previewSender = quotePreview?.displayName || quotePreview?.senderUserName || quotePreview?.fromUserName || "";
      const typeLabel = controller.humanizeMessageType(previewType);
      quotedMeta.textContent = previewSender ? `${previewSender} · ${typeLabel}` : `引用的${typeLabel}消息`;
    }
    if (quotePreview?.content) {
      if (quotedContent) quotedContent.textContent = quotePreview.content;
    } else if (parsed.refContent) {
      if (quotedContent) quotedContent.textContent = parsed.refContent;
    } else {
      if (quoted) { quoted.classList.add("cursor-not-allowed", "opacity-60"); quoted.classList.remove("cursor-pointer"); delete quoted.dataset.referMessageId; quoted.onclick = null; }
      if (quotedMeta) quotedMeta.textContent = "引用的消息";
      if (quotedContent) quotedContent.textContent = "该消息尚未加载";
    }
  }
  return controller.applyBubbleStyle(referBubble, msg, isNewGroup, senderInfo, isFirstMessage);
}

export function renderSystemNoticeMessage(controller, bubble, msg, isNewGroup, senderInfo, isFirstMessage) {
  const template = controller.cloneTemplate("message-template-system-notice");
  const noticeBubble = template || bubble;
  const content = noticeBubble.querySelector("[data-role='system-notice-content']");
  const preview = controller.buildSystemNoticeContent(msg);
  if (content) content.textContent = preview; else noticeBubble.textContent = preview;
  return controller.applyBubbleStyle(noticeBubble, msg, isNewGroup, senderInfo, isFirstMessage);
}

export function applyBubbleStyle(controller, bubble, msg, isNewGroup = true, senderInfo = null, isFirstMessage = false) {
  if (!bubble) return bubble;
  bubble.classList.add("relative", "inline-block", "rounded-2xl", "shadow-sm", "message-bubble");
  bubble.style.marginTop = "";
  bubble.style.paddingBottom = "";
  bubble.dataset.tail = msg._endsGroup ? "true" : "false";
  bubble.classList.remove("bg-blue-500", "text-white", "rounded-bl-2xl", "rounded-tr-2xl", "rounded-br-md", "bg-white", "text-gray-900", "border", "border-gray-200", "rounded-br-2xl", "rounded-tl-2xl", "rounded-bl-md");
  bubble.style.background = "";
  bubble.style.color = "";
  bubble.style.border = "";
  bubble.style.boxShadow = "";
  bubble.style.borderRadius = "";
  bubble.style.setProperty("--tg-bubble-bg", "");
  bubble.style.setProperty("--tg-bubble-border-color", "");
  delete bubble.dataset.senderType;
  if (controller.isSystemNoticeMessage(msg)) {
    bubble.dataset.senderType = "system";
    bubble.classList.remove("rounded-bl-2xl", "rounded-tr-2xl", "rounded-br-md", "rounded-br-2xl", "rounded-tl-2xl", "rounded-bl-md", "border");
    bubble.classList.add("mx-auto");
    bubble.style.background = "rgba(255,255,255,0.92)";
    bubble.style.color = "#475569";
    bubble.style.border = "1px solid rgba(203,213,225,0.9)";
    bubble.style.boxShadow = "0 8px 30px -20px rgba(15,23,42,0.35)";
    bubble.style.borderRadius = "9999px";
    bubble.style.setProperty("--tg-bubble-bg", "rgba(255,255,255,0.92)");
    bubble.style.setProperty("--tg-bubble-border-color", "rgba(203,213,225,0.9)");
    return bubble;
  }

  if (msg.self_send) {
    bubble.dataset.senderType = "self";
    bubble.classList.add("text-white", "rounded-bl-2xl", "rounded-tr-2xl", "rounded-br-md");
    bubble.classList.remove("rounded-br-2xl", "rounded-tl-2xl", "rounded-bl-md");
    bubble.style.background = controller.theme.selfBubbleColor;
    bubble.style.color = controller.theme.selfBubbleTextColor;
    bubble.style.border = "1px solid rgba(181, 214, 173, 0.92)";
    bubble.style.boxShadow = "0 1px 1px rgba(15,23,42,0.05)";
    bubble.style.borderRadius = "18px 18px 6px 18px";
    bubble.style.setProperty("--tg-bubble-bg", controller.theme.selfBubbleColor);
    bubble.style.setProperty("--tg-bubble-border-color", "rgba(181, 214, 173, 0.92)");
  } else {
    bubble.dataset.senderType = "other";
    bubble.classList.add("text-gray-900", "border", "rounded-br-2xl", "rounded-tl-2xl", "rounded-bl-md");
    bubble.classList.remove("rounded-bl-2xl", "rounded-tr-2xl", "rounded-br-md");
    bubble.style.background = controller.theme.otherBubbleColor;
    bubble.style.color = "#111827";
    bubble.style.border = `1px solid ${controller.theme.otherBubbleBorderColor}`;
    bubble.style.boxShadow = "0 1px 1px rgba(15,23,42,0.06)";
    bubble.style.borderRadius = "18px 18px 18px 6px";
    bubble.style.setProperty("--tg-bubble-bg", controller.theme.otherBubbleColor);
    bubble.style.setProperty("--tg-bubble-border-color", controller.theme.otherBubbleBorderColor);
  }

  const existingName = bubble.querySelector('[data-role="sender-name"]');
  if (existingName) existingName.remove();
  if (!msg.self_send && controller.isRoom() && msg._startsGroup) {
    const name = senderInfo?.name || msg.sender_name || "";
    if (name) {
      const nameTag = document.createElement("div");
      nameTag.dataset.role = "sender-name";
      nameTag.className = "px-3 pt-1 text-[11px] font-semibold text-sky-600/90";
      nameTag.textContent = name;
      bubble.insertBefore(nameTag, bubble.firstChild);
    }
  }
  return bubble;
}

export function renderStatus(controller, m, bubble, msg) {
  if (!msg.self_send) return;
  if (m.sending || msg._sending) {
    const loader = document.createElement("div");
    loader.className = "absolute bottom-1 left-2 flex space-x-1";
    loader.innerHTML = `<span class="w-1 h-1 bg-blue-300 rounded-full animate-tg-dot"></span><span class="w-1 h-1 bg-blue-300 rounded-full animate-tg-dot" style="animation-delay:0.2s"></span><span class="w-1 h-1 bg-blue-300 rounded-full animate-tg-dot" style="animation-delay:0.4s"></span>`;
    bubble.appendChild(loader);
  } else if (m.send_failed) {
    const retry = document.createElement("button");
    retry.className = "absolute bottom-1 left-2 text-[10px] text-red-500 underline";
    retry.textContent = "重试";
    retry.addEventListener("click", () => { controller.inputTarget.value = msg.content; controller.sendMessage("text"); controller.autoResize(); });
    bubble.appendChild(retry);
  }
}

export function addTimestamp(controller, bubble, wrapper, msg = null) {
  const time = document.createElement("span");
  const ts = wrapper.message_time || wrapper.created_at || wrapper.wx_message?.message_time;
  time.textContent = ts ? controller.formatTimestamp(ts) : "";
  const isSelf = msg?.self_send;
  const inlineTarget = inlineTimestampTargetForBubble(controller, bubble, msg);
  if (inlineTarget) {
    time.className = "float-right ml-2 mt-1 text-[10px] leading-none tracking-wide select-none";
    time.style.color = isSelf ? "rgba(255,255,255,0.72)" : "rgba(100,116,139,0.92)";
    inlineTarget.appendChild(time);
    return;
  }
  time.className = "absolute bottom-2 right-3 text-[10px] leading-none tracking-wide";
  if (!bubble.dataset.timestampPrepared) {
    bubble.style.minWidth = bubble.style.minWidth || "140px";
    bubble.style.minHeight = bubble.style.minHeight || "52px";
    bubble.style.paddingBottom = bubble.style.paddingBottom || "28px";
    bubble.dataset.timestampPrepared = "true";
  }
  time.style.padding = "3px 8px";
  time.style.borderRadius = "9999px";
  time.style.background = isSelf ? "rgba(255,255,255,0.18)" : "rgba(15,23,42,0.08)";
  time.style.color = isSelf ? "rgba(255,255,255,0.85)" : "rgba(100,116,139,0.95)";
  time.style.boxShadow = isSelf ? "0 4px 12px -8px rgba(15,23,42,0.45)" : "0 4px 10px -8px rgba(15,23,42,0.25)";
  bubble.appendChild(time);
}

export function inlineTimestampTargetForBubble(controller, bubble, msg = null) {
  const type = controller.normalizeMessageType(msg);
  const inlineTypes = ["text", "quote", "refer", "xml_unparsed"];
  if (!inlineTypes.includes(type)) return null;
  return bubble.querySelector("[data-role='content']") || bubble.querySelector("[data-role='refer-body']") || bubble.querySelector("[data-role='xml-content']");
}
