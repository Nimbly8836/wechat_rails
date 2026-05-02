import { chatStorageKeys, readCache, writeCache } from "utils/chat_storage";

export const LEGACY_DEFAULT_THEME = {
  backgroundColor: "var(--color-gray-100)",
  backgroundImage: "",
  selfBubbleColor: "#6387f2",
  selfBubbleTextColor: "#ffffff",
  otherBubbleColor: "rgba(255,255,255,0.92)",
  otherBubbleBorderColor: "rgba(148,163,184,0.45)",
  fontFamily: "inherit"
};

export const DEFAULT_THEME = {
  backgroundColor: "#d7e3ef",
  backgroundImage: "",
  selfBubbleColor: "#d9fdd3",
  selfBubbleTextColor: "#1f2937",
  otherBubbleColor: "#ffffff",
  otherBubbleBorderColor: "rgba(15,23,42,0.08)",
  fontFamily: "inherit"
};

export function parseCssColor(value) {
  const color = String(value || "").trim();
  const hex = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const raw = hex[1].length === 3
      ? hex[1].split("").map((part) => `${part}${part}`).join("")
      : hex[1];
    return {
      r: parseInt(raw.slice(0, 2), 16),
      g: parseInt(raw.slice(2, 4), 16),
      b: parseInt(raw.slice(4, 6), 16),
      a: 1
    };
  }

  const rgb = color.match(/^rgba?\(([^)]+)\)$/i);
  if (!rgb) {
    return null;
  }

  const parts = rgb[1].split(",").map((part) => part.trim());
  if (parts.length < 3) {
    return null;
  }

  const [r, g, b] = parts.slice(0, 3).map((part) => Number.parseFloat(part));
  const a = parts[3] == null ? 1 : Number.parseFloat(parts[3]);
  if ([r, g, b, a].some((part) => Number.isNaN(part))) {
    return null;
  }

  return {
    r: Math.max(0, Math.min(r, 255)),
    g: Math.max(0, Math.min(g, 255)),
    b: Math.max(0, Math.min(b, 255)),
    a: Math.max(0, Math.min(a, 1))
  };
}

export function readableTextColorForBackground(value, fallback = "#111827") {
  const color = parseCssColor(value);
  if (!color) {
    return fallback;
  }

  const composite = {
    r: color.r * color.a + 255 * (1 - color.a),
    g: color.g * color.a + 255 * (1 - color.a),
    b: color.b * color.a + 255 * (1 - color.a)
  };
  const channels = [composite.r, composite.g, composite.b].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  return luminance > 0.45 ? "#111827" : "#ffffff";
}

function applyBackgroundStyles(element, backgroundColor, backgroundImageValue) {
  if (!element) {
    return;
  }

  element.style.backgroundColor = backgroundColor;
  if (backgroundImageValue) {
    element.style.backgroundImage = backgroundImageValue;
    element.style.backgroundSize = "cover";
    element.style.backgroundRepeat = "no-repeat";
    element.style.backgroundPosition = "center";
  } else {
    element.style.backgroundImage = "";
    element.style.backgroundSize = "";
    element.style.backgroundRepeat = "";
    element.style.backgroundPosition = "";
  }
}

export function readChatRoomTheme(controller) {
  const [namespace, identifier] = chatStorageKeys.chatRoomTheme(controller.idValue);
  return readCache(namespace, identifier, {}) || {};
}

export function normalizeThemeConfig(_controller, rawTheme) {
  const theme = rawTheme && typeof rawTheme === "object" ? { ...rawTheme } : {};
  const migratePairs = [
    "backgroundColor",
    "selfBubbleColor",
    "selfBubbleTextColor",
    "otherBubbleColor",
    "otherBubbleBorderColor"
  ];

  migratePairs.forEach((key) => {
    if (!theme[key] || theme[key] === LEGACY_DEFAULT_THEME[key]) {
      theme[key] = DEFAULT_THEME[key];
    }
  });

  if (!theme.fontFamily) {
    theme.fontFamily = DEFAULT_THEME.fontFamily;
  }

  return theme;
}

export function persistTheme(controller) {
  const [namespace, identifier] = chatStorageKeys.chatRoomTheme(controller.idValue);
  writeCache(namespace, identifier, controller.theme);
}

export function updateBackgroundColor(controller, event) {
  const value = event?.target?.value;
  if (!value) {
    return;
  }
  controller.theme.backgroundColor = value;
  applyTheme(controller);
}

export function updateBubbleColor(controller, event) {
  const value = event?.target?.value;
  if (!value) {
    return;
  }
  controller.theme.selfBubbleColor = value;
  applyTheme(controller);
}

export function updateBackgroundImage(controller, event) {
  const value = event?.target?.value ?? "";
  controller.theme.backgroundImage = value.trim();
  applyTheme(controller);
}

export function clearBackgroundImage(controller, event) {
  event?.preventDefault();
  controller.theme.backgroundImage = "";
  if (controller.hasBackgroundUploadStatusTarget) {
    controller.backgroundUploadStatusTarget.textContent = "";
  }
  applyTheme(controller);
  syncThemeInputs(controller);
}

export function openBackgroundUpload(controller, event = null) {
  event?.preventDefault();
  if (controller.hasBackgroundUploadInputTarget) {
    controller.backgroundUploadInputTarget.click();
  }
}

