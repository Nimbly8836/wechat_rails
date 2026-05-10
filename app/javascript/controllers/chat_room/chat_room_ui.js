import { chatStorageKeys, removeCache } from "utils/chat_storage";

export function toggleSearchPanel(controller, event = null) {
  event?.preventDefault();
  event?.stopPropagation();
  if (!controller.hasSearchPanelTarget) {
    return;
  }

  const shouldOpen = controller.searchPanelTarget.classList.contains("hidden");
  if (shouldOpen) {
    openSearchPanel(controller);
  } else {
    closeSearchPanel(controller);
  }
}

export function openSearchPanel(controller) {
  if (!controller.hasSearchPanelTarget) {
    return;
  }

  closeMembersPanel(controller);
  controller.searchPanelTarget.classList.remove("hidden");
  document.addEventListener("click", controller.boundCloseSearchPanel);
  if (controller.hasSearchInputTarget) {
    controller.searchInputTarget.focus();
    controller.searchInputTarget.select?.();
  }
}

export function closeSearchPanel(controller, event = null) {
  if (!controller.hasSearchPanelTarget) {
    return;
  }

  if (event?.currentTarget === document && controller.searchPanelTarget.contains(event.target)) {
    return;
  }

  controller.searchPanelTarget.classList.add("hidden");
  document.removeEventListener("click", controller.boundCloseSearchPanel);
}

export function searchMessages(controller, event) {
  const query = event?.target?.value?.trim() || "";
  if (!controller.hasSearchResultsTarget) {
    return;
  }

  if (controller.messageSearchTimer) {
    clearTimeout(controller.messageSearchTimer);
    controller.messageSearchTimer = null;
  }

  if (!query) {
    renderMessageSearchResults(controller, []);
    return;
  }

  controller.messageSearchTimer = setTimeout(() => {
    const requestId = ++controller.messageSearchRequestId;
    fetchMessageSearchResults(controller, query)
      .then((messages) => {
        if (requestId !== controller.messageSearchRequestId) {
          return;
        }
        renderMessageSearchResults(controller, messages);
      })
      .catch((error) => {
        console.error("搜索消息失败", error);
        renderMessageSearchResults(controller, []);
      });
  }, 180);
}

export function fetchMessageSearchResults(controller, query) {
  const params = new URLSearchParams({ q: query, limit: "40" });
  return controller.fetchJson(`/chat_room/${controller.idValue}/messages?${params.toString()}`, {
    emptyOnNotModified: []
  });
}

export function renderMessageSearchResults(controller, messages) {
  if (!controller.hasSearchResultsTarget) {
    return;
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    controller.searchResultsTarget.innerHTML = `
      <div class="px-4 py-8 text-center text-sm text-slate-400">
        没有匹配的聊天记录
      </div>
    `;
    return;
  }

  controller.searchResultsTarget.innerHTML = messages.map((wrapper) => {
    const msg = wrapper?.wx_message || {};
    const sender = controller.lookupSenderInfo(msg, msg.content);
    const preview = controller.buildMessagePreview(msg);
    const timestamp = wrapper?.message_time || wrapper?.created_at || "";
    return `
      <button type="button"
              class="flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-slate-50"
              data-message-search-result-id="${controller.escapeHtml(String(wrapper.id))}">
        <div class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
          ${controller.escapeHtml((sender?.name || "消息").slice(0, 1))}
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <div class="truncate text-sm font-medium text-slate-900">${controller.escapeHtml(sender?.name || (msg.self_send ? "我" : "消息"))}</div>
            <div class="shrink-0 text-[11px] text-slate-400">${controller.escapeHtml(controller.humanizeMessageType(preview.type))}</div>
          </div>
          <div class="mt-1 line-clamp-2 text-sm text-slate-600">${controller.escapeHtml(preview.content || "[消息]")}</div>
          <div class="mt-1 text-[11px] text-slate-400">${controller.escapeHtml(timestamp ? controller.formatTimestamp(timestamp) : "")}</div>
        </div>
      </button>
    `;
  }).join("");

  messages.forEach((wrapper) => {
    const button = controller.searchResultsTarget.querySelector(`[data-message-search-result-id="${wrapper.id}"]`);
    if (!button) {
      return;
    }
    button.addEventListener("click", async () => {
      closeSearchPanel(controller);
      await controller.focusMessageById(wrapper.id);
    });
  });
}

export function toggleMembersPanel(controller, event = null) {
  event?.preventDefault();
  event?.stopPropagation();
  if (!controller.hasMembersPanelTarget) {
    return;
  }

  const shouldOpen = controller.membersPanelTarget.classList.contains("hidden");
  if (shouldOpen) {
    openMembersPanel(controller);
  } else {
    closeMembersPanel(controller);
  }
}

