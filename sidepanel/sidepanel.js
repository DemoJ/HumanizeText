/**
 * Side Panel — 常驻翻译工作台
 * 视觉：字号 / 颜色 / 间距分层，无卡片分割线
 */

const MAX_INPUT_CHARS = 8000;
const WARN_INPUT_CHARS = 7200;
const SOURCE = 'sidepanel';

function escapeHtml(text) {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const md = {
  parse(text) {
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
      .replace(/(?:<li data-ul="1">.+<\/li>\n?)+/g, (m) =>
        `<ul>${m.replace(/ data-ul="1"/g, '')}</ul>`)
      .replace(/(?:<li data-ol="1">.+<\/li>\n?)+/g, (m) =>
        `<ol>${m.replace(/ data-ol="1"/g, '')}</ol>`)
      .replace(/<\/ul>\s*<ul>/g, '')
      .replace(/<\/ol>\s*<ol>/g, '')
      .replace(/\n\n/g, '</p><p>')
      .replace(/^(.+)$/gm, (line) => {
        if (/<\/?(h1|h2|h3|ul|ol|li|blockquote|code|pre|p)/.test(line)) return line;
        if (/<\/p><p>/.test(line)) return line;
        return `<p>${line}</p>`;
      });
  }
};

function debounce(fn, wait) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

function $(id) {
  return document.getElementById(id);
}

function toast(message, isError) {
  const host = $('toastHost');
  if (!host) return;
  const el = document.createElement('div');
  el.className = 'toast' + (isError ? ' error' : '');
  el.textContent = message;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 200);
  }, 2000);
}

function safeSend(message, callback) {
  try {
    if (!chrome?.runtime?.id) {
      if (callback) callback(null);
      return false;
    }
    chrome.runtime.sendMessage(message, (res) => {
      void chrome.runtime.lastError;
      if (callback) callback(res);
    });
    return true;
  } catch (_) {
    if (callback) callback(null);
    return false;
  }
}

const state = {
  streaming: false,
  reasoningUserToggled: false,
  userScrolled: false,
  lastText: ''
};

function hasAnswerText() {
  const el = $('translatedText');
  if (!el) return false;
  if (el.querySelector('.error')) return false;
  return !!el.textContent?.trim();
}

function syncResultActions() {
  const actions = $('resultActions');
  const retryBtn = $('retryBtn');
  const copyBtn = $('copyBtn');
  const show = hasAnswerText() && !state.streaming;
  if (actions) actions.hidden = !show;
  if (retryBtn) retryBtn.disabled = !show;
  if (copyBtn) {
    copyBtn.disabled = !show;
    copyBtn.classList.remove('is-done');
    copyBtn.title = '复制';
    copyBtn.setAttribute('aria-label', '复制');
  }
}

function setPrimaryMode(mode) {
  const btn = $('primaryBtn');
  if (!btn) return;
  btn.dataset.mode = mode;
  if (mode === 'streaming') {
    btn.textContent = '停止';
    btn.classList.add('is-stop');
    btn.disabled = false;
    btn.title = '停止生成';
  } else {
    btn.textContent = '翻译';
    btn.classList.remove('is-stop');
    btn.disabled = false;
    btn.title = '翻译';
  }
}

function setStreaming(on) {
  state.streaming = on;
  setPrimaryMode(on ? 'streaming' : 'idle');
  syncResultActions();
}

function updateCharCount() {
  const ta = $('sourceText');
  const el = $('charCount');
  if (!ta || !el) return;
  const len = ta.value.length;
  el.textContent = String(len);
  el.classList.toggle('near-limit', len >= WARN_INPUT_CHARS && len <= MAX_INPUT_CHARS);
  el.classList.toggle('over-limit', len > MAX_INPUT_CHARS);
}

function autoResizeTextarea() {
  const ta = $('sourceText');
  if (!ta) return;
  ta.style.height = 'auto';
  ta.style.height = Math.min(180, Math.max(64, ta.scrollHeight)) + 'px';
}

function showThread() {
  const empty = $('emptyState');
  const thread = $('thread');
  if (empty) empty.hidden = true;
  if (thread) thread.hidden = false;
}

function setStatus(text, { loading = false, error = false } = {}) {
  const line = $('statusLine');
  if (!line) return;
  if (!text) {
    line.hidden = true;
    line.textContent = '';
    line.classList.remove('is-loading', 'is-error');
    return;
  }
  line.hidden = false;
  line.textContent = text;
  line.classList.toggle('is-loading', loading);
  line.classList.toggle('is-error', error);
}

