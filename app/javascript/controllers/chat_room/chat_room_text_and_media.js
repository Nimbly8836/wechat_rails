export function formatTimestamp(_controller, value) {
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

  if (sameDay) return timePart;
  if (date.toDateString() === yesterday.toDateString()) return `昨 ${timePart}`;
  if (sameYear) {
    return date.toLocaleDateString("zh-Hans-CN", { month: "2-digit", day: "2-digit" }) + ` ${timePart}`;
  }

  return date.toLocaleDateString("zh-Hans-CN", {
    year: "2-digit", month: "2-digit", day: "2-digit"
  }) + ` ${timePart}`;
}

export function buildLinkedText(controller, text) {
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
      appendPlainSegment(controller, fragment, preceding);
    }

    const href = match[1];
    const labelHtml = match[2];
    const cleanHref = normalizeHref(controller, href);

    if (cleanHref) {
      const anchor = createAnchor(controller, cleanHref,
        decodeHtmlEntities(controller, labelHtml));
      fragment.appendChild(anchor);
    } else {
      appendPlainSegment(controller, fragment, match[0]);
    }

    lastIndex = anchorRegex.lastIndex;
  }

  const trailing = text.slice(lastIndex);
  if (trailing) {
    appendPlainSegment(controller, fragment, trailing);
  }

  return fragment;
}

export function appendPlainSegment(controller, fragment, text) {
  const urlRegex = /(https?:\/\/[^\s]+)/gi;
  let lastIndex = 0;
  let match;

  while ((match = urlRegex.exec(text)) !== null) {
    const preceding = text.slice(lastIndex, match.index);
    if (preceding) {
      fragment.appendChild(document.createTextNode(preceding));
    }

    const url = match[0];
    const cleanHref = normalizeHref(controller, url);
    if (cleanHref) {
      fragment.appendChild(createAnchor(controller, cleanHref, url));
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

export function createAnchor(_controller, href, label) {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.textContent = label;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.className = "underline text-blue-500 hover:text-blue-600";
  return anchor;
}

export function decodeHtmlEntities(_controller, text) {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = text;
  return textarea.value;
}

export function normalizeHref(_controller, href) {
  if (!href) {
    return null;
  }
  const trimmed = href.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return null;
  }
  return trimmed;
}

export function buildMediaPreviewTitle(controller, msg, fallback = "媒体预览") {
  const senderName = msg?.self_send ? "我" : (msg?.sender_name
    || controller.lookupSenderInfo(msg, msg?.content)?.name || "");
  return senderName ? `${senderName} · ${fallback}` : fallback;
}

export function ensureMediaPreviewElements(controller) {
  if (controller.mediaPreviewOverlay?.isConnected) {
    return;
  }

  const overlay = document.createElement("div");
  overlay.className = "fixed inset-0 z-[120] hidden items-center justify-center bg-slate-950/90 px-4 py-5";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.innerHTML = `
    <div class="absolute inset-0 backdrop-blur-sm" data-role="media-preview-backdrop"></div>
    <div class="relative z-10 flex max-h-full w-full max-w-6xl flex-col gap-3">
      <div class="flex items-center justify-between gap-3 text-slate-100">
        <div class="min-w-0">
          <div class="truncate text-sm font-medium" data-role="media-preview-title">图片预览</div>
          <div class="truncate text-xs text-slate-400" data-role="media-preview-meta"></div>
        </div>
        <div class="flex items-center gap-2">
          <a class="rounded-full border border-white/15 px-3 py-1.5 text-xs text-slate-100 transition hover:border-white/30 hover:bg-white/10"
             data-role="media-preview-open"
             target="_blank"
             rel="noopener noreferrer">新窗口打开</a>
          <button type="button"
                  class="rounded-full border border-white/15 px-3 py-1.5 text-xs text-slate-100 transition hover:border-white/30 hover:bg-white/10"
                  data-role="media-preview-close">关闭</button>
        </div>
      </div>
      <div class="relative flex max-h-[calc(100vh-7rem)] w-full items-center justify-center overflow-auto rounded-[28px] bg-black/30 p-3"
           data-role="media-preview-frame">
        <img data-role="media-preview-image"
             alt="媒体预览"
             class="max-h-[calc(100vh-9rem)] max-w-full object-contain select-none">
      </div>
    </div>
  `;

  overlay.addEventListener("click", (event) => {
    if (event.target.closest("[data-role='media-preview-backdrop']")
      || event.target.closest("[data-role='media-preview-close']")) {
      event.preventDefault();
      closeMediaPreview(controller);
    }
  });

  document.body.appendChild(overlay);
  controller.mediaPreviewOverlay = overlay;
  controller.mediaPreviewFrame = overlay.querySelector("[data-role='media-preview-frame']");
  controller.mediaPreviewImage = overlay.querySelector("[data-role='media-preview-image']");
  controller.mediaPreviewTitle = overlay.querySelector("[data-role='media-preview-title']");
  controller.mediaPreviewMeta = overlay.querySelector("[data-role='media-preview-meta']");
  controller.mediaPreviewOpenLink = overlay.querySelector("[data-role='media-preview-open']");
}

export function openMediaPreview(controller, { src, title = "图片预览", meta = "" } = {}) {
  if (!src) {
    return;
  }

  ensureMediaPreviewElements(controller);
  if (!controller.mediaPreviewOverlay || !controller.mediaPreviewImage) {
    return;
  }

  if (controller.mediaPreviewTitle) controller.mediaPreviewTitle.textContent = title;
  if (controller.mediaPreviewMeta) {
    controller.mediaPreviewMeta.textContent = meta;
    controller.mediaPreviewMeta.classList.toggle("hidden", !meta);
  }
  if (controller.mediaPreviewOpenLink) controller.mediaPreviewOpenLink.href = src;

  controller.mediaPreviewImage.src = src;
  controller.mediaPreviewOverlay.classList.remove("hidden");
  controller.mediaPreviewOverlay.classList.add("flex");
  controller.mediaPreviewPreviousBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  document.addEventListener("keydown", controller.boundHandleMediaPreviewKeydown);
}

export function closeMediaPreview(controller) {
  if (!controller.mediaPreviewOverlay) {
    return;
  }

  controller.mediaPreviewOverlay.classList.add("hidden");
  controller.mediaPreviewOverlay.classList.remove("flex");
  if (controller.mediaPreviewImage) {
    controller.mediaPreviewImage.removeAttribute("src");
  }

  document.body.style.overflow = controller.mediaPreviewPreviousBodyOverflow || "";
  document.removeEventListener("keydown", controller.boundHandleMediaPreviewKeydown);
}

export function handleMediaPreviewKeydown(controller, event) {
  if (event.key === "Escape") {
    closeMediaPreview(controller);
  }
}
