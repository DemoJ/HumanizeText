document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('settingsForm');
  const apiKeyInput = document.getElementById('apiKey');
  const toggleApiKeyBtn = document.getElementById('toggleApiKey');
  const baseUrlInput = document.getElementById('baseUrl');
  const modelInput = document.getElementById('model');
  const temperatureInput = document.getElementById('temperature');
  const temperatureValue = document.getElementById('temperatureValue');
  const testBtn = document.getElementById('testBtn');

  // 设置默认值
  const defaultSettings = {
    baseUrl: 'https://api.deepseek.com/v1/chat/completions',
    model: 'deepseek-reasoner',
    temperature: 0.7
  };

  // 加载保存的设置
  chrome.storage.sync.get(['apiKey', 'baseUrl', 'model', 'temperature'], (settings) => {
    apiKeyInput.value = settings.apiKey || '';
    baseUrlInput.value = settings.baseUrl || defaultSettings.baseUrl;
    modelInput.value = settings.model || defaultSettings.model;
    temperatureInput.value = settings.temperature || defaultSettings.temperature;
    temperatureValue.textContent = temperatureInput.value;
  });

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
  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const settings = {
      apiKey: apiKeyInput.value.trim(),
      baseUrl: baseUrlInput.value.trim() || 'https://api.openai.com/v1/chat/completions',
      model: modelInput.value,
      temperature: parseFloat(temperatureInput.value)
    };

    chrome.storage.sync.set(settings, () => {
      const saveBtn = form.querySelector('button[type="submit"]');
      saveBtn.textContent = '已保存';
      setTimeout(() => {
        saveBtn.textContent = '保存设置';
      }, 1500);
    });
  });

  // 测试连接
  testBtn.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();
    const baseUrl = baseUrlInput.value.trim() || 'https://api.openai.com/v1/chat/completions';
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