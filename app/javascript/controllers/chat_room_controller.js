import { Controller } from "@hotwired/stimulus";
import {
  get_file_base64,
  replaceEmojis,
  setupEmojiInputPreview,
  hideAllEmojiPreviews
} from "utils/file_utils";
import {
  chatStorageKeys,
  readCache,
  writeCache,
  removeCache
} from "utils/chat_storage";
import { ChatRoomMessageState } from "utils/chat_room_message_state";
import {
  buildLocalMessagePreview,
  dispatchLocalChatMessage,
  createSendMessage,
  sendMessage
} from "controllers/chat_room/chat_room_message_sender";
import { renderMessages as renderChatRoomMessages,
  buildEmptyState as buildChatRoomEmptyState } from "controllers/chat_room/chat_room_message_renderer";
import {
  buildMessageGroup,
  buildRow,
  buildQuoteActionButton,
  renderMessageBubble,
  renderCardMessage,
  renderVoipMessage,
  renderVideoAccountMessage,
  renderChatHistoryMessage,
  renderXmlMessage,
  renderImageMessage,
  renderFileMessage,
  renderLocationMessage,
  renderVideoMessageAttachment,
  downloadFile,
  renderEmojiMessage,
  emojiRenderSourcesFor,
  appendCacheKey,
  extractEmojiCdnUrl,
  renderTextMessage,
  renderVoiceMessage,
  renderReferMessage,
  renderSystemNoticeMessage,
  applyBubbleStyle,
  renderStatus,
  addTimestamp,
  inlineTimestampTargetForBubble
} from "controllers/chat_room/chat_room_message_bubbles";
import {
  formatTimestamp,
  buildLinkedText,
  appendPlainSegment,
  createAnchor,
  decodeHtmlEntities,
  normalizeHref,
  buildMediaPreviewTitle,
  ensureMediaPreviewElements,
  openMediaPreview,
  closeMediaPreview,
  handleMediaPreviewKeydown
} from "controllers/chat_room/chat_room_text_and_media";
import {
  getMessageType,
  parsedMessageFor,
  payloadValue,
  normalizeParsedMessageType,
  cardPayloadFor,
  voipPayloadFor,
  chatHistoryPayloadFor,
  filePayloadFor,
  locationPayloadFor,
  quotePayloadFor,
  parseWxXmlMessage,
  parseWxVideoMessage,
  parseWxVoipMessage,
  localizeVoipStatus,
  parseWxChatHistoryMessage,
  parseWxChatHistoryItem,
  chatHistoryItemType,
  chatHistoryTypeLabel,
  formatVoipDuration,
  parseWxFileAttachment,
  parseWxLocationMessage,
  extractXmlPayload,
  parseXmlDocument,
  mapAppMessageType,
  cleanXmlTitle,
  isUnsupportedXmlTitle,
  isPlaceholderUpgradeUrl,
  attachmentUrl,
  normalizeReferenceId,
  findChatMember,
  resolveMemberName,
  resolveMemberAvatar,
  stripRoomSenderPrefix,
  sortedMessageWrappers,
  messageTimestampSortValue,
  messageNumericIdSortValue,
  oldestServerMessageId,
  normalizeMessageType,
  buildMessagePreview,
  isSystemNoticeMessage,
  buildSystemNoticeContent,
  lookupSenderInfo,
  humanizeMessageType
} from "controllers/chat_room/chat_room_message_content";
import {
  DEFAULT_THEME,
  readChatRoomTheme,
  normalizeThemeConfig,
  persistTheme,
  updateBackgroundColor,
  updateBubbleColor,
  updateBackgroundImage,
  clearBackgroundImage,
  openBackgroundUpload,
  uploadBackgroundImage,
  resetTheme,
  updateFontFamily,
  updateCustomFont,
  applyTheme,
  refreshBubbleStyles,
  syncThemeInputs
} from "controllers/chat_room/chat_room_theme";
import {
  toggleSearchPanel,
  openSearchPanel,
  closeSearchPanel,
  searchMessages,
  fetchMessageSearchResults,
  renderMessageSearchResults,
  toggleMembersPanel,
  openMembersPanel,
  closeMembersPanel,
  searchMembers,
  fetchMemberSearchResults,
  renderMembersPanel,
  toggleMenu,
  closeMenu,
  handleMenuClose,
  openAppearanceSettings,
  closeThemePanel,
  openHookPanel,
  closeHookPanel,
  saveHookSettings,
  openBotManager,
  handleInputCompositionStart,
  handleInputCompositionEnd,
  handleInputKeydown,
  handleComposerFocus,
  handleComposerBlur,
  handleComposerViewportChange,
  ensureComposerVisible,
  composerElement,
  scheduleComposerLayoutSync,
  syncComposerLayout,
  autoResize,
  syncMembers,
  openSidebar,
  syncMessages,
  syncContact,
  loadMore
} from "controllers/chat_room/chat_room_ui";
import {
  handleVoiceClick,
  playVoice,
  seekVoice,
  toggleSpeed,
  formatVoiceDuration
} from "controllers/chat_room/chat_room_voice_player";

const EMOJI_REQUEST_VERSION = "20260330b";
const MESSAGE_CACHE_FRESH_MS = 15 * 1000;
const MESSAGE_FETCH_LIMIT = 100;

export default class extends Controller {
  static targets = ["messageList", "input", "emptyMessage", "menu",
    "showMore", "themePanel", "backgroundInput", "bubbleInput",
    "backgroundImageInput", "backgroundUploadInput", "backgroundUploadStatus",
    "fileInput", "uploadStatus",
    "fontSelect", "fontCustomInput", "attachmentSelect", "quoteComposer",
    "quoteComposerMeta", "quoteComposerContent", "hookPanel", "hookBotList",
    "hookStatus", "searchPanel",
    "searchInput", "searchResults", "searchEmpty", "membersPanel",
    "memberSearchInput", "memberResults", "memberEmpty", "voiceRecorder",
    "voiceRecorderStatus", "voiceRecorderTimer"];
  static values = {
    currentWxid: String,
    ownerWxid: String,
    contactId: Number,
    id: Number,
    name: String,
    members: String
  };

  connect() {
    hideAllEmojiPreviews();
    this.theme = {
      ...DEFAULT_THEME,
      ...this.normalizeThemeConfig(this.readChatRoomTheme()),
      ...(this.theme || {})
    };

    this.boundCloseMenu = this.closeMenu.bind(this);
    this.boundCloseThemePanel = this.closeThemePanel.bind(this);
    this.boundCloseHookPanel = this.closeHookPanel.bind(this);
    this.boundCloseAttachmentSelect = this.mouseleaveAttachment.bind(this);
    this.boundCloseSearchPanel = this.closeSearchPanel.bind(this);
    this.boundCloseMembersPanel = this.closeMembersPanel.bind(this);
    this.boundPreventMenuHide = (event) => event.stopPropagation();
    this.boundPreventThemeHide = (event) => event.stopPropagation();
    this.boundPreventHookHide = (event) => event.stopPropagation();
    this.boundCloseAttachmentSelectHide = (event) => event.stopPropagation();
    this.boundPreventSearchHide = (event) => event.stopPropagation();
    this.boundPreventMembersHide = (event) => event.stopPropagation();

    if (this.hasMenuTarget) {
      this.menuTarget.addEventListener("click", this.boundPreventMenuHide);
    }

    if (this.hasThemePanelTarget) {
      this.themePanelTarget.addEventListener("click",
        this.boundPreventThemeHide);
    }

    if (this.hasHookPanelTarget) {
      this.hookPanelTarget.addEventListener("click", this.boundPreventHookHide);
    }

    if (this.hasAttachmentSelectTarget) {
      this.attachmentSelectTarget.addEventListener("mouseleave",
        this.boundCloseAttachmentSelect);
    }
    if (this.hasSearchPanelTarget) {
      this.searchPanelTarget.addEventListener("click", this.boundPreventSearchHide);
    }
    if (this.hasMembersPanelTarget) {
      this.membersPanelTarget.addEventListener("click", this.boundPreventMembersHide);
    }

    // 防止重复绑定
    if (!this._boundHideAttachmentSelect) {
      this._boundHideAttachmentSelect = this.hideAttachmentSelect.bind(this);
    }

    this.pendingNotifyRefreshTimer = null;
    this.voiceBlobUrls = new Map();
    this.mediaRecorder = null;
    this.voiceRecordingStream = null;
    this.voiceRecordingChunks = [];
    this.voiceRecordingStartedAt = null;
    this.voiceRecordingTimer = null;
    this.voiceRecordingShouldSend = false;
    this.pendingRecordedMimeType = null;
    this.currentVoicePlayback = null;
    this.voicePlaybackRates = new Map();
    this.pendingVoiceSeeks = new Map();
    this.voicePlaybackOptions = [0.5, 1.0, 1.5, 2.0];
    this.highlightedRow = null;
    this.highlightTimer = null;
    this.loadingOlderMessages = false;
    this.initialMessagesLoaded = false;
    this.loadMessagesPromise = null;
    this.autoScrollPinnedToBottom = true;
    this.mediaPreviewOverlay = null;
    this.mediaPreviewFrame = null;
    this.mediaPreviewImage = null;
    this.mediaPreviewTitle = null;
    this.mediaPreviewMeta = null;
    this.mediaPreviewOpenLink = null;
    this.mediaPreviewPreviousBodyOverflow = "";
    this.boundHandleMediaPreviewKeydown = this.handleMediaPreviewKeydown.bind(this);
    this.pendingQuote = null;
    this.messageSearchTimer = null;
    this.memberSearchTimer = null;
    this.isInputComposing = false;
    this.boundInputKeydown = this.handleInputKeydown.bind(this);
    this.boundInputCompositionStart = this.handleInputCompositionStart.bind(this);
    this.boundInputCompositionEnd = this.handleInputCompositionEnd.bind(this);
    this.messageSearchRequestId = 0;
    this.memberSearchRequestId = 0;
    const cachedMembers = this.readCachedChatMembers();
    this.chatMembers = cachedMembers;
    const initialMembers = this.normalizeChatMembersData(this.membersValue);
    if (!this.chatMembers.length && initialMembers.length) {
      this.chatMembers = initialMembers;
      this.persistChatMembers();
    }
    this.boundChatNotify = (e) => {
      const payload = e.detail || {};
      if (this.matchesCurrentRoom(payload)) {
        this.refreshRoomFromNotification(payload);
      }
    };
    this.boundGlobalBackgroundImageChange = () => {
      this.theme = {
        ...this.theme,
        ...this.normalizeThemeConfig(this.readChatRoomTheme())
      };
      this.applyTheme({ refreshBubbles: false });
      this.syncThemeInputs();
    };
    this.boundComposerFocus = this.handleComposerFocus.bind(this);
    this.boundComposerBlur = this.handleComposerBlur.bind(this);
    this.boundComposerViewportChange = this.handleComposerViewportChange.bind(this);
    this.boundAutoResize = this.autoResize.bind(this);

    window.addEventListener("chat:notify", this.boundChatNotify);
    window.addEventListener("chat:global-background-image:change",
      this.boundGlobalBackgroundImageChange);

    this.messageState = new ChatRoomMessageState(this.idValue);
    this.messages = this.messageState.messages;
    const restoredMessages = this.restoreCachedMessages();

    if (this.isRoom()) {
      this.loadChatMembers({ force: cachedMembers.length === 0 });
      if (cachedMembers.length) {
        requestAnimationFrame(() => this.loadChatMembers({ force: true }));
      }
    }

    if (restoredMessages > 0) {
      const cachedMessagesFresh = this.messageState.cachedMessagesFresh(MESSAGE_CACHE_FRESH_MS);
      this.renderMessages({ skipPersist: true });
      this.initialMessagesLoaded = true;
      if (!cachedMessagesFresh) {
        requestAnimationFrame(() => this.refreshCachedMessages());
      }
    } else {
      this.loadMessages();
    }

    this.boundVisibilityRefresh = () => {
      if (document.visibilityState === "visible" && this.initialMessagesLoaded) {
        this.loadNewMessages();
      }
    };
    this.boundEventSourceOpen = () => {
      if (this.initialMessagesLoaded) this.loadNewMessages();
    };
    document.addEventListener("visibilitychange", this.boundVisibilityRefresh);
    window.addEventListener("chat:events:open", this.boundEventSourceOpen);

    this.applyTheme({ refreshBubbles: false });
    this.syncThemeInputs();
    this.ensureMediaPreviewElements();
    this.renderPendingQuote();
    this.renderMembersPanel(this.chatMembers);

    this.inputTarget.addEventListener("keydown", this.boundInputKeydown);
    this.inputTarget.addEventListener("compositionstart",
      this.boundInputCompositionStart);
    this.inputTarget.addEventListener("compositionend",
      this.boundInputCompositionEnd);

    this.messageListTarget.addEventListener("scroll",
      this.handleScroll.bind(this));

    this.inputTarget.addEventListener("focus", this.boundComposerFocus);
    this.inputTarget.addEventListener("blur", this.boundComposerBlur);
    this.inputTarget.addEventListener("input", this.boundAutoResize);
    window.visualViewport?.addEventListener("resize",
      this.boundComposerViewportChange);
    window.visualViewport?.addEventListener("scroll",
      this.boundComposerViewportChange);
    this.autoResize();

    // 设置 emoji 预览功能
    if (this.hasInputTarget) {
      this.cleanupEmojiPreview = setupEmojiInputPreview(this.inputTarget,
        this.idValue);
    }
  }