export function uploadBackgroundImage(controller, event) {
  const file = event?.target?.files?.[0];
  if (!file) {
    return;
  }

  if (controller.hasBackgroundUploadStatusTarget) {
    controller.backgroundUploadStatusTarget.textContent = "上传中...";
  }

  const formData = new FormData();
  formData.append("image", file);

  fetch(`/chat_room/${controller.idValue}/upload_background_image`, {
    method: "POST",
    headers: {
      "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]')?.content || "",
      "Accept": "application/json"
    },
    body: formData
  })
    .then((response) => response.json().then((payload) => ({ response, payload })))
    .then(({ response, payload }) => {
      if (!response.ok || !payload?.url) {
        throw new Error(payload?.error || "背景图片上传失败");
      }
      controller.theme.backgroundImage = payload.url;
      applyTheme(controller);
      syncThemeInputs(controller);
      if (controller.hasBackgroundUploadStatusTarget) {
        controller.backgroundUploadStatusTarget.textContent = "已上传";
      }
    })
    .catch((error) => {
      if (controller.hasBackgroundUploadStatusTarget) {
        controller.backgroundUploadStatusTarget.textContent = error.message || "上传失败";
      }
    })
    .finally(() => {
      if (event?.target) {
        event.target.value = "";
      }
    });
}

export function resetTheme(controller, event = null) {
  event?.preventDefault();
  controller.theme = { ...DEFAULT_THEME };
  syncThemeInputs(controller);
  applyTheme(controller);
}

export function updateFontFamily(controller, event) {
  const value = event?.target?.value ?? "inherit";
  if (value === "custom") {
    if (controller.hasFontCustomInputTarget) {
      controller.fontCustomInputTarget.focus();
    }
    return;
  }

  controller.theme.fontFamily = value || "inherit";
  applyTheme(controller, { refreshBubbles: false });
  if (controller.hasFontCustomInputTarget) {
    controller.fontCustomInputTarget.value = "";
  }
}

export function updateCustomFont(controller, event) {
  const rawValue = event?.target?.value ?? "";
  const value = rawValue.trim();
  if (!value) {
    controller.theme.fontFamily = "inherit";
    if (controller.hasFontSelectTarget) {
      controller.fontSelectTarget.value = "inherit";
    }
  } else {
    controller.theme.fontFamily = value;
    if (controller.hasFontSelectTarget) {
      controller.fontSelectTarget.value = "custom";
    }
  }
  applyTheme(controller, { refreshBubbles: false });
}

export function applyTheme(controller, { refreshBubbles = true } = {}) {
  const backgroundColor = controller.theme.backgroundColor || "#ffffff";
  const backgroundImage = controller.theme.backgroundImage || "";
  const fontFamily = controller.theme.fontFamily || "inherit";

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
  const shell = controller.element?.closest(".tg-app-shell");
  const backgroundTarget = shell || controller.element;

  applyBackgroundStyles(backgroundTarget, backgroundColor, backgroundImageValue);

  if (controller.element) {
    controller.element.style.fontFamily = fontFamily;
  }

  if (controller.hasMessageListTarget) {
    const list = controller.messageListTarget;
    if (backgroundImageValue) {
      list.style.backgroundColor = "transparent";
      list.style.backgroundImage = "";
      list.style.backgroundAttachment = "";
      list.style.backgroundSize = "";
      list.style.backgroundRepeat = "";
      list.style.backgroundPosition = "";
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
    refreshBubbleStyles(controller);
  }

  persistTheme(controller);
}

export function refreshBubbleStyles(controller) {
  if (!controller.hasMessageListTarget) {
    return;
  }
  const bubbles = controller.messageListTarget.querySelectorAll(".message-bubble");
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
      const textColor = readableTextColorForBackground(controller.theme.selfBubbleColor, "#111827");
      bubble.style.background = controller.theme.selfBubbleColor;
      bubble.style.color = textColor;
      bubble.style.border = "none";
      bubble.classList.remove("text-white");
      const progressInner = bubble.querySelector('[data-role="voice-progress-inner"]');
      if (progressInner) {
        progressInner.style.background = textColor;
      }
    } else {
      const textColor = readableTextColorForBackground(controller.theme.otherBubbleColor, "#111827");
      bubble.style.background = controller.theme.otherBubbleColor;
      bubble.style.color = textColor;
      bubble.style.border = `1px solid ${controller.theme.otherBubbleBorderColor}`;
      bubble.classList.remove("text-white");
      const progressInner = bubble.querySelector('[data-role="voice-progress-inner"]');
      if (progressInner) {
        progressInner.style.background = "#6366f1";
      }
    }
  });
}

export function syncThemeInputs(controller) {
  if (controller.hasBackgroundInputTarget && controller.backgroundInputTarget.value
    !== controller.theme.backgroundColor) {
    controller.backgroundInputTarget.value = controller.theme.backgroundColor;
  }
  if (controller.hasBubbleInputTarget && controller.bubbleInputTarget.value
    !== controller.theme.selfBubbleColor) {
    controller.bubbleInputTarget.value = controller.theme.selfBubbleColor;
  }
  if (controller.hasBackgroundImageInputTarget) {
    controller.backgroundImageInputTarget.value = controller.theme.backgroundImage || "";
  }
  const fontValue = controller.theme.fontFamily || "inherit";
  const presetFonts = new Set(["inherit",
    '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
    '"Source Han Serif SC", "Songti SC", serif', '"LXGW WenKai", cursive',
    '"JetBrains Mono", monospace']);
  if (controller.hasFontSelectTarget) {
    if (presetFonts.has(fontValue)) {
      controller.fontSelectTarget.value = fontValue;
    } else {
      controller.fontSelectTarget.value = "custom";
    }
  }
  if (controller.hasFontCustomInputTarget) {
    controller.fontCustomInputTarget.value = presetFonts.has(fontValue) || fontValue
      === "inherit" ? "" : fontValue;
  }
}