function setSourceDisplay(text) {
  const display = $('sourceDisplay');
  const block = $('sourceBlock');
  const expand = $('sourceExpand');
  if (!display || !block) return;
  display.textContent = text || '';
  block.classList.remove('is-expanded');
  if (expand) {
    expand.textContent = '展开';
    requestAnimationFrame(() => {
      const truncated = display.scrollHeight > display.clientHeight + 1;
      expand.classList.toggle('is-hidden', !truncated);
    });
  }
}

function resetReasoning() {
  const block = $('reasoningBlock');
  const body = $('reasoningText');
  const title = $('reasoningTitle');
  const hint = $('reasoningHint');
  const toggle = $('reasoningToggle');
  state.reasoningUserToggled = false;
  if (block) {
    block.hidden = true;
    block.classList.add('is-collapsed');
    block.classList.remove('is-streaming');
  }
  if (body) body.innerHTML = '';
  if (title) title.textContent = '思考过程';
  if (hint) hint.textContent = '';
  if (toggle) toggle.setAttribute('aria-expanded', 'false');
}

function applyReasoningUpdate(request) {
  const block = $('reasoningBlock');
  const body = $('reasoningText');
  const title = $('reasoningTitle');
  const hint = $('reasoningHint');
  const toggle = $('reasoningToggle');
  if (!block || !body) return;

  const show = !!request.hasReasoning && !!(request.reasoningContent);
  block.hidden = !show;
  if (!show) return;

  body.innerHTML = md.parse(request.reasoningContent);
  const finished = !!(request.done || request.stopped);
  const streaming = !finished && (request.streaming || state.streaming);

  if (streaming) {
    block.classList.add('is-streaming');
    if (title) title.textContent = '正在思考';
    if (!state.reasoningUserToggled) {
      block.classList.remove('is-collapsed');
      if (toggle) toggle.setAttribute('aria-expanded', 'true');
      if (hint) hint.textContent = '';
    } else {
      const collapsed = block.classList.contains('is-collapsed');
      if (toggle) toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      if (hint) hint.textContent = collapsed ? '已隐藏' : '';
    }
  } else if (!state.reasoningUserToggled) {
    block.classList.remove('is-streaming');
    block.classList.add('is-collapsed');
    if (title) title.textContent = '思考过程';
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
    if (hint) hint.textContent = '';
  } else {
    block.classList.remove('is-streaming');
    if (title) title.textContent = '思考过程';
    if (hint) hint.textContent = '';
  }
}

function scrollWorkspaceIfNeeded() {
  const ws = $('workspace');
  if (!ws || state.userScrolled) return;
  ws.scrollTop = ws.scrollHeight;
}

async function startTranslation(rawText) {
  if (state.streaming) return;

  let text = (rawText ?? $('sourceText')?.value ?? '').trim();
  if (!text) {
    toast('请输入要翻译的文本', true);
    return;
  }

  if (text.length > MAX_INPUT_CHARS) {
    text = text.slice(0, MAX_INPUT_CHARS);
    if ($('sourceText')) {
      $('sourceText').value = text;
      updateCharCount();
      autoResizeTextarea();
    }
  }

  state.lastText = text;
  state.reasoningUserToggled = false;
  state.userScrolled = false;

  showThread();
  setSourceDisplay(text);
  resetReasoning();
  const out = $('translatedText');
  if (out) out.innerHTML = '';
  setStatus('正在翻译…', { loading: true });
  setStreaming(true);
  syncResultActions();

  safeSend({ action: 'cleanup', source: SOURCE }, () => {
    safeSend({ action: 'translate', text, source: SOURCE });
  });
}