  readChatRoomTheme() { return readChatRoomTheme(this); }
  normalizeThemeConfig(rawTheme) { return normalizeThemeConfig(this, rawTheme); }
  persistTheme() { return persistTheme(this); }

  readCachedChatMembers() {
    const [namespace, identifier] = chatStorageKeys.chatRoomMembers(this.idValue);
    const cached = readCache(namespace, identifier, []);
    return this.normalizeChatMembersData(cached);
  }

  persistChatMembers() {
    const [namespace, identifier] = chatStorageKeys.chatRoomMembers(this.idValue);
    writeCache(namespace, identifier, this.chatMembers || []);
  }

  normalizeChatMembersData(value) {
    let current = value;

    for (let depth = 0; depth < 3; depth += 1) {
      if (Array.isArray(current)) {
        return current;
      }

      if (current && typeof current === "object") {
        if (Array.isArray(current.members)) {
          return current.members;
        }
        break;
      }

      if (typeof current !== "string") {
        break;
      }

      const trimmed = current.trim();
      if (!trimmed) {
        return [];
      }

      try {
        current = JSON.parse(trimmed);
      } catch (error) {
        console.warn("群成员数据解析失败", error);
        return [];
      }
    }

    return Array.isArray(current) ? current : [];
  }

  loadChatMembers({ force = false } = {}) {
    if (!this.isRoom()) {
      return Promise.resolve([]);
    }

    if (!force && this.chatMembers?.length) {
      return Promise.resolve(this.chatMembers);
    }

    return fetch(`/chat_room/${this.idValue}/chat_members`)
      .then(res => res.json())
      .then(data => {
        this.chatMembers = this.normalizeChatMembersData(data);
        this.persistChatMembers();
        this.renderMessages();
        this.renderMembersPanel(this.chatMembers);
        return this.chatMembers;
      })
      .catch(error => {
        console.error("加载room members 失败", error);
        return [];
      });
  }

  persistMessages() {
    this.messageState.persistMessages();
  }

  restoreCachedMessages() {
    return this.messageState.restoreCachedMessages();
  }

  refreshCachedMessages() {
    if (!this.element?.isConnected) {
      return Promise.resolve(0);
    }
    if (this.latestServerMessageId() == null) {
      return this.loadMessages({ replace: true });
    }

    return this.loadNewMessages({ refreshCacheOnEmpty: true, resetOnLimit: true });
  }

  disconnect() {
    if (this.messageSearchTimer) {
      clearTimeout(this.messageSearchTimer);
      this.messageSearchTimer = null;
    }
    if (this.memberSearchTimer) {
      clearTimeout(this.memberSearchTimer);
      this.memberSearchTimer = null;
    }

    if (this.highlightTimer) {
      clearTimeout(this.highlightTimer);
      this.highlightTimer = null;
    }

    document.removeEventListener("click", this.boundCloseMenu);
    document.removeEventListener("click", this.boundCloseThemePanel);
    document.removeEventListener("click", this.boundCloseHookPanel);

    if (this.hasMenuTarget) {
      this.menuTarget.removeEventListener("click", this.boundPreventMenuHide);
    }

    if (this.hasThemePanelTarget) {
      this.themePanelTarget.removeEventListener("click",
        this.boundPreventThemeHide);
    }

    if (this.hasHookPanelTarget) {
      this.hookPanelTarget.removeEventListener("click", this.boundPreventHookHide);
    }

    if (this.hasAttachmentSelectTarget) {
      this.attachmentSelectTarget.removeEventListener("mouseleave",
        this.boundCloseAttachmentSelect);
    }
    if (this.hasSearchPanelTarget) {
      this.searchPanelTarget.removeEventListener("click", this.boundPreventSearchHide);
    }
    if (this.hasMembersPanelTarget) {
      this.membersPanelTarget.removeEventListener("click", this.boundPreventMembersHide);
    }

    if (this.boundChatNotify) {
      window.removeEventListener("chat:notify", this.boundChatNotify);
    }
    if (this.boundGlobalBackgroundImageChange) {
      window.removeEventListener("chat:global-background-image:change",
        this.boundGlobalBackgroundImageChange);
    }
    this.inputTarget.removeEventListener("focus", this.boundComposerFocus);
    this.inputTarget.removeEventListener("blur", this.boundComposerBlur);
    this.inputTarget.removeEventListener("input", this.boundAutoResize);
    this.inputTarget.removeEventListener("keydown", this.boundInputKeydown);
    this.inputTarget.removeEventListener("compositionstart",
      this.boundInputCompositionStart);
    this.inputTarget.removeEventListener("compositionend",
      this.boundInputCompositionEnd);
    window.visualViewport?.removeEventListener("resize",
      this.boundComposerViewportChange);
    window.visualViewport?.removeEventListener("scroll",
      this.boundComposerViewportChange);
    document.documentElement.classList.remove("tg-composer-active");
    if (this.composerLayoutFrame) {
      cancelAnimationFrame(this.composerLayoutFrame);
      this.composerLayoutFrame = null;
    }
    this.element?.style?.removeProperty("--tg-composer-height");

    if (this.pendingNotifyRefreshTimer) {
      clearTimeout(this.pendingNotifyRefreshTimer);
      this.pendingNotifyRefreshTimer = null;
    }

    document.removeEventListener("visibilitychange", this.boundVisibilityRefresh);
    window.removeEventListener("chat:events:open", this.boundEventSourceOpen);

    this.stopVoiceRecordingTimer();
    this.releaseVoiceRecordingStream();

    if (typeof this.cleanupEmojiPreview === "function") {
      this.cleanupEmojiPreview();
    }

    document.removeEventListener("click", this._boundHideAttachmentSelect);
    document.removeEventListener("click", this.boundCloseSearchPanel);
    document.removeEventListener("click", this.boundCloseMembersPanel);
    document.removeEventListener("keydown", this.boundHandleMediaPreviewKeydown);

    if (this.mediaPreviewOverlay) {
      this.mediaPreviewOverlay.remove();
      this.mediaPreviewOverlay = null;
      this.mediaPreviewFrame = null;
      this.mediaPreviewImage = null;
      this.mediaPreviewTitle = null;
      this.mediaPreviewMeta = null;
      this.mediaPreviewOpenLink = null;
    }

    if (document.body.style.overflow === "hidden") {
      document.body.style.overflow = this.mediaPreviewPreviousBodyOverflow || "";
    }

    this.closeMemberDetail();


  }

