import OpenAI from 'openai';
import { defaultSettings, MAX_INPUT_CHARS, normalizeBaseUrl } from '../shared/defaults.js';
import { getSettings } from './settings.js';
import { saveTranslationHistory } from './history.js';

/** @type {Map<number|string, AbortController>} */
const activeRequests = new Map();

/** 每个请求的最新缓冲，便于 handoff / rebind */
/** @type {Map<number|string, { original: string, content: string, reasoning: string, effort: string, truncated: boolean }>} */
const requestBuffers = new Map();

/** key 别名：rebind 后旧 key 指向新 key */
/** @type {Map<number|string, number|string>} */
const keyAliases = new Map();

function resolveKey(key) {
  let cur = key;
  const seen = new Set();
  while (keyAliases.has(cur) && !seen.has(cur)) {
    seen.add(cur);
    cur = keyAliases.get(cur);
  }
  return cur;
}

export function hasActiveRequest(tabId) {
  return activeRequests.has(resolveKey(tabId));
}

export async function cleanupRequest(tabId) {
  const key = resolveKey(tabId);
  if (activeRequests.has(key)) {
    const controller = activeRequests.get(key);
    controller.abort();
    activeRequests.delete(key);
    requestBuffers.delete(key);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  // 清理指向该 key 的别名
  for (const [from, to] of [...keyAliases.entries()]) {
    if (from === key || to === key) keyAliases.delete(from);
  }
}

/**
 * 将进行中的请求从 fromKey 接到 toKey（不 abort）
 * @returns {boolean}
 */
export function rebindRequest(fromKey, toKey) {
  if (fromKey === toKey) return activeRequests.has(resolveKey(fromKey));
  const realFrom = resolveKey(fromKey);
  if (!activeRequests.has(realFrom)) return false;

  // toKey 若已有请求，先清掉
  if (activeRequests.has(toKey) && toKey !== realFrom) {
    try {
      activeRequests.get(toKey).abort();
    } catch (_) { /* ignore */ }
    activeRequests.delete(toKey);
  }

  const controller = activeRequests.get(realFrom);
  activeRequests.delete(realFrom);
  activeRequests.set(toKey, controller);

  const buf = requestBuffers.get(realFrom);
  if (buf) {
    requestBuffers.delete(realFrom);
    requestBuffers.set(toKey, buf);
  }

  keyAliases.set(fromKey, toKey);
  if (realFrom !== fromKey) keyAliases.set(realFrom, toKey);

  return true;
}

export function getRequestBuffer(key) {
  return requestBuffers.get(resolveKey(key)) || null;
}

async function safeSendMessage(tabId, message) {
  try {
    if (!tabId) return false;

    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab) return false;

    return await new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, message, () => {
        if (chrome.runtime.lastError) {
          resolve(false);
          return;
        }
        resolve(true);
      });
    });
  } catch (error) {
    if (!error.message?.includes('Receiving end does not exist')) {
      console.error('消息发送失败:', error);
    }
    return false;
  }
}

function isTabKey(requestKey) {
  return typeof requestKey === 'number';
}

async function sendUpdate(requestKey, payload) {
  const key = resolveKey(requestKey);

  if (isTabKey(key)) {
    return safeSendMessage(key, { action: 'updateTranslation', ...payload });
  }

  const target = typeof key === 'string' ? key : undefined;
  return await new Promise((resolve) => {
    chrome.runtime.sendMessage({
      action: 'updateTranslation',
      target,
      ...payload
    }, () => {
      resolve(!chrome.runtime.lastError);
    });
  });
}

/** rebind 后立刻把当前缓冲推给新目标 */
export async function pushBufferToTarget(key) {
  const real = resolveKey(key);
  const buf = requestBuffers.get(real);
  if (!buf) return false;
  const streaming = activeRequests.has(real);
  return sendUpdate(real, {
    content: buf.content || '',
    hasReasoning: !!(buf.reasoning && buf.reasoning.length),
    reasoningContent: buf.reasoning || '',
    done: !streaming,
    streaming,
    original: buf.original
  });
}

function extractDelta(chunk) {
  const choice = chunk?.choices?.[0];
  const delta = choice?.delta || {};
  let content = '';
  let reasoning = '';

  if (delta.content != null) content += delta.content;
  if (delta.reasoning_content != null) reasoning += delta.reasoning_content;
  if (delta.reasoning != null) {
    reasoning += typeof delta.reasoning === 'string' ? delta.reasoning : '';
  }

  const message = choice?.message;
  if (!content && message?.content) content += message.content;
  if (!reasoning && message?.reasoning_content) reasoning += message.reasoning_content;

  return { content, reasoning };
}