export function openMembersPanel(controller) {
  if (!controller.hasMembersPanelTarget) {
    return;
  }

  closeSearchPanel(controller);
  controller.membersPanelTarget.classList.remove("hidden");
  document.addEventListener("click", controller.boundCloseMembersPanel);
  if (controller.hasMemberSearchInputTarget) {
    controller.memberSearchInputTarget.value = "";
  }
  controller.renderMembersPanel(controller.chatMembers);
  controller.loadChatMembers({ force: controller.chatMembers.length === 0 });
  controller.memberSearchInputTarget?.focus();
}

export function closeMembersPanel(controller, event = null) {
  if (!controller.hasMembersPanelTarget) {
    return;
  }

  if (event?.currentTarget === document && controller.membersPanelTarget.contains(event.target)) {
    return;
  }

  controller.membersPanelTarget.classList.add("hidden");
  document.removeEventListener("click", controller.boundCloseMembersPanel);
}

export function searchMembers(controller, event) {
  const query = event?.target?.value?.trim() || "";
  if (!controller.hasMemberResultsTarget) {
    return;
  }

  if (controller.memberSearchTimer) {
    clearTimeout(controller.memberSearchTimer);
    controller.memberSearchTimer = null;
  }

  if (!query) {
    controller.renderMembersPanel(controller.chatMembers);
    return;
  }

  controller.memberSearchTimer = setTimeout(() => {
    const requestId = ++controller.memberSearchRequestId;
    fetchMemberSearchResults(controller, query)
      .then((members) => {
        if (requestId !== controller.memberSearchRequestId) {
          return;
        }
        controller.renderMembersPanel(members);
      })
      .catch((error) => {
        console.error("搜索群成员失败", error);
        controller.renderMembersPanel([]);
      });
  }, 180);
}

export function fetchMemberSearchResults(controller, query) {
  const params = new URLSearchParams({ q: query, limit: "200" });
  return fetch(`/chat_room/${controller.idValue}/chat_members?${params.toString()}`, {
    headers: { "Accept": "application/json" }
  }).then((res) => {
    if (!res.ok) {
      throw new Error(`搜索群成员失败: ${res.status}`);
    }
    return res.json();
  });
}

export function renderMembersPanel(controller, members = []) {
  if (!controller.hasMemberResultsTarget) {
    return;
  }

  if (!Array.isArray(members) || members.length === 0) {
    controller.memberResultsTarget.innerHTML = `
      <div class="px-4 py-8 text-center text-sm text-slate-400">
        暂无匹配的群成员
      </div>
    `;
    return;
  }

  controller.memberResultsTarget.innerHTML = members.map((member) => {
    const name = member?.display_name || member?.remark || member?.nick_name || member?.user_name || "群成员";
    const avatar = member?.small_head_img_url || member?.big_head_img_url || "";
    const avatarHtml = avatar
      ? `<img src="${controller.escapeHtml(avatar)}" class="h-full w-full object-cover" alt="${controller.escapeHtml(name)}">`
      : controller.escapeHtml(String(name).slice(0, 1).toUpperCase());
    const meta = [member?.remark, member?.nick_name, member?.user_name].filter(Boolean).join(" · ");
    return `
      <div class="flex items-center gap-3 rounded-2xl px-3 py-3 transition hover:bg-slate-50">
        <div class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-sm font-semibold text-slate-500">
          ${avatarHtml}
        </div>
        <div class="min-w-0 flex-1">
          <div class="truncate text-sm font-medium text-slate-900">${controller.escapeHtml(name)}</div>
          <div class="truncate text-xs text-slate-400">${controller.escapeHtml(meta)}</div>
        </div>
      </div>
    `;
  }).join("");
}

export function toggleMenu(controller, event) {
  event.stopPropagation();
  if (!controller.hasMenuTarget) {
    return;
  }

  const shouldShow = controller.menuTarget.classList.contains("hidden");
  if (shouldShow) {
    controller.menuTarget.classList.remove("hidden");
    document.addEventListener("click", controller.boundCloseMenu);
  } else {
    closeMenu(controller);
  }
}

export function closeMenu(controller, event = null) {
  if (!controller.hasMenuTarget) {
    return;
  }

  if (event) {
    const target = event.target;
    if (controller.menuTarget.contains(target)) {
      return;
    }
    if (controller.hasThemePanelTarget && controller.themePanelTarget.contains(target)) {
      return;
    }
    if (controller.hasHookPanelTarget && controller.hookPanelTarget.contains(target)) {
      return;
    }
  }

  if (!controller.menuTarget.classList.contains("hidden")) {
    controller.menuTarget.classList.add("hidden");
  }

  document.removeEventListener("click", controller.boundCloseMenu);
}

