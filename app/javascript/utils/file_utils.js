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
  const emojiAliases = {
    微笑: ["Smile"],
    撇嘴: ["Grimace"],
    色: ["Drool"],
    发呆: ["Scowl"],
    得意: ["Chill"],
    流泪: ["Sob"],
    害羞: ["Shy"],
    闭嘴: ["Shutup"],
    睡: ["Sleep"],
    大哭: ["Cry"],
    尴尬: ["Awkward"],
    发怒: ["Pout"],
    调皮: ["Wink"],
    呲牙: ["Grin"],
    惊讶: ["Surprised"],
    难过: ["Frown"],
    囧: ["Tension"],
    抓狂: ["Scream"],
    吐: ["Puke"],
    偷笑: ["Chuckle"],
    愉快: ["Joyful"],
    白眼: ["Slight"],
    傲慢: ["Smug"],
    困: ["Drowsy"],
    惊恐: ["Panic"],
    憨笑: ["Laugh"],
    悠闲: ["Loafer"],
    咒骂: ["Scold"],
    疑问: ["Doubt"],
    嘘: ["Shhh"],
    晕: ["Dizzy"],
    衰: ["BadLuck"],
    骷髅: ["Skull"],
    敲打: ["Hammer"],
    再见: ["Bye"],
    擦汗: ["Relief"],
    抠鼻: ["DigNose"],
    鼓掌: ["Clap"],
    坏笑: ["Trick"],
    右哼哼: ["Bah！R"],
    鄙视: ["Lookdown"],
    委屈: ["Wronged"],
    快哭了: ["Puling"],
    阴险: ["Sly"],
    亲亲: ["Kiss"],
    可怜: ["Whimper"],
    笑脸: ["Happy"],
    生病: ["Sick"],
    脸红: ["Flushed"],
    破涕为笑: ["Lol"],
    恐惧: ["Terror"],
    失望: ["Let Down"],
    无语: ["Duh"],
    嘿哈: ["Hey"],
    捂脸: ["Facepalm"],
    奸笑: ["Smirk"],
    机智: ["Smart"],
    皱眉: ["Concerned"],
    耶: ["Yeah!"],
    吃瓜: ["Onlooker"],
    加油: ["GoForIt"],
    汗: ["Sweats"],
    天啊: ["OMG"],
    Emm: ["Emm"],
    社会社会: ["Respect"],
    旺柴: ["Doge"],
    好的: ["NoProb"],
    打脸: ["MyBad"],
    哇: ["Wow"],
    翻白眼: ["Boring"],
    666: ["Awesome"],
    让我看看: ["LetMeSee"],
    叹气: ["Sigh"],
    苦涩: ["Hurt"],
    裂开: ["Broken"],
    嘴唇: ["Lip"],
    爱心: ["Heart"],
    心碎: ["BrokenHeart"],
    拥抱: ["Hug"],
    强: ["Strong"],
    弱: ["Weak"],
    握手: ["Shake"],
    胜利: ["Victory"],
    抱拳: ["Salute"],
    勾引: ["Beckon"],
    拳头: ["Fist"],
    OK: ["OK"],
    合十: ["Worship"],
    啤酒: ["Beer"],
    咖啡: ["Coffee"],
    蛋糕: ["Cake"],
    玫瑰: ["Rose"],
    凋谢: ["Wilt"],
    菜刀: ["Cleaver"],
    炸弹: ["Bomb"],
    便便: ["Poop"],
    月亮: ["Moon"],
    太阳: ["Sun"],
    庆祝: ["Party"],
    礼物: ["Gift"],
    红包: ["Packet"],
    發: ["Rich"],
    福: ["Blessing"],
    烟花: ["Fireworks"],
    爆竹: ["Firecracker"],
    猪头: ["Pig"],
    跳跳: ["Waddle"],
    发抖: ["Tremble"],
    转圈: ["Twirl"]
  };

  Object.entries(emojiAliases).forEach(([name, aliases]) => {
    const html = `<img src="/emoji/${name}.webp" alt="${name}" class="w-5 h-5 inline">`;
    emojiMap[`[${name}]`] = html;
    aliases.forEach(alias => {
      emojiMap[`[${alias}]`] = html;
    });
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
