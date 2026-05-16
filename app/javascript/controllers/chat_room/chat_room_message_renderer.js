export function renderMessages(controller, options = {}) {
  if (!controller.hasMessageListTarget) {
    return;
  }
  const container = controller.messageListTarget;
  const emptyState = controller.hasEmptyMessageTarget
    ? controller.emptyMessageTarget.cloneNode(true)
    : buildEmptyState();
  container.replaceChildren();

  let bottomOffset = null;
  if (typeof options.preserveBottomOffset === "number") {
    bottomOffset = options.preserveBottomOffset;
  }
  const forceScrollToBottom = options.forceScrollToBottom === true;

  if (controller.highlightTimer) {
    clearTimeout(controller.highlightTimer);
    controller.highlightTimer = null;
  }
  controller.highlightedRow = null;

  if (controller.messages.length === 0) {
    if (!options.skipPersist) {
      controller.persistMessages();
    }
    emptyState.style.display = "block";
    container.appendChild(emptyState);
    return;
  }

  let lastSenderKey = null;
  let currentGroupKey = null;
  let currentGroup = null;
  const sortedMessages = controller.sortedMessageWrappers();
  sortedMessages.forEach((wrapper, index) => {
    const msg = wrapper.wx_message;
    const messageId = wrapper.message_id || wrapper.id || wrapper.wx_messages_id;
    const wxMessageId = wrapper.wx_message_id || wrapper.wx_messages_id || null;
    msg.id = messageId || wxMessageId;
    msg._messageId = messageId || wxMessageId;
    msg._wxMessageId = wxMessageId || msg._messageId;
    msg._cacheKey = wrapper.updated_at || wrapper.message_time
      || wrapper.created_at || msg.message_time;
    msg.referenced_message = wrapper.referenced_message;
    msg._sending = wrapper.sending;
    msg.extra = wrapper.extra;

    if (controller.isSystemNoticeMessage(msg)) {
      msg.self_send = false;
    }

    const senderInfo = controller.lookupSenderInfo(msg, msg.content);
    msg.sender_name = senderInfo?.name;
    msg.sender_avatar = senderInfo?.avatar;
    msg.sender_initial = senderInfo?.initial;
    msg.sender_key = senderInfo?.key;

    const senderKey = msg.sender_key || (msg.self_send
      ? `self:${msg.to_user_name || 'me'}` : msg.from_user_name || "");
    const startsGroup = lastSenderKey === null || lastSenderKey !== senderKey;
    const nextWrapper = sortedMessages[index + 1];
    const nextMsg = nextWrapper?.wx_message;
    const nextSenderInfo = nextMsg
      ? controller.lookupSenderInfo(nextMsg, nextMsg.content)
      : null;
    const nextSenderKey = nextSenderInfo?.key || (nextMsg?.self_send
      ? `self:${nextMsg?.to_user_name || 'me'}`
      : nextMsg?.from_user_name || "");
    const endsGroup = !nextMsg || nextSenderKey !== senderKey;

    msg._startsGroup = startsGroup;
    msg._endsGroup = endsGroup;
    lastSenderKey = senderKey;

    if (msg.real_msg_type == "file_transfer_start") {
      return;
    }
    if (startsGroup || currentGroupKey !== senderKey || !currentGroup) {
      currentGroupKey = senderKey;
      currentGroup = controller.buildMessageGroup(msg, senderInfo);
      container.appendChild(currentGroup.group);
    }

    const row = controller.buildRow(msg, senderInfo);
    const bubble = controller.renderMessageBubble(msg, startsGroup, senderInfo,
      sortedMessages[0] === wrapper);
    const actionButton = controller.buildQuoteActionButton(wrapper, msg, senderInfo);
    if (msg.self_send && actionButton) {
      row.appendChild(actionButton);
    }
    row.appendChild(bubble);
    if (!msg.self_send && actionButton) {
      row.appendChild(actionButton);
    }
    currentGroup.stack.appendChild(row);

    controller.renderStatus(wrapper, bubble, msg);
    controller.addTimestamp(bubble, wrapper, msg);
  });

  if (forceScrollToBottom) {
    controller.autoScrollPinnedToBottom = true;
    controller.scheduleScrollToBottom();
  } else if (bottomOffset !== null) {
    container.scrollTop = Math.max(container.scrollHeight - bottomOffset, 0);
  } else {
    controller.autoScrollPinnedToBottom = true;
    controller.scheduleScrollToBottom();
  }

  if (!options.skipPersist) {
    controller.persistMessages();
  }
}

export function buildEmptyState() {
  const emptyState = document.createElement("div");
  emptyState.className = "text-gray-400 text-center py-8";
  emptyState.textContent = "暂无消息";
  return emptyState;
}
