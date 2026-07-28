export const MAX_HISTORY_ITEMS = 100;
export const MAX_INPUT_CHARS = 8000;
export const WARN_INPUT_CHARS = 7200;

export const REASONING_EFFORT_OPTIONS = [
  { value: 'none', label: '无推理 (none)' },
  { value: 'minimal', label: '极少推理 (minimal)' },
  { value: 'low', label: '低推理 (low)' },
  { value: 'medium', label: '中等推理 (medium)' },
  { value: 'high', label: '高推理 (high)' },
  { value: 'xhigh', label: '超高推理 (xhigh)' }
];

export const PROVIDER_PRESETS = {
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-v4-flash',
    reasoningEffort: 'none'
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-5.5',
    reasoningEffort: 'none'
  },
  custom: {
    id: 'custom',
    name: '自定义',
    baseUrl: '',
    model: '',
    reasoningEffort: 'none'
  }
};

export const defaultSettings = {
  provider: 'deepseek',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-v4-flash',
  temperature: 0.7,
  promptTemplate: '用通俗易懂的中文解释以下内容：\n\n{text}',
  reasoningEffort: 'none',
  floatButton: true
};

export const SETTING_KEYS = [
  'apiKey',
  'provider',
  'baseUrl',
  'model',
  'temperature',
  'promptTemplate',
  'reasoningEffort',
  'floatButton'
];

/**
 * 规范 Base URL，供 OpenAI SDK 使用：
 * - 接受 https://host
 * - 接受 https://host/v1
 * - 接受完整 .../chat/completions（自动去掉路径后缀）
 */
export function normalizeBaseUrl(url) {
  if (!url || typeof url !== 'string') {
    return defaultSettings.baseUrl;
  }
  let normalized = url.trim().replace(/\/+$/, '');
  // 完整 chat completions 地址 → 去掉末尾路径
  normalized = normalized.replace(/\/chat\/completions\/?$/i, '');
  normalized = normalized.replace(/\/+$/, '');
  return normalized || defaultSettings.baseUrl;
}
