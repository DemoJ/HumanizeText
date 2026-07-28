import { defaultSettings, SETTING_KEYS } from '../shared/defaults.js';

export async function getSettings() {
  try {
    const syncSettings = await chrome.storage.sync.get(SETTING_KEYS);

    if (Object.keys(syncSettings).length > 0) {
      try {
        await chrome.storage.local.set(syncSettings);
      } catch (error) {
        console.error('保存设置到本地存储失败:', error);
      }
      return { ...defaultSettings, ...syncSettings };
    }

    const localSettings = await chrome.storage.local.get(SETTING_KEYS);
    if (Object.keys(localSettings).length > 0) {
      return { ...defaultSettings, ...localSettings };
    }

    return { ...defaultSettings };
  } catch (error) {
    console.error('获取云端设置失败，尝试从本地获取:', error);

    try {
      const localSettings = await chrome.storage.local.get(SETTING_KEYS);
      if (Object.keys(localSettings).length > 0) {
        return { ...defaultSettings, ...localSettings };
      }
    } catch (localError) {
      console.error('获取本地设置也失败:', localError);
    }

    return { ...defaultSettings };
  }
}