  handleInputCompositionStart() { return handleInputCompositionStart(this); }
  handleInputCompositionEnd() { return handleInputCompositionEnd(this); }
  handleInputKeydown(event) { return handleInputKeydown(this, event); }

  isRoom() {
    return String(this.currentWxidValue || "").endsWith("@chatroom");
  }

  handleScroll() {
    this.syncAutoScrollState();

    if (!this.hasShowMoreTarget) {
      return;
    }

    if (this.messageListTarget.scrollTop <= 0
      && this.messageListTarget.scrollHeight >= 100) {
      this.showMoreTarget.style.display = "block";
    } else {
      this.showMoreTarget.style.display = "none";
    }
  }

  isNearBottom(threshold = 96) {
    if (!this.hasMessageListTarget) {
      return true;
    }

    const container = this.messageListTarget;
    const distanceToBottom = container.scrollHeight - container.clientHeight
      - container.scrollTop;
    return distanceToBottom <= threshold;
  }

  syncAutoScrollState() {
    this.autoScrollPinnedToBottom = this.isNearBottom();
  }

  scrollToBottom() {
    if (!this.hasMessageListTarget) {
      return;
    }

    this.messageListTarget.scrollTop = this.messageListTarget.scrollHeight;
  }

  scheduleScrollToBottom() {
    requestAnimationFrame(() => {
      this.scrollToBottom();
      requestAnimationFrame(() => this.scrollToBottom());
    });
  }

  stickToBottomIfNeeded() {
    if (this.autoScrollPinnedToBottom) {
      this.scheduleScrollToBottom();
    }
  }

  autoResize() { return autoResize(this); }
  handleComposerFocus() { return handleComposerFocus(this); }
  handleComposerBlur() { return handleComposerBlur(this); }
  handleComposerViewportChange() { return handleComposerViewportChange(this); }
  ensureComposerVisible(forceBottom = false) { return ensureComposerVisible(this, forceBottom); }
  composerElement() { return composerElement(this); }
  scheduleComposerLayoutSync(options = {}) { return scheduleComposerLayoutSync(this, options); }
  syncComposerLayout(options = {}) { return syncComposerLayout(this, options); }

  loadMessages({ replace = false } = {}) {
    if (this.loadMessagesPromise) {
      return this.loadMessagesPromise;
    }

    this.loadMessagesPromise = this.fetchMessages()
      .then(data => {
        if (replace) {
          this.messages.clear();
        }
        this.messages.merge(data)
        this.persistMessages();
        this.renderMessages();
        this.initialMessagesLoaded = true;
        return Array.isArray(data) ? data.length : 0;
      })
      .catch(error => {
        console.error("加载消息失败:", error);
        return 0;
      })
      .finally(() => {
        this.loadMessagesPromise = null;
      });

    return this.loadMessagesPromise;
  }

  fetchJson(url, { emptyOnNotModified = null } = {}) {
    return fetch(url, {
      cache: "no-store",
      headers: {
        "Accept": "application/json"
      }
    }).then((res) => {
      if (res.status === 304) {
        return emptyOnNotModified;
      }
      if (!res.ok) {
        throw new Error(`请求失败: ${res.status}`);
      }
      return res.json();
    });
  }

  fetchMessages({ beforeId = null, afterId = null, includeId = null } = {}) {
    const params = new URLSearchParams();
    if (beforeId != null) {
      params.set("before_id", beforeId);
    }
    if (afterId != null) {
      params.set("after_id", afterId);
    }
    if (includeId != null) {
      params.set("include_id", includeId);
    }

    const query = params.toString();
    const url = query ? `/chat_room/${this.idValue}/messages?${query}`
      : `/chat_room/${this.idValue}/messages`;

    return this.fetchJson(url, { emptyOnNotModified: [] });
  }

  toggleSearchPanel(event = null) { return toggleSearchPanel(this, event); }
  openSearchPanel() { return openSearchPanel(this); }
  closeSearchPanel(event = null) { return closeSearchPanel(this, event); }
  searchMessages(event) { return searchMessages(this, event); }
  fetchMessageSearchResults(query) { return fetchMessageSearchResults(this, query); }
  renderMessageSearchResults(messages) { return renderMessageSearchResults(this, messages); }
  toggleMembersPanel(event = null) { return toggleMembersPanel(this, event); }
  openMembersPanel() { return openMembersPanel(this); }
  closeMembersPanel(event = null) { return closeMembersPanel(this, event); }
  searchMembers(event) { return searchMembers(this, event); }
  fetchMemberSearchResults(query) { return fetchMemberSearchResults(this, query); }
  renderMembersPanel(members = []) { return renderMembersPanel(this, members); }

  renderMessages(options = {}) {
    return renderChatRoomMessages(this, options);
  }

  buildEmptyState() {
    return buildChatRoomEmptyState();
  }

  getMessageType(msg) { return getMessageType(this, msg); }
  parsedMessageFor(msg) { return parsedMessageFor(this, msg); }
  payloadValue(payload, ...keys) { return payloadValue(this, payload, ...keys); }
  normalizeParsedMessageType(type) { return normalizeParsedMessageType(this, type); }
  cardPayloadFor(msg) { return cardPayloadFor(this, msg); }
  voipPayloadFor(msg) { return voipPayloadFor(this, msg); }
  chatHistoryPayloadFor(msg) { return chatHistoryPayloadFor(this, msg); }
  filePayloadFor(msg) { return filePayloadFor(this, msg); }
  locationPayloadFor(msg) { return locationPayloadFor(this, msg); }
  quotePayloadFor(msg) { return quotePayloadFor(this, msg); }
  parseWxXmlMessage(xmlString) { return parseWxXmlMessage(this, xmlString); }
  parseWxVideoMessage(xmlString) { return parseWxVideoMessage(this, xmlString); }
  parseWxVoipMessage(xmlString) { return parseWxVoipMessage(this, xmlString); }
  localizeVoipStatus(rawMsg = "") { return localizeVoipStatus(this, rawMsg); }
  parseWxChatHistoryMessage(xmlString) { return parseWxChatHistoryMessage(this, xmlString); }
  parseWxChatHistoryItem(itemNode, fallbackLine = "") { return parseWxChatHistoryItem(this, itemNode, fallbackLine); }
  chatHistoryItemType(dataType) { return chatHistoryItemType(this, dataType); }
  chatHistoryTypeLabel(dataType) { return chatHistoryTypeLabel(this, dataType); }
  formatVoipDuration(totalSeconds) { return formatVoipDuration(this, totalSeconds); }
  parseWxFileAttachment(xmlString) { return parseWxFileAttachment(this, xmlString); }
  parseWxLocationMessage(xmlString) { return parseWxLocationMessage(this, xmlString); }
  extractXmlPayload(xmlString = "") { return extractXmlPayload(this, xmlString); }
  parseXmlDocument(xmlString) { return parseXmlDocument(this, xmlString); }
  mapAppMessageType(msgType) { return mapAppMessageType(this, msgType); }
  cleanXmlTitle(title = "") { return cleanXmlTitle(this, title); }
  isUnsupportedXmlTitle(title = "") { return isUnsupportedXmlTitle(this, title); }
  isPlaceholderUpgradeUrl(url = "") { return isPlaceholderUpgradeUrl(this, url); }
  attachmentUrl(type, msg, options = {}) { return attachmentUrl(this, type, msg, options); }
  normalizeReferenceId(value) { return normalizeReferenceId(this, value); }
  buildMediaPreviewTitle(msg, fallback = "媒体预览") { return buildMediaPreviewTitle(this, msg, fallback); }
  findChatMember(wxid) { return findChatMember(this, wxid); }
  resolveMemberName(member, fallback = "") { return resolveMemberName(this, member, fallback); }
  resolveMemberAvatar(member) { return resolveMemberAvatar(this, member); }
  stripRoomSenderPrefix(text = "") { return stripRoomSenderPrefix(this, text); }
  sortedMessageWrappers() { return sortedMessageWrappers(this); }
  messageTimestampSortValue(wrapper) { return messageTimestampSortValue(this, wrapper); }
  messageNumericIdSortValue(wrapper) { return messageNumericIdSortValue(this, wrapper); }
  oldestServerMessageId() { return oldestServerMessageId(this); }
  normalizeMessageType(msg) { return normalizeMessageType(this, msg); }
  buildMessagePreview(msg) { return buildMessagePreview(this, msg); }
  isSystemNoticeMessage(msg) { return isSystemNoticeMessage(this, msg); }
  buildSystemNoticeContent(msg) { return buildSystemNoticeContent(this, msg); }
  lookupSenderInfo(msg, rawContent = "") { return lookupSenderInfo(this, msg, rawContent); }
  humanizeMessageType(msgType) { return humanizeMessageType(this, msgType); }

  replaceRoomSenderWxid(msg) {
    if (this.chatMembers && msg.content) {
      const title_send_wxid = msg.content.match(/^[^:\n]+:\n/)?.[0];
      if (title_send_wxid) {
        const wxid = title_send_wxid.slice(0, -2);
        const member_info = this.findChatMember(wxid);
        if (member_info) {
          msg.content = msg.content.replace(wxid + ":\n", "");
        }
      }
    }
  }

  buildMessageGroup(msg, senderInfo) { return buildMessageGroup(this, msg, senderInfo); }
  buildRow(msg, senderInfo) { return buildRow(this, msg, senderInfo); }
  buildQuoteActionButton(wrapper, msg, senderInfo) { return buildQuoteActionButton(this, wrapper, msg, senderInfo); }
  renderMessageBubble(msg, isNewGroup, senderInfo, isFirstMessage) { return renderMessageBubble(this, msg, isNewGroup, senderInfo, isFirstMessage); }

