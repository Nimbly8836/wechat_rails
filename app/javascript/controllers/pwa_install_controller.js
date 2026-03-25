import { Controller } from "@hotwired/stimulus"

const DISMISS_KEY = "wechat-rails-pwa-install-dismissed"

export default class extends Controller {
  static targets = ["banner"]

  connect() {
    this.deferredPrompt = null
    this.boundBeforeInstallPrompt = this.captureInstallPrompt.bind(this)
    this.boundAppInstalled = this.handleAppInstalled.bind(this)

    if (window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone) {
      return
    }

    this.registerServiceWorker()
    window.addEventListener("beforeinstallprompt", this.boundBeforeInstallPrompt)
    window.addEventListener("appinstalled", this.boundAppInstalled)
  }

  disconnect() {
    window.removeEventListener("beforeinstallprompt", this.boundBeforeInstallPrompt)
    window.removeEventListener("appinstalled", this.boundAppInstalled)
  }

  registerServiceWorker() {
    if (!("serviceWorker" in navigator)) {
      return
    }

    navigator.serviceWorker.register("/service-worker.js", { scope: "/" })
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
    this.showBanner()
  }

  async install() {
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
    this.hideBanner()
    localStorage.removeItem(DISMISS_KEY)
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
