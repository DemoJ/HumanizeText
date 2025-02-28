// 检查是否已经存在样式
if (!document.querySelector('#translator-popup-style')) {
  // 更新弹窗样式
  const style = document.createElement('style');
  style.id = 'translator-popup-style'; // 添加唯一ID
  style.textContent = `
    .translator-popup {
      position: fixed;
      z-index: 10000;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
      display: flex;
      flex-direction: column;
      max-width: 400px;
      min-width: 300px;
      font-family: system-ui, -apple-system, sans-serif;
      max-height: 80vh;
      cursor: default;
    }

    .translator-popup .translator-header {
      position: sticky;
      top: 0;
      z-index: 1;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: white;
      border-bottom: 1px solid #eee;
      border-radius: 8px 8px 0 0;
      cursor: grab;
      user-select: none;
    }

    .translator-popup .translator-header:active {
      cursor: grabbing;
    }

    .translator-popup .translator-title {
      font-weight: bold;
      color: #333;
    }

    .translator-popup .translator-close-btn {
      cursor: pointer;
      padding: 4px;
      color: #666;
    }

    .translator-popup .translator-content {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      scroll-behavior: smooth;
      max-height: calc(80vh - 100px);
      cursor: auto;
    }

    .translator-popup .translator-section {
      margin-bottom: 12px;
      padding: 12px;
      border-radius: 6px;
      background: #fff;
    }

    .translator-popup .translator-section:last-child {
      margin-bottom: 0;
      padding-bottom: 40px;
    }

    .translator-popup .translator-label {
      font-size: 12px;
      color: #666;
      margin-bottom: 8px;
      font-weight: 500;
    }

    .translator-popup .translator-text {
      color: #333;
      line-height: 1.5;
      overflow-wrap: break-word;
    }

    .translator-popup .translator-reasoning-text {
      color: #666;
      line-height: 1.5;
      overflow-wrap: break-word;
      font-size: 0.95em;
      background: #f8f9fa;
      padding: 12px;
      border-radius: 4px;
      border-left: 3px solid #6c757d;
    }

    .translator-popup .translator-translated-text {
      color: #333;
      line-height: 1.5;
      overflow-wrap: break-word;
      font-weight: 500;
    }

    /* Markdown 样式 */
    .translator-popup .translator-text p,
    .translator-popup .translator-reasoning-text p,
    .translator-popup .translator-translated-text p {
      margin: 0.5em 0;
    }

    .translator-popup .translator-text code,
    .translator-popup .translator-reasoning-text code,
    .translator-popup .translator-translated-text code {
      background: #f5f5f5;
      padding: 0.2em 0.4em;
      border-radius: 3px;
      font-size: 0.9em;
    }

    .translator-popup .translator-text pre,
    .translator-popup .translator-reasoning-text pre,
    .translator-popup .translator-translated-text pre {
      background: #f5f5f5;
      padding: 1em;
      border-radius: 6px;
      overflow-x: auto;
    }

    .translator-popup .translator-text blockquote,
    .translator-popup .translator-reasoning-text blockquote,
    .translator-popup .translator-translated-text blockquote {
      margin: 0.5em 0;
      padding-left: 1em;
      border-left: 4px solid #ddd;
      color: #666;
    }

    .translator-popup .translator-loading {
      display: inline-block;
      margin-left: 8px;
      color: #666;
    }

    .translator-popup .translator-copy-btn {
      position: sticky;
      bottom: 0;
      left: 0;
      right: 0;
      background: #4CAF50;
      color: white;
      border: none;
      padding: 8px 16px;
      width: 100%;
      cursor: pointer;
      border-radius: 0 0 8px 8px;
      margin-top: auto;
    }

    .translator-popup .translator-copy-btn:hover {
      background: #45a049;
    }

    /* 美化滚动条 */
    .translator-popup .translator-content::-webkit-scrollbar {
      width: 8px;
    }

    .translator-popup .translator-content::-webkit-scrollbar-track {
      background: #f1f1f1;
      border-radius: 4px;
    }

    .translator-popup .translator-content::-webkit-scrollbar-thumb {
      background: #888;
      border-radius: 4px;
    }

    .translator-popup .translator-content::-webkit-scrollbar-thumb:hover {
      background: #666;
    }
  `; // 确保正确闭合模板字符串
  document.head.appendChild(style);
}