  renderCardMessage(bubble, msg, isNewGroup, senderInfo, isFirstMessage) { return renderCardMessage(this, bubble, msg, isNewGroup, senderInfo, isFirstMessage); }
  renderVoipMessage(bubble, msg, isNewGroup, senderInfo, isFirstMessage) { return renderVoipMessage(this, bubble, msg, isNewGroup, senderInfo, isFirstMessage); }
  renderVideoAccountMessage(bubble, msg, isNewGroup, senderInfo, isFirstMessage) { return renderVideoAccountMessage(this, bubble, msg, isNewGroup, senderInfo, isFirstMessage); }
  renderChatHistoryMessage(bubble, msg, isNewGroup, senderInfo, isFirstMessage) { return renderChatHistoryMessage(this, bubble, msg, isNewGroup, senderInfo, isFirstMessage); }
  renderXmlMessage(bubble, msg, isNewGroup, senderInfo, isFirstMessage) { return renderXmlMessage(this, bubble, msg, isNewGroup, senderInfo, isFirstMessage); }
  renderImageMessage(bubble, msg, isNewGroup, senderInfo, isFirstMessage) { return renderImageMessage(this, bubble, msg, isNewGroup, senderInfo, isFirstMessage); }
  renderFileMessage(bubble, msg, isNewGroup, senderInfo, isFirstMessage) { return renderFileMessage(this, bubble, msg, isNewGroup, senderInfo, isFirstMessage); }
  renderLocationMessage(bubble, msg, isNewGroup, senderInfo, isFirstMessage) { return renderLocationMessage(this, bubble, msg, isNewGroup, senderInfo, isFirstMessage); }
  renderVideoMessage(bubble, msg, isNewGroup, senderInfo, isFirstMessage) { return renderVideoMessageAttachment(this, bubble, msg, isNewGroup, senderInfo, isFirstMessage); }
  downloadFile(url, filename) { return downloadFile(this, url, filename); }
  renderEmojiMessage(bubble, msg, isNewGroup, senderInfo, isFirstMessage) { return renderEmojiMessage(this, bubble, msg, isNewGroup, senderInfo, isFirstMessage); }
  emojiRenderSourcesFor(msg) { return emojiRenderSourcesFor(this, msg); }
  appendCacheKey(url, cacheKey) { return appendCacheKey(this, url, cacheKey); }
  extractEmojiCdnUrl(xmlString = "") { return extractEmojiCdnUrl(this, xmlString); }
  renderTextMessage(bubble, msg, isNewGroup, senderInfo, isFirstMessage) { return renderTextMessage(this, bubble, msg, isNewGroup, senderInfo, isFirstMessage); }
  renderVoiceMessage(bubble, msg, isNewGroup, senderInfo, isFirstMessage) { return renderVoiceMessage(this, bubble, msg, isNewGroup, senderInfo, isFirstMessage); }
  renderReferMessage(bubble, msg, isNewGroup, senderInfo, isFirstMessage) { return renderReferMessage(this, bubble, msg, isNewGroup, senderInfo, isFirstMessage); }
  renderSystemNoticeMessage(bubble, msg, isNewGroup, senderInfo, isFirstMessage) { return renderSystemNoticeMessage(this, bubble, msg, isNewGroup, senderInfo, isFirstMessage); }
  applyBubbleStyle(bubble, msg, isNewGroup = true, senderInfo = null, isFirstMessage = false) { return applyBubbleStyle(this, bubble, msg, isNewGroup, senderInfo, isFirstMessage); }
  renderStatus(m, bubble, msg) { return renderStatus(this, m, bubble, msg); }
  addTimestamp(bubble, wrapper, msg = null) { return addTimestamp(this, bubble, wrapper, msg); }
  inlineTimestampTargetForBubble(bubble, msg = null) { return inlineTimestampTargetForBubble(this, bubble, msg); }

  formatTimestamp(value) { return formatTimestamp(this, value); }

  buildLocalMessagePreview(type, tempMsg) {
    return buildLocalMessagePreview(this, type, tempMsg);
  }

  dispatchLocalChatMessage(type, tempMsg) {
    return dispatchLocalChatMessage(this, type, tempMsg);
  }

  createSendMessage(type, message) {
    return createSendMessage(this, type, message);
  }

  sendMessage(type, message) {
    return sendMessage(this, type, message);
  }

  selectGifEmoji(event) {
    const detail = event.detail || {};
    this.sendMessage("emoji", {
      extra: {
        file_md5: detail.fileMd5 || detail.file_md5,
        total_len: detail.totalLen || detail.total_len,
        preview_url: detail.previewUrl || detail.preview_url
      }
    });
  }

  parseWxXmlMessage(xmlString) {
    try {
      const xml = this.parseXmlDocument(xmlString);
      if (!xml) {
        return { type: "text", content: xmlString };
      }

      const rawTitle = xml.querySelector("title")?.textContent?.trim() || "";
      const desc = xml.querySelector("des")?.textContent?.trim() || "";
      const rawUrl = xml.querySelector("url")?.textContent?.trim() || "";
      const cover = xml.querySelector("thumburl")?.textContent?.trim()
        || xml.querySelector("cover")?.textContent?.trim();
      const source = xml.querySelector(
        "publisher > nickname")?.textContent?.trim() || xml.querySelector(
          "appname")?.textContent?.trim();
      const msgType = Number(xml.querySelector("appmsg > type")?.textContent
        || xml.querySelector("type")?.textContent || 0);
      const refContent = xml.querySelector("refermsg")?.querySelector(
        "content")?.textContent?.trim() || "";
      const refServerId = xml.querySelector("refermsg")?.querySelector(
        "svrid")?.textContent?.trim() || "";

      const finderFeed = xml.querySelector("finderFeed");
      if (finderFeed) {
        const nickname = finderFeed.querySelector("nickname")?.textContent?.trim()
          || "";
        const finderDesc = finderFeed.querySelector("desc")?.textContent?.trim()
          || desc;
        const media = finderFeed.querySelector("mediaList > media");
        const mediaUrl = media?.querySelector("url")?.textContent?.trim() || "";
        const finderCover = media?.querySelector("coverUrl")?.textContent?.trim()
          || media?.querySelector("thumbUrl")?.textContent?.trim()
          || media?.querySelector("fullCoverUrl")?.textContent?.trim()
          || finderFeed.querySelector("avatar")?.textContent?.trim()
          || cover;

        return {
          type: "xml",
          detectedType: "video_account",
          title: nickname || this.cleanXmlTitle(rawTitle) || "视频号分享",
          desc: finderDesc,
          url: this.isPlaceholderUpgradeUrl(rawUrl) ? "" : rawUrl,
          cover: finderCover,
          source: nickname ? `视频号 · ${nickname}` : "视频号",
          mediaUrl,
          msgType,
          refContent,
          refServerId,
          durationSeconds: Math.round(
            Number(media?.querySelector("videoPlayDuration")?.textContent || 0)
          )
        };
      }

      return {
        type: "xml",
        detectedType: this.mapAppMessageType(msgType),
        title: this.cleanXmlTitle(rawTitle),
        desc,
        url: this.isPlaceholderUpgradeUrl(rawUrl) ? "" : rawUrl,
        cover,
        source,
        msgType,
        refContent,
        refServerId
      };
    } catch (e) {
      console.error("XML parse error:", e);
      return { type: "text", content: xmlString };
    }
  }

  parseWxVideoMessage(xmlString) {
    try {
      const xml = this.parseXmlDocument(xmlString);
      if (!xml) {
        return null;
      }
      const videoNode = xml.querySelector("videomsg");
      if (!videoNode) {
        return null;
      }
      return {
        playLength: Number(videoNode.getAttribute("playlength") || 0),
        thumbWidth: Number(videoNode.getAttribute("cdnthumbwidth") || 0),
        thumbHeight: Number(videoNode.getAttribute("cdnthumbheight") || 0)
      };
    } catch (error) {
      console.error("Video XML parse error:", error);
      return null;
    }
  }

  parseWxVoipMessage(xmlString) {
    try {
      const xml = this.parseXmlDocument(xmlString);
      if (!xml) {
        return { title: "微信通话", summary: "通话消息" };
      }

      const voipNode = xml.querySelector("voipmsg");
      const bubble = xml.querySelector("VoIPBubbleMsg");
      const rawMsg = bubble?.querySelector("msg")?.textContent?.trim() || "";
      const roomType = bubble?.querySelector("room_type")?.textContent?.trim()
        || "";
      const durationSeconds = Number(
        bubble?.querySelector("duration")?.textContent || 0
      );

      let durationLabel = "";
      const durationMatch = rawMsg.match(/Duration:\s*([0-9:]+)/i);
      if (durationMatch?.[1]) {
        durationLabel = durationMatch[1];
      } else if (durationSeconds > 0) {
        durationLabel = this.formatVoipDuration(durationSeconds);
      }

      const localizedStatus = this.localizeVoipStatus(rawMsg);
      const title = roomType === "1" ? "微信通话" : "微信语音通话";
      const summary = durationLabel ? `通话时长 ${durationLabel}`
        : localizedStatus || voipNode?.getAttribute("type") || "通话消息";

      return {
        title,
        summary,
        durationLabel
      };
    } catch (error) {
      console.error("VoIP XML parse error:", error);
      return { title: "微信通话", summary: "通话消息" };
    }
  }

  localizeVoipStatus(rawMsg = "") {
    const normalized = String(rawMsg || "").trim();
    if (!normalized) {
      return "";
    }

    const exactMapping = {
      "Declined on other device": "已在其他设备拒绝",
      "Canceled": "已取消",
      "Rejected": "已拒绝",
      "No response": "未接听",
      "Busy": "忙线中",
      "Missed call": "未接听",
      "Connected": "已接通"
    };
    if (exactMapping[normalized]) {
      return exactMapping[normalized];
    }

    if (/declined/i.test(normalized)) {
      return "已拒绝";
    }
    if (/missed|no response/i.test(normalized)) {
      return "未接听";
    }
    if (/canceled/i.test(normalized)) {
      return "已取消";
    }
    if (/busy/i.test(normalized)) {
      return "忙线中";
    }

    return normalized;
  }

