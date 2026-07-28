// 注入页内弹窗样式（含暗色）
if (!document.querySelector('#translator-popup-style')) {
  const style = document.createElement('style');
  style.id = 'translator-popup-style';
  style.textContent = `
    .translator-popup {
      --ht-bg: #ffffff;
      --ht-fg: #1a1a1a;
      --ht-muted: #6b7280;
      --ht-border: rgba(0, 0, 0, 0.08);
      --ht-surface: #f4f5f7;
      --ht-surface-2: #eef0f3;
      --ht-primary: #16a34a;
      --ht-primary-hover: #15803d;
      --ht-danger: #dc2626;
      --ht-danger-bg: #fef2f2;
      --ht-shadow: 0 12px 40px rgba(15, 23, 42, 0.14), 0 2px 8px rgba(15, 23, 42, 0.06);
      position: fixed;
      z-index: 2147483000;
      background: var(--ht-bg);
      color: var(--ht-fg);
      border-radius: 14px;
      box-shadow: var(--ht-shadow);
      display: flex;
      flex-direction: column;
      max-width: none;
      min-width: 320px;
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
      max-height: 80vh;
      cursor: default;
      width: 400px;
      overflow: hidden;
      border: 1px solid var(--ht-border);
      backdrop-filter: blur(8px);
    }

    .translator-popup::after,
    .translator-popup::before {
      content: '';
      position: absolute;
      top: 48px;
      bottom: 64px;
      width: 10px;
      z-index: 2;
    }
    .translator-popup::after { right: 0; cursor: e-resize; }
    .translator-popup::before { left: 0; cursor: w-resize; }

    .translator-popup .translator-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 14px 18px 6px;
      background: transparent;
      border: none;
      cursor: grab;
      user-select: none;
      gap: 8px;
      flex-shrink: 0;
    }
    .translator-popup .translator-header:active { cursor: grabbing; }
    .translator-popup .translator-title {
      font-weight: 600;
      font-size: 13px;
      letter-spacing: -0.01em;
      color: var(--ht-muted);
      flex: 1;
    }
    .translator-popup .translator-header-actions {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .translator-popup .translator-close-btn {
      cursor: pointer;
      width: 28px;
      height: 28px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: var(--ht-muted);
      background: transparent;
      border: none;
      font-size: 18px;
      font-weight: 300;
      border-radius: 8px;
      line-height: 1;
      opacity: 0.7;
      transition: opacity .15s, color .15s, background .15s;
    }
    .translator-popup .translator-close-btn:hover {
      opacity: 1;
      color: var(--ht-fg);
      background: var(--ht-surface);
    }

    /* 对话流：只靠字号 / 字重 / 颜色 / 间距分层，无分隔线 */
    .translator-popup .translator-content {
      flex: 1;
      overflow-y: auto;
      padding: 4px 18px 8px;
      scroll-behavior: smooth;
      max-height: calc(80vh - 120px);
      cursor: auto;
      display: flex;
      flex-direction: column;
      gap: 0;
    }

    /* 原文：次要信息，小号浅色 */
    .translator-popup .translator-source {
      margin: 0 0 4px;
      padding: 0;
    }
    .translator-popup .translator-text {
      color: var(--ht-muted);
      line-height: 1.5;
      overflow-wrap: break-word;
      font-size: 12.5px;
      font-weight: 400;
      opacity: 0.85;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .translator-popup .translator-source.is-expanded .translator-text {
      display: block;
      -webkit-line-clamp: unset;
      overflow: visible;
      opacity: 0.9;
    }
    .translator-popup .translator-source-more {
      margin-top: 2px;
      padding: 0;
      border: none;
      background: none;
      color: var(--ht-muted);
      font-size: 12px;
      cursor: pointer;
      font-weight: 500;
      opacity: 0.75;
    }
    .translator-popup .translator-source-more:hover {
      opacity: 1;
      color: var(--ht-fg);
    }
    .translator-popup .translator-source-more.is-hidden {
      display: none;
    }

    /* 思维过程：更浅、更小；折叠时一行文字 */
    .translator-popup .translator-section-reasoning {
      margin: 10px 0 2px;
      padding: 0;
      border: none;
      background: transparent;
    }
    .translator-popup .translator-reasoning-toggle {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      width: auto;
      max-width: 100%;
      padding: 2px 0;
      border: none;
      background: transparent;
      cursor: pointer;
      color: var(--ht-muted);
      font-size: 12px;
      font-weight: 400;
      text-align: left;
      font-family: inherit;
      opacity: 0.75;
      transition: opacity .15s, color .15s;
    }
    .translator-popup .translator-reasoning-toggle:hover {
      opacity: 1;
      color: var(--ht-fg);
      background: transparent;
    }
    .translator-popup .translator-section-reasoning.is-streaming .translator-reasoning-toggle {
      opacity: 0.9;
    }
    .translator-popup .translator-reasoning-chevron {
      font-size: 10px;
      line-height: 1;
      transition: transform .18s ease;
      display: inline-block;
      opacity: 0.8;
      transform: rotate(90deg);
    }
    .translator-popup .translator-section-reasoning.is-collapsed .translator-reasoning-chevron {
      transform: rotate(0deg);
    }
    .translator-popup .translator-reasoning-title {
      flex: 0 0 auto;
    }
    .translator-popup .translator-reasoning-hint {
      font-size: 12px;
      font-weight: 400;
      opacity: 0.65;
    }
    .translator-popup .translator-reasoning-text {
      color: var(--ht-muted);
      line-height: 1.55;
      overflow-wrap: break-word;
      font-size: 12.5px;
      font-weight: 400;
      opacity: 0.72;
      padding: 6px 0 4px;
      margin: 0;
      border: none;
      /* 随主滚动，无独立滚动条 */
    }
    .translator-popup .translator-section-reasoning.is-collapsed .translator-reasoning-text {
      display: none;
    }

    /* 译文：主内容，更大更重 */
    .translator-popup .translator-result {
      margin-top: 14px;
      padding: 0 0 8px;
    }
    .translator-popup .translator-translated-text {
      color: var(--ht-fg);
      line-height: 1.7;
      overflow-wrap: break-word;
      font-size: 15px;
      font-weight: 400;
      letter-spacing: -0.01em;
    }

    .translator-popup .translator-text p,
    .translator-popup .translator-reasoning-text p,
    .translator-popup .translator-translated-text p { margin: 0.4em 0; }
    .translator-popup .translator-text p:first-child,
    .translator-popup .translator-reasoning-text p:first-child,
    .translator-popup .translator-translated-text p:first-child { margin-top: 0; }
    .translator-popup .translator-text p:last-child,
    .translator-popup .translator-reasoning-text p:last-child,
    .translator-popup .translator-translated-text p:last-child { margin-bottom: 0; }

    .translator-popup .translator-text ul,
    .translator-popup .translator-reasoning-text ul,
    .translator-popup .translator-translated-text ul,
    .translator-popup .translator-text ol,
    .translator-popup .translator-reasoning-text ol,
    .translator-popup .translator-translated-text ol {
      margin: 0.55em 0 !important;
      padding-left: 1.5em !important;
      padding-inline-start: 1.5em !important;
      list-style-position: outside !important;
    }
    .translator-popup .translator-text ul,
    .translator-popup .translator-reasoning-text ul,
    .translator-popup .translator-translated-text ul {
      list-style-type: disc !important;
    }
    .translator-popup .translator-text ol,
    .translator-popup .translator-reasoning-text ol,
    .translator-popup .translator-translated-text ol {
      list-style-type: decimal !important;
    }
    .translator-popup .translator-text li,
    .translator-popup .translator-reasoning-text li,
    .translator-popup .translator-translated-text li {
      margin: 0.3em 0 !important;
      padding-left: 0.25em !important;
      line-height: 1.55;
      display: list-item !important;
    }
    .translator-popup .translator-text li > ul,
    .translator-popup .translator-reasoning-text li > ul,
    .translator-popup .translator-translated-text li > ul,
    .translator-popup .translator-text li > ol,
    .translator-popup .translator-reasoning-text li > ol,
    .translator-popup .translator-translated-text li > ol {
      margin: 0.25em 0 !important;
    }

    .translator-popup .translator-text code,
    .translator-popup .translator-reasoning-text code,
    .translator-popup .translator-translated-text code {
      background: var(--ht-surface);
      padding: 0.12em 0.35em;
      border-radius: 4px;
      font-size: 0.9em;
    }
    .translator-popup .translator-text pre,
    .translator-popup .translator-reasoning-text pre,
    .translator-popup .translator-translated-text pre {
      background: var(--ht-surface);
      padding: 0.75em 0.9em;
      border-radius: 8px;
      overflow-x: auto;
    }
    .translator-popup .translator-text blockquote,
    .translator-popup .translator-reasoning-text blockquote,
    .translator-popup .translator-translated-text blockquote {
      margin: 0.4em 0;
      padding-left: 0;
      border: none;
      color: var(--ht-muted);
      opacity: 0.9;
    }

    .translator-popup .translator-loading {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin-top: 2px;
      color: var(--ht-muted);
      font-size: 13px;
      font-weight: 400;
    }
    .translator-popup .translator-loading::before {
      content: '';
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--ht-primary);
      animation: ht-pulse 1s ease-in-out infinite;
      flex-shrink: 0;
    }
    .translator-popup .translator-loading.is-error {
      color: var(--ht-danger);
    }
    .translator-popup .translator-loading.is-error::before,
    .translator-popup .translator-loading.is-idle::before {
      display: none;
    }
    @keyframes ht-pulse {
      0%, 100% { opacity: 0.35; transform: scale(0.85); }
      50% { opacity: 1; transform: scale(1); }
    }

    .translator-popup .translator-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 10px 14px 14px;
      border: none;
      background: transparent;
      flex-shrink: 0;
    }
    .translator-popup .translator-footer-left,
    .translator-popup .translator-footer-right {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .translator-popup .translator-footer-right {
      margin-left: auto;
    }

    .translator-popup .translator-btn {
      appearance: none;
      border: none;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      line-height: 1;
      border-radius: 9px;
      padding: 9px 14px;
      transition: background .15s, color .15s, border-color .15s, opacity .15s, transform .1s;
      white-space: nowrap;
    }
    .translator-popup .translator-btn:active:not(:disabled) {
      transform: scale(0.97);
    }
    .translator-popup .translator-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .translator-popup .translator-btn-ghost {
      background: transparent;
      color: var(--ht-muted);
      padding: 9px 10px;
    }
    .translator-popup .translator-btn-ghost:hover:not(:disabled) {
      background: var(--ht-surface);
      color: var(--ht-fg);
    }
    .translator-popup .translator-btn-stop {
      background: var(--ht-danger-bg);
      color: var(--ht-danger);
      border: 1px solid rgba(220, 38, 38, 0.15);
    }
    .translator-popup .translator-btn-stop:hover:not(:disabled) {
      background: #fee2e2;
    }
    .translator-popup .translator-btn-primary {
      background: var(--ht-primary);
      color: #fff;
      box-shadow: 0 1px 2px rgba(22, 163, 74, 0.25);
      min-width: 88px;
    }
    .translator-popup .translator-btn-primary:hover:not(:disabled) {
      background: var(--ht-primary-hover);
    }
    .translator-popup.is-streaming .translator-retry-btn,
    .translator-popup.is-streaming .translator-copy-btn {
      display: none;
    }
    .translator-popup:not(.is-streaming) .translator-stop-btn {
      display: none;
    }

    .translator-popup.resizing-left { cursor: w-resize; user-select: none; }
    .translator-popup.resizing-right { cursor: e-resize; user-select: none; }

    .translator-popup .translator-content::-webkit-scrollbar { width: 6px; }
    .translator-popup .translator-content::-webkit-scrollbar-track { background: transparent; }
    .translator-popup .translator-content::-webkit-scrollbar-thumb {
      background: #c5c9d1;
      border-radius: 99px;
    }

    @media (prefers-color-scheme: dark) {
      .translator-popup {
        --ht-bg: #1c1c1e;
        --ht-fg: #f2f2f7;
        --ht-muted: #98989f;
        --ht-border: rgba(255, 255, 255, 0.08);
        --ht-surface: #2c2c2e;
        --ht-surface-2: #3a3a3c;
        --ht-primary: #30d158;
        --ht-primary-hover: #28c44c;
        --ht-danger: #ff6961;
        --ht-danger-bg: rgba(255, 105, 97, 0.12);
        --ht-shadow: 0 16px 48px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3);
      }
      .translator-popup .translator-btn-stop:hover:not(:disabled) {
        background: rgba(255, 105, 97, 0.2);
      }
      .translator-popup .translator-content::-webkit-scrollbar-thumb {
        background: #48484a;
      }
      .translator-popup .translator-text code,
      .translator-popup .translator-reasoning-text code,
      .translator-popup .translator-translated-text code,
      .translator-popup .translator-text pre,
      .translator-popup .translator-reasoning-text pre,
      .translator-popup .translator-translated-text pre {
        background: var(--ht-surface-2);
      }
    }
  `;
  document.head.appendChild(style);
}

