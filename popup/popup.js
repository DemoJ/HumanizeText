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
  const copyBtn = document.getElementById('copyBtn');
  const settingsBtn = document.getElementById('settingsBtn');

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

    try {
      // 发送翻译请求
      chrome.runtime.sendMessage(
        { 
          action: 'translate', 
          text,
          source: 'popup'
        }
      );
    } catch (error) {
      translateBtn.disabled = false;
      translateBtn.textContent = '翻译';
      alert('发生错误：' + error.message);
    }
  });

  // 监听翻译更新
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'updateTranslation') {
      if (request.error) {
        translatedText.innerHTML = `<p class="error">翻译失败：${request.error}</p>`;
        translateBtn.disabled = false;
        translateBtn.textContent = '翻译';
      } else {
        translatedText.innerHTML = marked.parse(request.content);
        
        if (request.done) {
          translateBtn.disabled = false;
          translateBtn.textContent = '翻译';
        }
      }
      // 自动滚动到底部
      resultArea.scrollTop = resultArea.scrollHeight;
    }
    sendResponse({ success: true });
    return false; // 同步响应
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