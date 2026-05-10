import { hideAllEmojiPreviews } from "utils/file_utils";

export function buildLocalMessagePreview(controller, type, tempMsg) {
  switch (type) {
    case "text":
      return tempMsg?.wx_message?.content || "新消息";
    case "quote":
      return tempMsg?.wx_message?.refer_title || "[引用消息]";
    case "image":
      return "[图片]";
    case "emoji":
      return "[表情]";
    case "file":
      return "[文件]";
    case "voice":
      return "[语音]";
    case "video":
      return "[视频]";
    default:
      return "[新消息]";
  }
}

export function dispatchLocalChatMessage(controller, type, tempMsg) {
  window.dispatchEvent(new CustomEvent("chat:local-message", {
    detail: {
      chat_room_id: controller.idValue,
      chat_room_name: controller.nameValue || "聊天窗口",
      content_preview: buildLocalMessagePreview(controller, type, tempMsg),
      message_time: tempMsg?.message_time || new Date().toISOString(),
      self_send: true
    }
  }));
}

export function createSendMessage(controller, type, message) {
  const tempId = "temp-" + Date.now();

  const tempMsg = {
    id: tempId,
    chat_room_id: controller.idValue,
    message_time: new Date().toISOString(),
    sending: true,
    send_failed: false,
    wx_message: {
      msg_type: type,
      content: "",
      to_user_name: controller.currentWxidValue,
      self_send: true,
      real_msg_type: type,
    }
  };

  if (type === "text") {
    const content = controller.inputTarget.value;
    tempMsg.wx_message.content = content;
    tempMsg.msg_type = 1;
    controller.inputTarget.value = "";
  }
  if (type === "quote") {
    const pendingQuote = message?.pendingQuote || controller.pendingQuote;
    const content = controller.inputTarget.value.trim();
    tempMsg.msg_type = 49;
    tempMsg.wx_message.real_msg_type = "quote";
    tempMsg.wx_message.content = content;
    tempMsg.wx_message.refer_title = content;
    tempMsg.wx_message.refer_new_msg_id = pendingQuote?.newMsgId;
    tempMsg.referenced_message = pendingQuote?.wrapper || null;
    tempMsg.extra = {
      reference_message_id: pendingQuote?.messageId
    };
    controller.inputTarget.value = "";
  }
  if (type === "image") {
    tempMsg.msg_type = 3;
    tempMsg.extra = {
      base64: message?.extra?.base64,
    };
  }
  if (type === "emoji") {
    tempMsg.msg_type = 47;
    tempMsg.extra = {
      base64: message?.extra?.base64 || "",
      file_md5: message?.extra?.file_md5 || message?.extra?.md5 || "",
      total_len: message?.extra?.total_len || "",
      preview_url: message?.extra?.preview_url || "",
    };
  }
  if (type === "file") {
    tempMsg.msg_type = 6;
    tempMsg.wx_message.real_msg_type = "file_message";
  }
  if (type === "voice") {
    const voiceTime = Number(message?.extra?.voice_time || 0);
    tempMsg.msg_type = 34;
    tempMsg.wx_message.real_msg_type = "voice";
    tempMsg.wx_message.content = `<msg><voicemsg voicelength="${voiceTime}" length="0" endflag="1" voiceformat="4" /></msg>`;
    tempMsg.extra = {
      voice_time: voiceTime
    };
  }

  return tempMsg;
}

export function sendMessage(controller, type, message) {
  const pendingQuote = type === "quote" ? controller.pendingQuote : null;
  const msg = createSendMessage(controller, type, {
    ...(message || {}),
    pendingQuote
  });

  controller.messages.add(msg);
  controller.renderMessages({ forceScrollToBottom: true });
  controller.dispatchLocalChatMessage(type, msg);

  if (type === "text") {
    hideAllEmojiPreviews();
  }
  if (type === "quote") {
    controller.pendingQuote = null;
    controller.renderPendingQuote();
  }

  let body;
  let headers;
  const usesFormData = type === "file" || type === "voice";
  if (usesFormData) {
    const formData = new FormData();
    formData.append("chat_room_id", controller.idValue);
    formData.append("msg_type", msg.msg_type);
    formData.append("content", msg.wx_message.content || "");
    formData.append("file", message?.file);
    Object.entries(msg.extra || {}).forEach(([key, value]) => {
      formData.append(`extra[${key}]`, value);
    });
    body = formData;

    headers = {
      "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]').content
    };
  } else {
    const requestExtra = { ...(msg.extra || {}) };
    if (type === "emoji") {
      delete requestExtra.preview_url;
    }
    body = JSON.stringify({
      chat_room_id: controller.idValue,
      content: msg.wx_message.content,
      msg_type: msg.msg_type,
      extra: requestExtra,
    });
    headers = {
      "Content-Type": "application/json",
      "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]').content
    };
  }

  fetch(`/chat_room/${controller.idValue}/messages`, {
    method: "POST", headers: headers, body: body
  })
    .then((res) => res.json())
    .then((newMsg) => {
      if (newMsg?.data) {
        controller.messages.remove(msg.id);
        controller.messages.add({ ...newMsg.data, sending: false, send_failed: false });
        controller.renderMessages({ forceScrollToBottom: true });
      } else {
        controller.messages.remove(msg.id);
        controller.messages.add({ ...msg, sending: false, send_failed: true });
        controller.renderMessages({ forceScrollToBottom: true });
      }
    })
    .catch(() => {
      controller.messages.remove(msg.id);
      controller.messages.add({ ...msg, sending: false, send_failed: true });
      controller.renderMessages({ forceScrollToBottom: true });
    });
}
