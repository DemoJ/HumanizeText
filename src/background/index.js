import { notifyUser } from './notify.js';
import {
  getTranslationHistory,
  deleteHistoryItem,
  clearHistory,
  importHistory
} from './history.js';
import {
  translateText,
  cleanupRequest,
  rebindRequest,
  getRequestBuffer,
  pushBufferToTarget,
  hasActiveRequest
} from './translate.js';

/** 侧边栏是否存活（port 连接） */
let sidePanelOpen = false;

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'sidepanel') return;
  sidePanelOpen = true;
  // 先 handoff（取弹窗快照并关闭），再广播侧边栏已开，避免 content 先关窗导致空快照
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, async (tabs) => {
    const tab = tabs?.[0];
    try {
      if (tab?.id) {
        await handoffFromTab(tab.id);
      }
    } catch (err) {
      console.error('handoff 失败:', err);
    }
    broadcastSidePanelState(true);
  });
  port.onDisconnect.addListener(() => {
    sidePanelOpen = false;
    broadcastSidePanelState(false);
  });
});

async function broadcastSidePanelState(open) {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (!tab.id || !tab.url?.startsWith('http')) continue;
      chrome.tabs.sendMessage(tab.id, {
        action: 'sidePanelState',
        open
      }, () => void chrome.runtime.lastError);
    }
  } catch (_) { /* ignore */ }
}

export function isSidePanelOpen() {
  return sidePanelOpen;
}

async function saveCurrentShortcut() {
  try {
    const commands = await chrome.commands.getAll();
    const translateCommand = commands.find(command => command.name === 'translate-selection');
    const shortcut = translateCommand?.shortcut || '';
    await chrome.storage.local.set({ saved_shortcut: shortcut });
  } catch (error) {
    console.error('保存快捷键信息失败:', error);
  }
}

function createContextMenu() {
  try {
    chrome.contextMenus.removeAll(() => {
      chrome.storage.local.get('saved_shortcut', (data) => {
        const shortcut = data.saved_shortcut ? ` (${data.saved_shortcut})` : '';
        chrome.contextMenus.create({
          id: 'translateSelection',
          title: `翻译成人话${shortcut}`,
          contexts: ['selection']
        }, () => {
          if (chrome.runtime.lastError) {
            console.error('创建菜单出错:', chrome.runtime.lastError);
          }
        });
      });
    });
  } catch (error) {
    console.error('创建右键菜单时出错:', error);
    chrome.contextMenus.create({
      id: 'translateSelection',
      title: '翻译成人话',
      contexts: ['selection']
    });
  }
}

/**
 * 图标点击由 Chrome 直接打开侧边栏（保留用户手势）。
 * handoff 在 sidepanel port 连接时做，避免 open() 落在 await 之后。
 */
async function enableSidePanelOnActionClick() {
  try {
    if (chrome.sidePanel?.setPanelBehavior) {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    }
  } catch (error) {
    console.error('设置侧边栏行为失败:', error);
  }
}

enableSidePanelOnActionClick();

// 无 sidePanel 的浏览器：点击图标打开设置
if (chrome.action?.onClicked) {
  chrome.action.onClicked.addListener(async () => {
    if (chrome.sidePanel?.open) {
      // openPanelOnActionClick=true 时通常不会进这里
      return;
    }
    try {
      await chrome.runtime.openOptionsPage();
    } catch (error) {
      console.error('打开设置失败:', error);
    }
  });
}

chrome.runtime.onInstalled.addListener(() => {
  saveCurrentShortcut();
  createContextMenu();
  enableSidePanelOnActionClick();
});

chrome.runtime.onStartup.addListener(() => {
  createContextMenu();
  enableSidePanelOnActionClick();
});

if (chrome.commands?.onChanged) {
  chrome.commands.onChanged.addListener((command) => {
    if (command === 'translate-selection') {
      saveCurrentShortcut();
      createContextMenu();
    }
  });
}

if (chrome.management?.onEnabled) {
  chrome.management.onEnabled.addListener((extensionInfo) => {
    if (extensionInfo.id === chrome.runtime.id) {
      setTimeout(() => {
        saveCurrentShortcut();
        createContextMenu();
        enableSidePanelOnActionClick();
      }, 500);
    }
  });
}

async function ensureContentScript(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => !!window.__humanizeTextContentLoaded
    });
    if (results?.[0]?.result) return true;
  } catch (_) { /* continue */ }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content/content.js']
  });
  await new Promise(resolve => setTimeout(resolve, 100));
  return true;
}

async function storeHandoff(payload) {
  try {
    if (chrome.storage.session) {
      await chrome.storage.session.set({ sidepanelHandoff: payload });
    } else {
      await chrome.storage.local.set({ sidepanelHandoff: payload });
    }
  } catch (_) {
    await chrome.storage.local.set({ sidepanelHandoff: payload });
  }
  // 同时推消息，避免 storage 时序导致侧边栏漏收
  try {
    chrome.runtime.sendMessage({
      action: 'applyHandoff',
      target: 'sidepanel',
      snapshot: payload
    }, () => void chrome.runtime.lastError);
  } catch (_) { /* ignore */ }
}