if (window.__humanizeTextContentLoaded) {
  // already loaded
} else {
window.__humanizeTextContentLoaded = true;

/** 扩展重载/禁用后 runtime 会失效；检测并安全调用 */
function isExtensionAlive() {
  try {
    return !!(chrome?.runtime?.id);
  } catch (_) {
    return false;
  }
}

function safeSendMessage(message, callback) {
  if (!isExtensionAlive()) {
    if (typeof callback === 'function') callback(null);
    return false;
  }
  try {
    chrome.runtime.sendMessage(message, (response) => {
      // 必须读 lastError，否则 Chrome 会抛 Uncaught
      void chrome.runtime.lastError;
      if (typeof callback === 'function') callback(response);
    });
    return true;
  } catch (_) {
    // Extension context invalidated
    if (typeof callback === 'function') callback(null);
    return false;
  }
}

function safeStorageGet(keys, callback) {
  if (!isExtensionAlive()) {
    if (typeof callback === 'function') callback({});
    return;
  }
  try {
    chrome.storage.local.get(keys, (data) => {
      void chrome.runtime.lastError;
      if (typeof callback === 'function') callback(data || {});
    });
  } catch (_) {
    if (typeof callback === 'function') callback({});
  }
}

function safeStorageSet(obj) {
  if (!isExtensionAlive()) return Promise.resolve();
  try {
    return chrome.storage.local.set(obj).catch(() => {});
  } catch (_) {
    return Promise.resolve();
  }
}

function escapeHtml(text) {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const simpleMD = {
  parse: (text) => {
    if (!text) return '';
    const escaped = escapeHtml(text);
    return escaped
      .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/^[\-\*] (.+)$/gm, '<li data-ul="1">$1</li>')
      .replace(/^\d+\. (.+)$/gm, '<li data-ol="1">$1</li>')
      .replace(/(?:<li data-ul="1">.+<\/li>\n?)+/g, (match) =>
        `<ul>${match.replace(/ data-ul="1"/g, '')}</ul>`)
      .replace(/(?:<li data-ol="1">.+<\/li>\n?)+/g, (match) =>
        `<ol>${match.replace(/ data-ol="1"/g, '')}</ol>`)
      .replace(/<\/ul>\s*<ul>/g, '')
      .replace(/<\/ol>\s*<ol>/g, '')
      .replace(/\n\n/g, '</p><p>')
      .replace(/<\/p><p>$/, '</p>')
      .replace(/^(.+)$/gm, function (m) {
        if (/<\/(h1|h2|h3|ul|ol|li|blockquote|code|pre)>/.test(m)) return m;
        if (/<(h1|h2|h3|ul|ol|li|blockquote|code|pre)/.test(m)) return m;
        if (/<\/p><p>/.test(m)) return m;
        if (/^<p>/.test(m)) return m;
        return '<p>' + m + '</p>';
      });
  }
};

let lastPopupState = { left: null, top: null, width: null };
let lastSourceText = '';
let isStreaming = false;
let floatButtonEnabled = true;
let floatBtnEl = null;
let floatBtnHideTimer = null;
/** 侧边栏打开时划词不再出页内弹窗 */
let sidePanelOpen = false;
let activePopupCleanup = null;
const POPUP_STATE_KEY = 'ht_popup_state_' + location.origin;

function loadPopupState() {
  safeStorageGet(POPUP_STATE_KEY, (data) => {
    const saved = data?.[POPUP_STATE_KEY];
    if (saved && typeof saved === 'object') {
      lastPopupState = {
        left: saved.left ?? null,
        top: saved.top ?? null,
        width: saved.width ?? null
      };
    }
  });
}

function persistPopupState() {
  safeStorageSet({
    [POPUP_STATE_KEY]: {
      left: lastPopupState.left,
      top: lastPopupState.top,
      width: lastPopupState.width,
      updatedAt: Date.now()
    }
  });
}

loadPopupState();

safeStorageGet('floatButton', (data) => {
  if (data.floatButton !== undefined) floatButtonEnabled = data.floatButton !== false;
});
if (isExtensionAlive()) {
  try {
    chrome.storage.sync.get('floatButton', (data) => {
      void chrome.runtime.lastError;
      if (data?.floatButton !== undefined) floatButtonEnabled = data.floatButton !== false;
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' && area !== 'sync') return;
      if (changes.floatButton) {
        floatButtonEnabled = changes.floatButton.newValue !== false;
        if (!floatButtonEnabled) hideFloatButton();
      }
    });
  } catch (_) { /* ignore */ }
}

function setStreamingUI(popup, streaming) {
  isStreaming = streaming;
  popup.classList.toggle('is-streaming', streaming);
  const stopBtn = popup.querySelector('.translator-stop-btn');
  const retryBtn = popup.querySelector('.translator-retry-btn');
  const copyBtn = popup.querySelector('.translator-copy-btn');
  if (stopBtn) stopBtn.disabled = !streaming;
  if (retryBtn) retryBtn.disabled = streaming || !lastSourceText;
  if (copyBtn) copyBtn.disabled = streaming;
}

function setLoading(popup, text, isError) {
  const loadingEl = popup.querySelector('.translator-loading');
  if (!loadingEl) return;
  loadingEl.textContent = text || '';
  loadingEl.style.display = text ? 'inline-flex' : 'none';
  loadingEl.classList.toggle('is-error', !!isError);
  loadingEl.classList.toggle('is-idle', !!(text && !isError && !isStreaming));
}

function collectPopupSnapshot() {
  const popup = document.querySelector('.translator-popup');
  if (!popup) return { empty: true };

  const sourceEl = popup.querySelector('.translator-text');
  const translatedEl = popup.querySelector('.translator-translated-text');
  const reasoningEl = popup.querySelector('.translator-reasoning-text');
  const loadingEl = popup.querySelector('.translator-loading');

  const original = lastSourceText || (sourceEl?.textContent || '').trim();
  const translated = (translatedEl?.innerText || translatedEl?.textContent || '').trim();
  const reasoning = (reasoningEl?.innerText || reasoningEl?.textContent || '').trim();
  const loadingText = (loadingEl?.textContent || '').trim();
  const loadingVisible = loadingEl && loadingEl.style.display !== 'none' && loadingText;

  let status = 'done';
  let error = '';
  if (isStreaming) {
    status = 'streaming';
  } else if (loadingEl?.classList.contains('is-error') || /失败|错误/.test(loadingText)) {
    status = 'error';
    error = loadingText.replace(/^翻译失败：/, '') || loadingText;
  } else if (/已停止/.test(loadingText)) {
    status = 'stopped';
  } else if (loadingVisible && /正在翻译/.test(loadingText)) {
    status = 'streaming';
  }

  return {
    empty: false,
    original,
    translated,
    reasoning,
    hasReasoning: reasoning.length > 0,
    status,
    error
  };
}

/** 仅关 UI，不 abort 请求（handoff 用） */
function dismissPopupUIOnly() {
  const popup = document.querySelector('.translator-popup');
  if (!popup) {
    hideFloatButton();
    isStreaming = false;
    activePopupCleanup = null;
    return;
  }
  try {
    savePopupState(popup);
  } catch (_) { /* ignore */ }
  try {
    if (typeof activePopupCleanup === 'function') activePopupCleanup();
  } catch (_) { /* ignore */ }
  try {
    popup.remove();
  } catch (_) { /* ignore */ }
  hideFloatButton();
  isStreaming = false;
  activePopupCleanup = null;
}

if (isExtensionAlive()) {
try {
// 查询侧边栏是否已开
safeSendMessage({ action: 'isSidePanelOpen' }, (res) => {
  if (res && typeof res.open === 'boolean') sidePanelOpen = res.open;
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  try {
    if (request.action === 'sidePanelState') {
      sidePanelOpen = !!request.open;
      // 只更新路由标记；关弹窗由 handoffToSidePanel 负责，避免先关后取空快照
      if (sidePanelOpen) hideFloatButton();
      sendResponse({ success: true });
      return true;
    }

    if (request.action === 'handoffToSidePanel') {
      const snapshot = collectPopupSnapshot();
      // 交接关闭：不 abort（streaming 时由 bg rebind）
      dismissPopupUIOnly();
      sendResponse(snapshot);
      return true;
    }

    if (request.action === 'dismissPopupOnly') {
      dismissPopupUIOnly();
      sendResponse({ success: true });
      return true;
    }

    if (request.action === 'showTranslationPopup') {
      hideFloatButton();
      // 侧边栏已开：不再出页内弹窗
      if (sidePanelOpen) {
        sendResponse({ success: true, routed: 'sidepanel' });
        return true;
      }
      lastSourceText = request.text || '';
      const oldPopup = document.querySelector('.translator-popup');
      if (oldPopup) {
        safeSendMessage({ action: 'cleanup' }, () => {
          oldPopup.remove();
          const popup = showPopup(request.text);
          setStreamingUI(popup, true);
          safeSendMessage({ action: 'translate', text: request.text });
        });
      } else {
        const popup = showPopup(request.text);
        setStreamingUI(popup, true);
        safeSendMessage({ action: 'translate', text: request.text });
      }
      sendResponse({ success: true });
      return true;
    }

    if (request.action === 'updateTranslation') {
      const popup = document.querySelector('.translator-popup');
      if (!popup) {
        sendResponse({ success: true });
        return true;
      }

      const translatedTextEl = popup.querySelector('.translator-translated-text');
      const reasoningSectionEl = popup.querySelector('.translator-section-reasoning');
      const reasoningTextEl = popup.querySelector('.translator-reasoning-text');
      const contentEl = popup.querySelector('.translator-content');
      const reasoningHint = popup.querySelector('.translator-reasoning-hint');

      if (request.error) {
        setLoading(popup, '翻译失败：' + request.error, true);
        setStreamingUI(popup, false);
        sendResponse({ success: true });
        return true;
      }

      if (translatedTextEl) {
        translatedTextEl.innerHTML = simpleMD.parse(request.content || '');
      }

      if (reasoningSectionEl && reasoningTextEl) {
        const show = !!request.hasReasoning && !!(request.reasoningContent);
        reasoningSectionEl.style.display = show ? 'block' : 'none';
        if (show) {
          reasoningTextEl.innerHTML = simpleMD.parse(request.reasoningContent);
          const toggleBtn = popup.querySelector('.translator-reasoning-toggle');
          const finished = !!(request.done || request.stopped);
          const streaming = !finished && (request.streaming || isStreaming);

          const titleEl = popup.querySelector('.translator-reasoning-title');
          if (streaming) {
            // 生成中：默认展开；用户手动收起后保持收起
            reasoningSectionEl.classList.add('is-streaming');
            if (titleEl) titleEl.textContent = '正在思考';
            if (!reasoningSectionEl.dataset.userToggled) {
              reasoningSectionEl.classList.remove('is-collapsed');
              if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'true');
              if (reasoningHint) reasoningHint.textContent = '';
            } else {
              const collapsed = reasoningSectionEl.classList.contains('is-collapsed');
              if (toggleBtn) toggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
              if (reasoningHint) reasoningHint.textContent = collapsed ? '已隐藏' : '';
            }
          } else if (!reasoningSectionEl.dataset.userToggled) {
            // 完成后：自动折叠
            reasoningSectionEl.classList.remove('is-streaming');
            reasoningSectionEl.classList.add('is-collapsed');
            if (titleEl) titleEl.textContent = '思考过程';
            if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
            if (reasoningHint) reasoningHint.textContent = '';
          } else {
            reasoningSectionEl.classList.remove('is-streaming');
            if (titleEl) titleEl.textContent = '思考过程';
            if (reasoningHint) reasoningHint.textContent = '';
          }
        }
      }

      if (request.stopped) {
        setLoading(popup, '已停止生成', false);
        setStreamingUI(popup, false);
        const rs = popup.querySelector('.translator-section-reasoning');
        if (rs && !rs.dataset.userToggled && rs.style.display !== 'none') {
          rs.classList.remove('is-streaming');
          rs.classList.add('is-collapsed');
          const hint = popup.querySelector('.translator-reasoning-hint');
          const titleEl = popup.querySelector('.translator-reasoning-title');
          if (titleEl) titleEl.textContent = '思考过程';
          if (hint) hint.textContent = '';
        }
      } else if (request.done) {
        if (request.truncated) {
          setLoading(popup, `原文已截断至 ${request.maxChars || 8000} 字`, false);
          const loadingEl = popup.querySelector('.translator-loading');
          if (loadingEl) loadingEl.classList.add('is-idle');
        } else {
          setLoading(popup, '', false);
        }
        setStreamingUI(popup, false);
      } else if (request.streaming) {
        setLoading(popup, '正在翻译…', false);
        setStreamingUI(popup, true);
      }

      if (!popup.userHasScrolled || !popup.userHasScrolled()) {
        if (contentEl) contentEl.scrollTop = contentEl.scrollHeight;
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
} catch (_) { /* runtime 不可用 */ }
}

function closeTranslationPopup(popup, eventCleanupFunctions, { abort = true } = {}) {
  try {
    savePopupState(popup);
  } catch (_) { /* ignore */ }
  try {
    if (typeof eventCleanupFunctions === 'function') eventCleanupFunctions();
  } catch (_) { /* ignore */ }
  try {
    popup?.remove();
  } catch (_) { /* ignore */ }
  hideFloatButton();
  isStreaming = false;
  activePopupCleanup = null;
  if (abort) {
    safeSendMessage({ action: 'cleanup' });
  }
}

function showPopup(selection) {
  const oldPopup = document.querySelector('.translator-popup');
  if (oldPopup) oldPopup.remove();

  lastSourceText = selection || '';

  const popup = document.createElement('div');
  popup.className = 'translator-popup';
  popup.innerHTML = `
    <div class="translator-header">
      <div class="translator-title">人话翻译器</div>
      <div class="translator-header-actions">
        <button type="button" class="translator-close-btn" aria-label="关闭">×</button>
      </div>
    </div>
    <div class="translator-content">
      <div class="translator-source">
        <div class="translator-text">${escapeHtml(selection)}</div>
        <button type="button" class="translator-source-more is-hidden">展开</button>
      </div>
      <div class="translator-section-reasoning is-collapsed" style="display: none;">
        <button type="button" class="translator-reasoning-toggle" aria-expanded="false">
          <span class="translator-reasoning-chevron" aria-hidden="true">›</span>
          <span class="translator-reasoning-title">思考过程</span>
          <span class="translator-reasoning-hint"></span>
        </button>
        <div class="translator-reasoning-text"></div>
      </div>
      <div class="translator-result">
        <div class="translator-translated-text"></div>
        <div class="translator-loading">正在翻译…</div>
      </div>
    </div>
    <div class="translator-footer">
      <div class="translator-footer-left">
        <button type="button" class="translator-btn translator-btn-stop translator-stop-btn">停止</button>
        <button type="button" class="translator-btn translator-btn-ghost translator-retry-btn" disabled>重试</button>
      </div>
      <div class="translator-footer-right">
        <button type="button" class="translator-btn translator-btn-primary translator-copy-btn">复制</button>
      </div>
    </div>
  `;

  document.body.appendChild(popup);

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  let left = viewportWidth - 420;
  let top = 20;
  let width = 400;

  if (lastPopupState.left !== null && lastPopupState.top !== null) {
    left = Math.min(Math.max(0, lastPopupState.left), viewportWidth - 300);
    top = Math.min(Math.max(0, lastPopupState.top), viewportHeight - 100);
  }
  if (lastPopupState.width !== null) {
    width = Math.min(Math.max(300, lastPopupState.width), 1200);
  }

  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
  popup.style.width = `${width}px`;
  requestAnimationFrame(() => clampPopupToViewport(popup));

  const eventCleanupFunctions = initializePopupEvents(popup);
  activePopupCleanup = eventCleanupFunctions;

  const contentEl = popup.querySelector('.translator-content');
  let userHasScrolled = false;
  contentEl.addEventListener('scroll', () => {
    const isAtBottom = contentEl.scrollHeight - contentEl.scrollTop <= contentEl.clientHeight + 1;
    userHasScrolled = !isAtBottom;
  });
  popup.userHasScrolled = () => userHasScrolled;

  popup.querySelector('.translator-close-btn').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeTranslationPopup(popup, eventCleanupFunctions);
  });

  // 仅当原文被 line-clamp 实际截断时才显示「展开」
  const sourceBlock = popup.querySelector('.translator-source');
  const sourceTextEl = popup.querySelector('.translator-text');
  const sourceMoreBtn = popup.querySelector('.translator-source-more');
  if (sourceBlock && sourceTextEl && sourceMoreBtn) {
    const syncSourceMore = () => {
      if (sourceBlock.classList.contains('is-expanded')) return;
      // scrollHeight > clientHeight 说明内容被截断
      const truncated = sourceTextEl.scrollHeight > sourceTextEl.clientHeight + 1;
      sourceMoreBtn.classList.toggle('is-hidden', !truncated);
    };
    sourceMoreBtn.addEventListener('click', () => {
      const expanded = sourceBlock.classList.toggle('is-expanded');
      sourceMoreBtn.textContent = expanded ? '收起' : '展开';
      if (!expanded) {
        // 收起后重新检测是否仍需按钮
        requestAnimationFrame(syncSourceMore);
      }
    });
    requestAnimationFrame(syncSourceMore);
  }

  const reasoningSection = popup.querySelector('.translator-section-reasoning');
  const reasoningToggle = popup.querySelector('.translator-reasoning-toggle');
  const reasoningHint = popup.querySelector('.translator-reasoning-hint');
  if (reasoningSection && reasoningToggle) {
    reasoningToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      // 生成中也允许手动折叠/展开，标记后完成后不再强制折叠
      reasoningSection.dataset.userToggled = '1';
      const collapsed = reasoningSection.classList.toggle('is-collapsed');
      reasoningToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      const titleEl = popup.querySelector('.translator-reasoning-title');
      if (reasoningSection.classList.contains('is-streaming')) {
        if (titleEl) titleEl.textContent = '正在思考';
        if (reasoningHint) reasoningHint.textContent = collapsed ? '已隐藏' : '';
      } else {
        if (titleEl) titleEl.textContent = '思考过程';
        if (reasoningHint) reasoningHint.textContent = '';
      }
    });
  }

  popup.querySelector('.translator-stop-btn').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    // 先更新 UI，扩展失效时也不卡死
    setLoading(popup, isExtensionAlive() ? '已停止生成' : '扩展已更新，请刷新页面后重试', !isExtensionAlive());
    setStreamingUI(popup, false);
    safeSendMessage({ action: 'stopTranslation' });
  });

  popup.querySelector('.translator-retry-btn').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!lastSourceText || isStreaming) return;
    if (!isExtensionAlive()) {
      setLoading(popup, '扩展已更新，请刷新页面后重试', true);
      setStreamingUI(popup, false);
      return;
    }
    const translatedTextEl = popup.querySelector('.translator-translated-text');
    const reasoningSectionEl = popup.querySelector('.translator-section-reasoning');
    if (translatedTextEl) translatedTextEl.innerHTML = '';
    if (reasoningSectionEl) {
      reasoningSectionEl.style.display = 'none';
      reasoningSectionEl.classList.add('is-collapsed');
      delete reasoningSectionEl.dataset.userToggled;
    }
    setLoading(popup, '正在翻译…', false);
    setStreamingUI(popup, true);
    userHasScrolled = false;
    safeSendMessage({ action: 'cleanup' }, () => {
      safeSendMessage({ action: 'translate', text: lastSourceText });
    });
  });

  setStreamingUI(popup, true);
  setLoading(popup, '正在翻译...', false);
  return popup;
}

