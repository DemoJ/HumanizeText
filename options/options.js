document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('settingsForm');
  const apiKeyInput = document.getElementById('apiKey');
  const toggleApiKeyBtn = document.getElementById('toggleApiKey');
  const baseUrlInput = document.getElementById('baseUrl');
  const modelInput = document.getElementById('model');
  const temperatureInput = document.getElementById('temperature');
  const temperatureValue = document.getElementById('temperatureValue');
  const testBtn = document.getElementById('testBtn');
  const statusMessage = document.createElement('div'); // 添加状态消息元素
  statusMessage.className = 'status-message';
  form.appendChild(statusMessage);

  // 设置默认值
  const defaultSettings = {
    baseUrl: 'https://api.deepseek.com/v1/chat/completions',
    model: 'deepseek-reasoner',
    temperature: 0.7
  };

  // 加载保存的设置，优先从云端获取，失败时从本地获取
  async function loadSettings() {
    try {
      // 尝试从云端获取设置
      const syncSettings = await chrome.storage.sync.get(['apiKey', 'baseUrl', 'model', 'temperature']);
      
      if (Object.keys(syncSettings).length > 0) {
        applySettings(syncSettings);
        console.log('从云端加载设置成功');
        return;
      }
      
      // 如果云端没有设置，尝试从本地获取
      console.log('云端没有设置，尝试从本地获取');
      const localSettings = await chrome.storage.local.get(['apiKey', 'baseUrl', 'model', 'temperature']);
      
      if (Object.keys(localSettings).length > 0) {
        applySettings(localSettings);
        console.log('从本地加载设置成功');
        return;
      }
      
      // 如果本地也没有，使用默认设置
      applySettings(defaultSettings);
      console.log('使用默认设置');
    } catch (error) {
      console.error('从云端加载设置失败，尝试从本地获取:', error);
      
      try {
        // 尝试从本地获取设置
        const localSettings = await chrome.storage.local.get(['apiKey', 'baseUrl', 'model', 'temperature']);
        
        if (Object.keys(localSettings).length > 0) {
          applySettings(localSettings);
          console.log('从本地加载设置成功');
          return;
        }
      } catch (localError) {
        console.error('从本地加载设置也失败:', localError);
      }
      
      // 如果都失败了，使用默认设置
      applySettings(defaultSettings);
      console.log('使用默认设置');
    }
  }

  // 应用设置到表单
  function applySettings(settings) {
    apiKeyInput.value = settings.apiKey || '';
    baseUrlInput.value = settings.baseUrl || defaultSettings.baseUrl;
    modelInput.value = settings.model || defaultSettings.model;
    temperatureInput.value = settings.temperature || defaultSettings.temperature;
    temperatureValue.textContent = temperatureInput.value;
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

  // 保存设置
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const settings = {
      apiKey: apiKeyInput.value.trim(),
      baseUrl: baseUrlInput.value.trim() || defaultSettings.baseUrl,
      model: modelInput.value,
      temperature: parseFloat(temperatureInput.value)
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