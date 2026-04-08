export function getMessageType(controller, msg) {
  return normalizeMessageType(controller, msg);
}

export function parsedMessageFor(_controller, msg) {
  const payload = msg?.parsed_message;
  return payload && typeof payload === "object" ? payload : null;
}

export function payloadValue(_controller, payload, ...keys) {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  for (const key of keys) {
    if (payload[key] !== undefined && payload[key] !== null) {
      return payload[key];
    }
  }

  return undefined;
}

export function normalizeParsedMessageType(_controller, type) {
  if (type == null || type === "") {
    return null;
  }

  if (typeof type === "string" && !/^\d+$/.test(type)) {
    if (["sys", "sys_notice", "function_message"].includes(type)) {
      return "system_notice";
    }
    return type;
  }

  const numericType = Number(type);
  if (!Number.isFinite(numericType)) {
    return null;
  }

  return normalizeMessageType(_controller, { real_msg_type: numericType });
}

export function cardPayloadFor(controller, msg) {
  const parsed = parsedMessageFor(controller, msg);
  if (parsed) {
    const parsedType = normalizeParsedMessageType(controller, parsed.type);
    if (parsedType && parsedType !== "quote") {
      return parsed;
    }
  }

  return parseWxXmlMessage(controller, msg?.content || "");
}

export function voipPayloadFor(controller, msg) {
  const parsed = parsedMessageFor(controller, msg);
  if (parsed && normalizeParsedMessageType(controller, parsed.type) === "voip") {
    return parsed;
  }

  return parseWxVoipMessage(controller, msg?.content || "");
}

export function chatHistoryPayloadFor(controller, msg) {
  const parsed = parsedMessageFor(controller, msg);
  if (parsed && normalizeParsedMessageType(controller, parsed.type) === "chat_history") {
    return {
      ...parsed,
      items: Array.isArray(parsed.items) ? parsed.items.map((item) => ({
        type: normalizeParsedMessageType(controller, item?.type) || item?.type || "text",
        senderName: payloadValue(controller, item, "senderName", "sender_name") || "",
        time: payloadValue(controller, item, "time") || "",
        content: payloadValue(controller, item, "content") || ""
      })) : []
    };
  }

  return parseWxChatHistoryMessage(controller, msg?.content || "");
}

export function filePayloadFor(controller, msg) {
  const parsed = parsedMessageFor(controller, msg);
  if (parsed && normalizeParsedMessageType(controller, parsed.type) === "file_message") {
    return parsed;
  }

  return parseWxFileAttachment(controller, msg?.content || "") || {};
}

export function quotePayloadFor(controller, msg) {
  const parsed = parsedMessageFor(controller, msg);
  const preview = payloadValue(controller, parsed, "quote_preview", "quotePreview");

  return {
    title: payloadValue(controller, parsed, "title") || "",
    referNewMsgId: normalizeReferenceId(controller,
      payloadValue(controller, parsed, "refer_new_msg_id", "referNewMsgId")),
    quotePreview: preview && typeof preview === "object" ? {
      type: normalizeParsedMessageType(controller,
        payloadValue(controller, preview, "type")) || payloadValue(controller, preview, "type"),
      content: payloadValue(controller, preview, "content") || "",
      displayName: payloadValue(controller, preview, "display_name", "displayName") || "",
      senderUserName: payloadValue(controller, preview, "sender_user_name", "senderUserName") || "",
      fromUserName: payloadValue(controller, preview, "from_user_name", "fromUserName") || "",
      serverId: normalizeReferenceId(controller,
        payloadValue(controller, preview, "server_id", "serverId"))
    } : null
  };
}

