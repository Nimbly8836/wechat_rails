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
  applyTheme(controller);
  syncThemeInputs(controller);
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

  if (controller.element) {
    controller.element.style.backgroundColor = backgroundColor;
    if (backgroundImageValue) {
      controller.element.style.backgroundImage = backgroundImageValue;
      controller.element.style.backgroundSize = "cover";
      controller.element.style.backgroundRepeat = "no-repeat";
      controller.element.style.backgroundPosition = "center";
    } else {
      controller.element.style.backgroundImage = "";
      controller.element.style.backgroundSize = "";
      controller.element.style.backgroundRepeat = "";
      controller.element.style.backgroundPosition = "";
    }
    controller.element.style.fontFamily = fontFamily;
  }

  if (controller.hasMessageListTarget) {
    const list = controller.messageListTarget;
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
      bubble.style.background = controller.theme.selfBubbleColor;
      bubble.style.color = controller.theme.selfBubbleTextColor;
      bubble.style.border = "none";
      bubble.classList.add("text-white");
      const progressInner = bubble.querySelector('[data-role="voice-progress-inner"]');
      if (progressInner) {
        progressInner.style.background = controller.theme.selfBubbleTextColor || "#ffffff";
      }
    } else {
      bubble.style.background = controller.theme.otherBubbleColor;
      bubble.style.color = "#111827";
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