export function handleMenuClose(controller, event = null) {
  event?.stopPropagation();
  closeMenu(controller);
}

export function openAppearanceSettings(controller, event) {
  event.stopPropagation();
  closeMenu(controller);

  if (!controller.hasThemePanelTarget) {
    return;
  }

  controller.themePanelTarget.classList.remove("hidden");
  controller.syncThemeInputs();
  document.addEventListener("click", controller.boundCloseThemePanel);
}

export function closeThemePanel(controller, event = null) {
  if (!controller.hasThemePanelTarget) {
    return;
  }
  if (!controller.themePanelTarget.classList.contains("hidden")) {
    controller.themePanelTarget.classList.add("hidden");
  }

  document.removeEventListener("click", controller.boundCloseThemePanel);
}

export function openHookPanel(controller, event) {
  event.stopPropagation();
  closeMenu(controller);

  if (!controller.hasHookPanelTarget) {
    return;
  }

  controller.hookPanelTarget.classList.remove("hidden");
  loadHookSettings(controller);
  document.addEventListener("click", controller.boundCloseHookPanel);
}

export function closeHookPanel(controller, event = null) {
  if (!controller.hasHookPanelTarget) {
    return;
  }
  if (!controller.hookPanelTarget.classList.contains("hidden")) {
    controller.hookPanelTarget.classList.add("hidden");
  }

  document.removeEventListener("click", controller.boundCloseHookPanel);
}

export function loadHookSettings(controller) {
  if (controller.hasHookStatusTarget) {
    controller.hookStatusTarget.textContent = "加载 Hook 配置中…";
  }

  fetch(`/chat_room/${controller.idValue}/hook`, {
    cache: "no-store",
    headers: { "Accept": "application/json" }
  })
    .then((res) => {
      if (!res.ok) throw new Error(`请求失败: ${res.status}`);
      return res.json();
    })
    .then((hook) => {
      if (controller.hasHookEnabledInputTarget) controller.hookEnabledInputTarget.checked = Boolean(hook.enabled);
      if (controller.hasHookTimeoutInputTarget) controller.hookTimeoutInputTarget.value = hook.timeout_ms || 1000;
      if (controller.hasHookCodeInputTarget) controller.hookCodeInputTarget.value = hook.code || "";
      if (controller.hasHookStatusTarget) {
        controller.hookStatusTarget.textContent = hook.last_error
          ? `最近错误：${hook.last_error}`
          : "Hook 会在服务端 Node 子进程中执行。";
      }
    })
    .catch((error) => {
      if (controller.hasHookStatusTarget) controller.hookStatusTarget.textContent = `加载失败：${error.message}`;
    });
}

export function saveHookSettings(controller, event) {
  event?.preventDefault();
  event?.stopPropagation();

  if (controller.hasHookStatusTarget) {
    controller.hookStatusTarget.textContent = "保存中…";
  }

  fetch(`/chat_room/${controller.idValue}/hook`, {
    method: "PATCH",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]')?.content || ""
    },
    body: JSON.stringify({
      hook: {
        enabled: controller.hasHookEnabledInputTarget ? controller.hookEnabledInputTarget.checked : false,
        timeout_ms: controller.hasHookTimeoutInputTarget ? controller.hookTimeoutInputTarget.value : 1000,
        code: controller.hasHookCodeInputTarget ? controller.hookCodeInputTarget.value : ""
      }
    })
  })
    .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
    .then(({ ok, data }) => {
      if (!ok) throw new Error((data.errors || [data.error || "保存失败"]).join("，"));
      if (controller.hasHookStatusTarget) controller.hookStatusTarget.textContent = "已保存。";
    })
    .catch((error) => {
      if (controller.hasHookStatusTarget) controller.hookStatusTarget.textContent = `保存失败：${error.message}`;
    });
}

export function handleInputCompositionStart(controller) { controller.isInputComposing = true; }
export function handleInputCompositionEnd(controller) { controller.isInputComposing = false; }

export function handleInputKeydown(controller, event) {
  if (event.key !== "Enter") {
    return;
  }

  if (event.shiftKey) {
    return;
  }

  if (event.isComposing || controller.isInputComposing || event.keyCode === 229) {
    return;
  }

  event.preventDefault();
  if (controller.inputTarget.value.trim() === "") {
    controller.inputTarget.placeholder = "发送消息不能为空";
    return;
  }

  controller.sendMessage(controller.pendingQuote ? "quote" : "text");
  controller.autoResize();
}

