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

    return text.replace(/\[([^\[\]]+)]/g, (match, name) => emojiMap[match] || match);
}

export function setupEmojiInputPreview(inputElement) {
    // 创建预览容器
    const previewContainer = document.createElement('div');
    previewContainer.style.cssText = `
        position: fixed;
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 8px 12px;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        z-index: 1000;
        display: none;
        max-height: 120px;
        overflow-y: auto;
        word-wrap: break-word;
        font-size: 14px;
        line-height: 1.4;
        max-width: 400px;
    `;

    // 直接添加到 body
    document.body.appendChild(previewContainer);

    function updatePreview() {
        const text = inputElement.value.trim();

        if (!text) {
            previewContainer.style.display = 'none';
            return;
        }

        // 检查是否包含 emoji
        const hasEmoji = /\[[^\[\]]+\]/.test(text);

        if (hasEmoji) {
            const processedText = replaceEmojis(text);
            previewContainer.innerHTML = processedText;

            // 获取输入框的位置
            const inputRect = inputElement.getBoundingClientRect();

            // 设置预览框位置：在输入框上方80px的位置
            previewContainer.style.left = inputRect.left + 'px';
            previewContainer.style.top = (inputRect.top - 80) + 'px';
            previewContainer.style.width = Math.min(inputRect.width, 400) + 'px';
            previewContainer.style.display = 'block';
        } else {
            previewContainer.style.display = 'none';
        }
    }

    // 监听输入变化
    inputElement.addEventListener('input', updatePreview);
    inputElement.addEventListener('focus', updatePreview);

    // 监听窗口滚动和大小变化，重新定位
    window.addEventListener('scroll', () => {
        if (previewContainer.style.display !== 'none') {
            updatePreview();
        }
    });

    window.addEventListener('resize', () => {
        if (previewContainer.style.display !== 'none') {
            updatePreview();
        }
    });

    // 点击其他地方隐藏预览（可选）
    document.addEventListener('click', (e) => {
        if (!inputElement.contains(e.target) && !previewContainer.contains(e.target)) {
            // 可以选择是否在失去焦点时隐藏预览
            // previewContainer.style.display = 'none';
        }
    });

    // 返回清理函数
    return () => {
        previewContainer.remove();
    };
}