function savePopupState(popup) {
  if (!popup) return;
  const left = parseInt(popup.style.left, 10);
  const top = parseInt(popup.style.top, 10);
  const width = parseInt(popup.style.width, 10);
  if (!isNaN(left) && !isNaN(top) && !isNaN(width)) {
    lastPopupState = { left, top, width };
    persistPopupState();
  }
}

/** 视口变化（如打开侧边栏挤压页面）时，把弹窗夹回可见区域 */
function clampPopupToViewport(popup) {
  if (!popup || !popup.isConnected) return false;

  const margin = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let width = parseInt(popup.style.width, 10);
  let left = parseInt(popup.style.left, 10);
  let top = parseInt(popup.style.top, 10);

  if (isNaN(width) || width <= 0) width = popup.offsetWidth || 400;
  if (isNaN(left)) left = popup.offsetLeft || 0;
  if (isNaN(top)) top = popup.offsetTop || 0;

  const maxWidth = Math.max(280, vw - margin * 2);
  const nextWidth = Math.min(Math.max(300, width), Math.min(1200, maxWidth));
  // 宽度被压缩时，尽量靠右贴齐原右边缘，减少「被侧边栏挡住」的感觉
  if (nextWidth < width) {
    left = left + (width - nextWidth);
  }

  const maxLeft = Math.max(margin, vw - nextWidth - margin);
  const maxTop = Math.max(margin, vh - Math.min(popup.offsetHeight || 200, vh - margin) - margin);
  const nextLeft = Math.min(Math.max(margin, left), maxLeft);
  const nextTop = Math.min(Math.max(margin, top), maxTop);

  const changed =
    nextLeft !== left ||
    nextTop !== top ||
    nextWidth !== width ||
    popup.style.left !== `${nextLeft}px` ||
    popup.style.top !== `${nextTop}px` ||
    popup.style.width !== `${nextWidth}px`;

  popup.style.width = `${nextWidth}px`;
  popup.style.left = `${nextLeft}px`;
  popup.style.top = `${nextTop}px`;

  if (changed) {
    lastPopupState = { left: nextLeft, top: nextTop, width: nextWidth };
    persistPopupState();
  }
  return changed;
}