export function parseWxXmlMessage(controller, xmlString) {
  try {
    const xml = parseXmlDocument(controller, xmlString);
    if (!xml) {
      return { type: "text", content: xmlString };
    }

    const rawTitle = xml.querySelector("title")?.textContent?.trim() || "";
    const desc = xml.querySelector("des")?.textContent?.trim() || "";
    const rawUrl = xml.querySelector("url")?.textContent?.trim() || "";
    const cover = xml.querySelector("thumburl")?.textContent?.trim()
      || xml.querySelector("cover")?.textContent?.trim();
    const source = xml.querySelector("publisher > nickname")?.textContent?.trim()
      || xml.querySelector("appname")?.textContent?.trim();
    const msgType = Number(xml.querySelector("appmsg > type")?.textContent
      || xml.querySelector("type")?.textContent || 0);
    const refContent = xml.querySelector("refermsg")?.querySelector(
      "content")?.textContent?.trim() || "";
    const refServerId = xml.querySelector("refermsg")?.querySelector(
      "svrid")?.textContent?.trim() || "";

    const finderFeed = xml.querySelector("finderFeed");
    if (finderFeed) {
      const nickname = finderFeed.querySelector("nickname")?.textContent?.trim() || "";
      const finderDesc = finderFeed.querySelector("desc")?.textContent?.trim() || desc;
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
        title: nickname || cleanXmlTitle(controller, rawTitle) || "视频号分享",
        desc: finderDesc,
        url: isPlaceholderUpgradeUrl(controller, rawUrl) ? "" : rawUrl,
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
      detectedType: mapAppMessageType(controller, msgType),
      title: cleanXmlTitle(controller, rawTitle),
      desc,
      url: isPlaceholderUpgradeUrl(controller, rawUrl) ? "" : rawUrl,
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

export function parseWxVideoMessage(controller, xmlString) {
  try {
    const xml = parseXmlDocument(controller, xmlString);
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

export function parseWxVoipMessage(controller, xmlString) {
  try {
    const xml = parseXmlDocument(controller, xmlString);
    if (!xml) {
      return { title: "微信通话", summary: "通话消息" };
    }

    const voipNode = xml.querySelector("voipmsg");
    const bubble = xml.querySelector("VoIPBubbleMsg");
    const rawMsg = bubble?.querySelector("msg")?.textContent?.trim() || "";
    const roomType = bubble?.querySelector("room_type")?.textContent?.trim() || "";
    const durationSeconds = Number(bubble?.querySelector("duration")?.textContent || 0);

    let durationLabel = "";
    const durationMatch = rawMsg.match(/Duration:\s*([0-9:]+)/i);
    if (durationMatch?.[1]) {
      durationLabel = durationMatch[1];
    } else if (durationSeconds > 0) {
      durationLabel = formatVoipDuration(controller, durationSeconds);
    }

    const localizedStatus = localizeVoipStatus(controller, rawMsg);
    const title = roomType === "1" ? "微信通话" : "微信语音通话";
    const summary = durationLabel ? `通话时长 ${durationLabel}`
      : localizedStatus || voipNode?.getAttribute("type") || "通话消息";

    return { title, summary, durationLabel };
  } catch (error) {
    console.error("VoIP XML parse error:", error);
    return { title: "微信通话", summary: "通话消息" };
  }
}

export function localizeVoipStatus(_controller, rawMsg = "") {
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

export function parseWxChatHistoryMessage(controller, xmlString) {
  const fallback = { title: "聊天记录", desc: "", count: 0, items: [] };

  try {
    const xml = parseXmlDocument(controller, xmlString);
    if (!xml) {
      return fallback;
    }

    const appmsg = xml.querySelector("appmsg");
    const title = appmsg?.querySelector("title")?.textContent?.trim() || fallback.title;
    const desc = appmsg?.querySelector("des")?.textContent?.trim() || "";
    const recordRaw = appmsg?.querySelector("recorditem")?.textContent?.trim() || "";
    if (!recordRaw) {
      return { title, desc, count: desc ? desc.split(/\n+/).filter(Boolean).length : 0, items: [] };
    }

    const recordXml = parseXmlDocument(controller, recordRaw);
    if (!recordXml) {
      return { title, desc, count: desc ? desc.split(/\n+/).filter(Boolean).length : 0, items: [] };
    }

    const recordInfo = recordXml.querySelector("recordinfo");
    const itemNodes = Array.from(recordInfo?.querySelectorAll("datalist > dataitem") || []);
    const descLines = desc.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    const items = itemNodes.map((itemNode, index) =>
      parseWxChatHistoryItem(controller, itemNode, descLines[index] || ""));

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

export function parseWxChatHistoryItem(controller, itemNode, fallbackLine = "") {
  const dataType = Number(itemNode?.getAttribute("datatype") || 1);
  const rawContent = itemNode?.querySelector("datadesc")?.textContent?.trim() || "";
  const senderName = itemNode?.querySelector("sourcename")?.textContent?.trim() || "";
  const time = itemNode?.querySelector("sourcetime")?.textContent?.trim() || "";
  const fallbackContent = fallbackLine.includes(":")
    ? fallbackLine.split(":").slice(1).join(":").trim()
    : fallbackLine;
  const content = rawContent.includes("�") && fallbackContent
    ? fallbackContent
    : (rawContent || fallbackContent || chatHistoryTypeLabel(controller, dataType));

  return { type: chatHistoryItemType(controller, dataType), senderName, time, content };
}

export function chatHistoryItemType(_controller, dataType) {
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

export function chatHistoryTypeLabel(controller, dataType) {
  return `[${humanizeMessageType(controller, chatHistoryItemType(controller, dataType))}]`;
}

export function formatVoipDuration(_controller, totalSeconds) {
  const seconds = Math.max(Number(totalSeconds) || 0, 0);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainSeconds = seconds % 60;

  if (hours > 0) {
    return [hours, minutes, remainSeconds].map((value) => String(value).padStart(2, "0")).join(":");
  }

  return [minutes, remainSeconds].map((value) => String(value).padStart(2, "0")).join(":");
}

export function parseWxFileAttachment(controller, xmlString) {
  try {
    const xml = parseXmlDocument(controller, xmlString);
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

export function extractXmlPayload(_controller, xmlString = "") {
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

export function parseXmlDocument(controller, xmlString) {
  const payload = extractXmlPayload(controller, xmlString);
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

export function mapAppMessageType(_controller, msgType) {
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

export function cleanXmlTitle(controller, title = "") {
  const cleaned = String(title || "").trim();
  if (!cleaned || isUnsupportedXmlTitle(controller, cleaned)) {
    return "";
  }
  return cleaned;
}

export function isUnsupportedXmlTitle(_controller, title = "") {
  return /当前版本不支持展示该内容|请升级至最新版本/.test(title);
}

export function isPlaceholderUpgradeUrl(_controller, url = "") {
  return /support\.weixin\.qq\.com\/security\/readtemplate/.test(url);
}

export function attachmentUrl(controller, type, msg, { cacheKey } = {}) {
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

export function normalizeReferenceId(_controller, value) {
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

export function buildMediaPreviewTitle(controller, msg, fallback = "媒体预览") {
  const senderName = msg?.self_send ? "我" : (msg?.sender_name
    || lookupSenderInfo(controller, msg, msg?.content)?.name || "");
  return senderName ? `${senderName} · ${fallback}` : fallback;
}

export function findChatMember(controller, wxid) {
  if (!wxid || !Array.isArray(controller.chatMembers)) {
    return null;
  }

  return controller.chatMembers.find((member) => {
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

export function resolveMemberName(_controller, member, fallback = "") {
  return member?.display_name || member?.displayName || member?.DisplayName
    || member?.remark || member?.Remark || member?.nick_name
    || member?.nickName || member?.NickName || fallback;
}

export function resolveMemberAvatar(_controller, member) {
  return member?.small_head_img_url || member?.smallHeadImgUrl
    || member?.SmallHeadImgUrl || member?.big_head_img_url
    || member?.bigHeadImgUrl || member?.BigHeadImgUrl || member?.avatar
    || member?.Avatar || "";
}

export function stripRoomSenderPrefix(_controller, text = "") {
  return text.replace(/^[^:\n]+:\n/, "");
}

export function sortedMessageWrappers(controller) {
  return controller.messageState.sortedMessageWrappers();
}

export function messageTimestampSortValue(controller, wrapper) {
  return controller.messageState.messageTimestampSortValue(wrapper);
}

export function messageNumericIdSortValue(controller, wrapper) {
  return controller.messageState.messageNumericIdSortValue(wrapper);
}

export function oldestServerMessageId(controller) {
  return controller.messageState.oldestServerMessageId();
}

export function normalizeMessageType(controller, msg) {
  const parsedType = normalizeParsedMessageType(controller,
    parsedMessageFor(controller, msg)?.type);
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
  const stringAliases = { voip_msg: "voip" };
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
      if ((stringType === "refer" || stringType === "unknown") && msg?.content) {
        const parsed = parseWxXmlMessage(controller, msg.content);
        if (parsed?.detectedType) {
          return parsed.detectedType;
        }
      }
      return stringType;
    }
  }

  const numericType = Number(msg?.real_msg_type ?? msg?.msg_type);
  if (numericType === 49 && msg?.content) {
    const parsed = parseWxXmlMessage(controller, msg.content);
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

export function buildMessagePreview(controller, msg) {
  const type = normalizeMessageType(controller, msg);
  const content = stripRoomSenderPrefix(controller, msg?.content || "");

  switch (type) {
    case "text":
      return { type, content: content || "[文本]", asLinkedText: true };
    case "quote": {
      const parsed = quotePayloadFor(controller, msg);
      return {
        type,
        content: msg?.refer_title || parsed.title || parsed.quotePreview?.content
          || "[引用消息]",
        asLinkedText: false
      };
    }
    case "card": {
      const parsed = cardPayloadFor(controller, msg);
      return { type, content: payloadValue(controller, parsed, "title") || "[卡片消息]", asLinkedText: false };
    }
    case "video_account": {
      const parsed = cardPayloadFor(controller, msg);
      return {
        type,
        content: payloadValue(controller, parsed, "desc")
          || payloadValue(controller, parsed, "title")
          || "[视频号消息]",
        asLinkedText: false
      };
    }
    case "chat_history": {
      const parsed = chatHistoryPayloadFor(controller, msg);
      return { type, content: parsed.desc || parsed.title || "[聊天记录]", asLinkedText: false };
    }
    case "file_message": {
      const fileInfo = filePayloadFor(controller, msg);
      return { type, content: fileInfo.title || msg?.refer_title || "[文件消息]", asLinkedText: false };
    }
    case "voip": {
      const parsed = voipPayloadFor(controller, msg);
      return { type, content: parsed.summary || "[通话消息]", asLinkedText: false };
    }
    case "image":
    case "voice":
    case "video":
    case "emoji":
    case "micro_video":
      return { type, content: `[${humanizeMessageType(controller, type)}]`, asLinkedText: false };
    case "system_notice":
      return { type, content: buildSystemNoticeContent(controller, msg), asLinkedText: false };
    default: {
      const parsed = parseWxXmlMessage(controller, msg?.content || "");
      return {
        type,
        content: content || parsed.title || parsed.desc || `[${humanizeMessageType(controller, type)}]`,
        asLinkedText: !content.startsWith("<")
      };
    }
  }
}

export function isSystemNoticeMessage(controller, msg) {
  return normalizeMessageType(controller, msg) === "system_notice";
}

export function buildSystemNoticeContent(controller, msg) {
  const content = stripRoomSenderPrefix(controller, msg?.content || "").trim();
  if (!content) {
    return "群消息通知";
  }

  const xmlPayload = extractXmlPayload(controller, content);
  if (xmlPayload.startsWith("<")) {
    const parsed = parseWxXmlMessage(controller, content);
    if (parsed?.title || parsed?.desc) {
      return [parsed.title, parsed.desc].filter(Boolean).join(" ");
    }
  }

  return content;
}

export function lookupSenderInfo(controller, msg, rawContent = "") {
  if (msg.sender_key && msg.sender_name) {
    return {
      key: msg.sender_key,
      name: msg.sender_name,
      avatar: msg.sender_avatar || "",
      initial: (msg.sender_initial || msg.sender_name.slice(0, 1) || "?").toUpperCase()
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

  if (controller.isRoom()) {
    let wxid = null;
    if (msg.from_user_name && !msg.from_user_name.endsWith("@chatroom")) {
      wxid = msg.from_user_name;
    }
    if (!wxid) {
      const match = (rawContent || msg.content || "").match(/^([^:\n]+):\n/);
      wxid = match ? match[1] : null;
    }
    wxid = wxid || msg.to_user_name || msg.from_user_name;
    const member = findChatMember(controller, wxid);
    const name = resolveMemberName(controller, member, wxid);
    const avatar = resolveMemberAvatar(controller, member);
    const initial = (name || wxid || "?").slice(0, 1).toUpperCase();
    return { key: `room:${wxid}`, name, avatar, initial };
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

export function humanizeMessageType(_controller, msgType) {
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
