import { MessageSet } from "utils/file_utils";
import { chatStorageKeys, readCacheEntry, writeCache, removeCache } from "utils/chat_storage";

const MESSAGE_CACHE_LIMIT = 80;
const MESSAGE_CACHE_FALLBACK_LIMITS = [80, 40, 20, 10];

export class ChatRoomMessageState {
  constructor(chatRoomId) {
    this.idValue = chatRoomId;
    this.messages = new MessageSet();
    this.cachedMessagesUpdatedAt = null;
  }

  sanitizeMessageForCache(wrapper) {
    if (!wrapper || wrapper.id == null || String(wrapper.id).startsWith("temp-")) {
      return null;
    }

    try {
      const cloned = JSON.parse(JSON.stringify(wrapper));
      if (cloned.extra?.base64) {
        delete cloned.extra.base64;
      }
      if (cloned.wx_message?.extra?.base64) {
        delete cloned.wx_message.extra.base64;
      }
      if (cloned.referenced_message) {
        delete cloned.referenced_message;
      }
      return cloned;
    } catch (error) {
      console.warn("消息缓存序列化失败", error);
      return null;
    }
  }

  persistMessages() {
    const [namespace, identifier] = chatStorageKeys.chatRoomMessages(this.idValue);
    const cacheableMessages = this.messages.all
      .map((wrapper) => this.sanitizeMessageForCache(wrapper))
      .filter(Boolean);

    let wrote = false;
    for (const limit of MESSAGE_CACHE_FALLBACK_LIMITS) {
      const slice = cacheableMessages.slice(-Math.min(limit, MESSAGE_CACHE_LIMIT));
      if (!slice.length) {
        continue;
      }
      wrote = writeCache(namespace, identifier, slice);
      if (wrote) {
        break;
      }
    }

    if (!wrote) {
      removeCache(namespace, identifier);
    }
  }

  restoreCachedMessages() {
    const [namespace, identifier] = chatStorageKeys.chatRoomMessages(this.idValue);
    const { data: cached, updatedAt } = readCacheEntry(namespace, identifier, []);
    this.cachedMessagesUpdatedAt = updatedAt;
    if (!Array.isArray(cached) || cached.length === 0) {
      return 0;
    }

    this.messages.merge(cached);
    return cached.length;
  }

  cachedMessagesFresh(maxAgeMs) {
    const cachedAt = this.cachedMessagesUpdatedAt
      ? new Date(this.cachedMessagesUpdatedAt).getTime()
      : NaN;
    return Number.isFinite(cachedAt) && Date.now() - cachedAt <= maxAgeMs;
  }

  hasMessage(messageId) {
    if (messageId == null) {
      return false;
    }
    return this.messages.all.some((wrapper) => String(wrapper?.id) === String(messageId));
  }

  latestServerMessageId() {
    let latest = null;
    this.messages.all.forEach((wrapper) => {
      const candidateId = Number(wrapper?.id);
      if (!Number.isFinite(candidateId)) {
        return;
      }
      if (latest == null || candidateId > latest) {
        latest = candidateId;
      }
    });
    return latest;
  }

  oldestServerMessageId() {
    let oldest = null;
    this.messages.all.forEach((wrapper) => {
      const candidateId = Number(wrapper?.id);
      if (!Number.isFinite(candidateId)) {
        return;
      }
      if (oldest == null || candidateId < oldest) {
        oldest = candidateId;
      }
    });
    return oldest;
  }

  sortedMessageWrappers() {
    return [...this.messages.all].sort((left, right) => {
      const timeDiff = this.messageTimestampSortValue(left)
        - this.messageTimestampSortValue(right);
      if (timeDiff !== 0) {
        return timeDiff;
      }
      return this.messageNumericIdSortValue(left)
        - this.messageNumericIdSortValue(right);
    });
  }

  messageTimestampSortValue(wrapper) {
    const value = wrapper?.message_time || wrapper?.created_at
      || wrapper?.wx_message?.message_time;
    const time = value ? new Date(value).getTime() : NaN;
    return Number.isFinite(time) ? time : this.messageNumericIdSortValue(wrapper);
  }

  messageNumericIdSortValue(wrapper) {
    const numericId = Number(wrapper?.id);
    return Number.isFinite(numericId) ? numericId : Number.MAX_SAFE_INTEGER;
  }

  addMessage(msg) {
    this.messages.add(msg);
  }

  removeMessage(id) {
    this.messages.remove(id);
  }

  mergeMessages(data, options = {}) {
    this.messages.merge(data, options);
  }

  clearMessages() {
    this.messages.clear();
  }

  get size() {
    return this.messages.size;
  }

  get all() {
    return this.messages.all;
  }

  at(index) {
    return this.messages.all[index];
  }
}