  parseWxChatHistoryMessage(xmlString) {
    const fallback = {
      title: "聊天记录",
      desc: "",
      count: 0,
      items: []
    };

    try {
      const xml = this.parseXmlDocument(xmlString);
      if (!xml) {
        return fallback;
      }

      const appmsg = xml.querySelector("appmsg");
      const title = appmsg?.querySelector("title")?.textContent?.trim()
        || fallback.title;
      const desc = appmsg?.querySelector("des")?.textContent?.trim() || "";
      const recordRaw = appmsg?.querySelector("recorditem")?.textContent?.trim()
        || "";
      if (!recordRaw) {
        return {
          title,
          desc,
          count: desc ? desc.split(/\n+/).filter(Boolean).length : 0,
          items: []
        };
      }

      const recordXml = this.parseXmlDocument(recordRaw);
      if (!recordXml) {
        return {
          title,
          desc,
          count: desc ? desc.split(/\n+/).filter(Boolean).length : 0,
          items: []
        };
      }

      const recordInfo = recordXml.querySelector("recordinfo");
      const itemNodes = Array.from(recordInfo?.querySelectorAll("datalist > dataitem")
        || []);
      const descLines = desc.split(/\n+/).map((line) => line.trim()).filter(Boolean);
      const items = itemNodes.map((itemNode, index) =>
        this.parseWxChatHistoryItem(itemNode, descLines[index] || ""));

      return {
        title,
        desc,
        count: Number(recordInfo?.querySelector("datalist")?.getAttribute("count")
          || items.length || 0),
        items
      };
    } catch (error) {
      console.error("Chat history XML parse error:", error);
      return fallback;
    }
  }

  parseWxChatHistoryItem(itemNode, fallbackLine = "") {
    const dataType = Number(itemNode?.getAttribute("datatype") || 1);
    const rawContent = itemNode?.querySelector("datadesc")?.textContent?.trim()
      || "";
    const senderName = itemNode?.querySelector("sourcename")?.textContent?.trim()
      || "";
    const time = itemNode?.querySelector("sourcetime")?.textContent?.trim() || "";
    const fallbackContent = fallbackLine.includes(":")
      ? fallbackLine.split(":").slice(1).join(":").trim()
      : fallbackLine;
    const content = rawContent.includes("�") && fallbackContent
      ? fallbackContent
      : (rawContent || fallbackContent || this.chatHistoryTypeLabel(dataType));

    return {
      type: this.chatHistoryItemType(dataType),
      senderName,
      time,
      content
    };
  }

  chatHistoryItemType(dataType) {
    switch (Number(dataType)) {
      case 2:
        return "image";
      case 4:
        return "video";
      case 6:
        return "file_message";
      default:
        return "text";
    }
  }

  chatHistoryTypeLabel(dataType) {
    return `[${this.humanizeMessageType(this.chatHistoryItemType(dataType))}]`;
  }

  formatVoipDuration(totalSeconds) {
    const seconds = Math.max(Number(totalSeconds) || 0, 0);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainSeconds = seconds % 60;

    if (hours > 0) {
      return [hours, minutes, remainSeconds]
        .map((value) => String(value).padStart(2, "0"))
        .join(":");
    }

    return [minutes, remainSeconds]
      .map((value) => String(value).padStart(2, "0"))
      .join(":");
  }

  parseWxFileAttachment(xmlString) {
    try {
      const xml = this.parseXmlDocument(xmlString);
      if (!xml) {
        return null;
      }
      const appmsg = xml.querySelector("appmsg");
      if (!appmsg) {
        return null;
      }
      const type = Number(appmsg.querySelector("type")?.textContent || 0);
      if (type !== 6) {
        return null;
      }
      const attach = appmsg.querySelector("appattach");
      return {
        title: appmsg.querySelector("title")?.textContent?.trim() || "",
        totallen: Number(attach?.querySelector("totallen")?.textContent || 0),
        fileext: attach?.querySelector("fileext")?.textContent?.trim() || ""
      };
    } catch (error) {
      console.error("File XML parse error:", error);
      return null;
    }
  }

  extractXmlPayload(xmlString = "") {
    const raw = String(xmlString || "").trim();
    if (!raw) {
      return "";
    }
    if (raw.startsWith("<")) {
      return raw;
    }

    const xmlStartIndex = raw.indexOf("<");
    return xmlStartIndex >= 0 ? raw.slice(xmlStartIndex) : raw;
  }

  parseXmlDocument(xmlString) {
    const payload = this.extractXmlPayload(xmlString);
    if (!payload.startsWith("<")) {
      return null;
    }

    const parser = new DOMParser();
    const xml = parser.parseFromString(payload, "application/xml");
    if (xml.querySelector("parsererror")) {
      return null;
    }
    return xml;
  }

  mapAppMessageType(msgType) {
    const mapping = {
      5: "card",
      6: "file_message",
      19: "chat_history",
      33: "mini_app",
      36: "mini_game",
      51: "video_account",
      57: "quote",
      74: "file_transfer_start",
      2000: "transfer",
      2001: "red_packet"
    };
    return mapping[Number(msgType)] || null;
  }

  cleanXmlTitle(title = "") {
    const cleaned = String(title || "").trim();
    if (!cleaned || this.isUnsupportedXmlTitle(cleaned)) {
      return "";
    }
    return cleaned;
  }

  isUnsupportedXmlTitle(title = "") {
    return /当前版本不支持展示该内容|请升级至最新版本/.test(title);
  }

  isPlaceholderUpgradeUrl(url = "") {
    return /support\.weixin\.qq\.com\/security\/readtemplate/.test(url);
  }

  attachmentUrl(type, msg, { cacheKey } = {}) {
    if (!msg) {
      return null;
    }
      const messageId = msg._messageId || msg._wxMessageId || msg.id;
    if (!messageId) {
      return null;
    }
    const resolvedKey = cacheKey === undefined ? msg._cacheKey : cacheKey;
    const base = `/message/${type}/${messageId}`;
    return resolvedKey ? `${base}?t=${encodeURIComponent(resolvedKey)}` : base;
  }

  startQuoteMessage(wrapper, msg, senderInfo = null) {
    if (!wrapper?.id || !msg) {
      return;
    }

    const preview = this.buildMessagePreview(msg);
    const info = senderInfo || this.lookupSenderInfo(msg, msg.content);
    this.pendingQuote = {
      messageId: wrapper.id,
      newMsgId: this.normalizeReferenceId(msg.new_msg_id),
      senderName: info?.name || (msg.self_send ? "我" : "消息"),
      typeLabel: this.humanizeMessageType(preview.type),
      content: preview.content,
      wrapper
    };
    this.renderPendingQuote();
    this.inputTarget.focus();
  }

  clearPendingQuote(event = null) {
    event?.preventDefault();
    event?.stopPropagation();
    this.pendingQuote = null;
    this.renderPendingQuote();
    this.inputTarget.focus();
  }

  renderPendingQuote() {
    if (!this.hasQuoteComposerTarget || !this.hasQuoteComposerMetaTarget
      || !this.hasQuoteComposerContentTarget) {
      return;
    }

    const pending = this.pendingQuote;
    if (!pending) {
      this.quoteComposerTarget.classList.add("hidden");
      this.quoteComposerTarget.classList.remove("flex");
      this.quoteComposerMetaTarget.textContent = "";
      this.quoteComposerContentTarget.textContent = "";
      this.scheduleComposerLayoutSync();
      return;
    }

    this.quoteComposerMetaTarget.textContent = `引用 ${pending.senderName} · ${pending.typeLabel}`;
    this.quoteComposerContentTarget.textContent = pending.content || "[消息]";
    this.quoteComposerTarget.classList.remove("hidden");
    this.quoteComposerTarget.classList.add("flex");
    this.scheduleComposerLayoutSync();
  }

  normalizeReferenceId(value) {
    if (value == null) {
      return null;
    }

    const normalized = String(value).trim();
    if (!normalized || normalized === "0" || normalized === "null"
      || normalized === "undefined") {
      return null;
    }

    return normalized;
  }

  buildMediaPreviewTitle(msg, fallback = "媒体预览") { return buildMediaPreviewTitle(this, msg, fallback); }
  ensureMediaPreviewElements() { return ensureMediaPreviewElements(this); }
  openMediaPreview(options = {}) { return openMediaPreview(this, options); }
  closeMediaPreview() { return closeMediaPreview(this); }
  handleMediaPreviewKeydown(event) { return handleMediaPreviewKeydown(this, event); }

  toggleMenu(event) { return toggleMenu(this, event); }

  mouseenterAttachment(event) {
    event.stopPropagation(); // 防止冒泡导致其他事件触发

    if (this.attachmentSelectTarget.classList.contains("hidden")) {
      // 显示附件选择框
      this.attachmentSelectTarget.classList.remove("hidden");

      // 添加文档点击监听器
      setTimeout(() => {
        document.addEventListener("click", this._boundHideAttachmentSelect);
      }, 0);
    }
  }

  mouseleaveAttachment() { return this.attachmentSelectTarget?.classList?.add("hidden"); }
  hideAttachmentSelect(event) { return this.mouseleaveAttachment(); }
  closeMenu(event = null) { return closeMenu(this, event); }
  handleMenuClose(event = null) { return handleMenuClose(this, event); }
  openAppearanceSettings(event) { return openAppearanceSettings(this, event); }
  closeThemePanel(event = null) { return closeThemePanel(this, event); }
  openHookPanel(event) { return openHookPanel(this, event); }
  closeHookPanel(event = null) { return closeHookPanel(this, event); }
  saveHookSettings(event) { return saveHookSettings(this, event); }
  openBotManager(event) { return openBotManager(this, event); }

  updateBackgroundColor(event) { return updateBackgroundColor(this, event); }
  updateBubbleColor(event) { return updateBubbleColor(this, event); }
  updateBackgroundImage(event) { return updateBackgroundImage(this, event); }
  clearBackgroundImage(event) { return clearBackgroundImage(this, event); }
  openBackgroundUpload(event) { return openBackgroundUpload(this, event); }
  uploadBackgroundImage(event) { return uploadBackgroundImage(this, event); }
  resetTheme(event = null) { return resetTheme(this, event); }
  updateFontFamily(event) { return updateFontFamily(this, event); }
  updateCustomFont(event) { return updateCustomFont(this, event); }
  applyTheme(options = {}) { return applyTheme(this, options); }
  refreshBubbleStyles() { return refreshBubbleStyles(this); }
  syncThemeInputs() { return syncThemeInputs(this); }