/** 交接：展示快照，不重新请求（streaming 则接过已有流） */
function applyHandoff(snapshot) {
  if (!snapshot || snapshot.empty) return;

  const original = snapshot.original || '';
  const translated = snapshot.translated || '';
  const reasoning = snapshot.reasoning || '';
  const status = snapshot.status || 'done';

  const ta = $('sourceText');
  if (ta && original) {
    ta.value = original;
    updateCharCount();
    autoResizeTextarea();
  }
  state.lastText = original;
  state.reasoningUserToggled = false;
  state.userScrolled = false;

  showThread();
  setSourceDisplay(original);
  resetReasoning();

  const out = $('translatedText');
  if (out) {
    if (snapshot.error && !translated) {
      out.innerHTML = `<p class="error">翻译失败：${escapeHtml(snapshot.error)}</p>`;
    } else {
      out.innerHTML = translated ? md.parse(translated) : '';
    }
  }

  if (reasoning || snapshot.hasReasoning) {
    applyReasoningUpdate({
      hasReasoning: true,
      reasoningContent: reasoning,
      done: status !== 'streaming',
      streaming: status === 'streaming'
    });
  }

  if (status === 'streaming' || status === 'pending_translate') {
    setStreaming(true);
    setStatus('正在翻译…', { loading: true });
    if (status === 'pending_translate' && original) {
      // 由侧边栏发起（划词在侧边栏已开时）
      safeSend({ action: 'cleanup', source: SOURCE }, () => {
        safeSend({ action: 'translate', text: original, source: SOURCE });
      });
    }
  } else if (status === 'error') {
    setStreaming(false);
    setStatus(snapshot.error || '翻译失败', { error: true });
  } else if (status === 'stopped') {
    setStreaming(false);
    setStatus('已停止生成', {});
  } else {
    setStreaming(false);
    setStatus('', {});
  }
  syncResultActions();
}

function clearHandoffStorage() {
  try {
    chrome.storage.session?.remove('sidepanelHandoff');
    chrome.storage.local.remove('sidepanelHandoff');
  } catch (_) { /* ignore */ }
}

function consumeHandoffPayload(payload) {
  if (!payload || payload.empty) return;
  if (!(payload.original || payload.translated || payload.status === 'streaming' || payload.status === 'pending_translate')) {
    return;
  }
  applyHandoff(payload);
  clearHandoffStorage();
}

function stopTranslation() {
  setStreaming(false);
  setStatus(chrome?.runtime?.id ? '已停止生成' : '扩展已更新，请刷新侧边栏', {
    error: !chrome?.runtime?.id
  });
  syncResultActions();
  safeSend({ action: 'stopTranslation', source: SOURCE });
}

