// app/javascript/utils/file_utils.js
export function get_file_base64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function replaceEmojis(text) {
  const emojiMap = {};
  [
    "微笑", "撇嘴", "色", "发呆", "得意", "流泪", "害羞", "闭嘴", "睡", "大哭",
    "尴尬", "发怒", "调皮", "呲牙", "惊讶", "难过", "囧", "抓狂", "吐", "偷笑",
    "愉快", "白眼", "傲慢", "困", "惊恐", "憨笑", "悠闲", "咒骂", "疑问", "嘘",
    "晕", "衰", "骷髅", "敲打", "再见", "擦汗", "抠鼻", "鼓掌", "坏笑", "右哼哼",
    "鄙视", "委屈", "快哭了", "阴险", "亲亲", "可怜", "笑脸", "生病", "脸红", "破涕为笑",
    "恐惧", "失望", "无语", "嘿哈", "捂脸", "奸笑", "机智", "皱眉", "耶", "吃瓜",
    "加油", "汗", "天啊", "Emm", "社会社会", "旺柴", "好的", "打脸", "哇", "翻白眼",
    "666", "让我看看", "叹气", "苦涩", "裂开", "嘴唇", "爱心", "心碎", "拥抱", "强",
    "弱", "握手", "胜利", "抱拳", "勾引", "拳头", "OK", "合十", "啤酒", "咖啡",
    "蛋糕", "玫瑰", "凋谢", "菜刀", "炸弹", "便便", "月亮", "太阳", "庆祝", "礼物",
    "红包", "發", "福", "烟花", "爆竹", "猪头", "跳跳", "发抖", "转圈"
  ].forEach(name => {
    emojiMap[`[${name}]`] = `<img src="/emoji/${name}.webp" alt="${name}" class="w-5 h-5 inline">`;
  });

  let result = text.replace(/\[([^\[\]]+)]/g, (match, name) => emojiMap[match] || match);
  result = result.replace(/\n/g, '<br>');
  return result;
}

// 全局管理当前活动的预览容器
let currentActivePreview = null;

// 隐藏所有预览容器
export function hideAllEmojiPreviews() {
  // 隐藏所有 emoji 预览容器
  document.querySelectorAll('.emoji-preview-container').forEach(container => {
    container.style.opacity = '0';
    container.style.transform = 'translateY(10px)';
    container.style.display = 'none';
  });
  currentActivePreview = null;
}

export function setupEmojiInputPreview(inputElement, uniqueId) {
  const containerId = `emoji-preview-${uniqueId}`;

  // 如果这个输入框已经设置过预览，直接返回
  if (inputElement._emojiPreviewSetup && inputElement._previewContainerId === containerId) {
    // 确保预览容器存在
    const existingContainer = document.getElementById(containerId);
    if (existingContainer) {
      return () => { };
    }
  }

  // 清理旧的监听器
  if (inputElement._emojiPreviewListener) {
    inputElement.removeEventListener('input', inputElement._emojiPreviewListener);
  }

  // 获取或创建预览容器
  let previewContainer = document.getElementById(containerId);
  if (!previewContainer) {
    previewContainer = document.createElement('div');
    previewContainer.id = containerId;
    previewContainer.className = 'emoji-preview-container';
    previewContainer.style.cssText = `
            position: fixed;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 12px;
            padding: 12px 16px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2), 0 2px 8px rgba(0, 0, 0, 0.1);
            backdrop-filter: blur(10px);
            z-index: 50;
            display: none;
            max-height: 140px;
            overflow-y: auto;
            word-wrap: break-word;
            font-size: 14px;
            line-height: 1.5;
            max-width: 420px;
            min-width: 200px;
            transition: all 0.2s ease-in-out;
            opacity: 0;
            transform: translateY(10px);
        `;
    document.body.appendChild(previewContainer);
  }

  function showPreview() {
    previewContainer.style.opacity = '1';
    previewContainer.style.transform = 'translateY(0)';
    currentActivePreview = previewContainer;
  }

  function hidePreview() {
    previewContainer.style.opacity = '0';
    previewContainer.style.transform = 'translateY(10px)';
    setTimeout(() => {
      if (previewContainer.style.opacity === '0') {
        previewContainer.style.display = 'none';
      }
    }, 200);
    if (currentActivePreview === previewContainer) {
      currentActivePreview = null;
    }
  }

  function updatePreview() {
    const text = inputElement.value;

    if (!text) {
      hidePreview();
      return;
    }

    const hasEmoji = /\[[^\[\]]+\]/.test(text);
    const hasNewline = text.includes('\n');

    if (hasEmoji || hasNewline) {
      // 先隐藏其他预览
      if (currentActivePreview && currentActivePreview !== previewContainer) {
        currentActivePreview.style.opacity = '0';
        currentActivePreview.style.transform = 'translateY(10px)';
        currentActivePreview.style.display = 'none';
      }

      const processedText = replaceEmojis(text);
      previewContainer.innerHTML = processedText;

      const inputRect = inputElement.getBoundingClientRect();
      previewContainer.style.display = 'block';
      const previewHeight = previewContainer.offsetHeight;

      previewContainer.style.left = inputRect.left + 'px';
      previewContainer.style.top = (inputRect.top - previewHeight - 12) + 'px';
      previewContainer.style.width = Math.min(Math.max(inputRect.width, 200), 420) + 'px';

      requestAnimationFrame(() => {
        showPreview();
      });
    } else {
      hidePreview();
    }
  }

  const inputListener = updatePreview;
  inputElement.addEventListener('input', inputListener);

  inputElement._emojiPreviewSetup = true;
  inputElement._previewContainerId = containerId;
  inputElement._emojiPreviewListener = inputListener;

  return () => { };
}

// 监听 Turbo 的页面切换事件，隐藏所有预览
document.addEventListener('turbo:before-visit', hideAllEmojiPreviews);
document.addEventListener('turbo:before-render', hideAllEmojiPreviews);



export class MessageSet {
  constructor() {
    this.items = [];
    this.idSet = new Set();
  }

  add(message) {
    if (!message || message.id == null) {
      console.warn("Message 必须有 id 属性");
      return;
    }

    if (this.idSet.has(message.id)) return;

    this.items.push(message);
    this.idSet.add(message.id);
  }

  remove(id) {
    const index = this.items.findIndex(m => m.id === id);
    if (index !== -1) {
      this.items.splice(index, 1);
      this.idSet.delete(id);
    }
  }

  clear() {
    this.items = [];
    this.idSet.clear();
  }

  /**
   * 批量合并消息数组，自动去重
   * @param {Array} messages - 需要合并的消息数组
   * @param {Boolean} prepend - 是否插入到前面（默认 false）
   */
  merge(messages, { prepend = false } = {}) {
    if (!Array.isArray(messages)) return;

    const newOnes = messages.filter(m => m && m.id != null && !this.idSet.has(m.id));
    if (newOnes.length === 0) return;

    if (prepend) {
      this.items = [...newOnes, ...this.items];
    } else {
      this.items.push(...newOnes);
    }

    for (const m of newOnes) {
      this.idSet.add(m.id);
    }
  }

  get all() {
    return this.items;
  }

  get length() {
    return this.items.length;
  }

  get size() {
return this.items.length;
  }

  at(index) {
    return this.items[index];
  }

  [Symbol.iterator]() {
    return this.items[Symbol.iterator]();
  }
}