// 修改消息监听器
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  try {
    if (request.action === 'showTranslationPopup') {
      const oldPopup = document.querySelector('.translator-popup');
      if (oldPopup) {
        chrome.runtime.sendMessage({ action: 'cleanup' }, () => {
          if (chrome.runtime.lastError) {
            // 清理请求的错误可以静默处理
            console.log('清理请求未完成，继续处理');
          }
          oldPopup.remove();
          const popup = showPopup(request.text);
          chrome.runtime.sendMessage({ 
            action: 'translate', 
            text: request.text
          });
        });
      } else {
        const popup = showPopup(request.text);
        chrome.runtime.sendMessage({ 
          action: 'translate', 
          text: request.text
        });
      }
      sendResponse({ success: true });
      return false;
    }
    
    if (request.action === 'updateTranslation') {
      const popup = document.querySelector('.translator-popup');
      if (!popup) {
        console.log('翻译弹窗不存在，可能已关闭');
        sendResponse({ success: true });
        return false;
      }
      
      const translatedTextEl = popup.querySelector('.translator-translated-text');
      const reasoningSectionEl = popup.querySelector('.translator-section-reasoning');
      const reasoningTextEl = popup.querySelector('.translator-reasoning-text');
      const loadingEl = popup.querySelector('.translator-loading');
      const contentEl = popup.querySelector('.translator-content');
      
      if (translatedTextEl && reasoningTextEl && loadingEl) {
        if (request.error) {
          if (request.error.includes('API Key') || 
              request.error.includes('API 请求失败') ||
              request.error.includes('rate limit')) {
            loadingEl.textContent = '翻译失败：' + request.error;
          } else {
            loadingEl.textContent = '翻译失败，请重试';
          }
        } else {
          translatedTextEl.innerHTML = marked.parse(request.content);
          
          if (reasoningSectionEl) {
            reasoningSectionEl.style.display = request.hasReasoning ? 'block' : 'none';
            if (request.hasReasoning && request.reasoningContent) {
              reasoningTextEl.innerHTML = marked.parse(request.reasoningContent);
            }
          }
          
          if (request.done) {
            loadingEl.style.display = 'none';
          }

          // 只在用户未主动滚动时自动滚动到底部
          if (!popup.userHasScrolled()) {
            contentEl.scrollTop = contentEl.scrollHeight;
          }
        }
      }
      sendResponse({ success: true });
      return false;
    }
  } catch (error) {
    // 只记录错误，不返回给用户
    console.error('处理消息时出错:', error);
    sendResponse({ success: true });
  }
  return false;
});

