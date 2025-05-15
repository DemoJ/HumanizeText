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
      max-width: none;
      min-width: 300px;
      font-family: system-ui, -apple-system, sans-serif;
      max-height: 80vh;
      cursor: default;
      width: 400px;
      overflow: hidden;
    }

    /* 右侧拖动区域 */
    .translator-popup::after {
      content: '';
      position: absolute;
      top: 0;
      right: 0;
      width: 15px;
      height: 100%;
      cursor: e-resize;
      z-index: 2;
    }
    
    /* 左侧拖动区域 */
    .translator-popup::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      width: 15px;
      height: 100%;
      cursor: w-resize;
      z-index: 2;
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

    /* 调整弹窗时的样式 */
    .translator-popup.resizing-left {
      cursor: w-resize;
      user-select: none;
    }

    .translator-popup.resizing-right {
      cursor: e-resize;
      user-select: none;
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

// 添加简易的Markdown解析器
const simpleMD = {
  parse: (text) => {
    if (!text) return '';
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
      .replace(/<li>(.+)<\/li>/g, '<ul><li>$1</li></ul>')
      .replace(/<\/ul>\s*<ul>/g, '')
      .replace(/\n\n/g, '</p><p>')
      .replace(/<\/p><p>$/, '</p>')
      .replace(/^(.+)$/gm, function(m) {
        if (/<\/(h1|h2|h3|ul|li|blockquote|code|pre)>/.test(m)) return m;
        if (/<(h1|h2|h3|ul|li|blockquote|code|pre)/.test(m)) return m;
        if (/<\/p><p>/.test(m)) return m;
        if (/^<p>/.test(m)) return m;
        return '<p>' + m + '</p>';
      });
  }
};

// 添加全局变量存储弹窗上次的位置和宽度
let lastPopupState = {
  left: null,
  top: null,
  width: null
};

// 修改消息监听器
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Content script收到消息:', request.action);
  try {
    if (request.action === 'showTranslationPopup') {
      const oldPopup = document.querySelector('.translator-popup');
      if (oldPopup) {
        console.log('发现旧的翻译弹窗，先移除');
        chrome.runtime.sendMessage({ action: 'cleanup' }, () => {
          if (chrome.runtime.lastError) {
            // 清理请求的错误可以静默处理
            console.log('清理请求未完成，继续处理');
          }
          oldPopup.remove();
          console.log('显示新弹窗');
          const popup = showPopup(request.text);
          chrome.runtime.sendMessage({ 
            action: 'translate', 
            text: request.text
          });
        });
      } else {
        console.log('显示弹窗');
        const popup = showPopup(request.text);
        chrome.runtime.sendMessage({ 
          action: 'translate', 
          text: request.text
        });
      }
      sendResponse({ success: true });
      return true; // 保持通道开放
    }
    
    if (request.action === 'updateTranslation') {
      const popup = document.querySelector('.translator-popup');
      if (!popup) {
        console.log('翻译弹窗不存在，可能已关闭');
        sendResponse({ success: true });
        return true;
      }
      
      const translatedTextEl = popup.querySelector('.translator-translated-text');
      const reasoningSectionEl = popup.querySelector('.translator-section-reasoning');
      const reasoningTextEl = popup.querySelector('.translator-reasoning-text');
      const loadingEl = popup.querySelector('.translator-loading');
      const contentEl = popup.querySelector('.translator-content');
      
      if (translatedTextEl && reasoningTextEl && loadingEl) {
        if (request.error) {
          console.log('翻译发生错误:', request.error);
          if (request.error.includes('API Key') || 
              request.error.includes('API 请求失败') ||
              request.error.includes('rate limit')) {
            loadingEl.textContent = '翻译失败：' + request.error;
          } else {
            loadingEl.textContent = '翻译失败，请重试';
          }
        } else {
          console.log('更新翻译结果');
          translatedTextEl.innerHTML = simpleMD.parse(request.content);
          
          if (reasoningSectionEl) {
            reasoningSectionEl.style.display = request.hasReasoning ? 'block' : 'none';
            if (request.hasReasoning && request.reasoningContent) {
              reasoningTextEl.innerHTML = simpleMD.parse(request.reasoningContent);
            }
          }
          
          if (request.done) {
            console.log('翻译完成');
            loadingEl.style.display = 'none';
          }

          // 判断是否用户已手动滚动
          if (!popup.userHasScrolled || !popup.userHasScrolled()) {
            // 如果用户没有手动滚动，则自动滚动到底部
            if (contentEl) {
              // 滚动到底部而不是顶部
              contentEl.scrollTop = contentEl.scrollHeight;
            }
          }
        }
      }
      
      sendResponse({ success: true });
      return true;
    }
  } catch (error) {
    console.error('处理消息错误:', error);
    sendResponse({ success: false, error: error.message });
    return true;
  }
  
  sendResponse({ success: false, error: '未知操作' });
  return true;
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

  document.body.appendChild(popup);

  // 修改弹窗位置 - 使用上次的位置和宽度，或者默认值
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  // 默认位置 - 右上角，留出一定边距
  let left = viewportWidth - 420; // 弹窗宽度约400px，留20px边距
  let top = 20; // 距离顶部20px
  let width = 400; // 默认宽度
  
  // 如果有上次的状态，则使用上次的位置和宽度
  if (lastPopupState.left !== null && lastPopupState.top !== null) {
    // 确保位置在可视区域内
    left = Math.min(Math.max(0, lastPopupState.left), viewportWidth - 300); // 保证至少300px宽度可见
    top = Math.min(Math.max(0, lastPopupState.top), viewportHeight - 100); // 保证至少100px高度可见
  }
  
  if (lastPopupState.width !== null) {
    // 确保宽度在允许范围内
    width = Math.min(Math.max(300, lastPopupState.width), 1200);
  }
  
  // 应用位置和宽度
  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
  popup.style.width = `${width}px`;

  console.log('弹窗初始化 - 位置:', left, top, '宽度:', width, '上次状态:', lastPopupState);

  // 添加事件监听器
  const eventCleanupFunctions = initializePopupEvents(popup);

  // 添加滚动检测
  const contentEl = popup.querySelector('.translator-content');
  let userHasScrolled = false;

  contentEl.addEventListener('scroll', () => {
    // 检查是否是用户主动滚动
    // 如果滚动条不在底部，说明是用户主动滚动
    const isAtBottom = contentEl.scrollHeight - contentEl.scrollTop <= contentEl.clientHeight + 1;
    if (!isAtBottom) {
      userHasScrolled = true;
    } else {
      userHasScrolled = false;
    }
  });

  // 将滚动状态添加到popup对象上
  popup.userHasScrolled = () => userHasScrolled;
  
  // 关闭按钮事件
  popup.querySelector('.translator-close-btn').addEventListener('click', () => {
    // 保存当前弹窗状态
    savePopupState(popup);
    
    // 发送清理请求的消息
    chrome.runtime.sendMessage({ 
      action: 'cleanup'
    });
    
    // 清理事件监听器
    if (eventCleanupFunctions) {
      eventCleanupFunctions();
    }
    
    popup.remove();
  });

  return popup;
}

