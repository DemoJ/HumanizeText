document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('settingsForm');
  const apiKeyInput = document.getElementById('apiKey');
  const toggleApiKeyBtn = document.getElementById('toggleApiKey');
  const providerSelect = document.getElementById('provider');
  const baseUrlGroup = document.getElementById('baseUrlGroup');
  const baseUrlInput = document.getElementById('baseUrl');
  const modelInput = document.getElementById('model');
  const temperatureInput = document.getElementById('temperature');
  const temperatureValue = document.getElementById('temperatureValue');
  const reasoningEffortInput = document.getElementById('reasoningEffort');
  const floatButtonInput = document.getElementById('floatButton');
  const testBtn = document.getElementById('testBtn');
  const promptTemplateInput = document.getElementById('promptTemplate');
  const presetBtns = document.querySelectorAll('.preset-btn');
  const currentShortcut = document.getElementById('currentShortcut');
  const sidepanelShortcut = document.getElementById('sidepanelShortcut');
  const changeShortcutBtn = document.getElementById('changeShortcut');

  const DEFAULT_SHORTCUTS = {
    'translate-selection': 'Alt+H',
    'open-sidepanel': 'Alt+S'
  };

  const statusMessage = document.getElementById('statusMessage')
    || (() => {
      const el = document.createElement('div');
      el.className = 'status-message';
      form.appendChild(el);
      return el;
    })();

  const SETTING_KEYS = [
    'apiKey', 'provider', 'baseUrl', 'model', 'temperature', 'promptTemplate',
    'reasoningEffort', 'floatButton'
  ];

  const PROVIDERS = {
    deepseek: {
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      reasoningEffort: 'none'
    },
    openai: {
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-5.5',
      reasoningEffort: 'none'
    },
    custom: {
      baseUrl: '',
      model: '',
      reasoningEffort: 'none'
    }
  };

  const defaultSettings = {
    provider: 'deepseek',
    baseUrl: PROVIDERS.deepseek.baseUrl,
    model: PROVIDERS.deepseek.model,
    temperature: 0.7,
    promptTemplate: '用通俗易懂的中文解释以下内容：\n\n{text}',
    reasoningEffort: 'none',
    floatButton: true
  };

  /** 接受根地址、/v1、完整 chat/completions */
  function normalizeBaseUrl(url) {
    if (!url || typeof url !== 'string') return defaultSettings.baseUrl;
    let normalized = url.trim().replace(/\/+$/, '');
    normalized = normalized.replace(/\/chat\/completions\/?$/i, '');
    normalized = normalized.replace(/\/+$/, '');
    return normalized || defaultSettings.baseUrl;
  }

  function detectProvider(baseUrl) {
    const norm = normalizeBaseUrl(baseUrl || '');
    if (!norm) return 'custom';
    if (norm === 'https://api.deepseek.com' || norm === 'https://api.deepseek.com/v1') {
      return 'deepseek';
    }
    if (norm === 'https://api.openai.com' || norm === 'https://api.openai.com/v1') {
      return 'openai';
    }
    return 'custom';
  }

  function syncBaseUrlVisibility() {
    const isCustom = providerSelect.value === 'custom';
    if (baseUrlGroup) {
      baseUrlGroup.hidden = !isCustom;
    }
    if (!isCustom) {
      const preset = PROVIDERS[providerSelect.value];
      if (preset?.baseUrl) {
        baseUrlInput.value = preset.baseUrl;
      }
    }
  }

  function applyProviderPreset(providerId, { fillModel = true } = {}) {
    const preset = PROVIDERS[providerId];
    if (!preset) return;
    providerSelect.value = providerId;
    if (providerId !== 'custom' && preset.baseUrl) {
      baseUrlInput.value = preset.baseUrl;
    }
    if (fillModel && preset.model) {
      modelInput.value = preset.model;
    }
    if (fillModel && reasoningEffortInput && preset.reasoningEffort) {
      reasoningEffortInput.value = preset.reasoningEffort;
    }
    syncBaseUrlVisibility();
  }

  async function loadSettings() {
    try {
      const syncSettings = await chrome.storage.sync.get(SETTING_KEYS);
      if (Object.keys(syncSettings).length > 0) {
        applySettings(syncSettings);
        loadShortcutInfo();
        return;
      }

      const localSettings = await chrome.storage.local.get(SETTING_KEYS);
      if (Object.keys(localSettings).length > 0) {
        applySettings(localSettings);
        loadShortcutInfo();
        return;
      }

      applySettings(defaultSettings);
      loadShortcutInfo();
    } catch (error) {
      console.error('加载设置失败:', error);
      try {
        const localSettings = await chrome.storage.local.get(SETTING_KEYS);
        if (Object.keys(localSettings).length > 0) {
          applySettings(localSettings);
          loadShortcutInfo();
          return;
        }
      } catch (_) { /* ignore */ }
      applySettings(defaultSettings);
      loadShortcutInfo();
    }
  }

  function formatShortcut(commandName, actual) {
    if (actual) return actual;
    const fallback = DEFAULT_SHORTCUTS[commandName];
    return fallback ? `${fallback}（建议，当前未绑定）` : '未设置';
  }

  async function loadShortcutInfo() {
    try {
      const commands = await chrome.commands.getAll();
      const translateCommand = commands.find(command => command.name === 'translate-selection');
      const sidepanelCommand = commands.find(command => command.name === 'open-sidepanel');
      if (currentShortcut) {
        currentShortcut.textContent = formatShortcut(
          'translate-selection',
          translateCommand?.shortcut
        );
      }
      if (sidepanelShortcut) {
        sidepanelShortcut.textContent = formatShortcut(
          'open-sidepanel',
          sidepanelCommand?.shortcut
        );
      }
    } catch (error) {
      console.error('获取快捷键信息失败:', error);
      if (currentShortcut) currentShortcut.textContent = DEFAULT_SHORTCUTS['translate-selection'];
      if (sidepanelShortcut) sidepanelShortcut.textContent = DEFAULT_SHORTCUTS['open-sidepanel'];
    }
  }

  function applySettings(settings) {
    apiKeyInput.value = settings.apiKey || '';

    const baseUrl = settings.baseUrl
      ? normalizeBaseUrl(settings.baseUrl)
      : defaultSettings.baseUrl;
    baseUrlInput.value = baseUrl;

    const provider = settings.provider && PROVIDERS[settings.provider]
      ? settings.provider
      : detectProvider(baseUrl);
    providerSelect.value = provider;

    modelInput.value = settings.model || defaultSettings.model;
    temperatureInput.value = settings.temperature ?? defaultSettings.temperature;
    temperatureValue.textContent = temperatureInput.value;
    if (reasoningEffortInput) {
      reasoningEffortInput.value = settings.reasoningEffort || defaultSettings.reasoningEffort;
    }
    if (floatButtonInput) {
      floatButtonInput.checked = settings.floatButton !== false;
    }
    if (promptTemplateInput) {
      promptTemplateInput.value = settings.promptTemplate || defaultSettings.promptTemplate;
    }
    syncBaseUrlVisibility();
  }

  function resolveBaseUrlForSave() {
    const provider = providerSelect.value;
    if (provider !== 'custom' && PROVIDERS[provider]?.baseUrl) {
      return normalizeBaseUrl(PROVIDERS[provider].baseUrl);
    }
    return normalizeBaseUrl(baseUrlInput.value.trim() || defaultSettings.baseUrl);
  }

  loadSettings();

  toggleApiKeyBtn.addEventListener('click', () => {
    if (apiKeyInput.type === 'password') {
      apiKeyInput.type = 'text';
      toggleApiKeyBtn.textContent = '隐藏';
    } else {
      apiKeyInput.type = 'password';
      toggleApiKeyBtn.textContent = '显示';
    }
  });

  temperatureInput.addEventListener('input', (e) => {
    temperatureValue.textContent = e.target.value;
  });

  if (presetBtns && presetBtns.length > 0) {
    presetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        if (promptTemplateInput) {
          promptTemplateInput.value = btn.dataset.template;
        }
      });
    });
  }

  providerSelect.addEventListener('change', () => {
    const id = providerSelect.value;
    if (id === 'custom') {
      // 切到自定义：保留当前地址便于改，不强制清空
      if (!baseUrlInput.value.trim()) {
        baseUrlInput.value = defaultSettings.baseUrl;
      }
      syncBaseUrlVisibility();
      statusMessage.textContent = '已切换为自定义，请填写 Base URL 后保存';
      statusMessage.style.color = 'green';
      return;
    }
    applyProviderPreset(id, { fillModel: true });
    statusMessage.textContent = `已切换为 ${providerSelect.options[providerSelect.selectedIndex].text}，请保存设置`;
    statusMessage.style.color = 'green';
  });

  if (changeShortcutBtn) {
    changeShortcutBtn.addEventListener('click', () => {
      const isFirefox = navigator.userAgent.includes('Firefox');
      chrome.tabs.create({
        url: isFirefox ? 'about:addons' : 'chrome://extensions/shortcuts'
      });

      statusMessage.textContent = isFirefox
        ? '请在扩展管理页中找到本扩展并设置快捷键，然后切回本页'
        : '修改快捷键后，请切换回此标签页，系统将自动检测并更新';
      statusMessage.style.color = 'orange';
    });
  }

  window.addEventListener('focus', () => {
    chrome.commands.getAll((commands) => {
      const translateCommand = commands.find(command => command.name === 'translate-selection');
      const sidepanelCommand = commands.find(command => command.name === 'open-sidepanel');
      const shortcut = translateCommand?.shortcut || '';

      if (currentShortcut) {
        currentShortcut.textContent = formatShortcut('translate-selection', translateCommand?.shortcut);
      }
      if (sidepanelShortcut) {
        sidepanelShortcut.textContent = formatShortcut('open-sidepanel', sidepanelCommand?.shortcut);
      }

      chrome.storage.local.get('saved_shortcut', (data) => {
        const savedShortcut = data.saved_shortcut || '';
        if (shortcut === savedShortcut) return;

        chrome.storage.local.set({ saved_shortcut: shortcut }, () => {
          chrome.runtime.sendMessage({
            action: 'shortcutChanged',
            oldShortcut: savedShortcut,
            newShortcut: shortcut
          }, (response) => {
            if (response?.success) {
              // already refreshed UI above
            }
            statusMessage.textContent = '快捷键已更新，右键菜单已刷新';
            statusMessage.style.color = 'green';
            setTimeout(() => {
              if (statusMessage.textContent === '快捷键已更新，右键菜单已刷新') {
                statusMessage.textContent = '';
              }
            }, 5000);
          });
        });
      });
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const provider = providerSelect.value;
    if (provider === 'custom' && !baseUrlInput.value.trim()) {
      statusMessage.textContent = '自定义服务商请填写 Base URL';
      statusMessage.style.color = 'red';
      return;
    }

    const settings = {
      apiKey: apiKeyInput.value.trim(),
      provider,
      baseUrl: resolveBaseUrlForSave(),
      model: modelInput.value.trim() || defaultSettings.model,
      temperature: parseFloat(temperatureInput.value),
      promptTemplate: promptTemplateInput
        ? promptTemplateInput.value
        : defaultSettings.promptTemplate,
      reasoningEffort: reasoningEffortInput?.value || defaultSettings.reasoningEffort,
      floatButton: floatButtonInput ? floatButtonInput.checked : true
    };

    const saveBtn = form.querySelector('button[type="submit"]');
    saveBtn.disabled = true;
    saveBtn.textContent = '保存中...';
    statusMessage.textContent = '';

    try {
      await chrome.storage.local.set(settings);
      await chrome.storage.sync.set(settings);
      saveBtn.textContent = '已保存';
      statusMessage.textContent = '设置已保存到本地和云端';
      statusMessage.style.color = 'green';
    } catch (error) {
      console.error('保存设置到云端失败:', error);
      saveBtn.textContent = '已保存(仅本地)';
      statusMessage.textContent = '设置已保存到本地，但同步到云端失败';
      statusMessage.style.color = 'orange';
    } finally {
      setTimeout(() => {
        saveBtn.disabled = false;
        saveBtn.textContent = '保存设置';
        statusMessage.textContent = '';
      }, 3000);
    }
  });

  testBtn.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();
    const baseUrl = resolveBaseUrlForSave();
    const model = modelInput.value.trim() || defaultSettings.model;

    if (!apiKey) {
      statusMessage.textContent = '请先输入 API Key';
      statusMessage.style.color = 'red';
      return;
    }

    if (providerSelect.value === 'custom' && !baseUrlInput.value.trim()) {
      statusMessage.textContent = '自定义服务商请填写 Base URL';
      statusMessage.style.color = 'red';
      return;
    }

    testBtn.disabled = true;
    testBtn.textContent = '测试中...';
    statusMessage.textContent = '';

    try {
      const endpoint = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'ping' }],
          temperature: 0,
          max_tokens: 8
        })
      });

      const data = await response.json().catch(() => ({}));
      if (response.ok && (data.choices || data.id)) {
        statusMessage.textContent = '连接测试成功';
        statusMessage.style.color = 'green';
      } else {
        throw new Error(data.error?.message || `HTTP ${response.status}`);
      }
    } catch (error) {
      statusMessage.textContent = '连接测试失败：' + error.message;
      statusMessage.style.color = 'red';
    } finally {
      testBtn.disabled = false;
      testBtn.textContent = '测试连接';
    }
  });
});
