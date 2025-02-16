// 创建右键菜单
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "translateSelection",
    title: "翻译成人话",
    contexts: ["selection"]
  });
});

// 处理API请求
async function translateText(text, tabId) {
  const config = await chrome.storage.sync.get(['apiKey', 'baseUrl', 'model', 'temperature']);
  
  if (!config.apiKey) {
    throw new Error('请先在设置中配置 API Key');
  }

  const response = await fetch(config.baseUrl || 'https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model || 'deepseek-reasoner',
      messages: [{
        role: 'user',
        content: `用通俗易懂的中文解释以下内容：\n\n${text}`
      }],
      temperature: config.temperature || 0.7,
      stream: true
    })
  });

  if (!response.ok) {
    throw new Error(`API 请求失败: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      
      // 改进数据处理逻辑
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      let currentChunk = '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices[0].delta.content;
            if (content) {
              currentChunk += content;
            }
          } catch (e) {
            console.error('解析错误:', e);
          }
        }
      }

      // 累积一定量的文本后再发送
      if (currentChunk) {
        result += currentChunk;
        // 根据来源选择发送方式
        if (tabId) {
          try {
            await safeSendMessage(tabId, {
              action: 'updateTranslation',
              content: result,
              done: false
            });
          } catch (error) {
            console.warn('更新消息发送失败，继续处理:', error);
          }
        } else {
          // 对于 popup 的请求，使用 runtime.sendMessage
          chrome.runtime.sendMessage({
            action: 'updateTranslation',
            content: result,
            done: false
          });
        }
      }
    }

    // 发送完成信号
    if (tabId) {
      try {
        await safeSendMessage(tabId, {
          action: 'updateTranslation',
          content: result,
          done: true
        });
      } catch (error) {
        console.warn('完成消息发送失败:', error);
      }
    } else {
      chrome.runtime.sendMessage({
        action: 'updateTranslation',
        content: result,
        done: true
      });
    }

    return result;
  } catch (error) {
    throw new Error('翻译请求失败：' + error.message);
  }
}

// 修改消息发送函数，使用 Promise 包装
function safeSendMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    try {
      if (tabId) {
        chrome.tabs.sendMessage(tabId, message, (response) => {
          if (chrome.runtime.lastError) {
            console.error('消息发送失败:', chrome.runtime.lastError);
            reject(chrome.runtime.lastError);
          } else {
            resolve(response);
          }
        });
      } else {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            console.error('消息发送失败:', chrome.runtime.lastError);
            reject(chrome.runtime.lastError);
          } else {
            resolve(response);
          }
        });
      }
    } catch (error) {
      console.error('消息发送失败:', error);
      reject(error);
    }
  });
}

// 处理右键菜单点击
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "translateSelection" && tab?.id) {
    try {
      if (!tab.url.startsWith('http')) {
        alert('不支持在此协议页面使用翻译功能');
        return;
      }

      // 立即发送消息显示弹窗
      try {
        await chrome.tabs.sendMessage(tab.id, {
          action: 'showTranslationPopup',
          text: info.selectionText
        });
      } catch (error) {
        // 如果消息发送失败，可能是因为content script还未注入
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content/content.js']
        });
        
        // 重试发送消息
        await chrome.tabs.sendMessage(tab.id, {
          action: 'showTranslationPopup',
          text: info.selectionText
        });
      }

      // 开始翻译（不等待结果）
      translateText(info.selectionText, tab.id);

    } catch (error) {
      console.error('处理右键菜单点击失败:', error);
    }
  }
});

// 修改消息监听器
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'translate') {
    const tabId = request.source === 'popup' ? null : sender.tab.id;
    
    // 使用异步函数处理翻译
    (async () => {
      try {
        const result = await translateText(request.text, tabId);
        if (request.source === 'popup') {
          // 对于 popup 的请求，使用 runtime.sendMessage
          chrome.runtime.sendMessage({
            action: 'updateTranslation',
            content: result,
            done: true
          });
        }
        sendResponse({ success: true }); 
      } catch (error) {
        console.error('翻译失败:', error);
        // 发送错误消息
        if (request.source === 'popup') {
          chrome.runtime.sendMessage({
            action: 'updateTranslation',
            error: error.message,
            done: true
          });
        } else {
          await safeSendMessage(tabId, {
            action: 'updateTranslation',
            error: error.message,
            done: true
          });
        }
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // 保持消息通道开放
  }
  return false;
}); 