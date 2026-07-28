import { MAX_HISTORY_ITEMS } from '../shared/defaults.js';

export async function saveTranslationHistory(original, translated, reasoning) {
  try {
    const data = await chrome.storage.local.get('translationHistory');
    const history = data.translationHistory || [];
    const existingIndex = history.findIndex(item => item.original === original);

    const newItem = {
      original,
      translated,
      reasoning,
      timestamp: Date.now(),
      hasReasoning: !!(reasoning && reasoning.length > 0)
    };

    if (existingIndex >= 0) {
      history[existingIndex] = newItem;
    } else {
      history.unshift(newItem);
    }

    await chrome.storage.local.set({
      translationHistory: history.slice(0, MAX_HISTORY_ITEMS)
    });
  } catch (error) {
    console.error('保存翻译历史出错:', error);
  }
}

export async function getTranslationHistory() {
  try {
    const data = await chrome.storage.local.get('translationHistory');
    return data.translationHistory || [];
  } catch (error) {
    console.error('获取翻译历史出错:', error);
    return [];
  }
}

export async function deleteHistoryItem(original) {
  const data = await chrome.storage.local.get('translationHistory');
  const history = data.translationHistory || [];
  const newHistory = history.filter(item => item.original !== original);
  await chrome.storage.local.set({ translationHistory: newHistory });
}

export async function clearHistory() {
  await chrome.storage.local.set({ translationHistory: [] });
}

export async function importHistory(incoming) {
  const data = await chrome.storage.local.get('translationHistory');
  const currentHistory = data.translationHistory || [];
  const list = Array.isArray(incoming) ? incoming : [];

  const historyMap = new Map();
  for (const item of currentHistory) {
    if (item && typeof item.original === 'string') {
      historyMap.set(item.original, item);
    }
  }

  for (const item of list) {
    if (!item || typeof item.original !== 'string') continue;
    const normalized = {
      original: item.original,
      translated: item.translated || '',
      reasoning: item.reasoning || '',
      timestamp: item.timestamp || Date.now(),
      hasReasoning: !!(item.hasReasoning || (item.reasoning && item.reasoning.length > 0))
    };
    const existing = historyMap.get(item.original);
    if (!existing || (normalized.timestamp || 0) >= (existing.timestamp || 0)) {
      historyMap.set(item.original, normalized);
    }
  }

  const mergedHistory = Array.from(historyMap.values())
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    .slice(0, MAX_HISTORY_ITEMS);

  await chrome.storage.local.set({ translationHistory: mergedHistory });
  return mergedHistory.length;
}
