// 创建右键菜单
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "translateSelection",
    title: "翻译成人话",
    contexts: ["selection"]
  });
});

// 添加一个 Map 来跟踪每个标签页的请求状态
const activeRequests = new Map();

// 修改 translateText 函数
async function translateText(text, tabId) {
  // 如果存在旧的请求，则中止它
  if (activeRequests.has(tabId)) {
    const oldController = activeRequests.get(tabId);
    oldController.abort();
    activeRequests.delete(tabId);
  }

  // 创建新的 AbortController
  const controller = new AbortController();
  activeRequests.set(tabId, controller);

  const config = await chrome.storage.sync.get(['apiKey', 'baseUrl', 'model', 'temperature']);
  
  if (!config.apiKey) {
    throw new Error('请先在设置中配置 API Key');
  }

  try {
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
      }),
      signal: controller.signal // 添加 signal 以支持中止请求
    });

    if (!response.ok) {
      throw new Error(`API 请求失败: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let result = '';
    let reasoningContent = ''; // 添加思维链内容的变量

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      let currentChunk = '';
      let currentReasoningChunk = ''; // 添加当前思维链内容块
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices[0].delta.content;
            const hasReasoning = 'reasoning_content' in parsed.choices[0].delta;
            const reasoning = hasReasoning ? parsed.choices[0].delta.reasoning_content : null;
            if (content) {
              currentChunk += content;
            }
            if (reasoning) {
              currentReasoningChunk += reasoning;
            }
          } catch (e) {
            console.error('解析错误:', e);
          }
        }
      }

      if (currentChunk || currentReasoningChunk) {
        result += currentChunk;
        reasoningContent += currentReasoningChunk;
        if (tabId) {
          // 右键菜单翻译使用 safeSendMessage
          await safeSendMessage(tabId, {
            action: 'updateTranslation',
            content: result,
            hasReasoning: reasoningContent.length > 0,
            reasoningContent: reasoningContent,
            done: false
          });
        } else {
          // popup 翻译直接使用 runtime.sendMessage
          let popupClosed = false;
          chrome.runtime.sendMessage({
            action: 'updateTranslation',
            content: result,
            hasReasoning: reasoningContent.length > 0,
            reasoningContent: reasoningContent,
            done: false
          }, () => {
            if (chrome.runtime.lastError) {
              popupClosed = true;
            }
          });

          // 如果 popup 已关闭，中止翻译
          if (popupClosed) {
            controller.abort();
            return;
          }
        }
      }
    }

    // 发送完成信号
    if (tabId) {
      await safeSendMessage(tabId, {
        action: 'updateTranslation',
        content: result,
        hasReasoning: reasoningContent.length > 0,
        reasoningContent: reasoningContent,
        done: true
      });
    } else {
      // popup 翻译的完成信号
      chrome.runtime.sendMessage({
        action: 'updateTranslation',
        content: result,
        hasReasoning: reasoningContent.length > 0,
        reasoningContent: reasoningContent,
        done: true
      }, () => {
        if (chrome.runtime.lastError) {
          console.log('popup 已关闭');
        }
      });
    }

    // 清理已完成的请求
    activeRequests.delete(tabId);
    return result;

  } catch (error) {
    // 区分错误类型
    if (error.name === 'AbortError') {
      console.log('翻译请求已中止');
      return;
    }
    if (error.message.includes('Receiving end does not exist')) {
      console.log('连接已断开，可能是页面已关闭');
      return;
    }
    // 只有真正需要用户知道的错误才抛出
    if (error.message.includes('API Key') || 
        error.message.includes('API 请求失败') ||
        error.message.includes('rate limit')) {
      throw error;
    }
    // 其他错误只记录不抛出
    console.error('翻译过程中出现错误:', error);
  }
}

// 修改 safeSendMessage 函数
async function safeSendMessage(tabId, message) {
  try {
    // popup 请求不需要使用 tabs.sendMessage
    if (!tabId) {
      return;  // popup 的消息已经在调用处直接使用 runtime.sendMessage 发送
    }

    // 检查标签页是否存在
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab) {
      console.log('标签页不存在');
      return;
    }

    // 发送消息到指定标签页
    chrome.tabs.sendMessage(tabId, message, () => {
      if (chrome.runtime.lastError) {
        // 连接断开或页面关闭时静默处理
        if (chrome.runtime.lastError.message.includes('Receiving end does not exist')) {
          console.log('目标页面可能已关闭');
          return;
        }
        // 其他错误才记录
        console.error('消息发送失败:', chrome.runtime.lastError);
      }
    });
  } catch (error) {
    // 静默处理连接相关错误
    if (error.message.includes('Receiving end does not exist')) {
      console.log('目标页面可能已关闭');
      return;
    }
    console.error('消息发送失败:', error);
  }
}

// 修改右键菜单点击处理
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "translateSelection" && tab?.id) {
    try {
      if (!tab.url.startsWith('http')) {
        alert('不支持在此协议页面使用翻译功能');
        return;
      }

      // 发送显示弹窗的消息
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
    } catch (error) {
      console.error('处理右键菜单点击失败:', error);
    }
  }
});

// 修改消息监听器
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'translate') {
    const tabId = request.source === 'popup' ? null : sender.tab.id;
    
    (async () => {
      try {
        const result = await translateText(request.text, tabId);
        if (result) {
          if (request.source === 'popup') {
            chrome.runtime.sendMessage({
              action: 'updateTranslation',
              content: result,
              done: true
            }, () => {
              if (chrome.runtime.lastError) {
                console.log('popup 已关闭');
              }
            });
          }
          sendResponse({ success: true });
        }
      } catch (error) {
        // 只有重要错误才发送给用户
        if (error.message.includes('API Key') || 
            error.message.includes('API 请求失败') ||
            error.message.includes('rate limit')) {
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
        } else {
          // 其他错误静默处理
          console.error('非关键错误:', error);
          sendResponse({ success: false });
        }
      }
    })();
    return true;
  }
  if (request.action === 'cleanup') {
    const tabId = sender.tab?.id || null;  // popup 请求时 tabId 为 null
    cleanupRequest(tabId).then(() => {
      sendResponse({ success: true });
    });
    return true; // 保持消息通道开放以支持异步响应
  }
  return false;
});

// 修改清理函数
async function cleanupRequest(tabId) {
  if (activeRequests.has(tabId)) {
    const controller = activeRequests.get(tabId);
    controller.abort();
    activeRequests.delete(tabId);
    
    // 添加小延迟确保清理完成
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

// 监听标签页关闭事件
chrome.tabs.onRemoved.addListener((tabId) => {
  cleanupRequest(tabId);
}); 