function clampAllTranslatorPopups() {
  document.querySelectorAll('.translator-popup').forEach((el) => {
    clampPopupToViewport(el);
  });
}

let viewportClampTimer = null;
function scheduleClampPopups() {
  if (viewportClampTimer) clearTimeout(viewportClampTimer);
  // 侧边栏动画过程中多次 resize，稍作合并
  viewportClampTimer = setTimeout(() => {
    viewportClampTimer = null;
    clampAllTranslatorPopups();
  }, 50);
}

if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', scheduleClampPopups);
  window.visualViewport.addEventListener('scroll', scheduleClampPopups);
}

function ensureFloatButton() {
  if (floatBtnEl) return floatBtnEl;
  floatBtnEl = document.createElement('button');
  floatBtnEl.type = 'button';
  floatBtnEl.id = 'humanize-text-float-btn';
  floatBtnEl.textContent = '译';
  floatBtnEl.setAttribute('aria-label', '翻译成人话');
  floatBtnEl.style.cssText = [
    'position:absolute',
    'z-index:2147483001',
    'display:none',
    'align-items:center',
    'justify-content:center',
    'width:32px',
    'height:32px',
    'padding:0',
    'border:none',
    'border-radius:999px',
    'background:#16a34a',
    'color:#fff',
    'font-size:13px',
    'font-weight:600',
    'font-family:system-ui,-apple-system,sans-serif',
    'cursor:pointer',
    'box-shadow:0 4px 14px rgba(22,163,74,.35)',
    'line-height:1',
    'user-select:none',
    'transition:transform .12s,opacity .12s'
  ].join(';');
  floatBtnEl.addEventListener('mouseenter', () => {
    floatBtnEl.style.transform = 'scale(1.06)';
  });
  floatBtnEl.addEventListener('mouseleave', () => {
    floatBtnEl.style.transform = 'scale(1)';
  });
  floatBtnEl.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  floatBtnEl.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const text = window.getSelection()?.toString().trim();
    hideFloatButton();
    if (!text) return;
    if (!isExtensionAlive()) {
      alert('人话翻译器已更新，请刷新页面后再使用');
      return;
    }

    // 侧边栏优先：交给 background 路由（不弹页内窗）
    if (sidePanelOpen) {
      dismissPopupUIOnly();
      safeSendMessage({ action: 'translateSelection', text });
      return;
    }

    lastSourceText = text;
    const oldPopup = document.querySelector('.translator-popup');
    const start = () => {
      const popup = showPopup(text);
      setStreamingUI(popup, true);
      safeSendMessage({ action: 'translate', text });
    };
    if (oldPopup) {
      safeSendMessage({ action: 'cleanup' }, () => {
        oldPopup.remove();
        start();
      });
    } else {
      start();
    }
  });
  document.documentElement.appendChild(floatBtnEl);
  return floatBtnEl;
}

