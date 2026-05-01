import { chatStorageKeys, readCache, writeCache } from "utils/chat_storage"

export const GLOBAL_THEME_LIGHT = "light"
export const GLOBAL_THEME_DARK = "dark"

export function normalizeGlobalTheme(value) {
  return value === GLOBAL_THEME_DARK ? GLOBAL_THEME_DARK : GLOBAL_THEME_LIGHT
}

export function readGlobalTheme() {
  const [namespace, identifier] = chatStorageKeys.globalTheme()
  return normalizeGlobalTheme(readCache(namespace, identifier, GLOBAL_THEME_LIGHT))
}

export function writeGlobalTheme(theme) {
  const normalized = normalizeGlobalTheme(theme)
  const [namespace, identifier] = chatStorageKeys.globalTheme()
  writeCache(namespace, identifier, normalized)
  return normalized
}

export function applyGlobalTheme(theme) {
  const normalized = normalizeGlobalTheme(theme)
  const root = document.documentElement
  root.classList.toggle("tg-theme-dark", normalized === GLOBAL_THEME_DARK)
  root.classList.toggle("tg-theme-light", normalized === GLOBAL_THEME_LIGHT)
  root.style.colorScheme = normalized === GLOBAL_THEME_DARK ? "dark" : "light"
  return normalized
}

export function toggleGlobalThemeValue(theme) {
  return normalizeGlobalTheme(theme) === GLOBAL_THEME_DARK
    ? GLOBAL_THEME_LIGHT
    : GLOBAL_THEME_DARK
}