function init() {
  const ta = $('sourceText');
  const primaryBtn = $('primaryBtn');
  const retryBtn = $('retryBtn');
  const copyBtn = $('copyBtn');
  const settingsBtn = $('settingsBtn');
  const historyBtn = $('historyBtn');
  const workspace = $('workspace');

  if (ta) {
    ta.addEventListener('input', () => {
      updateCharCount();
      autoResizeTextarea();
    });
    ta.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      // Enter 发送；Shift+Enter 换行
      if (e.shiftKey) return;
      e.preventDefault();
      if (!state.streaming) startTranslation();
    });
    updateCharCount();
  }

  primaryBtn?.addEventListener('click', () => {
    if (state.streaming || primaryBtn.dataset.mode === 'streaming') {
      stopTranslation();
    } else {
      startTranslation();
    }
  });

  retryBtn?.addEventListener('click', () => {
    if (!state.streaming) startTranslation(state.lastText || ta?.value);
  });

  copyBtn?.addEventListener('click', async () => {
    const text = $('translatedText')?.textContent?.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      copyBtn.classList.add('is-done');
      copyBtn.title = '已复制';
      copyBtn.setAttribute('aria-label', '已复制');
      setTimeout(() => {
        copyBtn.classList.remove('is-done');
        copyBtn.title = '复制';
        copyBtn.setAttribute('aria-label', '复制');
      }, 1400);
    } catch (_) {
      toast('复制失败', true);
    }
  });

  settingsBtn?.addEventListener('click', () => {
    try { chrome.runtime.openOptionsPage(); } catch (_) { /* ignore */ }
  });

  historyBtn?.addEventListener('click', openHistory);
  $('historyBack')?.addEventListener('click', closeHistory);

  $('sourceExpand')?.addEventListener('click', () => {
    const block = $('sourceBlock');
    const btn = $('sourceExpand');
    if (!block || !btn) return;
    const expanded = block.classList.toggle('is-expanded');
    btn.textContent = expanded ? '收起' : '展开';
    if (!expanded) {
      requestAnimationFrame(() => {
        const display = $('sourceDisplay');
        const truncated = display && display.scrollHeight > display.clientHeight + 1;
        btn.classList.toggle('is-hidden', !truncated);
      });
    }
  });

  $('reasoningToggle')?.addEventListener('click', () => {
    state.reasoningUserToggled = true;
    const block = $('reasoningBlock');
    const toggle = $('reasoningToggle');
    const title = $('reasoningTitle');
    const hint = $('reasoningHint');
    if (!block) return;
    const collapsed = block.classList.toggle('is-collapsed');
    toggle?.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    if (block.classList.contains('is-streaming')) {
      if (title) title.textContent = '正在思考';
      if (hint) hint.textContent = collapsed ? '已隐藏' : '';
    } else {
      if (title) title.textContent = '思考过程';
      if (hint) hint.textContent = '';
    }
  });

  workspace?.addEventListener('scroll', () => {
    const atBottom = workspace.scrollHeight - workspace.scrollTop <= workspace.clientHeight + 8;
    state.userScrolled = !atBottom;
  });

  // 历史
  $('clearHistory')?.addEventListener('click', () => {
    if (!confirm('确定清空全部历史？此操作不可撤销。')) return;
    safeSend({ action: 'clearHistory' }, (res) => {
      if (res?.success) {
        renderHistory([]);
        toast('已清空');
      } else toast('清空失败', true);
    });
  });

  $('exportHistory')?.addEventListener('click', () => {
    safeSend({ action: 'getHistory' }, (res) => {
      if (!res?.success || !res.history?.length) {
        toast('暂无历史可导出', true);
        return;
      }
      const blob = new Blob([JSON.stringify(res.history, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `translation_history_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 200);
      toast('已导出');
    });
  });

  $('importHistory')?.addEventListener('click', () => {
    const input = $('importFile');
    if (input) {
      input.value = '';
      input.click();
    }
  });

  $('importFile')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const history = JSON.parse(reader.result);
        if (!Array.isArray(history)) throw new Error('格式不正确');
        safeSend({ action: 'importHistory', history }, (res) => {
          if (res?.success) {
            toast('导入成功');
            loadHistory();
          } else toast('导入失败', true);
        });
      } catch (_) {
        toast('文件解析失败', true);
      }
    };
    reader.readAsText(file);
  });

  $('historySearch')?.addEventListener('input', debounce(function () {
    const term = this.value.trim().toLowerCase();
    safeSend({ action: 'getHistory' }, (res) => {
      if (!res?.success) return;
      if (!term) {
        renderHistory(res.history);
        return;
      }
      const filtered = res.history.filter((item) =>
        (item.original || '').toLowerCase().includes(term) ||
        (item.translated || '').toLowerCase().includes(term)
      );
      renderHistory(filtered, term);
    });
  }, 250));

  // 流式更新 + 交接快照
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === 'applyHandoff') {
      if (request.target && request.target !== SOURCE) {
        sendResponse?.({ success: true });
        return false;
      }
      if (request.snapshot) consumeHandoffPayload(request.snapshot);
      sendResponse?.({ success: true });
      return false;
    }

    if (request.action !== 'updateTranslation') {
      sendResponse?.({ success: true });
      return false;
    }
    // 只处理发给 sidepanel 的
    if (request.target && request.target !== SOURCE) {
      sendResponse?.({ success: true });
      return false;
    }

    showThread();

    if (request.error) {
      const out = $('translatedText');
      if (out) out.innerHTML = `<p class="error">翻译失败：${escapeHtml(request.error)}</p>`;
      setStatus('', {});
      setStreaming(false);
      syncResultActions();
      sendResponse?.({ success: true });
      return false;
    }

    const out = $('translatedText');
    if (out) out.innerHTML = md.parse(request.content || '');

    applyReasoningUpdate(request);

    if (request.stopped || request.done) {
      setStreaming(false);
      if (request.stopped && !(request.content || '').trim()) {
        setStatus('已停止生成', {});
      } else if (request.done && request.truncated) {
        setStatus(`原文已截断至 ${request.maxChars || MAX_INPUT_CHARS} 字`, {});
        if (out && !out.querySelector('.truncate-note')) {
          const note = document.createElement('p');
          note.className = 'truncate-note';
          note.textContent = `原文已截断至 ${request.maxChars || MAX_INPUT_CHARS} 字`;
          out.appendChild(note);
        }
      } else {
        setStatus('', {});
      }
      syncResultActions();
    } else if (request.streaming) {
      setStreaming(true);
      setStatus('正在翻译…', { loading: true });
    }

    scrollWorkspaceIfNeeded();
    sendResponse?.({ success: true });
    return false;
  });

  // 交接快照（开侧边栏时从页内弹窗带来）
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'session' && area !== 'local') return;
    const payload = changes.sidepanelHandoff?.newValue;
    if (!payload) return;
    consumeHandoffPayload(payload);
  });

  const loadHandoff = (data) => {
    consumeHandoffPayload(data?.sidepanelHandoff);
  };

  try {
    if (chrome.storage.session) {
      chrome.storage.session.get('sidepanelHandoff', loadHandoff);
    } else {
      chrome.storage.local.get('sidepanelHandoff', loadHandoff);
    }
  } catch (_) { /* ignore */ }

  // 心跳：告知 background 侧边栏存活（划词路由用）
  try {
    if (chrome.runtime?.connect) {
      const port = chrome.runtime.connect({ name: 'sidepanel' });
      port.onDisconnect.addListener(() => { /* bg 会置 false */ });
    }
  } catch (_) { /* ignore */ }

  setStreaming(false);
}

function openHistory() {
  const drawer = $('historyDrawer');
  if (!drawer) return;
  drawer.hidden = false;
  loadHistory();
  $('historySearch') && ($('historySearch').value = '');
}

function closeHistory() {
  const drawer = $('historyDrawer');
  if (drawer) drawer.hidden = true;
}

function loadHistory() {
  const list = $('historyList');
  if (list) list.innerHTML = '<div class="history-empty">加载中…</div>';
  safeSend({ action: 'getHistory' }, (res) => {
    if (!res?.success) {
      if (list) list.innerHTML = '<div class="history-empty">加载失败</div>';
      return;
    }
    renderHistory(res.history || []);
  });
}

function renderHistory(history, searchTerm) {
  const list = $('historyList');
  if (!list) return;
  list.innerHTML = '';

  if (!history.length) {
    list.innerHTML = `<div class="history-empty">${
      searchTerm ? `没有匹配「${escapeHtml(searchTerm)}」的记录` : '暂无翻译历史'
    }</div>`;
    return;
  }

  const frag = document.createDocumentFragment();
  history.forEach((item) => {
    const date = new Date(item.timestamp || Date.now());
    const time = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    const title = (item.original || '').length > 80
      ? item.original.slice(0, 80) + '…'
      : (item.original || '');

    const el = document.createElement('div');
    el.className = 'history-item';
    el.innerHTML = `
      <div class="history-item-title">${escapeHtml(title)}</div>
      ${item.hasReasoning ? '<div class="history-tag">含思考过程</div>' : ''}
      <div class="history-item-meta">
        <span>${time}</span>
        <div class="history-item-actions">
          <button type="button" class="restore">恢复</button>
          <button type="button" class="del">删除</button>
        </div>
      </div>
    `;
    el.dataset.original = item.original || '';
    el.dataset.translated = item.translated || '';
    el.dataset.reasoning = item.reasoning || '';
    el.dataset.hasReasoning = item.hasReasoning ? 'true' : 'false';

    el.querySelector('.restore')?.addEventListener('click', (e) => {
      e.stopPropagation();
      restoreItem(el);
    });
    el.querySelector('.del')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!confirm('删除这条历史？')) return;
      safeSend({ action: 'deleteHistoryItem', original: item.original }, (res) => {
        if (res?.success) el.remove();
        else toast('删除失败', true);
      });
    });
    el.addEventListener('click', () => restoreItem(el));
    frag.appendChild(el);
  });

  const hint = document.createElement('div');
  hint.className = 'history-hint';
  hint.textContent = '最多保留 100 条最近记录';
  frag.appendChild(hint);
  list.appendChild(frag);
}

function restoreItem(el) {
  const original = el.dataset.original || '';
  const translated = el.dataset.translated || '';
  const reasoning = el.dataset.reasoning || '';
  const hasReasoning = el.dataset.hasReasoning === 'true';

  const ta = $('sourceText');
  if (ta) {
    ta.value = original;
    updateCharCount();
    autoResizeTextarea();
  }
  state.lastText = original;
  state.reasoningUserToggled = false;

  showThread();
  setSourceDisplay(original);
  const out = $('translatedText');
  if (out) out.innerHTML = md.parse(translated);

  const block = $('reasoningBlock');
  const body = $('reasoningText');
  if (block && body) {
    if (hasReasoning && reasoning) {
      block.hidden = false;
      block.classList.add('is-collapsed');
      block.classList.remove('is-streaming');
      body.innerHTML = md.parse(reasoning);
      const title = $('reasoningTitle');
      if (title) title.textContent = '思考过程';
      $('reasoningToggle')?.setAttribute('aria-expanded', 'false');
    } else {
      block.hidden = true;
    }
  }

  setStatus('', {});
  setStreaming(false);
  syncResultActions();
  closeHistory();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