/**
 * 从页内弹窗交接：关弹窗，把快照交给侧边栏；翻译中则 rebind 流
 */
async function handoffFromTab(tabId) {
  if (!tabId) return null;

  let snapshot = null;
  try {
    await ensureContentScript(tabId);
    snapshot = await chrome.tabs.sendMessage(tabId, { action: 'handoffToSidePanel' });
  } catch (_) {
    snapshot = null;
  }

  if (!snapshot || snapshot.empty) {
    // 无弹窗，但 tab 上可能还有残留请求
    if (hasActiveRequest(tabId)) {
      rebindRequest(tabId, 'sidepanel');
      await pushBufferToTarget('sidepanel');
      const buf = getRequestBuffer('sidepanel');
      if (buf) {
        const payload = {
          original: buf.original || '',
          translated: buf.content || '',
          reasoning: buf.reasoning || '',
          hasReasoning: !!(buf.reasoning && buf.reasoning.length),
          status: 'streaming',
          at: Date.now()
        };
        await storeHandoff(payload);
        return payload;
      }
    }
    return null;
  }

  // 用 buffer 补全 DOM 快照（流式中更准）
  const buf = getRequestBuffer(tabId);
  if (buf) {
    if (!snapshot.translated && buf.content) snapshot.translated = buf.content;
    if (!snapshot.reasoning && buf.reasoning) snapshot.reasoning = buf.reasoning;
    if (!snapshot.original && buf.original) snapshot.original = buf.original;
    snapshot.hasReasoning = !!(snapshot.reasoning && snapshot.reasoning.length);
  }

  let status = snapshot.status || 'done';
  if (status === 'streaming' || hasActiveRequest(tabId)) {
    rebindRequest(tabId, 'sidepanel');
    const sideBuf = getRequestBuffer('sidepanel') || buf;
    if (sideBuf) {
      snapshot.translated = sideBuf.content || snapshot.translated || '';
      snapshot.reasoning = sideBuf.reasoning || snapshot.reasoning || '';
      snapshot.hasReasoning = !!(snapshot.reasoning && snapshot.reasoning.length);
      snapshot.original = sideBuf.original || snapshot.original || '';
    }
    status = 'streaming';
    await pushBufferToTarget('sidepanel');
  } else if (hasActiveRequest(tabId)) {
    await cleanupRequest(tabId);
  }

  // 已完成但 buffer 已清：完全依赖 DOM 快照
  if (status === 'done' && !snapshot.translated && buf?.content) {
    snapshot.translated = buf.content;
  }

  const payload = {
    original: snapshot.original || '',
    translated: snapshot.translated || '',
    reasoning: snapshot.reasoning || '',
    hasReasoning: !!snapshot.hasReasoning || !!(snapshot.reasoning && snapshot.reasoning.length),
    status,
    error: snapshot.error || '',
    at: Date.now()
  };
  await storeHandoff(payload);
  return payload;
}

/**
 * 必须在用户手势同步栈内调用 sidePanel.open（不能先 await 别的事）。
 * handoff 放到 open 之后异步执行。
 */
function openSidePanelFromUserGesture(tab) {
  if (!chrome.sidePanel?.open) return false;
  const windowId = tab?.windowId;
  const tabId = tab?.id;
  if (windowId == null && tabId == null) return false;

  // 同步发起 open，保留 user gesture
  const openPromise = tabId != null && windowId != null
    ? chrome.sidePanel.open({ windowId, tabId })
    : windowId != null
      ? chrome.sidePanel.open({ windowId })
      : chrome.sidePanel.open({ tabId });

  Promise.resolve(openPromise).catch((error) => {
    console.error('打开侧边栏失败:', error);
  });

  // 交接异步：不阻塞 open
  if (tabId) {
    handoffFromTab(tabId).catch((err) => console.error('handoff 失败:', err));
  }
  return true;
}

/** 划词翻译：侧边栏开着则交给侧边栏，否则页内弹窗 */
async function routeSelectionTranslation(tabId, text, windowId) {
  const trimmed = (text || '').trim();
  if (!trimmed) return;

  if (sidePanelOpen) {
    // 侧边栏优先：关页内弹窗，翻译结果只进侧边栏
    try {
      await chrome.tabs.sendMessage(tabId, { action: 'dismissPopupOnly' });
    } catch (_) { /* ignore */ }

    if (hasActiveRequest(tabId)) {
      await cleanupRequest(tabId);
    }
    // sidepanel 上旧请求也换掉
    if (hasActiveRequest('sidepanel')) {
      await cleanupRequest('sidepanel');
    }

    await storeHandoff({
      original: trimmed,
      translated: '',
      reasoning: '',
      hasReasoning: false,
      status: 'streaming',
      at: Date.now()
    });

    // 侧边栏已开：不再调用 sidePanel.open（无用户手势 / 不需要）
    try {
      await translateText(trimmed, 'sidepanel');
    } catch (error) {
      chrome.runtime.sendMessage({
        action: 'updateTranslation',
        target: 'sidepanel',
        error: error.message || '翻译失败',
        done: true,
        streaming: false
      }, () => void chrome.runtime.lastError);
    }
    return;
  }

  // 页内弹窗
  try {
    await chrome.tabs.sendMessage(tabId, {
      action: 'showTranslationPopup',
      text: trimmed
    });
  } catch (_) {
    await ensureContentScript(tabId);
    await chrome.tabs.sendMessage(tabId, {
      action: 'showTranslationPopup',
      text: trimmed
    });
  }
}

