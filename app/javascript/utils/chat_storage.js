const STORAGE_PREFIX = "wechat-rails"
const STORAGE_VERSION = "v2"

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
    window.localStorage.setItem(storageKey(namespace, identifier), JSON.stringify({
      updatedAt: new Date().toISOString(),
      data
    }))
    return true
  } catch (error) {
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
  chatRoomList: () => ["chat-room-list", ""],
  chatRoomTheme: (roomId) => ["chat-room-theme", String(roomId)],
  chatRoomMessages: (roomId) => ["chat-room-messages", String(roomId)],
  chatRoomMembers: (roomId) => ["chat-room-members", String(roomId)],
  chatRoomShell: (roomId) => ["chat-room-shell", String(roomId)]
}
