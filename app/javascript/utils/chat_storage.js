const STORAGE_PREFIX = "wechat-rails"
const STORAGE_VERSION = "v2"

function quotaExceeded(error) {
  return error?.name === "QuotaExceededError"
    || error?.name === "NS_ERROR_DOM_QUOTA_REACHED"
    || String(error?.message || "").toLowerCase().includes("quota")
}

function storageKey(namespace, identifier = "") {
  return `${STORAGE_PREFIX}:${STORAGE_VERSION}:${namespace}${identifier ? `:${identifier}` : ""}`
}

function storageAvailable() {
  try {
    return typeof window !== "undefined" && !!window.localStorage
  } catch (_) {
    return false
  }
}

export function readCache(namespace, identifier = "", fallback = null) {
  if (!storageAvailable()) {
    return fallback
  }

  try {
    const rawValue = window.localStorage.getItem(storageKey(namespace, identifier))
    if (!rawValue) {
      return fallback
    }

    const parsed = JSON.parse(rawValue)
    return parsed?.data ?? fallback
  } catch (_) {
    return fallback
  }
}

export function writeCache(namespace, identifier = "", data) {
  if (!storageAvailable()) {
    return false
  }

  try {
    const key = storageKey(namespace, identifier)
    window.localStorage.setItem(key, JSON.stringify({
      updatedAt: new Date().toISOString(),
      data
    }))
    return true
  } catch (error) {
    if (quotaExceeded(error)) {
      try {
        window.localStorage.removeItem(storageKey(namespace, identifier))
      } catch (_) {
        // ignore storage errors
      }
      return false
    }
    console.warn(`cache write failed for ${namespace}:${identifier}`, error)
    return false
  }
}

export function removeCache(namespace, identifier = "") {
  if (!storageAvailable()) {
    return
  }

  try {
    window.localStorage.removeItem(storageKey(namespace, identifier))
  } catch (_) {
    // ignore storage errors
  }
}

export const chatStorageKeys = {
  notificationSettings: () => ["notification-settings", ""],
  badgeLabels: () => ["badge-labels", ""],
  chatRoomList: () => ["chat-room-list", ""],
  activeChatFolder: () => ["active-chat-folder", ""],
  activeChatSection: () => ["active-chat-section", ""],
  collapsedContactGroups: () => ["collapsed-contact-groups", ""],
  chatRoomTheme: (roomId) => ["chat-room-theme", String(roomId)],
  chatRoomMessages: (roomId) => ["chat-room-messages", String(roomId)],
  chatRoomMembers: (roomId) => ["chat-room-members", String(roomId)],
  chatRoomShell: (roomId) => ["chat-room-shell", String(roomId)]
}
