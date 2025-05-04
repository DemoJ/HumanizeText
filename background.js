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

// 默认设置
const defaultSettings = {
  baseUrl: 'https://api.deepseek.com/v1/chat/completions',
  model: 'deepseek-reasoner',
  temperature: 0.7,
  promptTemplate: '用通俗易懂的中文解释以下内容：\n\n{text}'  // 添加默认提示词模板
};

// 获取设置，优先从云端获取，失败时从本地获取
async function getSettings() {
  try {
    // 尝试从云端获取设置
    const syncSettings = await chrome.storage.sync.get(['apiKey', 'baseUrl', 'model', 'temperature']);

    // 如果成功获取到云端设置，同时保存到本地作为备份
    if (Object.keys(syncSettings).length > 0) {
      try {
        await chrome.storage.local.set(syncSettings);
        console.log('设置已同步到本地存储');
      } catch (error) {
        console.error('保存设置到本地存储失败:', error);
      }
      return syncSettings;
    }

    // 如果云端没有设置，尝试从本地获取
    console.log('云端没有设置，尝试从本地获取');
    const localSettings = await chrome.storage.local.get(['apiKey', 'baseUrl', 'model', 'temperature']);

    if (Object.keys(localSettings).length > 0) {
      console.log('使用本地存储的设置');
      return localSettings;
    }

    // 如果本地也没有，返回默认设置
    console.log('使用默认设置');
    return { ...defaultSettings };
  } catch (error) {
    console.error('获取云端设置失败，尝试从本地获取:', error);

    try {
      // 尝试从本地获取设置
      const localSettings = await chrome.storage.local.get(['apiKey', 'baseUrl', 'model', 'temperature']);

      if (Object.keys(localSettings).length > 0) {
        console.log('使用本地存储的设置');
        return localSettings;
      }
    } catch (localError) {
      console.error('获取本地设置也失败:', localError);
    }

    // 如果都失败了，返回默认设置
    console.log('使用默认设置');
    return { ...defaultSettings };
  }
}

// 在顶部声明常量
const MAX_HISTORY_ITEMS = 100;

// 修改translateText函数中的解析逻辑
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

  // 获取设置，优先从云端获取，失败时从本地获取
  const config = await getSettings();

  if (!config.apiKey) {
    throw new Error('请先在设置中配置 API Key');
  }

  // 使用提示词模板
  const promptTemplate = config.promptTemplate || defaultSettings.promptTemplate;
  const prompt = promptTemplate.replace('{text}', text);

  try {
    const response = await fetch(config.baseUrl || defaultSettings.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model || defaultSettings.model,
        messages: [{
          role: 'user',
          content: prompt // 使用处理后的提示词
        }],
        temperature: config.temperature || defaultSettings.temperature,
        stream: true
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`API 请求失败: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let result = '';
    let reasoningContent = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      let currentChunk = '';
      let currentReasoningChunk = '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);

            // 增强调试，记录实际响应格式

            // 检查delta内容是否存在
            if (parsed.choices &&
              parsed.choices.length > 0 &&
              parsed.choices[0].delta &&
              parsed.choices[0].delta.content !== undefined) {

              const content = parsed.choices[0].delta.content;

              // 处理空内容和表情符号
              if (content !== null && content !== undefined) {
                currentChunk += content;
              }

              // 添加解析的思维链内容（如果有）
              const hasReasoning = parsed.choices[0].delta.reasoning_content !== undefined;
              if (hasReasoning) {
                const reasoning = parsed.choices[0].delta.reasoning_content;
                if (reasoning !== null && reasoning !== undefined) {
                  currentReasoningChunk += reasoning;
                }
              }
            }
          } catch (e) {
            console.error('解析错误:', e, '原始数据:', line);
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

    // 在成功翻译完成后，保存翻译历史
    if (result) {
      try {
        await saveTranslationHistory(text, result, reasoningContent);
      } catch (error) {
        console.error('保存翻译历史失败:', error);
      }
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

// 添加保存翻译历史的函数
async function saveTranslationHistory(original, translated, reasoning) {
  try {
    // 获取现有历史
    const data = await chrome.storage.local.get('translationHistory');
    const history = data.translationHistory || [];

    // 检查是否已存在相同的原文，避免重复
    const existingIndex = history.findIndex(item => item.original === original);

    // 创建新的历史项
    const newItem = {
      original,
      translated,
      reasoning,
      timestamp: Date.now(),
      hasReasoning: reasoning && reasoning.length > 0
    };

    if (existingIndex >= 0) {
      // 更新现有项
      history[existingIndex] = newItem;
    } else {
      // 添加新项到开头
      history.unshift(newItem);
    }

    // 限制历史记录数量
    const limitedHistory = history.slice(0, MAX_HISTORY_ITEMS);

    // 保存更新后的历史
    await chrome.storage.local.set({ translationHistory: limitedHistory });
    console.log('翻译历史已保存');
  } catch (error) {
    console.error('保存翻译历史出错:', error);
  }
}

// 添加获取翻译历史的函数
async function getTranslationHistory() {
  try {
    const data = await chrome.storage.local.get('translationHistory');
    return data.translationHistory || [];
  } catch (error) {
    console.error('获取翻译历史出错:', error);
    return [];
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
  if (request.action === 'getHistory') {
    getTranslationHistory()
      .then(history => sendResponse({ success: true, history }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

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

  if (request.action === 'deleteHistoryItem') {
    (async () => {
      try {
        const data = await chrome.storage.local.get('translationHistory');
        const history = data.translationHistory || [];

        const newHistory = history.filter(item => item.original !== request.original);

        await chrome.storage.local.set({ translationHistory: newHistory });
        sendResponse({ success: true });
      } catch (error) {
        console.error('删除历史记录项失败:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (request.action === 'clearHistory') {
    (async () => {
      try {
        await chrome.storage.local.set({ translationHistory: [] });
        sendResponse({ success: true });
      } catch (error) {
        console.error('清空历史记录失败:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (request.action === 'importHistory') {
    (async () => {
      try {
        const data = await chrome.storage.local.get('translationHistory');
        const currentHistory = data.translationHistory || [];

        // 合并历史并去重
        const mergedHistory = [...request.history];

        // 保存到本地
        await chrome.storage.local.set({
          translationHistory: mergedHistory.slice(0, MAX_HISTORY_ITEMS)
        });

        sendResponse({ success: true });
      } catch (error) {
        console.error('导入历史记录失败:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
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