function hideFloatButton() {
  if (floatBtnHideTimer) {
    clearTimeout(floatBtnHideTimer);
    floatBtnHideTimer = null;
  }
  if (floatBtnEl) floatBtnEl.style.display = 'none';
}

function showFloatButtonNearSelection() {
  if (!floatButtonEnabled) return;

  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) {
    hideFloatButton();
    return;
  }

  const text = selection.toString().trim();
  if (!text || text.length < 2) {
    hideFloatButton();
    return;
  }

  // 输入框内选中不显示
  const anchor = selection.anchorNode;
  const el = anchor?.nodeType === 1 ? anchor : anchor?.parentElement;
  if (el?.closest?.('input, textarea, [contenteditable="true"]')) {
    hideFloatButton();
    return;
  }

  let range;
  try {
    range = selection.getRangeAt(0);
  } catch (_) {
    hideFloatButton();
    return;
  }

  const rect = range.getBoundingClientRect();
  if (!rect || (rect.width === 0 && rect.height === 0)) {
    hideFloatButton();
    return;
  }

  const btn = ensureFloatButton();
  const top = window.scrollY + rect.top - 40;
  const left = window.scrollX + rect.right + 6;
  btn.style.top = `${Math.max(window.scrollY + 8, top)}px`;
  btn.style.left = `${Math.min(window.scrollX + window.innerWidth - 40, left)}px`;
  btn.style.display = 'inline-flex';

  if (floatBtnHideTimer) clearTimeout(floatBtnHideTimer);
  floatBtnHideTimer = setTimeout(() => {
    // 选区仍在则保持；否则隐藏
    const still = window.getSelection()?.toString().trim();
    if (!still) hideFloatButton();
  }, 8000);
}