  syncMembers(event = null) { return syncMembers(this, event); }
  openSidebar(event = null) { return openSidebar(this, event); }
  syncMessages(event = null) { return syncMessages(this, event); }
  syncContact(event = null) { return syncContact(this, event); }
  loadMore() { return loadMore(this); }

  openChatContactDetail(event = null) {
    event?.preventDefault();
    event?.stopPropagation();
    if (!this.contactIdValue) {
      return;
    }

    const chatShell = this.element.closest('[data-controller~="chat"]');
    if (chatShell) {
      this.element.dispatchEvent(new CustomEvent("chat:open-contact", {
        bubbles: true,
        detail: { contactId: this.contactIdValue }
      }));
      return;
    }

    window.location.href = `/contact/${this.contactIdValue}`;
  }

  openMemberDetail(userName) {
    const normalizedUserName = String(userName || "").trim();
    if (!normalizedUserName) {
      return;
    }

    fetch(`/chat_room/${this.idValue}/member_detail?user_name=${encodeURIComponent(normalizedUserName)}`, {
      headers: { "Accept": "application/json" }
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`成员详情加载失败: ${response.status}`);
        }
        return response.json();
      })
      .then((member) => this.renderMemberDetail(member))
      .catch((error) => {
        console.error("成员详情加载失败", error);
      });
  }

  closeMemberDetail(event = null) {
    if (event?.target && this.memberDetailCard?.contains(event.target)) {
      return;
    }

    this.memberDetailOverlay?.remove();
    this.memberDetailOverlay = null;
    this.memberDetailCard = null;
  }

  renderMemberDetail(member) {
    this.closeMemberDetail();

    const overlay = document.createElement("div");
    overlay.className = "absolute inset-0 z-50 flex items-end justify-center bg-slate-950/20 px-4 py-4 backdrop-blur-[2px] sm:items-center";
    overlay.addEventListener("click", (event) => this.closeMemberDetail(event));

    const card = document.createElement("div");
    card.className = "w-full max-w-sm overflow-hidden rounded-[1.75rem] bg-white shadow-2xl ring-1 ring-slate-200";
    this.memberDetailCard = card;

    const avatarUrl = member.avatar_url || member.big_head_img_url || member.small_head_img_url || "";
    const displayName = member.display_name || member.remark || member.nick_name || member.user_name || "成员";
    const location = [member.country, member.province, member.city].filter(Boolean).join(" ");
    const fields = [
      ["微信号", member.user_name],
      ["别名", member.alias],
      ["地区", location],
      ["签名", member.signature],
      ["手机号", member.phone_num_list]
    ].filter(([, value]) => String(value || "").trim());

    const header = document.createElement("div");
    header.className = "bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.18),_transparent_58%),linear-gradient(135deg,#f8fafc,#e2e8f0)] px-6 py-6 text-center";
    const avatar = document.createElement("div");
    avatar.className = "mx-auto flex h-20 w-20 items-center justify-center overflow-hidden rounded-[1.35rem] bg-slate-200 text-2xl font-bold text-slate-600 shadow-lg";
    if (avatarUrl) {
      const img = document.createElement("img");
      img.src = avatarUrl;
      img.alt = displayName;
      img.className = "h-full w-full object-cover";
      avatar.appendChild(img);
    } else {
      avatar.textContent = displayName.slice(0, 1) || "?";
    }
    const name = document.createElement("div");
    name.className = "mt-4 text-lg font-semibold text-slate-900";
    name.textContent = displayName;
    const user = document.createElement("div");
    user.className = "mt-1 break-all text-xs text-slate-500";
    user.textContent = member.user_name || "";
    header.appendChild(avatar);
    header.appendChild(name);
    header.appendChild(user);

    const body = document.createElement("div");
    body.className = "space-y-3 px-5 py-5 text-sm";
    fields.forEach(([label, value]) => {
      const row = document.createElement("div");
      row.className = "rounded-2xl bg-slate-50 px-4 py-3";
      const labelEl = document.createElement("div");
      labelEl.className = "text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400";
      labelEl.textContent = label;
      const valueEl = document.createElement("div");
      valueEl.className = "mt-1 break-words text-slate-800";
      valueEl.textContent = value;
      row.appendChild(labelEl);
      row.appendChild(valueEl);
      body.appendChild(row);
    });

    const close = document.createElement("button");
    close.type = "button";
    close.className = "mx-5 mb-5 w-[calc(100%-2.5rem)] rounded-full bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700";
    close.textContent = "关闭";
    close.addEventListener("click", () => this.closeMemberDetail());

    card.appendChild(header);
    card.appendChild(body);
    card.appendChild(close);
    overlay.appendChild(card);
    this.element.appendChild(overlay);
    this.memberDetailOverlay = overlay;
  }

  matchesCurrentRoom(payload) {
    return String(payload?.chat_room_id || "") === String(this.idValue);
  }

  hasMessage(messageId) {
    return this.messageState.hasMessage(messageId);
  }

  latestServerMessageId() {
    return this.messageState.latestServerMessageId();
  }

  refreshRoomFromNotification(payload, attempt = 0) {
    const expectedMessageId = payload?.message_id;
    if (!expectedMessageId && this.pendingNotifyRefreshTimer) {
      clearTimeout(this.pendingNotifyRefreshTimer);
      this.pendingNotifyRefreshTimer = null;
    }

    const refreshTimer = setTimeout(() => {
      if (this.pendingNotifyRefreshTimer === refreshTimer) {
        this.pendingNotifyRefreshTimer = null;
      }
      if (!this.element?.isConnected) {
        return;
      }
      if (expectedMessageId && this.hasMessage(expectedMessageId)) {
        return;
      }

      if (expectedMessageId) {
        this.fetchMessageById(expectedMessageId)
          .then((loaded) => {
            if (loaded) {
              this.renderMessages({
                forceScrollToBottom: this.autoScrollPinnedToBottom
              });
              return;
            }

            if (attempt >= 3) {
              this.loadNewMessages(payload);
              return;
            }

            this.refreshRoomFromNotification(payload, attempt + 1);
          })
          .catch((error) => {
            console.error("按通知消息补拉失败:", error);
          });
        return;
      }

      this.loadNewMessages(payload)
        .then((loadedCount) => {
          if (loadedCount > 0) {
            return;
          }

          if (attempt >= 3) {
            this.loadMessages();
            return;
          }

          this.refreshRoomFromNotification(payload, attempt + 1);
        })
        .catch((error) => {
          console.error("刷新当前聊天室失败:", error);
        });
    }, attempt === 0 ? 0 : 120 * (attempt + 1));

    if (!expectedMessageId) {
      this.pendingNotifyRefreshTimer = refreshTimer;
    }
  }

  loadNewMessages(msg, options = {}) {
    const refreshOptions = msg && !Object.prototype.hasOwnProperty.call(msg, "message_id")
      ? msg
      : options;
    const notifyPayload = msg && Object.prototype.hasOwnProperty.call(msg, "message_id")
      ? msg
      : null;

    if (this.messages.size === 0) {
      return this.loadMessages();
    }

    const container = this.messageListTarget;
    const shouldStickToBottom = this.isNearBottom();
    const preserveBottomOffset = shouldStickToBottom ? null
      : container.scrollHeight - container.scrollTop;
    const lastMsgId = this.latestServerMessageId();
    if (lastMsgId == null) {
      return this.loadMessages({ replace: true });
    }

    return this.fetchMessages({
      afterId: lastMsgId,
      includeId: notifyPayload?.message_id
    })
      .then(data => {
        if (!this.element?.isConnected) {
          return 0;
        }
        if (!data.length) {
          if (refreshOptions.refreshCacheOnEmpty) {
            this.persistMessages();
          }
          return 0;
        }

        if (refreshOptions.resetOnLimit && data.length >= MESSAGE_FETCH_LIMIT) {
          this.messages.clear();
        }
        this.messages.merge(data);
        this.renderMessages({
          preserveBottomOffset,
          forceScrollToBottom: shouldStickToBottom
        });
        return data.length;
      })
      .catch(error => {
        console.error(error);
        return 0;
      });
  }

  handleVoiceClick(messageId, container, label, context) {
    return handleVoiceClick(this, messageId, container, label, context);
  }

  playVoice(url, container, label, context) {
    return playVoice(this, url, container, label, context);
  }

  seekVoice(messageId, context, event) {
    return seekVoice(this, messageId, context, event);
  }

  toggleSpeed(messageId, context) {
    return toggleSpeed(this, messageId, context);
  }

  formatVoiceDuration(seconds) {
    return formatVoiceDuration(seconds);
  }

  formatVideoDuration(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const minutes = Math.floor(total / 60);
    const remaining = total % 60;
    return minutes > 0 ? `${minutes}:${String(remaining).padStart(2, "0")}`
      : `${remaining}s`;
  }

  formatFileSize(bytes) {
    const size = Number(bytes);
    if (!Number.isFinite(size) || size <= 0) {
      return "";
    }
    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = size;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }
    const precision = value >= 10 || unitIndex === 0 ? 0 : 1;
    return `${value.toFixed(precision)}${units[unitIndex]}`;
  }

  stopCurrentVoicePlayback() {
    if (!this.currentVoicePlayback) {
      return;
    }
    const { audio, cleanup } = this.currentVoicePlayback;
    audio.pause();
    audio.currentTime = 0;
    cleanup();
  }

  buildLinkedText(text) { return buildLinkedText(this, text); }
  appendPlainSegment(fragment, text) { return appendPlainSegment(this, fragment, text); }
  createAnchor(href, label) { return createAnchor(this, href, label); }
  decodeHtmlEntities(text) { return decodeHtmlEntities(this, text); }
  normalizeHref(href) { return normalizeHref(this, href); }

  focusMessageById(messageId) {
    if (!messageId || !this.hasMessageListTarget) {
      return Promise.resolve(false);
    }

    return this.ensureMessageVisible(messageId).then((isVisible) => {
      if (!isVisible) {
        return false;
      }

      const row = this.messageListTarget.querySelector(
        `[data-message-id="${messageId}"]`);
      if (!row) {
        return false;
      }

      if (this.highlightedRow && this.highlightedRow !== row) {
        this.highlightedRow.classList.remove("ring-2", "ring-blue-400",
          "ring-offset-2", "ring-offset-gray-100");
      }

      const container = this.messageListTarget;
      const containerRect = container.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      const targetTop = Math.max(
        container.scrollTop + (rowRect.top - containerRect.top)
          - (container.clientHeight - rowRect.height) / 2,
        0
      );
      container.scrollTo({ top: targetTop, behavior: "smooth" });
      row.classList.add("ring-2", "ring-blue-400", "ring-offset-2",
        "ring-offset-gray-100");
      this.highlightedRow = row;

      if (this.highlightTimer) {
        clearTimeout(this.highlightTimer);
      }
      this.highlightTimer = setTimeout(() => {
        row.classList.remove("ring-2", "ring-blue-400", "ring-offset-2",
          "ring-offset-gray-100");
        if (this.highlightedRow === row) {
          this.highlightedRow = null;
        }
      }, 2000);
      return true;
    });
  }

  async ensureMessageVisible(messageId) {
    const loaded = await this.ensureMessageLoaded(messageId);
    if (loaded) {
      return true;
    }

    const fetched = await this.fetchMessageById(messageId);
    if (!fetched) {
      return false;
    }

    this.renderMessages();
    return Boolean(this.messageListTarget.querySelector(
      `[data-message-id="${messageId}"]`));
  }

  async ensureMessageLoaded(messageId) {
    const targetId = Number(messageId);
    if (!this.hasMessageListTarget) {
      return false;
    }

    if (!Number.isFinite(targetId)) {
      return Boolean(this.messageListTarget.querySelector(
        `[data-message-id="${messageId}"]`));
    }

    let row = this.messageListTarget.querySelector(
      `[data-message-id="${messageId}"]`);
    if (row) {
      return true;
    }

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const firstMsgId = Number(this.oldestServerMessageId());
      if (!Number.isFinite(firstMsgId) || targetId >= firstMsgId) {
        break;
      }

      const loaded = await this.loadOlderMessagesChunk();
      if (!loaded) {
        break;
      }

      row = this.messageListTarget.querySelector(
        `[data-message-id="${messageId}"]`);
      if (row) {
        return true;
      }
    }

    return Boolean(this.messageListTarget.querySelector(
      `[data-message-id="${messageId}"]`));
  }

  loadOlderMessagesChunk() {
    if (this.loadingOlderMessages || this.messages.length === 0) {
      return Promise.resolve(false);
    }

    const firstMsgId = this.oldestServerMessageId();
    if (!firstMsgId) {
      return Promise.resolve(false);
    }

    this.loadingOlderMessages = true;
    const container = this.messageListTarget;
    const preserveBottomOffset = container.scrollHeight - container.scrollTop;

    return this.fetchMessages({ beforeId: firstMsgId })
      .then(data => {
        if (!data.length) {
          return false;
        }

        this.messages.merge(data, { prepend: true });
        this.renderMessages({ preserveBottomOffset });
        const nextFirstMsgId = Number(this.messages.at(0)?.id);
        return Number.isFinite(nextFirstMsgId)
          ? nextFirstMsgId < Number(firstMsgId)
          : true;
      })
      .catch(error => {
        console.error("加载更多消息失败:", error);
        return false;
      })
      .finally(() => {
        this.loadingOlderMessages = false;
      });
  }

  fetchMessageById(messageId) {
    return fetch(`/chat_room/${this.idValue}/messages/${messageId}`, {
      cache: "no-store",
      headers: {
        "Accept": "application/json"
      }
    })
      .then((res) => {
        if (res.status === 304) {
          return null;
        }
        if (!res.ok) {
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (!data || data.id == null || this.hasMessage(data.id)) {
          return Boolean(data);
        }

        this.messages.add(data);
        this.persistMessages();
        return true;
      })
      .catch((error) => {
        console.error("按消息 id 加载失败:", error);
        return false;
      });
  }

  resolveReferencedMessageId(referNewMsgId) {
    const normalizedReferId = this.normalizeReferenceId(referNewMsgId);
    if (!normalizedReferId) {
      return Promise.resolve(null);
    }

    const url = `/chat_room/${this.idValue}/messages/resolve_reference?new_msg_id=${
      encodeURIComponent(normalizedReferId)
    }`;

    return fetch(url, {
      cache: "no-store",
      headers: {
        "Accept": "application/json"
      }
    })
      .then((res) => {
        if (res.status === 304) {
          return null;
        }
        if (!res.ok) {
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (!data || data.id == null) {
          return null;
        }

        if (!this.hasMessage(data.id)) {
          this.messages.add(data);
          this.persistMessages();
          this.renderMessages();
        }

        return data.id;
      })
      .catch((error) => {
        console.error("按引用消息 id 解析失败:", error);
        return null;
      });
  }

  humanizeMessageType(msgType) {
    const mapping = {
      quote: "引用",
      refer: "引用",
      system_notice: "通知",
      text: "文本",
      image: "图片",
      chat_history: "聊天记录",
      voice: "语音",
      voip: "通话",
      video: "视频",
      file: "文件",
      file_message: "文件",
      emoji: "表情",
      card: "卡片",
      video_account: "视频号",
      html: "网页",
      micro_video: "小视频"
    };
    return mapping[msgType] || "消息";
  }

  cloneTemplate(templateId) {
    const template = document.getElementById(templateId);
    if (!template || !template.content || !template.content.firstElementChild) {
      return null;
    }
    return template.content.firstElementChild.cloneNode(true);
  }

  findChatMember(wxid) {
    if (!wxid || !Array.isArray(this.chatMembers)) {
      return null;
    }

    return this.chatMembers.find((member) => {
      const candidates = [
        member?.UserName,
        member?.user_name,
        member?.userName,
        member?.username,
        member?.wx_id,
        member?.wxid
      ].filter(Boolean);
      return candidates.includes(wxid);
    }) || null;
  }

  resolveMemberName(member, fallback = "") {
    return member?.display_name || member?.displayName || member?.DisplayName
      || member?.remark || member?.Remark || member?.nick_name
      || member?.nickName || member?.NickName || fallback;
  }

  resolveMemberAvatar(member) {
    return member?.small_head_img_url || member?.smallHeadImgUrl
      || member?.SmallHeadImgUrl || member?.big_head_img_url
      || member?.bigHeadImgUrl || member?.BigHeadImgUrl || member?.avatar
      || member?.Avatar || "";
  }

  stripRoomSenderPrefix(text = "") {
    return text.replace(/^[^:\n]+:\n/, "");
  }

  sortedMessageWrappers() {
    return this.messageState.sortedMessageWrappers();
  }

  messageTimestampSortValue(wrapper) {
    return this.messageState.messageTimestampSortValue(wrapper);
  }

  messageNumericIdSortValue(wrapper) {
    return this.messageState.messageNumericIdSortValue(wrapper);
  }

  oldestServerMessageId() {
    return this.messageState.oldestServerMessageId();
  }

  normalizeMessageType(msg) {
    const parsedType = this.normalizeParsedMessageType(
      this.parsedMessageFor(msg)?.type
    );
    if (parsedType) {
      return parsedType;
    }

    const rawStringType = (() => {
      const realType = msg?.real_msg_type;
      if (realType && realType !== "unknown") {
        return realType;
      }
      return msg?.msg_type ?? realType;
    })();
    const stringAliases = {
      voip_msg: "voip"
    };
    const stringType = stringAliases[rawStringType] || rawStringType;
    if (typeof stringType === "string" && stringType.length > 0) {
      if (/^\d+$/.test(stringType)) {
        const mappedNumericType = Number(stringType);
        if (Number.isFinite(mappedNumericType)) {
          msg = { ...msg, real_msg_type: mappedNumericType };
        }
      } else {
        if (["sys", "sys_notice", "function_message"].includes(stringType)) {
          return "system_notice";
        }
        if ((stringType === "refer" || stringType === "unknown")
          && msg?.content) {
          const parsed = this.parseWxXmlMessage(msg.content);
          if (parsed?.detectedType) {
            return parsed.detectedType;
          }
        }
        return stringType;
      }
    }

    const numericType = Number(msg?.real_msg_type ?? msg?.msg_type);
    if (numericType === 49 && msg?.content) {
      const parsed = this.parseWxXmlMessage(msg.content);
      if (parsed?.detectedType) {
        return parsed.detectedType;
      }
    }

    const mapping = {
      1: "text",
      3: "image",
      5: "card",
      6: "file_message",
      34: "voice",
      50: "voip",
      43: "video",
      47: "emoji",
      49: "refer",
      57: "quote",
      62: "micro_video",
      9999: "system_notice",
      10000: "system_notice"
    };
    return mapping[numericType] || "unknown";
  }

  buildMessagePreview(msg) {
    const type = this.normalizeMessageType(msg);
    const content = this.stripRoomSenderPrefix(msg?.content || "");

    switch (type) {
      case "text":
        return {
          type,
          content: content || "[文本]",
          asLinkedText: true
        };
      case "quote": {
        const parsed = this.quotePayloadFor(msg);
        return {
          type,
          content: msg?.refer_title || parsed.title || parsed.quotePreview?.content
            || "[引用消息]",
          asLinkedText: false
        };
      }
      case "card": {
        const parsed = this.cardPayloadFor(msg);
        return {
          type,
          content: this.payloadValue(parsed, "title") || "[卡片消息]",
          asLinkedText: false
        };
      }
      case "video_account": {
        const parsed = this.cardPayloadFor(msg);
        return {
          type,
          content: this.payloadValue(parsed, "desc")
            || this.payloadValue(parsed, "title")
            || "[视频号消息]",
          asLinkedText: false
        };
      }
      case "chat_history": {
        const parsed = this.chatHistoryPayloadFor(msg);
        return {
          type,
          content: parsed.desc || parsed.title || "[聊天记录]",
          asLinkedText: false
        };
      }
      case "file_message": {
        const fileInfo = this.filePayloadFor(msg);
        return {
          type,
          content: fileInfo.title || msg?.refer_title || "[文件消息]",
          asLinkedText: false
        };
      }
      case "voip": {
        const parsed = this.voipPayloadFor(msg);
        return {
          type,
          content: parsed.summary || "[通话消息]",
          asLinkedText: false
        };
      }
      case "image":
      case "voice":
      case "video":
      case "emoji":
      case "micro_video":
        return {
          type,
          content: `[${this.humanizeMessageType(type)}]`,
          asLinkedText: false
        };
      case "system_notice":
        return {
          type,
          content: this.buildSystemNoticeContent(msg),
          asLinkedText: false
        };
      default: {
        const parsed = this.parseWxXmlMessage(msg?.content || "");
        return {
          type,
          content: content || parsed.title || parsed.desc
            || `[${this.humanizeMessageType(type)}]`,
          asLinkedText: !content.startsWith("<")
        };
      }
    }
  }

  isSystemNoticeMessage(msg) {
    return this.normalizeMessageType(msg) === "system_notice";
  }

  buildSystemNoticeContent(msg) {
    const content = this.stripRoomSenderPrefix(msg?.content || "").trim();
    if (!content) {
      return "群消息通知";
    }

    const xmlPayload = this.extractXmlPayload(content);
    if (xmlPayload.startsWith("<")) {
      const parsed = this.parseWxXmlMessage(content);
      if (parsed?.title || parsed?.desc) {
        return [parsed.title, parsed.desc].filter(Boolean).join(" ");
      }
    }

    return content;
  }

  lookupSenderInfo(msg, rawContent = "") {
    if (msg.sender_key && msg.sender_name) {
      return {
        key: msg.sender_key,
        name: msg.sender_name,
        avatar: msg.sender_avatar || "",
        initial: (msg.sender_initial || msg.sender_name.slice(0, 1)
          || "?").toUpperCase()
      };
    }

    if (msg.self_send) {
      return {
        key: `self:${msg.to_user_name || 'me'}`,
        name: "我",
        avatar: null,
        initial: "我"
      };
    }

    if (this.isRoom()) {
      let wxid = null;
      if (msg.from_user_name && !msg.from_user_name.endsWith("@chatroom")) {
        wxid = msg.from_user_name;
      }
      if (!wxid) {
        const match = (rawContent || msg.content || "").match(/^([^:\n]+):\n/);
        wxid = match ? match[1] : null;
      }
      wxid = wxid || msg.to_user_name || msg.from_user_name;
      const member = this.findChatMember(wxid);
      const name = this.resolveMemberName(member, wxid);
      const avatar = this.resolveMemberAvatar(member);
      const initial = (name || wxid || "?").slice(0, 1).toUpperCase();
      return {
        key: `room:${wxid}`, name, avatar, initial
      };
    }

    const wxid = msg.from_user_name || msg.to_user_name || "contact";
    const name = wxid;
    return {
      key: `direct:${wxid}`,
      name,
      avatar: null,
      initial: (name || "?").slice(0, 1).toUpperCase()
    };
  }

  openFilePicker(event) {
    const uploadType = event.currentTarget.dataset.uploadTypeParam; // 获取按钮上的参数
    this.currentUploadType = uploadType;
    let acceptTypes;

    // 根据 uploadType 设置文件类型
    if (uploadType === "image") {
      acceptTypes = "image/*";
    } else if (uploadType === "emoji") {
      acceptTypes = ".gif,image/gif";
    } else if (uploadType === "voice") {
      acceptTypes = "audio/*";
    } else if (uploadType === "file") {
      acceptTypes = "*/*";
    } else if (uploadType === "video") {
      acceptTypes = "video/*";
    }

    this.fileInputTarget.accept = acceptTypes || "";
    this.fileInputTarget.click();
  }

  async handleFileSelect(event) {
    const uploadType = this.currentUploadType
    const file = event.target.files[0];
    if (file) {
      let sendMsg = { extra: {} }
      if (uploadType === "image") {
        sendMsg.extra.base64 = await get_file_base64(file);
      }
      if (uploadType === "emoji") {
        const isGif = file.type === "image/gif"
          || file.name.toLowerCase().endsWith(".gif");
        if (!isGif) {
          alert("请选择 GIF 表情文件");
          event.target.value = "";
          return;
        }
        sendMsg.extra.base64 = await get_file_base64(file);
        sendMsg.extra.preview_url = URL.createObjectURL(file);
      }
      if (uploadType === "file") {
        sendMsg.file = file
      }
      if (uploadType === "voice") {
        sendMsg.file = file
        sendMsg.extra.voice_time = 1000
      }
      this.sendMessage(uploadType, sendMsg)
    }
    event.target.value = "";

  }

  async startVoiceRecording(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    this.hideAttachmentSelect();

    if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
      return;
    }
    if (!window.isSecureContext) {
      alert("当前页面不是安全上下文，浏览器不会开放麦克风录音。请使用 HTTPS 或 localhost；现在将改为选择本地音频文件发送。");
      this.currentUploadType = "voice";
      this.fileInputTarget.accept = "audio/*";
      this.fileInputTarget.click();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      alert("当前浏览器不支持网页录音，将改为选择本地音频文件发送。");
      this.currentUploadType = "voice";
      this.fileInputTarget.accept = "audio/*";
      this.fileInputTarget.click();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = this.preferredVoiceMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      this.voiceRecordingStream = stream;
      this.mediaRecorder = recorder;
      this.voiceRecordingChunks = [];
      this.voiceRecordingStartedAt = Date.now();
      this.voiceRecordingShouldSend = false;
      this.pendingRecordedMimeType = recorder.mimeType || mimeType || "audio/webm";

      recorder.addEventListener("dataavailable", (captureEvent) => {
        if (captureEvent.data && captureEvent.data.size > 0) {
          this.voiceRecordingChunks.push(captureEvent.data);
        }
      });

      recorder.addEventListener("stop", () => {
        const shouldSend = this.voiceRecordingShouldSend;
        const durationMs = Math.max(1000, Date.now() - (this.voiceRecordingStartedAt || Date.now()));
        const chunks = [ ...this.voiceRecordingChunks ];
        const mime = this.pendingRecordedMimeType || "audio/webm";

        this.mediaRecorder = null;
        this.voiceRecordingChunks = [];
        this.voiceRecordingStartedAt = null;
        this.pendingRecordedMimeType = null;
        this.stopVoiceRecordingTimer();
        this.hideVoiceRecorder();
        this.releaseVoiceRecordingStream();

        if (!shouldSend || chunks.length === 0) {
          return;
        }

        const extension = mime.includes("ogg") ? "ogg" : mime.includes("mp4") ? "m4a" : "webm";
        const blob = new Blob(chunks, { type: mime });
        const file = new File([ blob ], `voice-recording.${extension}`, { type: mime });
        this.sendMessage("voice", {
          file,
          extra: {
            voice_time: durationMs
          }
        });
      });

      recorder.start();
      this.showVoiceRecorder();
      this.startVoiceRecordingTimer();
    } catch (error) {
      console.error("启动录音失败", error);
      alert("无法启动录音，请检查麦克风权限");
      this.releaseVoiceRecordingStream();
    }
  }

  finishVoiceRecording(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (!this.mediaRecorder || this.mediaRecorder.state !== "recording") {
      return;
    }
    this.voiceRecordingShouldSend = true;
    this.mediaRecorder.stop();
  }

  cancelVoiceRecording(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (!this.mediaRecorder || this.mediaRecorder.state !== "recording") {
      this.hideVoiceRecorder();
      return;
    }
    this.voiceRecordingShouldSend = false;
    this.mediaRecorder.stop();
  }

  preferredVoiceMimeType() {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4"
    ];
    return candidates.find((mimeType) => window.MediaRecorder?.isTypeSupported?.(mimeType)) || "";
  }

  showVoiceRecorder() {
    if (!this.hasVoiceRecorderTarget) {
      return;
    }
    this.voiceRecorderTarget.classList.remove("hidden");
    if (this.hasVoiceRecorderStatusTarget) {
      this.voiceRecorderStatusTarget.textContent = "请讲话，结束后发送。";
    }
    if (this.hasVoiceRecorderTimerTarget) {
      this.voiceRecorderTimerTarget.textContent = "00:00";
    }
  }

  hideVoiceRecorder() {
    if (this.hasVoiceRecorderTarget) {
      this.voiceRecorderTarget.classList.add("hidden");
    }
  }

  startVoiceRecordingTimer() {
    this.stopVoiceRecordingTimer();
    this.voiceRecordingTimer = window.setInterval(() => {
      if (!this.hasVoiceRecorderTimerTarget || !this.voiceRecordingStartedAt) {
        return;
      }
      const elapsedSeconds = Math.max(0, Math.floor((Date.now() - this.voiceRecordingStartedAt) / 1000));
      const minutes = String(Math.floor(elapsedSeconds / 60)).padStart(2, "0");
      const seconds = String(elapsedSeconds % 60).padStart(2, "0");
      this.voiceRecorderTimerTarget.textContent = `${minutes}:${seconds}`;
    }, 250);
  }

  stopVoiceRecordingTimer() {
    if (this.voiceRecordingTimer) {
      clearInterval(this.voiceRecordingTimer);
      this.voiceRecordingTimer = null;
    }
  }

  releaseVoiceRecordingStream() {
    if (this.voiceRecordingStream) {
      this.voiceRecordingStream.getTracks().forEach((track) => track.stop());
      this.voiceRecordingStream = null;
    }
  }

  escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

}
