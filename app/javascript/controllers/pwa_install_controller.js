import { Controller } from "@hotwired/stimulus"

const DISMISS_KEY = "wechat-rails-pwa-install-dismissed"

export default class extends Controller {
  static values = {
    serviceWorkerUrl: String
  }

  static targets = ["banner", "title", "description", "iosGuide", "installButton"]

  connect() {
    this.deferredPrompt = null
    this.bannerMode = null
    this.boundBeforeInstallPrompt = this.captureInstallPrompt.bind(this)
    this.boundAppInstalled = this.handleAppInstalled.bind(this)
    this.registerServiceWorker()

    if (this.isStandalone()) {
      return
    }

    window.addEventListener("beforeinstallprompt", this.boundBeforeInstallPrompt)
    window.addEventListener("appinstalled", this.boundAppInstalled)
    this.showIosInstallGuideIfNeeded()
  }

  disconnect() {
    window.removeEventListener("beforeinstallprompt", this.boundBeforeInstallPrompt)
    window.removeEventListener("appinstalled", this.boundAppInstalled)
  }

  registerServiceWorker() {
    if (!("serviceWorker" in navigator)) {
      return
    }

    const serviceWorkerUrl = this.serviceWorkerUrlValue || "/service-worker.js"
    navigator.serviceWorker.register(serviceWorkerUrl, { scope: "/" })
      .catch((error) => {
        console.error("service worker register failed", error)
      })
  }

  captureInstallPrompt(event) {
    if (localStorage.getItem(DISMISS_KEY) === "true") {
      return
    }

    event.preventDefault()
    this.deferredPrompt = event
    this.configureBannerForPrompt()
    this.showBanner()
  }

  async install() {
    if (this.bannerMode === "ios-manual") {
      this.toggleIosGuide()
      return
    }

    if (!this.deferredPrompt) {
      return
    }

    this.deferredPrompt.prompt()
    const result = await this.deferredPrompt.userChoice
    if (result.outcome !== "accepted") {
      this.showBanner()
      return
    }

    this.hideBanner()
    this.deferredPrompt = null
  }

  dismiss() {
    localStorage.setItem(DISMISS_KEY, "true")
    this.hideBanner()
  }

  handleAppInstalled() {
    this.deferredPrompt = null
    this.bannerMode = null
    this.hideBanner()
    localStorage.removeItem(DISMISS_KEY)
  }

  isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone
  }

  isIosSafari() {
    const userAgent = window.navigator.userAgent || ""
    const isAppleTouchDevice = /iPhone|iPad|iPod/.test(userAgent)
      || (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1)
    const isSafari = /Safari/i.test(userAgent)
    const excluded = /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|YaBrowser/i.test(userAgent)
    return isAppleTouchDevice && isSafari && !excluded
  }

  showIosInstallGuideIfNeeded() {
    if (localStorage.getItem(DISMISS_KEY) === "true") {
      return
    }

    if (!this.isIosSafari()) {
      return
    }

    this.configureBannerForIos()
    this.showBanner()
  }

  configureBannerForPrompt() {
    this.bannerMode = "prompt"
    if (this.hasTitleTarget) {
      this.titleTarget.textContent = "安装到手机主屏幕"
    }
    if (this.hasDescriptionTarget) {
      this.descriptionTarget.textContent = "像应用一样打开聊天和通讯录，支持独立窗口使用。"
    }
    if (this.hasInstallButtonTarget) {
      this.installButtonTarget.textContent = "安装"
    }
    if (this.hasIosGuideTarget) {
      this.iosGuideTarget.classList.add("hidden")
    }
  }

  configureBannerForIos() {
    this.bannerMode = "ios-manual"
    if (this.hasTitleTarget) {
      this.titleTarget.textContent = "添加到主屏幕"
    }
    if (this.hasDescriptionTarget) {
      this.descriptionTarget.textContent = "iPhone Safari 不会弹系统安装窗，需要手动加入主屏幕。"
    }
    if (this.hasInstallButtonTarget) {
      this.installButtonTarget.textContent = "查看步骤"
    }
    if (this.hasIosGuideTarget) {
      this.iosGuideTarget.classList.add("hidden")
    }
  }

  toggleIosGuide() {
    if (!this.hasIosGuideTarget) {
      return
    }

    const shouldShow = this.iosGuideTarget.classList.contains("hidden")
    this.iosGuideTarget.classList.toggle("hidden", !shouldShow)
    if (this.hasInstallButtonTarget) {
      this.installButtonTarget.textContent = shouldShow ? "收起步骤" : "查看步骤"
    }
  }

  showBanner() {
    if (!this.hasBannerTarget) {
      return
    }

    this.bannerTarget.classList.remove("hidden")
  }

  hideBanner() {
    if (!this.hasBannerTarget) {
      return
    }

    this.bannerTarget.classList.add("hidden")
  }
}
