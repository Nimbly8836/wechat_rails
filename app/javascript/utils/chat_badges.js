import { chatStorageKeys, readCache } from "utils/chat_storage"

export const DEFAULT_BADGE_LABELS = Object.freeze({
  group: "群聊",
  official: "公众号"
})

export function normalizeBadgeLabels(rawValue = {}) {
  return {
    group: normalizeBadgeLabel(rawValue?.group, DEFAULT_BADGE_LABELS.group),
    official: normalizeBadgeLabel(rawValue?.official, DEFAULT_BADGE_LABELS.official)
  }
}

export function loadBadgeLabels() {
  const [namespace, identifier] = chatStorageKeys.badgeLabels()
  return normalizeBadgeLabels(readCache(namespace, identifier, {}))
}

export function badgeLabelFor(kind, labels = DEFAULT_BADGE_LABELS) {
  return normalizeBadgeLabels(labels)[kind] || ""
}

function normalizeBadgeLabel(value, fallback) {
  const normalized = String(value || "").trim()
  return normalized || fallback
}