function buildUserError(error) {
  if (!error) return '翻译失败，请重试';
  if (error.name === 'AbortError' || error.message?.includes('aborted')) {
    return null;
  }

  const status = error.status || error.statusCode;
  const msg = error.message || String(error);

  if (msg.includes('API Key') || status === 401) {
    return '请先在设置中配置正确的 API Key';
  }
  if (status === 429 || /rate limit/i.test(msg)) {
    return '请求过于频繁，请稍后再试';
  }
  if (status) {
    return `API 请求失败: ${status}${msg ? ` (${msg})` : ''}`;
  }
  if (/API Key|API 请求失败|rate limit|Failed to fetch|NetworkError|timeout/i.test(msg)) {
    return msg;
  }
  return msg || '翻译失败，请重试';
}

/**
 * @param {string} text
 * @param {number|string|null} requestKey - 标签页 id，或 'sidepanel'
 */
export async function translateText(text, requestKey) {
  let key = requestKey === null || requestKey === undefined ? 'sidepanel' : requestKey;
  await cleanupRequest(key);

  const controller = new AbortController();
  activeRequests.set(key, controller);

  const config = await getSettings();
  if (!config.apiKey) {
    activeRequests.delete(key);
    throw new Error('请先在设置中配置 API Key');
  }

  const input = (text || '').trim();
  if (!input) {
    activeRequests.delete(key);
    throw new Error('没有可翻译的文本');
  }

  const wasTruncated = input.length > MAX_INPUT_CHARS;
  const truncated = wasTruncated ? input.slice(0, MAX_INPUT_CHARS) : input;

  const promptTemplate = config.promptTemplate || defaultSettings.promptTemplate;
  const prompt = promptTemplate.replace('{text}', truncated);
  const effort = config.reasoningEffort || defaultSettings.reasoningEffort;
  const baseURL = normalizeBaseUrl(config.baseUrl || defaultSettings.baseUrl);

  requestBuffers.set(key, {
    original: truncated,
    content: '',
    reasoning: '',
    effort,
    truncated: wasTruncated
  });

  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL,
    dangerouslyAllowBrowser: true,
    maxRetries: 0
  });

  const body = {
    model: config.model || defaultSettings.model,
    messages: [{ role: 'user', content: prompt }],
    temperature: config.temperature ?? defaultSettings.temperature,
    stream: true
  };

  if (effort) {
    body.reasoning_effort = effort;
  }

  let result = '';
  let reasoningContent = '';

  // 每次发送前解析当前 key（可能已被 rebind）
  const currentKey = () => resolveKey(key);

  async function createStream(requestBody) {
    return client.chat.completions.create(requestBody, {
      signal: controller.signal
    });
  }

  try {
    let stream;
    try {
      stream = await createStream(body);
    } catch (firstError) {
      if (body.reasoning_effort != null && !controller.signal.aborted) {
        const { reasoning_effort: _, ...fallbackBody } = body;
        stream = await createStream(fallbackBody);
      } else {
        throw firstError;
      }
    }

    for await (const chunk of stream) {
      if (controller.signal.aborted) break;

      const { content, reasoning } = extractDelta(chunk);
      if (!content && !reasoning) continue;

      result += content;
      if (effort !== 'none') {
        reasoningContent += reasoning;
      }

      const k = currentKey();
      const buf = requestBuffers.get(k) || requestBuffers.get(key);
      if (buf) {
        buf.content = result;
        buf.reasoning = reasoningContent;
        requestBuffers.set(k, buf);
      }

      const alive = await sendUpdate(k, {
        content: result,
        hasReasoning: effort !== 'none' && reasoningContent.length > 0,
        reasoningContent,
        done: false,
        streaming: true
      });

      // 页内 tab 收不到消息时：若已 rebind 到 sidepanel 则继续；否则中止
      if (!alive && isTabKey(k) && currentKey() === k) {
        controller.abort();
        activeRequests.delete(k);
        requestBuffers.delete(k);
        return;
      }
    }

    const finalKey = currentKey();

    if (controller.signal.aborted) {
      activeRequests.delete(finalKey);
      // 不删 buffer，handoff 可能还要用
      return;
    }

    await sendUpdate(finalKey, {
      content: result,
      hasReasoning: effort !== 'none' && reasoningContent.length > 0,
      reasoningContent,
      done: true,
      streaming: false,
      truncated: wasTruncated,
      maxChars: MAX_INPUT_CHARS
    });

    if (result) {
      try {
        await saveTranslationHistory(
          truncated,
          result,
          effort === 'none' ? '' : reasoningContent
        );
      } catch (error) {
        console.error('保存翻译历史失败:', error);
      }
    }

    activeRequests.delete(finalKey);
    requestBuffers.delete(finalKey);
    return result;
  } catch (error) {
    const finalKey = currentKey();
    activeRequests.delete(finalKey);

    if (error?.name === 'AbortError' || controller.signal.aborted) {
      await sendUpdate(finalKey, {
        content: result,
        hasReasoning: effort !== 'none' && reasoningContent.length > 0,
        reasoningContent,
        done: true,
        stopped: true,
        streaming: false
      });
      return result || undefined;
    }

    requestBuffers.delete(finalKey);
    const userError = buildUserError(error);
    if (userError) {
      throw new Error(userError);
    }
  }
}

export { activeRequests, requestBuffers };
