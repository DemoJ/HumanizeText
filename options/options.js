document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('settingsForm');
  const apiKeyInput = document.getElementById('apiKey');
  const toggleApiKeyBtn = document.getElementById('toggleApiKey');
  const baseUrlInput = document.getElementById('baseUrl');
  const modelInput = document.getElementById('model');
  const temperatureInput = document.getElementById('temperature');
  const temperatureValue = document.getElementById('temperatureValue');
  const testBtn = document.getElementById('testBtn');
  // 添加之前缺少的DOM元素引用
  const promptTemplateInput = document.getElementById('promptTemplate');
  const presetBtns = document.querySelectorAll('.preset-btn');
  // 快捷键相关元素
  const currentShortcut = document.getElementById('currentShortcut');
  const changeShortcutBtn = document.getElementById('changeShortcut');

  const statusMessage = document.createElement('div');
  statusMessage.className = 'status-message';
  form.appendChild(statusMessage);

  // 默认设置中添加提示词模板
  const defaultSettings = {
    baseUrl: 'https://api.deepseek.com/v1/chat/completions',
    model: 'deepseek-reasoner',
    temperature: 0.7,
    promptTemplate: '用通俗易懂的中文解释以下内容：\n\n{text}'
  };

  // 加载保存的设置，优先从云端获取，失败时从本地获取
  async function loadSettings() {
    try {
      // 尝试从云端获取设置
      const syncSettings = await chrome.storage.sync.get(['apiKey', 'baseUrl', 'model', 'temperature', 'promptTemplate']);

      if (Object.keys(syncSettings).length > 0) {
        applySettings(syncSettings);
        console.log('从云端加载设置成功');
        // 加载当前的快捷键信息
        loadShortcutInfo();
        return;
      }

      // 如果云端没有设置，尝试从本地获取
      console.log('云端没有设置，尝试从本地获取');
      const localSettings = await chrome.storage.local.get(['apiKey', 'baseUrl', 'model', 'temperature', 'promptTemplate']);

      if (Object.keys(localSettings).length > 0) {
        applySettings(localSettings);
        console.log('从本地加载设置成功');
        // 加载当前的快捷键信息
        loadShortcutInfo();
        return;
      }

      // 如果本地也没有，使用默认设置
      applySettings(defaultSettings);
      console.log('使用默认设置');
      // 加载当前的快捷键信息
      loadShortcutInfo();
    } catch (error) {
      console.error('从云端加载设置失败，尝试从本地获取:', error);

      try {
        // 尝试从本地获取设置
        const localSettings = await chrome.storage.local.get(['apiKey', 'baseUrl', 'model', 'temperature', 'promptTemplate']);

        if (Object.keys(localSettings).length > 0) {
          applySettings(localSettings);
          console.log('从本地加载设置成功');
          // 加载当前的快捷键信息
          loadShortcutInfo();
          return;
        }
      } catch (localError) {
        console.error('从本地加载设置也失败:', localError);
      }

      // 如果都失败了，使用默认设置
      applySettings(defaultSettings);
      console.log('使用默认设置');
      // 加载当前的快捷键信息
      loadShortcutInfo();
    }
  }

  // 加载当前快捷键信息
  async function loadShortcutInfo() {
    try {
      // 获取当前快捷键配置
      const commands = await chrome.commands.getAll();
      const translateCommand = commands.find(command => command.name === 'translate-selection');
      if (translateCommand && translateCommand.shortcut && currentShortcut) {
        currentShortcut.textContent = translateCommand.shortcut;
      }
    } catch (error) {
      console.error('获取快捷键信息失败:', error);
    }
  }

  // 应用设置到表单
  function applySettings(settings) {
    apiKeyInput.value = settings.apiKey || '';
    baseUrlInput.value = settings.baseUrl || defaultSettings.baseUrl;
    modelInput.value = settings.model || defaultSettings.model;
    temperatureInput.value = settings.temperature || defaultSettings.temperature;
    temperatureValue.textContent = temperatureInput.value;

    // 确保promptTemplateInput存在再设置值
    if (promptTemplateInput) {
      promptTemplateInput.value = settings.promptTemplate || defaultSettings.promptTemplate;
    }
  }

  // 加载设置
  loadSettings();

  // 切换 API Key 显示/隐藏
  toggleApiKeyBtn.addEventListener('click', () => {
    if (apiKeyInput.type === 'password') {
      apiKeyInput.type = 'text';
      toggleApiKeyBtn.textContent = '隐藏';
    } else {
      apiKeyInput.type = 'password';
      toggleApiKeyBtn.textContent = '显示';
    }
  });

  // 更新温度值显示
  temperatureInput.addEventListener('input', (e) => {
    temperatureValue.textContent = e.target.value;
  });

  // 预设模板点击事件 - 添加空值检查
  if (presetBtns && presetBtns.length > 0) {
    presetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        if (promptTemplateInput) {
          const template = btn.dataset.template;
          promptTemplateInput.value = template;
        }
      });
    });
  }

  // 修改快捷键按钮
  if (changeShortcutBtn) {
    changeShortcutBtn.addEventListener('click', () => {
      // 打开chrome://extensions/shortcuts 页面
      chrome.tabs.create({
        url: 'chrome://extensions/shortcuts'
      });
      
      // 显示提示消息
      const statusMessage = document.createElement('div');
      statusMessage.className = 'status-message';
      statusMessage.id = 'shortcut_status_message';
      statusMessage.textContent = '修改快捷键后，请切换回此标签页，系统将自动检测并更新';
      statusMessage.style.color = 'orange';
      statusMessage.style.marginTop = '10px';
      
      // 防止重复添加提示
      const existingMessage = document.querySelector('#shortcut_status_message');
      if (existingMessage) {
        existingMessage.textContent = statusMessage.textContent;
        existingMessage.style.color = statusMessage.style.color;
      } else {
        const shortcutBox = document.getElementById('shortcutInfo');
        if (shortcutBox) {
          shortcutBox.parentNode.appendChild(statusMessage);
        } else {
          form.appendChild(statusMessage);
        }
      }
    });
  }

  // 添加窗口获焦时检查快捷键更新
  window.addEventListener('focus', () => {
    // 当窗口重新获得焦点时，检查快捷键是否更新
    console.log('检查快捷键是否已更新');
    
    // 重新获取当前快捷键
    chrome.commands.getAll(async (commands) => {
      const translateCommand = commands.find(command => command.name === 'translate-selection');
      const currentShortcut = translateCommand && translateCommand.shortcut ? translateCommand.shortcut : '';
      
      // 从存储中获取上次保存的快捷键
      chrome.storage.local.get('saved_shortcut', (data) => {
        const savedShortcut = data.saved_shortcut || '';
        console.log('当前快捷键:', currentShortcut, '保存的快捷键:', savedShortcut);
        
        // 快捷键有变化时更新
        if (currentShortcut !== savedShortcut) {
          console.log('检测到快捷键变化，保存并通知更新');
          
          // 保存新快捷键
          chrome.storage.local.set({ 'saved_shortcut': currentShortcut }, () => {
            // 通知background更新右键菜单
            chrome.runtime.sendMessage({ 
              action: 'shortcutChanged',
              oldShortcut: savedShortcut,
              newShortcut: currentShortcut
            }, response => {
              if (response && response.success) {
                // 更新成功
                console.log('右键菜单已更新');
                
                // 更新页面显示的快捷键
                const currentShortcutEl = document.getElementById('currentShortcut');
                if (currentShortcutEl) {
                  currentShortcutEl.textContent = currentShortcut || '无';
                }
                
                // 更新状态消息
                const statusMessage = document.querySelector('#shortcut_status_message');
                if (statusMessage) {
                  statusMessage.textContent = '快捷键已更新，右键菜单已刷新';
                  statusMessage.style.color = 'green';
                  
                  // 5秒后隐藏消息
                  setTimeout(() => {
                    if (statusMessage.parentNode) {
                      statusMessage.parentNode.removeChild(statusMessage);
                    }
                  }, 5000);
                }
              }
            });
          });
        }
      });
    });
  });

  // 保存设置
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const settings = {
      apiKey: apiKeyInput.value.trim(),
      baseUrl: baseUrlInput.value.trim() || defaultSettings.baseUrl,
      model: modelInput.value,
      temperature: parseFloat(temperatureInput.value),
      promptTemplate: promptTemplateInput ? promptTemplateInput.value : defaultSettings.promptTemplate
    };

    const saveBtn = form.querySelector('button[type="submit"]');
    saveBtn.disabled = true;
    saveBtn.textContent = '保存中...';
    statusMessage.textContent = '';

    try {
      // 先保存到本地
      await chrome.storage.local.set(settings);
      console.log('设置已保存到本地存储');

      // 再尝试保存到云端
      await chrome.storage.sync.set(settings);
      console.log('设置已同步到云端存储');

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

  // 测试连接
  testBtn.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();
    const baseUrl = baseUrlInput.value.trim() || defaultSettings.baseUrl;
    const model = modelInput.value;

    if (!apiKey) {
      alert('请先输入 API Key');
      return;
    }

    testBtn.disabled = true;
    testBtn.textContent = '测试中...';

    try {
      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: [{
            role: 'user',
            content: '测试消息'
          }],
          temperature: 0.7
        })
      });

      const data = await response.json();

      if (response.ok && data.choices) {
        alert('连接测试成功！');
      } else {
        throw new Error(data.error?.message || '未知错误');
      }
    } catch (error) {
      alert('连接测试失败：' + error.message);
    } finally {
      testBtn.disabled = false;
      testBtn.textContent = '测试连接';
    }
  });
});