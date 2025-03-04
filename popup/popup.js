// 在文件开头添加 marked 实现
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

document.addEventListener('DOMContentLoaded', () => {
  const sourceText = document.getElementById('sourceText');
  const translateBtn = document.getElementById('translateBtn');
  const resultArea = document.getElementById('resultArea');
  const translatedText = document.getElementById('translatedText');
  const reasoningText = document.getElementById('reasoningText');
  const copyBtn = document.getElementById('copyBtn');
  const settingsBtn = document.getElementById('settingsBtn');

  // 添加滚动检测
  let userHasScrolled = false;
  resultArea.addEventListener('scroll', () => {
    // 检查是否是用户主动滚动
    // 如果滚动条不在底部，说明是用户主动滚动
    const isAtBottom = resultArea.scrollHeight - resultArea.scrollTop <= resultArea.clientHeight + 1;
    if (!isAtBottom) {
      userHasScrolled = true;
    } else {
      userHasScrolled = false;
    }
  });

  // 添加一个标志来追踪 popup 是否已关闭
  let isPopupActive = true;
  
  // 监听 popup 关闭事件
  window.addEventListener('unload', () => {
    isPopupActive = false;
    // 发送清理请求
    chrome.runtime.sendMessage({ action: 'cleanup' }, () => {
      if (chrome.runtime.lastError) {
        console.log('清理请求未完成');
      }
    });
  });

  // 翻译按钮点击事件
  translateBtn.addEventListener('click', async () => {
    const text = sourceText.value.trim();
    if (!text) {
      alert('请输入要翻译的文本');
      return;
    }

    translateBtn.disabled = true;
    translateBtn.textContent = '翻译中...';
    resultArea.style.display = 'block';
    translatedText.innerHTML = '';
    reasoningText.innerHTML = '';
    userHasScrolled = false; // 重置滚动标志

    try {
      // 先发送清理请求，忽略可能的连接错误
      try {
        await new Promise(resolve => {
          chrome.runtime.sendMessage({ action: 'cleanup' }, () => {
            if (chrome.runtime.lastError) {
              console.log('清理请求未完成，继续处理');
            }
            resolve();
          });
        });
      } catch (error) {
        console.log('清理请求发送失败，继续处理');
      }

      // 开始新的翻译，忽略可能的连接错误
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
      // 只处理真正的错误
      if (!error.message.includes('Receiving end does not exist')) {
        translateBtn.disabled = false;
        translateBtn.textContent = '翻译';
        alert('发生错误：' + error.message);
      }
    }
  });

  // 修改翻译更新监听器
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // 如果 popup 已关闭，不处理消息
    if (!isPopupActive) {
      sendResponse({ success: false });
      return false;
    }

    if (request.action === 'updateTranslation') {
      if (request.error) {
        translatedText.innerHTML = `<p class="error">翻译失败：${request.error}</p>`;
        translateBtn.disabled = false;
        translateBtn.textContent = '翻译';
      } else {
        try {
          translatedText.innerHTML = marked.parse(request.content);
          
          // 获取思维链区域元素
          const reasoningSection = document.querySelector('.result-section-reasoning');
          if (reasoningSection) {
            reasoningSection.style.display = request.hasReasoning ? 'block' : 'none';
            if (request.hasReasoning && request.reasoningContent) {
              reasoningText.innerHTML = marked.parse(request.reasoningContent);
            }
          }
          
          if (request.done) {
            translateBtn.disabled = false;
            translateBtn.textContent = '翻译';
          }

          // 只在用户未主动滚动时自动滚动到底部
          if (!userHasScrolled) {
            resultArea.scrollTop = resultArea.scrollHeight;
          }
        } catch (error) {
          console.log('popup 可能已关闭');
        }
      }
    }
    sendResponse({ success: true });
    return false;
  });

  // 复制按钮点击事件
  copyBtn.addEventListener('click', () => {
    const translatedText = document.getElementById('translatedText').textContent;
    navigator.clipboard.writeText(translatedText)
      .then(() => {
        copyBtn.textContent = '已复制';
        setTimeout(() => copyBtn.textContent = '复制译文', 1500);
      })
      .catch(error => {
        console.error('复制失败:', error);
        alert('复制失败，请重试');
      });
  });

  // 设置按钮点击事件
  settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // 支持快捷键
  sourceText.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      translateBtn.click();
    }
  });
}); 