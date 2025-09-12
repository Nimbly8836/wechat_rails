import { Controller } from "@hotwired/stimulus"

// Connects to data-controller="chat"
export default class extends Controller {
  static targets = ["chatBox", "contact", "letter", "contactsList", "group"]

  connect() {
    console.log("Chat controller connected!", this.element)
  }

  // 点击联系人
  selectContact(event) {
    const contact = event.currentTarget
    const contactId = contact.dataset.contactId

    // 左侧样式切换
    this.contactTargets.forEach(c => c.classList.remove("active"))
    contact.classList.add("active")

    // 拉取聊天内容
    fetch(`/contact/${contactId}`)
        .then(resp => resp.text())
        .then(html => {
          this.chatBoxTarget.innerHTML = html
        })
  }

  // 点击字母导航
  scrollToGroup(event) {
    const initial = event.currentTarget.dataset.letter
    const group = this.groupTargets.find(g => g.id === `group-${initial}`)
    if (group) {
      group.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  // 滚动监听，自动高亮字母
  highlightLetter() {
    let currentInitial = "#"
    const containerTop = this.contactsListTarget.getBoundingClientRect().top

    this.groupTargets.forEach(group => {
      const rect = group.getBoundingClientRect()
      if (rect.top - containerTop <= 10) {
        currentInitial = group.id.replace("group-", "")
      }
    })

    this.letterTargets.forEach(letter => {
      letter.classList.toggle("active", letter.dataset.letter === currentInitial)
    })
  }
}