export function handleComposerFocus(controller) {
  document.documentElement.classList.add("tg-composer-active");
  controller.ensureComposerVisible(true);
}

export function handleComposerBlur(controller) {
  document.documentElement.classList.remove("tg-composer-active");
  window.setTimeout(() => controller.scheduleComposerLayoutSync(), 40);
}

export function handleComposerViewportChange(controller) {
  controller.scheduleComposerLayoutSync({
    scrollToBottom: document.activeElement === controller.inputTarget
      && controller.autoScrollPinnedToBottom
  });
}

export function ensureComposerVisible(controller, forceBottom = false) {
  if (forceBottom) {
    controller.autoScrollPinnedToBottom = true;
  }

  controller.scheduleComposerLayoutSync({ scrollToBottom: controller.autoScrollPinnedToBottom });
}

export function composerElement(controller) {
  return controller.element.querySelector(".telegram-composer");
}

export function scheduleComposerLayoutSync(controller, { scrollToBottom = false } = {}) {
  if (controller.composerLayoutFrame) {
    cancelAnimationFrame(controller.composerLayoutFrame);
  }

  controller.composerLayoutFrame = requestAnimationFrame(() => {
    controller.composerLayoutFrame = null;
    syncComposerLayout(controller, { scrollToBottom });
  });
}

export function syncComposerLayout(controller, { scrollToBottom = false } = {}) {
  const composer = composerElement(controller);
  if (!composer) {
    return;
  }

  const composerHeight = Math.max(Math.ceil(composer.getBoundingClientRect().height || 0), 76);
  controller.element.style.setProperty("--tg-composer-height", `${composerHeight}px`);

  if (scrollToBottom && controller.hasMessageListTarget) {
    controller.scheduleScrollToBottom();
  }
}

export function autoResize(controller) {
  const el = controller.inputTarget;
  const maxHeight = Math.round(Math.max(window.innerHeight * 0.3, 140));
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  controller.scheduleComposerLayoutSync();
}

export function syncMembers(controller, event = null) {
  event?.stopPropagation();
  closeMenu(controller);
  const [namespace, identifier] = chatStorageKeys.chatRoomMembers(controller.idValue);
  removeCache(namespace, identifier);
  fetch(`/chat_room/${controller.idValue}/sync_chat_members`, {
    method: "PUT", headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]').content
    },
    body: JSON.stringify({ chat_room_id: controller.idValue })
  });
  setTimeout(() => controller.loadChatMembers({ force: true }), 1200);
  setTimeout(() => controller.loadChatMembers({ force: true }), 2600);
}

export function openSidebar(controller, event = null) {
  event?.stopPropagation();
  const inChatShell = controller.element.closest('[data-controller~="chat"]');
  if (!inChatShell) {
    window.location.href = "/chat";
    return;
  }

  const sidebarEvent = new CustomEvent("chat:sidebar:open", { bubbles: true });
  controller.element.dispatchEvent(sidebarEvent);
}

export function syncMessages(controller, event = null) {
  event?.stopPropagation();
  closeMenu(controller);
  const syncWxid = controller.currentWxidValue || controller.ownerWxidValue;
  fetch(`/message/sync/${encodeURIComponent(syncWxid)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]').content
    }
  })
    .then((resp) => {
      if (!resp.ok) {
        throw new Error(`同步消息失败: ${resp.status}`);
      }
      return resp.json();
    })
    .then((data) => {
      if (data?.sync_wxid && data.sync_wxid !== syncWxid) {
        console.info("message sync resolved owner wxid", data);
      }
      controller.loadMessages({ replace: true });
      setTimeout(() => controller.loadMessages({ replace: true }), 1200);
      setTimeout(() => controller.loadMessages({ replace: true }), 2600);
    })
    .catch((error) => {
      console.error("同步消息失败", error);
      if (typeof window.showErrorToast === "function") {
        window.showErrorToast("同步消息失败，请稍后重试");
      } else {
        alert("同步消息失败，请稍后重试");
      }
    });
}

export function syncContact(controller, event = null) {
  event?.stopPropagation();
  closeMenu(controller);
  const [shellNamespace, shellIdentifier] = chatStorageKeys.chatRoomShell(controller.idValue);
  const [listNamespace, listIdentifier] = chatStorageKeys.chatRoomList();
  removeCache(shellNamespace, shellIdentifier);
  removeCache(listNamespace, listIdentifier);
  fetch(`/chat_room/${controller.idValue}/sync_chat_contact`, {
    method: "PUT", headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]').content
    }, body: JSON.stringify({ chat_room_id: controller.idValue })
  });
}

export function loadMore(controller) {
  controller.loadOlderMessagesChunk();
}