// 保存弹窗状态的辅助函数
function savePopupState(popup) {
  if (popup) {
    // 移除 'px' 并转换为数字
    const left = parseInt(popup.style.left);
    const top = parseInt(popup.style.top);
    const width = parseInt(popup.style.width);
    
    if (!isNaN(left) && !isNaN(top) && !isNaN(width)) {
      lastPopupState = { left, top, width };
      console.log('保存弹窗状态:', lastPopupState);
    }
  }
}

// 抽取弹窗事件初始化逻辑
function initializePopupEvents(popup) {
  // 公共变量
  let isDragging = false;
  let isResizing = false;
  let resizeDirection = null; // 'left' 或 'right'
  let startX, startY, startWidth;
  let initialX, initialY, startLeft;

  // 使弹窗可拖动
  const header = popup.querySelector('.translator-header');

  header.addEventListener('mousedown', (e) => {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    initialX = popup.offsetLeft;
    initialY = popup.offsetTop;
    e.preventDefault();
    e.stopPropagation();
  }, true);

  // 添加左右两侧拖动调整宽度功能
  popup.addEventListener('mousedown', (e) => {
    // 确保不是从header开始的拖动
    if (e.target.closest('.translator-header')) {
      return;
    }
    
    // 获取点击位置与弹窗的相对位置
    const rect = popup.getBoundingClientRect();
    const leftEdgeDistance = e.clientX - rect.left;
    const rightEdgeDistance = rect.right - e.clientX;
    
    console.log('鼠标按下 - 左距离:', leftEdgeDistance, '右距离:', rightEdgeDistance);
    
    // 判断调整方向 - 增大热区到15px使操作更容易
    if (leftEdgeDistance <= 15) {
      isResizing = true;
      resizeDirection = 'left';
      startWidth = popup.offsetWidth;
      startX = e.clientX;
      startLeft = popup.offsetLeft;
      popup.classList.add('resizing-left');
      console.log('开始左侧调整宽度 - 初始宽度:', startWidth, '初始X:', startX, '初始左侧:', startLeft);
      e.preventDefault();
      e.stopPropagation();
    } else if (rightEdgeDistance <= 15) {
      isResizing = true;
      resizeDirection = 'right';
      startWidth = popup.offsetWidth;
      startX = e.clientX;
      popup.classList.add('resizing-right');
      console.log('开始右侧调整宽度 - 初始宽度:', startWidth, '初始X:', startX);
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);
  
  // 创建单独的mousemove和mouseup处理函数，以便可以正确移除它们
  const mouseMoveHandler = (e) => {
    if (isResizing) {
      // 根据不同方向计算新宽度
      let newWidth;
      
      if (resizeDirection === 'right') {
        // 向右拖动，增加宽度 - 直接计算差值
        const dx = e.clientX - startX;
        newWidth = startWidth + dx;
        console.log('右侧调整 - 原始宽度:', startWidth, '当前X:', e.clientX, 'dx:', dx, '新宽度:', newWidth);
      } else if (resizeDirection === 'left') {
        // 向左拖动，计算与起始点的差值
        const dx = startX - e.clientX;
        newWidth = startWidth + dx;
        console.log('左侧调整 - 原始宽度:', startWidth, '当前X:', e.clientX, 'dx:', dx, '新宽度:', newWidth);
      }
      
      // 限制最小和最大宽度 (增大到1200px)
      if (newWidth < 300) {
        console.log('应用最小宽度限制: 300px');
        newWidth = 300;
      } else if (newWidth > 1200) {
        console.log('应用最大宽度限制: 1200px');
        newWidth = 1200;
      }
      
      console.log('最终应用宽度:', newWidth);
      popup.style.width = `${newWidth}px`;
      
      // 对于左侧调整，需要同时改变位置
      if (resizeDirection === 'left') {
        // 修正左侧位置计算 - 宽度增加多少，左边界就要左移多少
        const newLeft = startLeft - (newWidth - startWidth);
        console.log('最终左侧位置:', newLeft, '位移量:', (newWidth - startWidth));
        popup.style.left = `${newLeft}px`;
      }
      
      // 即使超出边界也要阻止默认行为
      e.preventDefault();
      e.stopPropagation();
    } else if (isDragging) {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      popup.style.left = `${initialX + dx}px`;
      popup.style.top = `${initialY + dy}px`;
      
      e.preventDefault();
      e.stopPropagation();
    }
  };
  
  const mouseUpHandler = (e) => {
    if (isResizing) {
      isResizing = false;
      resizeDirection = null;
      popup.classList.remove('resizing-left');
      popup.classList.remove('resizing-right');
      // 在调整大小完成后保存弹窗状态
      savePopupState(popup);
      e.preventDefault();
      e.stopPropagation();
    }
    if (isDragging) {
      isDragging = false;
      // 在拖动完成后保存弹窗状态
      savePopupState(popup);
    }
  };
  
  document.addEventListener('mousemove', mouseMoveHandler, true);
  document.addEventListener('mouseup', mouseUpHandler, true);
  
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
  
  // 返回一个函数用于清理所有事件监听器
  return function cleanup() {
    document.removeEventListener('mousemove', mouseMoveHandler, true);
    document.removeEventListener('mouseup', mouseUpHandler, true);
  };
}

// 修改初始化逻辑，避免重复初始化
if (typeof window.translatorInitialized === 'undefined') {
  window.translatorInitialized = true;

  // 修改为仅在未定义时创建 marked
  if (typeof window.marked === 'undefined') {
    // 使用顶部已定义的simpleMD
    window.marked = simpleMD;
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