/**
 * Markdown 简易解析器
 */
const marked = {
  parse: (text) => {
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

/**
 * 防抖函数
 * @param {Function} func - 要执行的函数
 * @param {number} wait - 等待时间(ms)
 * @return {Function} - 防抖后的函数
 */
function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

/**
 * 高级DOM查询函数
 * @param {string} selector - CSS选择器
 * @param {Element|Document} [parent=document] - 查询的父元素，默认从document开始
 * @param {boolean} [all=false] - 是否查询所有匹配元素
 * @returns {Element|NodeList|null} 返回匹配的元素或元素集合
 */
const $ = (selector, parent = document, all = false) => {
  // 参数校验
  if (typeof selector !== 'string') {
    console.error('选择器必须是字符串', selector)
    return null
  }

  try {
    // 处理父元素参数
    const validParent = parent instanceof Element || parent === document
      ? parent
      : document

    // 根据all参数决定查询方式
    return all
      ? validParent.querySelectorAll(selector)
      : validParent.querySelector(selector)

  } catch (e) {
    console.error('DOM查询出错:', {
      错误: e,
      选择器: selector,
      父元素: parent
    })
    return all ? [] : null // 返回空数组或null保持类型一致
  }
}

// 扩展方法：快捷操作
$.fn = {
  /**
   * 显示元素
   * @param {string} [display='block'] - 显示方式
   */
  show: (el, display = 'block') => {
    if (el) el.style.display = display
    return el
  },

  /**
   * 隐藏元素
   */
  hide: (el) => {
    if (el) el.style.display = 'none'
    return el
  }
}
/**
 * 初始化应用
 */
// 初始化应用函数重构
function initializeApp() {
  console.log('开始初始化应用...');

  // DOM 元素缓存
  const elements = {
    sourceText: document.getElementById('sourceText'),
    translateBtn: document.getElementById('translateBtn'),
    resultArea: document.getElementById('resultArea'),
    translatedText: document.getElementById('translatedText'),
    reasoningText: document.getElementById('reasoningText'),
    copyBtn: document.getElementById('copyBtn'),
    settingsBtn: document.getElementById('settingsBtn'),
    historyBtn: document.getElementById('historyBtn')
  };

  // 检查关键元素是否存在
  const missingElements = Object.entries(elements)
    .filter(([key, value]) => !value)
    .map(([key]) => key);

  if (missingElements.length > 0) {
    console.error('缺少以下DOM元素:', missingElements.join(', '));
  } else {
    console.log('所有DOM元素已找到');
  }

  // 添加历史记录面板
  if (!document.getElementById('historyPanel')) {
    const panelHTML = `
      <div id="historyPanel" class="history-panel">
        <div class="history-panel-header">
          <div class="history-panel-title">
            <div class="back-button" id="historyBackButton">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
            </div>
            <h2>翻译历史</h2>
          </div>
          <div class="history-search-container">
            <input type="text" id="historySearch" placeholder="搜索历史记录..." class="history-search">
          </div>
        </div>
        <div class="history-panel-content" id="historyList"></div>
        <div class="history-panel-footer">
          <button id="clearHistory" class="footer-btn">
            <div class="footer-btn-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </div>
            <span>清空</span>
          </button>
          <button id="exportHistory" class="footer-btn">
            <div class="footer-btn-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
            </div>
            <span>导出</span>
          </button>
          <button id="importHistory" class="footer-btn">
            <div class="footer-btn-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
            </div>
            <span>导入</span>
          </button>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', panelHTML);

    // 添加隐藏的文件输入
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = 'importFile';
    fileInput.accept = '.json';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    // 添加CSS样式
    const style = document.createElement('style');
    style.textContent = `
      .modal-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .history-search {
        padding: 6px 10px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 14px;
        min-width: 150px;
      }
      .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .history-meta {
        margin-top: 8px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .history-actions {
        display: flex;
        gap: 6px;
      }
      .history-action-btn {
        background: none;
        border: none;
        color: #4caf50;
        cursor: pointer;
        padding: 3px;
        font-size: 12px;
      }
      .history-action-btn:hover {
        text-decoration: underline;
      }
      .history-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        margin-top: 6px;
      }
      .history-tag {
        background: #e8f5e9;
        color: #388e3c;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 12px;
      }
      .import-error {
        color: red;
        padding: 10px;
        text-align: center;
      }
    `;
    document.head.appendChild(style);
  }

  // 更新historyElements对象，替换historyModal为historyPanel
  const historyElements = {
    historyList: document.getElementById('historyList'),
    historyPanel: document.getElementById('historyPanel'),
    historySearch: document.getElementById('historySearch'),
    clearHistory: document.getElementById('clearHistory'),
    exportHistory: document.getElementById('exportHistory'),
    importHistory: document.getElementById('importHistory'),
    importFile: document.getElementById('importFile'),
    historyBackButton: document.getElementById('historyBackButton')
  };

  // 输出当前获取到的元素情况，便于调试
  console.log('历史记录相关元素:', Object.entries(historyElements)
    .map(([key, value]) => `${key}: ${value ? '已找到' : '未找到'}`)
    .join(', '));

  // 滚动检测变量
  let userHasScrolled = false;
  // 追踪popup状态
  let isPopupActive = true;

  // 事件监听器设置
  // ====================

  // 滚动检测 - 添加空值检查
  if (elements.resultArea) {
    elements.resultArea.addEventListener('scroll', function () {
      const isAtBottom = this.scrollHeight - this.scrollTop <= this.clientHeight + 1;
      userHasScrolled = !isAtBottom;
    });
  }

  // 监听窗口关闭
  window.addEventListener('unload', function () {
    isPopupActive = false;
    chrome.runtime.sendMessage({ action: 'cleanup' });
  });

  // 翻译按钮点击事件 - 添加空值检查
  if (elements.translateBtn) {
    elements.translateBtn.addEventListener('click', async function () {
      if (!elements.sourceText) return;

      const text = elements.sourceText.value.trim();
      if (!text) {
        alert('请输入要翻译的文本');
        return;
      }

      elements.translateBtn.disabled = true;
      elements.translateBtn.textContent = '翻译中...';

      if (elements.resultArea) {
        elements.resultArea.style.display = 'block';
      }

      if (elements.translatedText) {
        elements.translatedText.innerHTML = '';
      }

      if (elements.reasoningText) {
        elements.reasoningText.innerHTML = '';
      }

      userHasScrolled = false; // 重置滚动标志

      try {
        // 先发送清理请求
        await new Promise(resolve => {
          chrome.runtime.sendMessage({ action: 'cleanup' }, () => {
            if (chrome.runtime.lastError) {
              console.log('清理请求未完成，继续处理');
            }
            resolve();
          });
        });

        // 开始新的翻译
        chrome.runtime.sendMessage({
          action: 'translate',
          text,
          source: 'popup'
        }, () => {
          if (chrome.runtime.lastError) {
            console.log('翻译请求发送完成');
          }
        });
      } catch (error) {
        if (!error.message?.includes('Receiving end does not exist')) {
          elements.translateBtn.disabled = false;
          elements.translateBtn.textContent = '翻译';
          alert('发生错误：' + error.message);
        }
      }
    });
  }

  // 实时翻译（文本长度超过30个字符并停止输入1秒后）
  const debouncedTranslate = debounce(function (text) {
    if (text.length > 30 && elements.translateBtn) {
      elements.translateBtn.click();
    }
  }, 1000);

  // 添加空值检查
  if (elements.sourceText) {
    elements.sourceText.addEventListener('input', function () {
      const text = this.value.trim();
      debouncedTranslate(text);
    });
  }

  // 复制按钮点击事件 - 添加空值检查
  if (elements.copyBtn && elements.translatedText) {
    elements.copyBtn.addEventListener('click', function () {
      const translatedText = elements.translatedText.textContent;
      navigator.clipboard.writeText(translatedText)
        .then(() => {
          elements.copyBtn.textContent = '已复制';
          setTimeout(() => elements.copyBtn.textContent = '复制', 1500);
        })
        .catch(error => {
          console.error('复制失败:', error);
          alert('复制失败，请重试');
        });
    });
  }

  // 设置按钮点击事件 - 添加空值检查
  if (elements.settingsBtn) {
    elements.settingsBtn.addEventListener('click', function () {
      chrome.runtime.openOptionsPage();
    });
  }

  // 支持快捷键 - 添加空值检查
  if (elements.sourceText && elements.translateBtn) {
    elements.sourceText.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        elements.translateBtn.click();
      }
    });
  }

  // 绑定历史记录按钮点击事件
  if (elements.historyBtn) {
    elements.historyBtn.addEventListener('click', loadAndDisplayHistory);
  }

  // 绑定历史记录面板关闭按钮
  if (historyElements.historyBackButton) {
    historyElements.historyBackButton.addEventListener('click', () => {
      if (historyElements.historyPanel) {
        historyElements.historyPanel.classList.remove('visible');
        // 在过渡完成后隐藏面板
        setTimeout(() => {
          historyElements.historyPanel.style.display = 'none';
        }, 250);
      }
    });
  }

  // 绑定清空历史记录按钮
  if (historyElements.clearHistory) {
    historyElements.clearHistory.addEventListener('click', () => {
      if (confirm('确定要清空所有历史记录吗？此操作不可撤销。')) {
        chrome.runtime.sendMessage({ action: 'clearHistory' }, function(response) {
          if (response && response.success) {
            if (historyElements.historyList) {
              historyElements.historyList.innerHTML = `
                <div class="empty-state-container">
                  <p class="empty-history">所有历史记录已清空</p>
                  <div class="history-limit-hint">注意：系统最多保留100条最近的历史记录</div>
                </div>
              `;
              
              // 清空文件输入框的值，确保能够再次选择相同文件
              if (historyElements.importFile) {
                historyElements.importFile.value = '';
              }
              
              // 显示操作成功提示
              const toast = document.createElement('div');
              toast.className = 'toast success-toast';
              toast.textContent = '历史记录已清空';
              document.body.appendChild(toast);
              
              setTimeout(() => {
                toast.classList.add('show');
                setTimeout(() => {
                  toast.classList.remove('show');
                  setTimeout(() => toast.remove(), 300);
                }, 2000);
              }, 100);
            }
          } else {
            alert('清空历史记录失败：' + (response?.error || '未知错误'));
          }
        });
      }
    });
  }

  // 绑定导出历史记录按钮
  if (historyElements.exportHistory) {
    historyElements.exportHistory.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'getHistory' }, function(response) {
        if (response && response.success && response.history.length > 0) {
          const historyData = JSON.stringify(response.history, null, 2);
          const blob = new Blob([historyData], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          
          const a = document.createElement('a');
          a.href = url;
          a.download = `translation_history_${new Date().toISOString().slice(0, 10)}.json`;
          a.click();
          
          setTimeout(() => {
            URL.revokeObjectURL(url);
          }, 100);
          
          // 显示操作成功提示
          const toast = document.createElement('div');
          toast.className = 'toast success-toast';
          toast.textContent = '历史记录已导出';
          document.body.appendChild(toast);
          
          setTimeout(() => {
            toast.classList.add('show');
            setTimeout(() => {
              toast.classList.remove('show');
              setTimeout(() => toast.remove(), 300);
            }, 2000);
          }, 100);
        } else {
          // 显示错误提示
          const toast = document.createElement('div');
          toast.className = 'toast error-toast';
          toast.textContent = '暂无历史记录可导出';
          document.body.appendChild(toast);
          
          setTimeout(() => {
            toast.classList.add('show');
            setTimeout(() => {
              toast.classList.remove('show');
              setTimeout(() => toast.remove(), 300);
            }, 2000);
          }, 100);
        }
      });
    });
  }

  // 绑定导入历史记录按钮和文件输入
  if (historyElements.importHistory && historyElements.importFile) {
    historyElements.importHistory.addEventListener('click', () => {
      // 确保每次点击导入按钮时，文件输入的值都被重置
      historyElements.importFile.value = '';
      historyElements.importFile.click();
    });

    historyElements.importFile.addEventListener('change', (event) => {
      const file = event.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
          try {
            const history = JSON.parse(e.target.result);
            if (Array.isArray(history)) {
              chrome.runtime.sendMessage({
                action: 'importHistory',
                history: history
              }, function(response) {
                if (response && response.success) {
                  // 显示操作成功提示
                  const toast = document.createElement('div');
                  toast.className = 'toast success-toast';
                  toast.textContent = '历史记录导入成功';
                  document.body.appendChild(toast);
                  
                  setTimeout(() => {
                    toast.classList.add('show');
                    setTimeout(() => {
                      toast.classList.remove('show');
                      setTimeout(() => toast.remove(), 300);
                    }, 2000);
                  }, 100);
                  
                  loadAndDisplayHistory(); // 重新加载历史记录
                } else {
                  // 显示错误提示
                  const toast = document.createElement('div');
                  toast.className = 'toast error-toast';
                  toast.textContent = '导入失败：' + (response?.error || '未知错误');
                  document.body.appendChild(toast);
                  
                  setTimeout(() => {
                    toast.classList.add('show');
                    setTimeout(() => {
                      toast.classList.remove('show');
                      setTimeout(() => toast.remove(), 300);
                    }, 2000);
                  }, 100);
                }
              });
            } else {
              // 显示错误提示
              const toast = document.createElement('div');
              toast.className = 'toast error-toast';
              toast.textContent = '导入的文件格式不正确';
              document.body.appendChild(toast);
              
              setTimeout(() => {
                toast.classList.add('show');
                setTimeout(() => {
                  toast.classList.remove('show');
                  setTimeout(() => toast.remove(), 300);
                }, 2000);
              }, 100);
            }
          } catch (error) {
            // 显示错误提示
            const toast = document.createElement('div');
            toast.className = 'toast error-toast';
            toast.textContent = '导入失败：文件解析错误';
            document.body.appendChild(toast);
            
            setTimeout(() => {
              toast.classList.add('show');
              setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
              }, 2000);
            }, 100);
            
            console.error(error);
          }
        };
        reader.readAsText(file);
      }
    });
  }

  // 绑定历史记录搜索框
  if (historyElements.historySearch) {
    historyElements.historySearch.addEventListener('input', debounce(function() {
      const searchTerm = this.value.toLowerCase();
      chrome.runtime.sendMessage({ action: 'getHistory' }, function(response) {
        if (response && response.success) {
          if (searchTerm.trim() === '') {
            displayHistory(response.history);
          } else {
            const filteredHistory = response.history.filter(item => 
              item.original.toLowerCase().includes(searchTerm) ||
              item.translated.toLowerCase().includes(searchTerm)
            );
            
            if (filteredHistory.length > 0) {
              displayHistory(filteredHistory);
            } else {
              historyElements.historyList.innerHTML = `
                <div class="empty-state-container">
                  <p class="empty-history">没有符合"${searchTerm}"的搜索结果</p>
                  <div class="history-limit-hint">注意：系统最多保留100条最近的历史记录</div>
                </div>
              `;
            }
          }
        }
      });
    }, 300));
  }

  // 监听翻译更新消息
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // 如果popup已关闭，不处理消息
    if (!isPopupActive) {
      sendResponse({ success: false });
      return false;
    }

    if (request.action === 'updateTranslation') {
      if (request.error && elements.translatedText) {
        elements.translatedText.innerHTML = `<p class="error">翻译失败：${request.error}</p>`;
        if (elements.translateBtn) {
          elements.translateBtn.disabled = false;
          elements.translateBtn.textContent = '翻译';
        }
      } else {
        try {
          if (elements.translatedText) {
            elements.translatedText.innerHTML = marked.parse(request.content);
          }

          // 获取思维链区域元素
          const reasoningSection = document.querySelector('.result-section-reasoning');
          if (reasoningSection) {
            reasoningSection.style.display = request.hasReasoning ? 'block' : 'none';
            if (request.hasReasoning && request.reasoningContent && elements.reasoningText) {
              elements.reasoningText.innerHTML = marked.parse(request.reasoningContent);
            }
          }

          if (request.done && elements.translateBtn) {
            elements.translateBtn.disabled = false;
            elements.translateBtn.textContent = '翻译';
          }

          // 只在用户未主动滚动时自动滚动到底部
          if (!userHasScrolled && elements.resultArea) {
            elements.resultArea.scrollTop = elements.resultArea.scrollHeight;
          }
        } catch (error) {
          console.log('popup 可能已关闭');
        }
      }
    }
    sendResponse({ success: true });
    return false;
  });

  /**
   * 加载并显示历史记录
   */
  function loadAndDisplayHistory() {
    // 检查必要元素是否存在
    if (!historyElements.historyList || !historyElements.historyPanel) {
      console.error('历史记录相关DOM元素不存在');
      return;
    }

    historyElements.historyList.innerHTML = '<div class="loading">加载历史记录</div>';
    historyElements.historyPanel.style.display = 'flex';
    
    // 添加延迟以确保过渡效果显示
    setTimeout(() => {
      historyElements.historyPanel.classList.add('visible');
    }, 10);

    if (historyElements.historySearch) {
      historyElements.historySearch.value = ''; // 清空搜索框
    }

    chrome.runtime.sendMessage({ action: 'getHistory' }, function (response) {
      if (chrome.runtime.lastError) {
        if (historyElements.historyList) {
          historyElements.historyList.innerHTML = '<p class="error">加载历史记录失败</p>';
        }
        return;
      }

      if (response && response.success && response.history.length > 0 && historyElements.historyList) {
        displayHistory(response.history);
      } else if (historyElements.historyList) {
        historyElements.historyList.innerHTML = `
          <div class="empty-state-container">
            <p class="empty-history">暂无翻译历史</p>
            <div class="history-limit-hint">注意：系统最多保留100条最近的历史记录</div>
          </div>
        `;
      }
    });
  }

  /**
   * 显示历史记录
   * @param {Array} history - 历史记录数组
   */
  function displayHistory(history) {
    if (!historyElements.historyList) return;

    historyElements.historyList.innerHTML = '';

    if (history.length === 0) {
      historyElements.historyList.innerHTML = `
        <div class="empty-state-container">
          <p class="empty-history">暂无翻译历史</p>
          <div class="history-limit-hint">注意：系统最多保留100条最近的历史记录</div>
        </div>
      `;
      return;
    }

    // 创建一个文档片段，优化性能
    const fragment = document.createDocumentFragment();

    history.forEach(item => {
      // 格式化日期
      const date = new Date(item.timestamp);
      const formattedDate = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;

      // 截取原文前30个字符作为标题
      const title = item.original.length > 30 ? item.original.substring(0, 30) + '...' : item.original;

      // 创建历史记录项
      const historyItem = document.createElement('div');
      historyItem.className = 'history-item';
      historyItem.innerHTML = `
        <div class="history-item-title">${title}</div>
        <div class="history-meta">
          <div class="history-item-time">${formattedDate}</div>
          <div class="history-actions">
            <button class="history-action-btn history-restore">恢复</button>
            <button class="history-action-btn history-delete">删除</button>
          </div>
        </div>
        ${item.hasReasoning ? '<div class="history-tags"><span class="history-tag">含思维链</span></div>' : ''}
      `;

      // 存储完整数据
      historyItem.dataset.original = item.original;
      historyItem.dataset.translated = item.translated;
      historyItem.dataset.reasoning = item.reasoning || '';
      historyItem.dataset.hasReasoning = item.hasReasoning;
      historyItem.dataset.timestamp = item.timestamp;

      // 恢复翻译按钮
      const restoreBtn = historyItem.querySelector('.history-restore');
      if (restoreBtn) {
        restoreBtn.addEventListener('click', function (e) {
          e.stopPropagation(); // 阻止冒泡
          restoreHistoryItem(historyItem);
        });
      }

      // 删除历史记录按钮
      const deleteBtn = historyItem.querySelector('.history-delete');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', function (e) {
          e.stopPropagation(); // 阻止冒泡
          if (confirm('确定要删除这条历史记录吗？')) {
            deleteHistoryItem(item.original, historyItem);
          }
        });
      }

      // 点击整个历史记录项也可恢复翻译
      historyItem.addEventListener('click', function () {
        restoreHistoryItem(this);
      });

      fragment.appendChild(historyItem);
    });

    // 添加历史记录限制提示
    const limitHint = document.createElement('div');
    limitHint.className = 'history-limit-hint';
    limitHint.textContent = '注意：系统最多保留100条最近的历史记录';
    fragment.appendChild(limitHint);

    historyElements.historyList.appendChild(fragment);
  }

  /**
   * 恢复历史记录项
   * @param {HTMLElement} item - 历史记录项元素
   */
  function restoreHistoryItem(item) {
    // 检查元素是否存在
    if (!elements.sourceText || !elements.translatedText) {
      console.error('元素不存在，可能DOM尚未加载完成');
      return;
    }

    // 添加恢复动画
    item.classList.add('restoring');

    // 填充原文和译文
    elements.sourceText.value = item.dataset.original;
    elements.translatedText.innerHTML = marked.parse(item.dataset.translated);

    // 显示结果区域
    if (elements.resultArea) {
      elements.resultArea.style.display = 'block';
    }

    // 显示思维链(如果有)
    const reasoningSection = document.querySelector('.result-section-reasoning');
    if (reasoningSection) {
      const hasReasoning = item.dataset.hasReasoning === 'true';
      reasoningSection.style.display = hasReasoning ? 'block' : 'none';
      if (hasReasoning && item.dataset.reasoning && elements.reasoningText) {
        elements.reasoningText.innerHTML = marked.parse(item.dataset.reasoning);
      }
    }

    // 关闭历史记录面板
    if (historyElements.historyPanel) {
      historyElements.historyPanel.classList.remove('visible');
      // 在过渡完成后隐藏面板
      setTimeout(() => {
        historyElements.historyPanel.style.display = 'none';
      }, 250);
    }
  }

  /**
   * 删除历史记录项
   * @param {string} original - 原文
   * @param {HTMLElement} item - 历史记录项元素
   */
  function deleteHistoryItem(original, item) {
    chrome.runtime.sendMessage({
      action: 'deleteHistoryItem',
      original: original
    }, function (response) {
      if (response && response.success) {
        // 添加删除动画类
        item.classList.add('deleting');
        
        // 等待动画完成后移除元素
        setTimeout(() => {
          item.style.height = '0';
          item.style.margin = '0';
          item.style.padding = '0';
          item.style.overflow = 'hidden';
          item.style.opacity = '0';
          item.style.transform = 'translateX(30px)';
          item.style.transition = 'all 0.3s ease-out';

          setTimeout(() => {
            item.remove();
            // 检查是否还有记录
            if (document.querySelectorAll('.history-item').length === 0 && historyElements.historyList) {
              historyElements.historyList.innerHTML = '<p class="empty-history">暂无翻译历史</p>';
            }
          }, 300);
        }, 50);
      } else {
        alert('删除失败：' + (response?.error || '未知错误'));
      }
    });
  }
}

// 确保DOM加载完成后再初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  // 添加延迟确保HTML中的模态框结构正确加载
  setTimeout(initializeApp, 50);
}