async function showTranslationOnTab(tabId, text) {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  await routeSelectionTranslation(tabId, text, tab?.windowId);
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'translateSelection' || !tab?.id) return;

  try {
    if (!tab.url || !tab.url.startsWith('http')) {
      await notifyUser('不支持在此协议页面使用翻译功能', tab.id);
      return;
    }
    await routeSelectionTranslation(tab.id, info.selectionText, tab.windowId);
  } catch (error) {
    console.error('处理右键菜单点击失败:', error);
    await notifyUser('翻译启动失败，请刷新页面后重试', tab.id);
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'shortcutChanged') {
    chrome.storage.local.set({ saved_shortcut: request.newShortcut }, () => {
      createContextMenu();
      sendResponse({ success: true });
    });
    return true;
  }

  if (request.action === 'getHistory') {
    getTranslationHistory()
      .then(history => sendResponse({ success: true, history }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'isSidePanelOpen') {
    sendResponse({ open: sidePanelOpen });
    return false;
  }

  if (request.action === 'translateSelection') {
    (async () => {
      try {
        const tabId = sender.tab?.id;
        if (!tabId) {
          sendResponse({ success: false });
          return;
        }
        await routeSelectionTranslation(tabId, request.text, sender.tab?.windowId);
        sendResponse({ success: true });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (request.action === 'translate') {
    const requestKey = request.source === 'sidepanel' ? 'sidepanel' : sender.tab?.id;

    (async () => {
      try {
        await translateText(request.text, requestKey);
        sendResponse({ success: true });
      } catch (error) {
        const message = error.message || '翻译失败，请重试';
        if (request.source === 'sidepanel') {
          chrome.runtime.sendMessage({
            action: 'updateTranslation',
            target: 'sidepanel',
            error: message,
            done: true,
            streaming: false
          }, () => void chrome.runtime.lastError);
        } else if (typeof requestKey === 'number') {
          chrome.tabs.sendMessage(requestKey, {
            action: 'updateTranslation',
            error: message,
            done: true,
            streaming: false
          }, () => void chrome.runtime.lastError);
        }
        sendResponse({ success: false, error: message });
      }
    })();
    return true;
  }

  if (request.action === 'stopTranslation') {
    const requestKey = request.source === 'sidepanel' ? 'sidepanel' : (sender.tab?.id ?? null);
    cleanupRequest(requestKey).then(() => sendResponse({ success: true }));
    return true;
  }

  if (request.action === 'cleanup') {
    // handoff 关闭弹窗时 content 可能仍发 cleanup——若已 rebind 则不要 abort sidepanel
    if (request.skipIfRebound && request.source !== 'sidepanel' && sender.tab?.id != null) {
      if (!hasActiveRequest(sender.tab.id)) {
        sendResponse({ success: true });
        return true;
      }
    }
    const requestKey = request.source === 'sidepanel' ? 'sidepanel' : (sender.tab?.id ?? null);
    cleanupRequest(requestKey).then(() => sendResponse({ success: true }));
    return true;
  }

  if (request.action === 'deleteHistoryItem') {
    deleteHistoryItem(request.original)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'clearHistory') {
    clearHistory()
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'importHistory') {
    importHistory(request.history)
      .then(count => sendResponse({ success: true, count }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  cleanupRequest(tabId);
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'translate-selection') {
    executeTranslation();
  }
  if (command === 'open-sidepanel') {
    // 用 callback 而非先 await，尽量贴近用户手势；handoff 由 port 连接兜底
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs?.[0];
      if (tab) {
        openSidePanelFromUserGesture(tab);
      }
    });
  }
});

async function executeTranslation() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    if (!tab.url || !tab.url.startsWith('http')) {
      await notifyUser('不支持在此协议页面使用翻译功能', tab.id);
      return;
    }

    let selectedText = '';
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => window.getSelection().toString().trim()
      });
      selectedText = result?.result || '';
    } catch (error) {
      console.error('获取选中文本失败:', error);
      await notifyUser('无法获取选中文本，请刷新页面后重试', tab.id);
      return;
    }

    if (!selectedText) {
      await notifyUser('请先选中要翻译的文本', tab.id);
      return;
    }

    try {
      await routeSelectionTranslation(tab.id, selectedText, tab.windowId);
    } catch (error) {
      console.error('快捷键翻译启动失败:', error);
      await notifyUser('翻译启动失败，请刷新页面后重试', tab.id);
    }
  } catch (error) {
    console.error('快捷键翻译执行错误:', error);
  }
}