// 更新弹窗创建函数
function showPopup(selection) {
  // 清理可能存在的旧弹窗
  const oldPopup = document.querySelector('.translator-popup');
  if (oldPopup) oldPopup.remove();

  const popup = document.createElement('div');
  popup.className = 'translator-popup';
  popup.innerHTML = `
    <div class="translator-header">
      <div class="translator-title">人话翻译器</div>
      <div class="translator-close-btn">✕</div>
    </div>
    <div class="translator-content">
      <div class="translator-section">
        <div class="translator-label">原文</div>
        <div class="translator-text">${selection}</div>
      </div>
      <div class="translator-section translator-section-reasoning" style="display: none;">
        <div class="translator-label">思维链</div>
        <div class="translator-reasoning-text"></div>
      </div>
      <div class="translator-section">
        <div class="translator-label">译文</div>
        <div class="translator-translated-text"></div>
        <div class="translator-loading">正在翻译...</div>
      </div>
    </div>
    <button class="translator-copy-btn">复制译文</button>
  `;

  // 修改弹窗位置为右上角
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  // 设置在右上角，留出一定边距
  popup.style.left = `${viewportWidth - 420}px`; // 弹窗宽度约400px，留20px边距
  popup.style.top = '20px'; // 距离顶部20px

  document.body.appendChild(popup);

  // 添加事件监听器
  initializePopupEvents(popup);

  // 添加滚动检测
  const contentEl = popup.querySelector('.translator-content');
  let userHasScrolled = false;
  let scrollTimeout;

  contentEl.addEventListener('scroll', () => {
    userHasScrolled = true;
    // 如果用户停止滚动5秒后，重置标志
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      userHasScrolled = false;
    }, 5000);
  });

  // 将滚动状态添加到popup对象上
  popup.userHasScrolled = () => userHasScrolled;

  return popup;
}

// 抽取弹窗事件初始化逻辑
function initializePopupEvents(popup) {
  // 使弹窗可拖动
  const header = popup.querySelector('.translator-header');
  let isDragging = false;
  let startX, startY, initialX, initialY;

  header.addEventListener('mousedown', (e) => {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    initialX = popup.offsetLeft;
    initialY = popup.offsetTop;
  });

  document.addEventListener('mousemove', (e) => {
    if (isDragging) {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      popup.style.left = `${initialX + dx}px`;
      popup.style.top = `${initialY + dy}px`;
    }
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
  });

  // 修改关闭按钮事件
  popup.querySelector('.translator-close-btn').addEventListener('click', () => {
    // 发送清理请求的消息
    chrome.runtime.sendMessage({ 
      action: 'cleanup'
    });
    popup.remove();
  });

  // 复制按钮事件
  popup.querySelector('.translator-copy-btn').addEventListener('click', () => {
    const translatedText = popup.querySelector('.translator-translated-text').textContent;
    navigator.clipboard.writeText(translatedText)
      .then(() => {
        const copyBtn = popup.querySelector('.translator-copy-btn');
        copyBtn.textContent = '已复制';
        setTimeout(() => copyBtn.textContent = '复制译文', 1500);
      })
      .catch(error => {
        console.error('复制失败:', error);
        alert('复制失败，请重试');
      });
  });
}

// 修改初始化逻辑，避免重复初始化
if (typeof window.translatorInitialized === 'undefined') {
  window.translatorInitialized = true;

  // 修改为仅在未定义时创建 marked
  if (typeof window.marked === 'undefined') {
    window.marked = {
      parse: (text) => {
        // 保持原有解析逻辑
        return text
          .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
          .replace(/`([^`]+)`/g, '<code>$1</code>')
          .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
          .replace(/\*([^*]+)\*/g, '<em>$1</em>')
          .replace(/^\> (.+)$/gm, '<blockquote>$1</blockquote>')
          .replace(/^### (.+)$/gm, '<h3>$1</h3>')
          .replace(/^## (.+)$/gm, '<h2>$1</h2>')
          .replace(/^# (.+)$/gm, '<h1>$1</h1>')
          .replace(/^- (.+)$/gm, '<li>$1</li>')
          .replace(/\n\n/g, '</p><p>')
          .replace(/^(.+)$/gm, '<p>$1</p>');
      }
    };
  }
}

// 更新翻译请求处理函数
function handleTranslation(selection) {
  try {
    const popup = showPopup(selection);
    
    // 发送翻译请求
    chrome.runtime.sendMessage(
      { 
        action: 'translate', 
        text: selection
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error('发送翻译请求失败:', chrome.runtime.lastError);
          const loadingEl = popup.querySelector('.translator-loading');
          if (loadingEl) {
            loadingEl.textContent = '翻译请求失败，请重试';
          }
        }
      }
    );
  } catch (error) {
    console.error('处理翻译请求时出错:', error);
  }
} 