document.addEventListener('mouseup', (e) => {
  if (e.target?.closest?.('#humanize-text-float-btn')) return;
  // 在已有弹窗内拖选也不拦截：允许再次划词出「译」按钮
  setTimeout(showFloatButtonNearSelection, 10);
});

document.addEventListener('keyup', (e) => {
  if (e.key === 'Shift' || e.key.startsWith('Arrow') || e.key === 'A' && (e.ctrlKey || e.metaKey)) {
    setTimeout(showFloatButtonNearSelection, 10);
  }
});

document.addEventListener('mousedown', (e) => {
  if (e.target?.closest?.('#humanize-text-float-btn')) return;
  // 点击别处时稍后检查选区是否还在
  setTimeout(() => {
    const still = window.getSelection()?.toString().trim();
    if (!still) hideFloatButton();
  }, 0);
});

document.addEventListener('scroll', () => {
  if (floatBtnEl?.style.display === 'inline-flex') {
    showFloatButtonNearSelection();
  }
}, true);

window.addEventListener('resize', () => {
  hideFloatButton();
  scheduleClampPopups();
});

function initializePopupEvents(popup) {
  let isDragging = false;
  let isResizing = false;
  let resizeDirection = null;
  let startX, startY, startWidth, initialX, initialY, startLeft;

  const header = popup.querySelector('.translator-header');
  header.addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) return;
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    initialX = popup.offsetLeft;
    initialY = popup.offsetTop;
    e.preventDefault();
  }, true);

  popup.addEventListener('mousedown', (e) => {
    if (e.target.closest('.translator-header')) return;
    const rect = popup.getBoundingClientRect();
    const leftEdgeDistance = e.clientX - rect.left;
    const rightEdgeDistance = rect.right - e.clientX;

    if (leftEdgeDistance <= 15) {
      isResizing = true;
      resizeDirection = 'left';
      startWidth = popup.offsetWidth;
      startX = e.clientX;
      startLeft = popup.offsetLeft;
      popup.classList.add('resizing-left');
      e.preventDefault();
    } else if (rightEdgeDistance <= 15) {
      isResizing = true;
      resizeDirection = 'right';
      startWidth = popup.offsetWidth;
      startX = e.clientX;
      popup.classList.add('resizing-right');
      e.preventDefault();
    }
  }, true);

  const mouseMoveHandler = (e) => {
    if (isResizing) {
      let newWidth;
      if (resizeDirection === 'right') {
        newWidth = startWidth + (e.clientX - startX);
      } else {
        newWidth = startWidth + (startX - e.clientX);
      }
      newWidth = Math.min(Math.max(300, newWidth), 1200);
      popup.style.width = `${newWidth}px`;
      if (resizeDirection === 'left') {
        popup.style.left = `${startLeft - (newWidth - startWidth)}px`;
      }
      e.preventDefault();
    } else if (isDragging) {
      popup.style.left = `${initialX + (e.clientX - startX)}px`;
      popup.style.top = `${initialY + (e.clientY - startY)}px`;
      e.preventDefault();
    }
  };

  const mouseUpHandler = () => {
    if (isResizing || isDragging) {
      savePopupState(popup);
    }
    isResizing = false;
    isDragging = false;
    resizeDirection = null;
    popup.classList.remove('resizing-left', 'resizing-right');
  };

  document.addEventListener('mousemove', mouseMoveHandler, true);
  document.addEventListener('mouseup', mouseUpHandler, true);

  popup.querySelector('.translator-copy-btn').addEventListener('click', () => {
    const translatedText = popup.querySelector('.translator-translated-text').textContent;
    navigator.clipboard.writeText(translatedText)
      .then(() => {
        const copyBtn = popup.querySelector('.translator-copy-btn');
        const prev = copyBtn.textContent;
        copyBtn.textContent = '已复制';
        setTimeout(() => { copyBtn.textContent = prev; }, 1500);
      })
      .catch(() => {
        setLoading(popup, '复制失败，请重试', true);
      });
  });

  return function cleanup() {
    document.removeEventListener('mousemove', mouseMoveHandler, true);
    document.removeEventListener('mouseup', mouseUpHandler, true);
  };
}

window.marked = simpleMD;
}
