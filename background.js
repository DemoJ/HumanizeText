/* HumanizeText background - built with esbuild + openai */
if (typeof globalThis.process === "undefined") { globalThis.process = { env: {}, version: "", platform: "browser", arch: "unknown" }; }
(() => {
  // src/background/notify.js
  async function notifyUser(message, tabId) {
    if (tabId) {
      try {
        const tab = await chrome.tabs.get(tabId).catch(() => null);
        if (tab?.url?.startsWith("http")) {
          await chrome.scripting.executeScript({
            target: { tabId },
            func: (msg) => {
              const id = "humanize-text-toast";
              let el = document.getElementById(id);
              if (!el) {
                el = document.createElement("div");
                el.id = id;
                el.style.cssText = [
                  "position:fixed",
                  "top:20px",
                  "right:20px",
                  "z-index:2147483647",
                  "background:#333",
                  "color:#fff",
                  "padding:12px 16px",
                  "border-radius:8px",
                  "font-size:14px",
                  "line-height:1.4",
                  "box-shadow:0 4px 12px rgba(0,0,0,.2)",
                  "max-width:320px",
                  "font-family:system-ui,-apple-system,sans-serif",
                  "transition:opacity .2s"
                ].join(";");
                document.body.appendChild(el);
              }
              el.textContent = msg;
              el.style.opacity = "1";
              clearTimeout(el._htTimer);
              el._htTimer = setTimeout(() => {
                el.style.opacity = "0";
                setTimeout(() => el.remove(), 200);
              }, 3e3);
            },
            args: [message]
          });
          return;
        }
      } catch (error) {
        console.error("\u9875\u5185\u63D0\u793A\u5931\u8D25:", error);
      }
    }
    try {
      await chrome.action.setBadgeText({ text: "!" });
      await chrome.action.setBadgeBackgroundColor({ color: "#f44336" });
      await chrome.action.setTitle({ title: message });
      setTimeout(() => {
        chrome.action.setBadgeText({ text: "" });
        chrome.action.setTitle({ title: "\u4EBA\u8BDD\u7FFB\u8BD1\u5668" });
      }, 3e3);
    } catch (error) {
      console.error(message, error);
    }
  }

  // src/shared/defaults.js
  var MAX_HISTORY_ITEMS = 100;
  var MAX_INPUT_CHARS = 8e3;
  var defaultSettings = {
    provider: "deepseek",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
    temperature: 0.7,
    promptTemplate: "\u7528\u901A\u4FD7\u6613\u61C2\u7684\u4E2D\u6587\u89E3\u91CA\u4EE5\u4E0B\u5185\u5BB9\uFF1A\n\n{text}",
    reasoningEffort: "none",
    floatButton: true
  };
  var SETTING_KEYS = [
    "apiKey",
    "provider",
    "baseUrl",
    "model",
    "temperature",
    "promptTemplate",
    "reasoningEffort",
    "floatButton"
  ];
  function normalizeBaseUrl(url) {
    if (!url || typeof url !== "string") {
      return defaultSettings.baseUrl;
    }
    let normalized = url.trim().replace(/\/+$/, "");
    normalized = normalized.replace(/\/chat\/completions\/?$/i, "");
    normalized = normalized.replace(/\/+$/, "");
    return normalized || defaultSettings.baseUrl;
  }

  // src/background/history.js
  async function saveTranslationHistory(original, translated, reasoning) {
    try {
      const data = await chrome.storage.local.get("translationHistory");
      const history = data.translationHistory || [];
      const existingIndex = history.findIndex((item) => item.original === original);
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
      console.error("\u4FDD\u5B58\u7FFB\u8BD1\u5386\u53F2\u51FA\u9519:", error);
    }
  }
  async function getTranslationHistory() {
    try {
      const data = await chrome.storage.local.get("translationHistory");
      return data.translationHistory || [];
    } catch (error) {
      console.error("\u83B7\u53D6\u7FFB\u8BD1\u5386\u53F2\u51FA\u9519:", error);
      return [];
    }
  }
  async function deleteHistoryItem(original) {
    const data = await chrome.storage.local.get("translationHistory");
    const history = data.translationHistory || [];
    const newHistory = history.filter((item) => item.original !== original);
    await chrome.storage.local.set({ translationHistory: newHistory });
  }
  async function clearHistory() {
    await chrome.storage.local.set({ translationHistory: [] });
  }
  async function importHistory(incoming) {
    const data = await chrome.storage.local.get("translationHistory");
    const currentHistory = data.translationHistory || [];
    const list = Array.isArray(incoming) ? incoming : [];
    const historyMap = /* @__PURE__ */ new Map();
    for (const item of currentHistory) {
      if (item && typeof item.original === "string") {
        historyMap.set(item.original, item);
      }
    }
    for (const item of list) {
      if (!item || typeof item.original !== "string") continue;
      const normalized = {
        original: item.original,
        translated: item.translated || "",
        reasoning: item.reasoning || "",
        timestamp: item.timestamp || Date.now(),
        hasReasoning: !!(item.hasReasoning || item.reasoning && item.reasoning.length > 0)
      };
      const existing = historyMap.get(item.original);
      if (!existing || (normalized.timestamp || 0) >= (existing.timestamp || 0)) {
        historyMap.set(item.original, normalized);
      }
    }
    const mergedHistory = Array.from(historyMap.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, MAX_HISTORY_ITEMS);
    await chrome.storage.local.set({ translationHistory: mergedHistory });
    return mergedHistory.length;
  }

  // node_modules/openai/internal/tslib.mjs
  function __classPrivateFieldSet(receiver, state, value, kind, f) {
    if (kind === "m")
      throw new TypeError("Private method is not writable");
    if (kind === "a" && !f)
      throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver))
      throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
  }
  function __classPrivateFieldGet(receiver, state, kind, f) {
    if (kind === "a" && !f)
      throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver))
      throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
  }

  // node_modules/openai/internal/utils/uuid.mjs
  var uuid4 = function() {
    const { crypto: crypto2 } = globalThis;
    if (crypto2?.randomUUID) {
      uuid4 = crypto2.randomUUID.bind(crypto2);
      return crypto2.randomUUID();
    }
    const u8 = new Uint8Array(1);
    const randomByte = crypto2 ? () => crypto2.getRandomValues(u8)[0] : () => Math.random() * 255 & 255;
    return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (+c ^ randomByte() & 15 >> +c / 4).toString(16));
  };

  // node_modules/openai/internal/errors.mjs
  function isAbortError(err) {
    return typeof err === "object" && err !== null && // Spec-compliant fetch implementations
    ("name" in err && err.name === "AbortError" || // Expo fetch
    "message" in err && String(err.message).includes("FetchRequestCanceledException"));
  }
  var castToError = (err) => {
    if (err instanceof Error)
      return err;
    if (typeof err === "object" && err !== null) {
      try {
        if (Object.prototype.toString.call(err) === "[object Error]") {
          const error = new Error(err.message, err.cause ? { cause: err.cause } : {});
          if (err.stack)
            error.stack = err.stack;
          if (err.cause && !error.cause)
            error.cause = err.cause;
          if (err.name)
            error.name = err.name;
          return error;
        }
      } catch {
      }
      try {
        return new Error(JSON.stringify(err));
      } catch {
      }
    }
    return new Error(err);
  };

  // node_modules/openai/core/error.mjs
  var OpenAIError = class extends Error {
  };
  var APIError = class _APIError extends OpenAIError {
    constructor(status, error, message, headers) {
      super(`${_APIError.makeMessage(status, error, message)}`);
      this.status = status;
      this.headers = headers;
      this.requestID = headers?.get("x-request-id");
      this.error = error;
      const data = error;
      this.code = data?.["code"];
      this.param = data?.["param"];
      this.type = data?.["type"];
    }
    static makeMessage(status, error, message) {
      const msg = error?.message ? typeof error.message === "string" ? error.message : JSON.stringify(error.message) : error ? JSON.stringify(error) : message;
      if (status && msg) {
        return `${status} ${msg}`;
      }
      if (status) {
        return `${status} status code (no body)`;
      }
      if (msg) {
        return msg;
      }
      return "(no status code or body)";
    }
    static generate(status, errorResponse, message, headers) {
      if (!status || !headers) {
        return new APIConnectionError({ message, cause: castToError(errorResponse) });
      }
      const error = errorResponse?.["error"];
      if (status === 400) {
        return new BadRequestError(status, error, message, headers);
      }
      if (status === 401) {
        return new AuthenticationError(status, error, message, headers);
      }
      if (status === 403) {
        return new PermissionDeniedError(status, error, message, headers);
      }
      if (status === 404) {
        return new NotFoundError(status, error, message, headers);
      }
      if (status === 409) {
        return new ConflictError(status, error, message, headers);
      }
      if (status === 422) {
        return new UnprocessableEntityError(status, error, message, headers);
      }
      if (status === 429) {
        return new RateLimitError(status, error, message, headers);
      }
      if (status >= 500) {
        return new InternalServerError(status, error, message, headers);
      }
      return new _APIError(status, error, message, headers);
    }
  };
  var APIUserAbortError = class extends APIError {
    constructor({ message } = {}) {
      super(void 0, void 0, message || "Request was aborted.", void 0);
    }
  };
  var APIConnectionError = class extends APIError {
    constructor({ message, cause }) {
      super(void 0, void 0, message || "Connection error.", void 0);
      if (cause)
        this.cause = cause;
    }
  };
  var APIConnectionTimeoutError = class extends APIConnectionError {
    constructor({ message } = {}) {
      super({ message: message ?? "Request timed out." });
    }
  };
  var BadRequestError = class extends APIError {
  };
  var AuthenticationError = class extends APIError {
  };
  var PermissionDeniedError = class extends APIError {
  };
  var NotFoundError = class extends APIError {
  };
  var ConflictError = class extends APIError {
  };
  var UnprocessableEntityError = class extends APIError {
  };
  var RateLimitError = class extends APIError {
  };
  var InternalServerError = class extends APIError {
  };
  var LengthFinishReasonError = class extends OpenAIError {
    constructor() {
      super(`Could not parse response content as the length limit was reached`);
    }
  };
  var ContentFilterFinishReasonError = class extends OpenAIError {
    constructor() {
      super(`Could not parse response content as the request was rejected by the content filter`);
    }
  };
  var InvalidWebhookSignatureError = class extends Error {
    constructor(message) {
      super(message);
    }
  };
  var OAuthError = class extends APIError {
    constructor(status, error, headers) {
      let finalMessage = "OAuth2 authentication error";
      let error_code = void 0;
      if (error && typeof error === "object") {
        const errorData = error;
        error_code = errorData["error"];
        const description = errorData["error_description"];
        if (description && typeof description === "string") {
          finalMessage = description;
        } else if (error_code) {
          finalMessage = error_code;
        }
      }
      super(status, error, finalMessage, headers);
      this.error_code = error_code;
    }
  };
  var SubjectTokenProviderError = class extends OpenAIError {
    constructor(message, provider, cause) {
      super(message);
      this.provider = provider;
      this.cause = cause;
    }
  };

  // node_modules/openai/internal/utils/values.mjs
  var startsWithSchemeRegexp = /^[a-z][a-z0-9+.-]*:/i;
  var isAbsoluteURL = (url) => {
    return startsWithSchemeRegexp.test(url);
  };
  var isArray = (val) => (isArray = Array.isArray, isArray(val));
  var isReadonlyArray = isArray;
  function maybeObj(x) {
    if (typeof x !== "object") {
      return {};
    }
    return x ?? {};
  }
  function isEmptyObj(obj) {
    if (!obj)
      return true;
    for (const _k in obj)
      return false;
    return true;
  }
  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }
  function isObj(obj) {
    return obj != null && typeof obj === "object" && !Array.isArray(obj);
  }
  var validatePositiveInteger = (name, n) => {
    if (typeof n !== "number" || !Number.isInteger(n)) {
      throw new OpenAIError(`${name} must be an integer`);
    }
    if (n < 0) {
      throw new OpenAIError(`${name} must be a positive integer`);
    }
    return n;
  };
  var safeJSON = (text) => {
    try {
      return JSON.parse(text);
    } catch (err) {
      return void 0;
    }
  };

  // node_modules/openai/internal/utils/sleep.mjs
  var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // node_modules/openai/version.mjs
  var VERSION = "7.0.0";

  // node_modules/openai/internal/detect-platform.mjs
  var isRunningInBrowser = () => {
    return (
      // @ts-ignore
      typeof window !== "undefined" && // @ts-ignore
      typeof window.document !== "undefined" && // @ts-ignore
      typeof navigator !== "undefined"
    );
  };
  function getDetectedPlatform() {
    if (typeof Deno !== "undefined" && Deno.build != null) {
      return "deno";
    }
    if (typeof EdgeRuntime !== "undefined") {
      return "edge";
    }
    if (Object.prototype.toString.call(typeof globalThis.process !== "undefined" ? globalThis.process : 0) === "[object process]") {
      return "node";
    }
    return "unknown";
  }
  var getPlatformProperties = () => {
    const detectedPlatform = getDetectedPlatform();
    if (detectedPlatform === "deno") {
      return {
        "X-Stainless-Lang": "js",
        "X-Stainless-Package-Version": VERSION,
        "X-Stainless-OS": normalizePlatform(Deno.build.os),
        "X-Stainless-Arch": normalizeArch(Deno.build.arch),
        "X-Stainless-Runtime": "deno",
        "X-Stainless-Runtime-Version": typeof Deno.version === "string" ? Deno.version : Deno.version?.deno ?? "unknown"
      };
    }
    if (typeof EdgeRuntime !== "undefined") {
      return {
        "X-Stainless-Lang": "js",
        "X-Stainless-Package-Version": VERSION,
        "X-Stainless-OS": "Unknown",
        "X-Stainless-Arch": `other:${EdgeRuntime}`,
        "X-Stainless-Runtime": "edge",
        "X-Stainless-Runtime-Version": globalThis.process.version
      };
    }
    if (detectedPlatform === "node") {
      return {
        "X-Stainless-Lang": "js",
        "X-Stainless-Package-Version": VERSION,
        "X-Stainless-OS": normalizePlatform(globalThis.process.platform ?? "unknown"),
        "X-Stainless-Arch": normalizeArch(globalThis.process.arch ?? "unknown"),
        "X-Stainless-Runtime": "node",
        "X-Stainless-Runtime-Version": globalThis.process.version ?? "unknown"
      };
    }
    const browserInfo = getBrowserInfo();
    if (browserInfo) {
      return {
        "X-Stainless-Lang": "js",
        "X-Stainless-Package-Version": VERSION,
        "X-Stainless-OS": "Unknown",
        "X-Stainless-Arch": "unknown",
        "X-Stainless-Runtime": `browser:${browserInfo.browser}`,
        "X-Stainless-Runtime-Version": browserInfo.version
      };
    }
    return {
      "X-Stainless-Lang": "js",
      "X-Stainless-Package-Version": VERSION,
      "X-Stainless-OS": "Unknown",
      "X-Stainless-Arch": "unknown",
      "X-Stainless-Runtime": "unknown",
      "X-Stainless-Runtime-Version": "unknown"
    };
  };
  function getBrowserInfo() {
    if (typeof navigator === "undefined" || !navigator) {
      return null;
    }
    const browserPatterns = [
      { key: "edge", pattern: /Edge(?:\W+(\d+)\.(\d+)(?:\.(\d+))?)?/ },
      { key: "ie", pattern: /MSIE(?:\W+(\d+)\.(\d+)(?:\.(\d+))?)?/ },
      { key: "ie", pattern: /Trident(?:.*rv\:(\d+)\.(\d+)(?:\.(\d+))?)?/ },
      { key: "chrome", pattern: /Chrome(?:\W+(\d+)\.(\d+)(?:\.(\d+))?)?/ },
      { key: "firefox", pattern: /Firefox(?:\W+(\d+)\.(\d+)(?:\.(\d+))?)?/ },
      { key: "safari", pattern: /(?:Version\W+(\d+)\.(\d+)(?:\.(\d+))?)?(?:\W+Mobile\S*)?\W+Safari/ }
    ];
    for (const { key, pattern } of browserPatterns) {
      const match = pattern.exec(navigator.userAgent);
      if (match) {
        const major = match[1] || 0;
        const minor = match[2] || 0;
        const patch = match[3] || 0;
        return { browser: key, version: `${major}.${minor}.${patch}` };
      }
    }
    return null;
  }
  var normalizeArch = (arch) => {
    if (arch === "x32")
      return "x32";
    if (arch === "x86_64" || arch === "x64")
      return "x64";
    if (arch === "arm")
      return "arm";
    if (arch === "aarch64" || arch === "arm64")
      return "arm64";
    if (arch)
      return `other:${arch}`;
    return "unknown";
  };
  var normalizePlatform = (platform) => {
    platform = platform.toLowerCase();
    if (platform.includes("ios"))
      return "iOS";
    if (platform === "android")
      return "Android";
    if (platform === "darwin")
      return "MacOS";
    if (platform === "win32")
      return "Windows";
    if (platform === "freebsd")
      return "FreeBSD";
    if (platform === "openbsd")
      return "OpenBSD";
    if (platform === "linux")
      return "Linux";
    if (platform)
      return `Other:${platform}`;
    return "Unknown";
  };
  var _platformHeaders;
  var getPlatformHeaders = () => {
    return _platformHeaders ?? (_platformHeaders = getPlatformProperties());
  };

  // node_modules/openai/internal/shims.mjs
  function getDefaultFetch() {
    if (typeof fetch !== "undefined") {
      return fetch;
    }
    throw new Error("`fetch` is not defined as a global; Either pass `fetch` to the client, `new OpenAI({ fetch })` or polyfill the global, `globalThis.fetch = fetch`");
  }
  function makeReadableStream(...args) {
    const ReadableStream = globalThis.ReadableStream;
    if (typeof ReadableStream === "undefined") {
      throw new Error("`ReadableStream` is not defined as a global; You will need to polyfill it, `globalThis.ReadableStream = ReadableStream`");
    }
    return new ReadableStream(...args);
  }
  function ReadableStreamFrom(iterable) {
    let iter = Symbol.asyncIterator in iterable ? iterable[Symbol.asyncIterator]() : iterable[Symbol.iterator]();
    return makeReadableStream({
      start() {
      },
      async pull(controller) {
        const { done, value } = await iter.next();
        if (done) {
          controller.close();
        } else {
          controller.enqueue(value);
        }
      },
      async cancel() {
        await iter.return?.();
      }
    });
  }
  function ReadableStreamToAsyncIterable(stream) {
    if (stream[Symbol.asyncIterator])
      return stream;
    const reader = stream.getReader();
    return {
      async next() {
        try {
          const result = await reader.read();
          if (result?.done)
            reader.releaseLock();
          return result;
        } catch (e) {
          reader.releaseLock();
          throw e;
        }
      },
      async return() {
        const cancelPromise = reader.cancel();
        reader.releaseLock();
        await cancelPromise;
        return { done: true, value: void 0 };
      },
      [Symbol.asyncIterator]() {
        return this;
      }
    };
  }
  async function CancelReadableStream(stream) {
    if (stream === null || typeof stream !== "object")
      return;
    if (stream[Symbol.asyncIterator]) {
      await stream[Symbol.asyncIterator]().return?.();
      return;
    }
    const reader = stream.getReader();
    const cancelPromise = reader.cancel();
    reader.releaseLock();
    await cancelPromise;
  }

  // node_modules/openai/internal/request-options.mjs
  var FallbackEncoder = ({ headers, body }) => {
    return {
      bodyHeaders: {
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    };
  };

  // node_modules/openai/internal/qs/formats.mjs
  var default_format = "RFC3986";
  var default_formatter = (v) => String(v);
  var formatters = {
    RFC1738: (v) => String(v).replace(/%20/g, "+"),
    RFC3986: default_formatter
  };
  var RFC1738 = "RFC1738";

  // node_modules/openai/internal/qs/utils.mjs
  var has = (obj, key) => (has = Object.hasOwn ?? Function.prototype.call.bind(Object.prototype.hasOwnProperty), has(obj, key));
  var hex_table = /* @__PURE__ */ (() => {
    const array = [];
    for (let i = 0; i < 256; ++i) {
      array.push("%" + ((i < 16 ? "0" : "") + i.toString(16)).toUpperCase());
    }
    return array;
  })();
  var limit = 1024;
  var encode = (str2, _defaultEncoder, charset, _kind, format) => {
    if (str2.length === 0) {
      return str2;
    }
    let string = str2;
    if (typeof str2 === "symbol") {
      string = Symbol.prototype.toString.call(str2);
    } else if (typeof str2 !== "string") {
      string = String(str2);
    }
    if (charset === "iso-8859-1") {
      return escape(string).replace(/%u[0-9a-f]{4}/gi, function($0) {
        return "%26%23" + parseInt($0.slice(2), 16) + "%3B";
      });
    }
    let out = "";
    for (let j = 0; j < string.length; j += limit) {
      const segment = string.length >= limit ? string.slice(j, j + limit) : string;
      const arr = [];
      for (let i = 0; i < segment.length; ++i) {
        let c = segment.charCodeAt(i);
        if (c === 45 || // -
        c === 46 || // .
        c === 95 || // _
        c === 126 || // ~
        c >= 48 && c <= 57 || // 0-9
        c >= 65 && c <= 90 || // a-z
        c >= 97 && c <= 122 || // A-Z
        format === RFC1738 && (c === 40 || c === 41)) {
          arr[arr.length] = segment.charAt(i);
          continue;
        }
        if (c < 128) {
          arr[arr.length] = hex_table[c];
          continue;
        }
        if (c < 2048) {
          arr[arr.length] = hex_table[192 | c >> 6] + hex_table[128 | c & 63];
          continue;
        }
        if (c < 55296 || c >= 57344) {
          arr[arr.length] = hex_table[224 | c >> 12] + hex_table[128 | c >> 6 & 63] + hex_table[128 | c & 63];
          continue;
        }
        i += 1;
        c = 65536 + ((c & 1023) << 10 | segment.charCodeAt(i) & 1023);
        arr[arr.length] = hex_table[240 | c >> 18] + hex_table[128 | c >> 12 & 63] + hex_table[128 | c >> 6 & 63] + hex_table[128 | c & 63];
      }
      out += arr.join("");
    }
    return out;
  };
  function is_buffer(obj) {
    if (!obj || typeof obj !== "object") {
      return false;
    }
    return !!(obj.constructor && obj.constructor.isBuffer && obj.constructor.isBuffer(obj));
  }
  function maybe_map(val, fn) {
    if (isArray(val)) {
      const mapped = [];
      for (let i = 0; i < val.length; i += 1) {
        mapped.push(fn(val[i]));
      }
      return mapped;
    }
    return fn(val);
  }

  // node_modules/openai/internal/qs/stringify.mjs
  var array_prefix_generators = {
    brackets(prefix) {
      return String(prefix) + "[]";
    },
    comma: "comma",
    indices(prefix, key) {
      return String(prefix) + "[" + key + "]";
    },
    repeat(prefix) {
      return String(prefix);
    }
  };
  var push_to_array = function(arr, value_or_array) {
    Array.prototype.push.apply(arr, isArray(value_or_array) ? value_or_array : [value_or_array]);
  };
  var toISOString;
  var defaults = {
    addQueryPrefix: false,
    allowDots: false,
    allowEmptyArrays: false,
    arrayFormat: "indices",
    charset: "utf-8",
    charsetSentinel: false,
    delimiter: "&",
    encode: true,
    encodeDotInKeys: false,
    encoder: encode,
    encodeValuesOnly: false,
    format: default_format,
    formatter: default_formatter,
    /** @deprecated */
    indices: false,
    serializeDate(date) {
      return (toISOString ?? (toISOString = Function.prototype.call.bind(Date.prototype.toISOString)))(date);
    },
    skipNulls: false,
    strictNullHandling: false
  };
  function is_non_nullish_primitive(v) {
    return typeof v === "string" || typeof v === "number" || typeof v === "boolean" || typeof v === "symbol" || typeof v === "bigint";
  }
  var sentinel = {};
  function inner_stringify(object, prefix, generateArrayPrefix, commaRoundTrip, allowEmptyArrays, strictNullHandling, skipNulls, encodeDotInKeys, encoder, filter, sort, allowDots, serializeDate, format, formatter, encodeValuesOnly, charset, sideChannel) {
    let obj = object;
    let tmp_sc = sideChannel;
    let step = 0;
    let find_flag = false;
    while ((tmp_sc = tmp_sc.get(sentinel)) !== void 0 && !find_flag) {
      const pos = tmp_sc.get(object);
      step += 1;
      if (typeof pos !== "undefined") {
        if (pos === step) {
          throw new RangeError("Cyclic object value");
        } else {
          find_flag = true;
        }
      }
      if (typeof tmp_sc.get(sentinel) === "undefined") {
        step = 0;
      }
    }
    if (typeof filter === "function") {
      obj = filter(prefix, obj);
    } else if (obj instanceof Date) {
      obj = serializeDate?.(obj);
    } else if (generateArrayPrefix === "comma" && isArray(obj)) {
      obj = maybe_map(obj, function(value) {
        if (value instanceof Date) {
          return serializeDate?.(value);
        }
        return value;
      });
    }
    if (obj === null) {
      if (strictNullHandling) {
        return encoder && !encodeValuesOnly ? (
          // @ts-expect-error
          encoder(prefix, defaults.encoder, charset, "key", format)
        ) : prefix;
      }
      obj = "";
    }
    if (is_non_nullish_primitive(obj) || is_buffer(obj)) {
      if (encoder) {
        const key_value = encodeValuesOnly ? prefix : encoder(prefix, defaults.encoder, charset, "key", format);
        return [
          formatter?.(key_value) + "=" + // @ts-expect-error
          formatter?.(encoder(obj, defaults.encoder, charset, "value", format))
        ];
      }
      return [formatter?.(prefix) + "=" + formatter?.(String(obj))];
    }
    const values = [];
    if (typeof obj === "undefined") {
      return values;
    }
    let obj_keys;
    if (generateArrayPrefix === "comma" && isArray(obj)) {
      if (encodeValuesOnly && encoder) {
        obj = maybe_map(obj, encoder);
      }
      obj_keys = [{ value: obj.length > 0 ? obj.join(",") || null : void 0 }];
    } else if (isArray(filter)) {
      obj_keys = filter;
    } else {
      const keys = Object.keys(obj);
      obj_keys = sort ? keys.sort(sort) : keys;
    }
    const encoded_prefix = encodeDotInKeys ? String(prefix).replace(/\./g, "%2E") : String(prefix);
    const adjusted_prefix = commaRoundTrip && isArray(obj) && obj.length === 1 ? encoded_prefix + "[]" : encoded_prefix;
    if (allowEmptyArrays && isArray(obj) && obj.length === 0) {
      return adjusted_prefix + "[]";
    }
    for (let j = 0; j < obj_keys.length; ++j) {
      const key = obj_keys[j];
      const value = (
        // @ts-ignore
        typeof key === "object" && typeof key.value !== "undefined" ? key.value : obj[key]
      );
      if (skipNulls && value === null) {
        continue;
      }
      const encoded_key = allowDots && encodeDotInKeys ? key.replace(/\./g, "%2E") : key;
      const key_prefix = isArray(obj) ? typeof generateArrayPrefix === "function" ? generateArrayPrefix(adjusted_prefix, encoded_key) : adjusted_prefix : adjusted_prefix + (allowDots ? "." + encoded_key : "[" + encoded_key + "]");
      sideChannel.set(object, step);
      const valueSideChannel = /* @__PURE__ */ new WeakMap();
      valueSideChannel.set(sentinel, sideChannel);
      push_to_array(values, inner_stringify(
        value,
        key_prefix,
        generateArrayPrefix,
        commaRoundTrip,
        allowEmptyArrays,
        strictNullHandling,
        skipNulls,
        encodeDotInKeys,
        // @ts-ignore
        generateArrayPrefix === "comma" && encodeValuesOnly && isArray(obj) ? null : encoder,
        filter,
        sort,
        allowDots,
        serializeDate,
        format,
        formatter,
        encodeValuesOnly,
        charset,
        valueSideChannel
      ));
    }
    return values;
  }
  function normalize_stringify_options(opts = defaults) {
    if (typeof opts.allowEmptyArrays !== "undefined" && typeof opts.allowEmptyArrays !== "boolean") {
      throw new TypeError("`allowEmptyArrays` option can only be `true` or `false`, when provided");
    }
    if (typeof opts.encodeDotInKeys !== "undefined" && typeof opts.encodeDotInKeys !== "boolean") {
      throw new TypeError("`encodeDotInKeys` option can only be `true` or `false`, when provided");
    }
    if (opts.encoder !== null && typeof opts.encoder !== "undefined" && typeof opts.encoder !== "function") {
      throw new TypeError("Encoder has to be a function.");
    }
    const charset = opts.charset || defaults.charset;
    if (typeof opts.charset !== "undefined" && opts.charset !== "utf-8" && opts.charset !== "iso-8859-1") {
      throw new TypeError("The charset option must be either utf-8, iso-8859-1, or undefined");
    }
    let format = default_format;
    if (typeof opts.format !== "undefined") {
      if (!has(formatters, opts.format)) {
        throw new TypeError("Unknown format option provided.");
      }
      format = opts.format;
    }
    const formatter = formatters[format];
    let filter = defaults.filter;
    if (typeof opts.filter === "function" || isArray(opts.filter)) {
      filter = opts.filter;
    }
    let arrayFormat;
    if (opts.arrayFormat && opts.arrayFormat in array_prefix_generators) {
      arrayFormat = opts.arrayFormat;
    } else if ("indices" in opts) {
      arrayFormat = opts.indices ? "indices" : "repeat";
    } else {
      arrayFormat = defaults.arrayFormat;
    }
    if ("commaRoundTrip" in opts && typeof opts.commaRoundTrip !== "boolean") {
      throw new TypeError("`commaRoundTrip` must be a boolean, or absent");
    }
    const allowDots = typeof opts.allowDots === "undefined" ? !!opts.encodeDotInKeys === true ? true : defaults.allowDots : !!opts.allowDots;
    return {
      addQueryPrefix: typeof opts.addQueryPrefix === "boolean" ? opts.addQueryPrefix : defaults.addQueryPrefix,
      // @ts-ignore
      allowDots,
      allowEmptyArrays: typeof opts.allowEmptyArrays === "boolean" ? !!opts.allowEmptyArrays : defaults.allowEmptyArrays,
      arrayFormat,
      charset,
      charsetSentinel: typeof opts.charsetSentinel === "boolean" ? opts.charsetSentinel : defaults.charsetSentinel,
      commaRoundTrip: !!opts.commaRoundTrip,
      delimiter: typeof opts.delimiter === "undefined" ? defaults.delimiter : opts.delimiter,
      encode: typeof opts.encode === "boolean" ? opts.encode : defaults.encode,
      encodeDotInKeys: typeof opts.encodeDotInKeys === "boolean" ? opts.encodeDotInKeys : defaults.encodeDotInKeys,
      encoder: typeof opts.encoder === "function" ? opts.encoder : defaults.encoder,
      encodeValuesOnly: typeof opts.encodeValuesOnly === "boolean" ? opts.encodeValuesOnly : defaults.encodeValuesOnly,
      filter,
      format,
      formatter,
      serializeDate: typeof opts.serializeDate === "function" ? opts.serializeDate : defaults.serializeDate,
      skipNulls: typeof opts.skipNulls === "boolean" ? opts.skipNulls : defaults.skipNulls,
      // @ts-ignore
      sort: typeof opts.sort === "function" ? opts.sort : null,
      strictNullHandling: typeof opts.strictNullHandling === "boolean" ? opts.strictNullHandling : defaults.strictNullHandling
    };
  }
  function stringify(object, opts = {}) {
    let obj = object;
    const options = normalize_stringify_options(opts);
    let obj_keys;
    let filter;
    if (typeof options.filter === "function") {
      filter = options.filter;
      obj = filter("", obj);
    } else if (isArray(options.filter)) {
      filter = options.filter;
      obj_keys = filter;
    }
    const keys = [];
    if (typeof obj !== "object" || obj === null) {
      return "";
    }
    const generateArrayPrefix = array_prefix_generators[options.arrayFormat];
    const commaRoundTrip = generateArrayPrefix === "comma" && options.commaRoundTrip;
    if (!obj_keys) {
      obj_keys = Object.keys(obj);
    }
    if (options.sort) {
      obj_keys.sort(options.sort);
    }
    const sideChannel = /* @__PURE__ */ new WeakMap();
    for (let i = 0; i < obj_keys.length; ++i) {
      const key = obj_keys[i];
      if (options.skipNulls && obj[key] === null) {
        continue;
      }
      push_to_array(keys, inner_stringify(
        obj[key],
        key,
        // @ts-expect-error
        generateArrayPrefix,
        commaRoundTrip,
        options.allowEmptyArrays,
        options.strictNullHandling,
        options.skipNulls,
        options.encodeDotInKeys,
        options.encode ? options.encoder : null,
        options.filter,
        options.sort,
        options.allowDots,
        options.serializeDate,
        options.format,
        options.formatter,
        options.encodeValuesOnly,
        options.charset,
        sideChannel
      ));
    }
    const joined = keys.join(options.delimiter);
    let prefix = options.addQueryPrefix === true ? "?" : "";
    if (options.charsetSentinel) {
      if (options.charset === "iso-8859-1") {
        prefix += "utf8=%26%2310003%3B&";
      } else {
        prefix += "utf8=%E2%9C%93&";
      }
    }
    return joined.length > 0 ? prefix + joined : "";
  }

  // node_modules/openai/internal/utils/query.mjs
  function stringifyQuery(query) {
    return stringify(query, { arrayFormat: "brackets" });
  }

  // node_modules/openai/internal/utils/bytes.mjs
  function concatBytes(buffers) {
    let length = 0;
    for (const buffer of buffers) {
      length += buffer.length;
    }
    const output = new Uint8Array(length);
    let index = 0;
    for (const buffer of buffers) {
      output.set(buffer, index);
      index += buffer.length;
    }
    return output;
  }
  var encodeUTF8_;
  function encodeUTF8(str2) {
    let encoder;
    return (encodeUTF8_ ?? (encoder = new globalThis.TextEncoder(), encodeUTF8_ = encoder.encode.bind(encoder)))(str2);
  }
  var decodeUTF8_;
  function decodeUTF8(bytes) {
    let decoder;
    return (decodeUTF8_ ?? (decoder = new globalThis.TextDecoder(), decodeUTF8_ = decoder.decode.bind(decoder)))(bytes);
  }

  // node_modules/openai/internal/decoders/line.mjs
  var _LineDecoder_buffer;
  var _LineDecoder_carriageReturnIndex;
  var LineDecoder = class {
    constructor() {
      _LineDecoder_buffer.set(this, void 0);
      _LineDecoder_carriageReturnIndex.set(this, void 0);
      __classPrivateFieldSet(this, _LineDecoder_buffer, new Uint8Array(), "f");
      __classPrivateFieldSet(this, _LineDecoder_carriageReturnIndex, null, "f");
    }
    decode(chunk) {
      if (chunk == null) {
        return [];
      }
      const binaryChunk = chunk instanceof ArrayBuffer ? new Uint8Array(chunk) : typeof chunk === "string" ? encodeUTF8(chunk) : chunk;
      __classPrivateFieldSet(this, _LineDecoder_buffer, concatBytes([__classPrivateFieldGet(this, _LineDecoder_buffer, "f"), binaryChunk]), "f");
      const lines = [];
      let patternIndex;
      while ((patternIndex = findNewlineIndex(__classPrivateFieldGet(this, _LineDecoder_buffer, "f"), __classPrivateFieldGet(this, _LineDecoder_carriageReturnIndex, "f"))) != null) {
        if (patternIndex.carriage && __classPrivateFieldGet(this, _LineDecoder_carriageReturnIndex, "f") == null) {
          __classPrivateFieldSet(this, _LineDecoder_carriageReturnIndex, patternIndex.index, "f");
          continue;
        }
        if (__classPrivateFieldGet(this, _LineDecoder_carriageReturnIndex, "f") != null && (patternIndex.index !== __classPrivateFieldGet(this, _LineDecoder_carriageReturnIndex, "f") + 1 || patternIndex.carriage)) {
          lines.push(decodeUTF8(__classPrivateFieldGet(this, _LineDecoder_buffer, "f").subarray(0, __classPrivateFieldGet(this, _LineDecoder_carriageReturnIndex, "f") - 1)));
          __classPrivateFieldSet(this, _LineDecoder_buffer, __classPrivateFieldGet(this, _LineDecoder_buffer, "f").subarray(__classPrivateFieldGet(this, _LineDecoder_carriageReturnIndex, "f")), "f");
          __classPrivateFieldSet(this, _LineDecoder_carriageReturnIndex, null, "f");
          continue;
        }
        const endIndex = __classPrivateFieldGet(this, _LineDecoder_carriageReturnIndex, "f") !== null ? patternIndex.preceding - 1 : patternIndex.preceding;
        const line = decodeUTF8(__classPrivateFieldGet(this, _LineDecoder_buffer, "f").subarray(0, endIndex));
        lines.push(line);
        __classPrivateFieldSet(this, _LineDecoder_buffer, __classPrivateFieldGet(this, _LineDecoder_buffer, "f").subarray(patternIndex.index), "f");
        __classPrivateFieldSet(this, _LineDecoder_carriageReturnIndex, null, "f");
      }
      return lines;
    }
    flush() {
      if (!__classPrivateFieldGet(this, _LineDecoder_buffer, "f").length) {
        return [];
      }
      return this.decode("\n");
    }
  };
  _LineDecoder_buffer = /* @__PURE__ */ new WeakMap(), _LineDecoder_carriageReturnIndex = /* @__PURE__ */ new WeakMap();
  LineDecoder.NEWLINE_CHARS = /* @__PURE__ */ new Set(["\n", "\r"]);
  LineDecoder.NEWLINE_REGEXP = /\r\n|[\n\r]/g;
  function findNewlineIndex(buffer, startIndex) {
    const newline = 10;
    const carriage = 13;
    for (let i = startIndex ?? 0; i < buffer.length; i++) {
      if (buffer[i] === newline) {
        return { preceding: i, index: i + 1, carriage: false };
      }
      if (buffer[i] === carriage) {
        return { preceding: i, index: i + 1, carriage: true };
      }
    }
    return null;
  }
  function findDoubleNewlineIndex(buffer) {
    const newline = 10;
    const carriage = 13;
    for (let i = 0; i < buffer.length - 1; i++) {
      if (buffer[i] === newline && buffer[i + 1] === newline) {
        return i + 2;
      }
      if (buffer[i] === carriage && buffer[i + 1] === carriage) {
        return i + 2;
      }
      if (buffer[i] === carriage && buffer[i + 1] === newline && i + 3 < buffer.length && buffer[i + 2] === carriage && buffer[i + 3] === newline) {
        return i + 4;
      }
    }
    return -1;
  }

  // node_modules/openai/internal/utils/log.mjs
  var levelNumbers = {
    off: 0,
    error: 200,
    warn: 300,
    info: 400,
    debug: 500
  };
  var parseLogLevel = (maybeLevel, sourceName, client) => {
    if (!maybeLevel) {
      return void 0;
    }
    if (hasOwn(levelNumbers, maybeLevel)) {
      return maybeLevel;
    }
    loggerFor(client).warn(`${sourceName} was set to ${JSON.stringify(maybeLevel)}, expected one of ${JSON.stringify(Object.keys(levelNumbers))}`);
    return void 0;
  };
  function noop() {
  }
  function makeLogFn(fnLevel, logger, logLevel) {
    if (!logger || levelNumbers[fnLevel] > levelNumbers[logLevel]) {
      return noop;
    } else {
      return logger[fnLevel].bind(logger);
    }
  }
  var noopLogger = {
    error: noop,
    warn: noop,
    info: noop,
    debug: noop
  };
  var cachedLoggers = /* @__PURE__ */ new WeakMap();
  function loggerFor(client) {
    const logger = client.logger;
    const logLevel = client.logLevel ?? "off";
    if (!logger) {
      return noopLogger;
    }
    const cachedLogger = cachedLoggers.get(logger);
    if (cachedLogger && cachedLogger[0] === logLevel) {
      return cachedLogger[1];
    }
    const levelLogger = {
      error: makeLogFn("error", logger, logLevel),
      warn: makeLogFn("warn", logger, logLevel),
      info: makeLogFn("info", logger, logLevel),
      debug: makeLogFn("debug", logger, logLevel)
    };
    cachedLoggers.set(logger, [logLevel, levelLogger]);
    return levelLogger;
  }
  var formatRequestDetails = (details) => {
    if (details.options) {
      details.options = { ...details.options };
      delete details.options["headers"];
    }
    if (details.headers) {
      details.headers = Object.fromEntries((details.headers instanceof Headers ? [...details.headers] : Object.entries(details.headers)).map(([name, value]) => [
        name,
        name.toLowerCase() === "authorization" || name.toLowerCase() === "api-key" || name.toLowerCase() === "x-api-key" || name.toLowerCase() === "x-amz-security-token" || name.toLowerCase() === "cookie" || name.toLowerCase() === "set-cookie" ? "***" : value
      ]));
    }
    if ("retryOfRequestLogID" in details) {
      if (details.retryOfRequestLogID) {
        details.retryOf = details.retryOfRequestLogID;
      }
      delete details.retryOfRequestLogID;
    }
    return details;
  };

  // node_modules/openai/core/streaming.mjs
  var _Stream_client;
  var Stream = class _Stream {
    constructor(iterator, controller, client) {
      this.iterator = iterator;
      _Stream_client.set(this, void 0);
      this.controller = controller;
      __classPrivateFieldSet(this, _Stream_client, client, "f");
    }
    static fromSSEResponse(response, controller, client, synthesizeEventData) {
      let consumed = false;
      const logger = client ? loggerFor(client) : console;
      async function* iterator() {
        if (consumed) {
          throw new OpenAIError("Cannot iterate over a consumed stream, use `.tee()` to split the stream.");
        }
        consumed = true;
        let done = false;
        try {
          for await (const sse of _iterSSEMessages(response, controller)) {
            if (done)
              continue;
            if (sse.data.startsWith("[DONE]")) {
              done = true;
              continue;
            }
            if (sse.event === null || !sse.event.startsWith("thread.")) {
              let data;
              try {
                data = JSON.parse(sse.data);
              } catch (e) {
                logger.error(`Could not parse message into JSON:`, sse.data);
                logger.error(`From chunk:`, sse.raw);
                throw e;
              }
              if (data && data.error) {
                throw new APIError(void 0, data.error, void 0, response.headers);
              }
              yield synthesizeEventData ? { event: sse.event, data } : data;
            } else {
              let data;
              try {
                data = JSON.parse(sse.data);
              } catch (e) {
                console.error(`Could not parse message into JSON:`, sse.data);
                console.error(`From chunk:`, sse.raw);
                throw e;
              }
              if (sse.event == "error") {
                throw new APIError(void 0, data.error, data.message, void 0);
              }
              yield { event: sse.event, data };
            }
          }
          done = true;
        } catch (e) {
          if (isAbortError(e))
            return;
          throw e;
        } finally {
          if (!done)
            controller.abort();
        }
      }
      return new _Stream(iterator, controller, client);
    }
    /**
     * Generates a Stream from a newline-separated ReadableStream
     * where each item is a JSON value.
     */
    static fromReadableStream(readableStream, controller, client) {
      let consumed = false;
      async function* iterLines() {
        const lineDecoder = new LineDecoder();
        const reader = readableStream.getReader();
        let closed = false;
        let cancelPromise;
        const cancel = () => {
          cancelPromise ?? (cancelPromise = reader.cancel());
          cancelPromise.catch(() => {
          });
        };
        controller.signal.addEventListener("abort", cancel, { once: true });
        try {
          if (controller.signal.aborted) {
            cancel();
            return;
          }
          while (true) {
            const { value: chunk, done } = await reader.read();
            if (done) {
              closed = true;
              break;
            }
            if (controller.signal.aborted)
              return;
            for (const line of lineDecoder.decode(chunk)) {
              if (controller.signal.aborted)
                return;
              yield line;
            }
          }
          if (controller.signal.aborted)
            return;
          for (const line of lineDecoder.flush()) {
            if (controller.signal.aborted)
              return;
            yield line;
          }
        } finally {
          controller.signal.removeEventListener("abort", cancel);
          if (!closed)
            cancel();
          reader.releaseLock();
        }
      }
      async function* iterator() {
        if (consumed) {
          throw new OpenAIError("Cannot iterate over a consumed stream, use `.tee()` to split the stream.");
        }
        consumed = true;
        let done = false;
        try {
          for await (const line of iterLines()) {
            if (done)
              continue;
            if (line)
              yield JSON.parse(line);
          }
          done = true;
        } catch (e) {
          if (controller.signal.aborted || isAbortError(e))
            return;
          throw e;
        } finally {
          if (!done)
            controller.abort();
        }
      }
      return new _Stream(iterator, controller, client);
    }
    [(_Stream_client = /* @__PURE__ */ new WeakMap(), Symbol.asyncIterator)]() {
      return this.iterator();
    }
    /**
     * Splits the stream into two streams which can be
     * independently read from at different speeds.
     */
    tee() {
      const left = [];
      const right = [];
      const iterator = this.iterator();
      const teeIterator = (queue) => {
        return {
          next: () => {
            if (queue.length === 0) {
              const result = iterator.next();
              left.push(result);
              right.push(result);
            }
            return queue.shift();
          }
        };
      };
      return [
        new _Stream(() => teeIterator(left), this.controller, __classPrivateFieldGet(this, _Stream_client, "f")),
        new _Stream(() => teeIterator(right), this.controller, __classPrivateFieldGet(this, _Stream_client, "f"))
      ];
    }
    /**
     * Converts this stream to a newline-separated ReadableStream of
     * JSON stringified values in the stream
     * which can be turned back into a Stream with `Stream.fromReadableStream()`.
     */
    toReadableStream() {
      const self = this;
      let iter;
      return makeReadableStream({
        async start() {
          iter = self[Symbol.asyncIterator]();
        },
        async pull(ctrl) {
          try {
            const { value, done } = await iter.next();
            if (done)
              return ctrl.close();
            const bytes = encodeUTF8(JSON.stringify(value) + "\n");
            ctrl.enqueue(bytes);
          } catch (err) {
            ctrl.error(err);
          }
        },
        async cancel() {
          await iter.return?.();
        }
      });
    }
  };
  async function* _iterSSEMessages(response, controller) {
    if (!response.body) {
      controller.abort();
      if (typeof globalThis.navigator !== "undefined" && globalThis.navigator.product === "ReactNative") {
        throw new OpenAIError(`The default react-native fetch implementation does not support streaming. Please use expo/fetch: https://docs.expo.dev/versions/latest/sdk/expo/#expofetch-api`);
      }
      throw new OpenAIError(`Attempted to iterate over a response with no body`);
    }
    const sseDecoder = new SSEDecoder();
    const lineDecoder = new LineDecoder();
    const iter = ReadableStreamToAsyncIterable(response.body);
    for await (const sseChunk of iterSSEChunks(iter)) {
      for (const line of lineDecoder.decode(sseChunk)) {
        const sse = sseDecoder.decode(line);
        if (sse)
          yield sse;
      }
    }
    for (const line of lineDecoder.flush()) {
      const sse = sseDecoder.decode(line);
      if (sse)
        yield sse;
    }
  }
  async function* iterSSEChunks(iterator) {
    let data = new Uint8Array();
    for await (const chunk of iterator) {
      if (chunk == null) {
        continue;
      }
      const binaryChunk = chunk instanceof ArrayBuffer ? new Uint8Array(chunk) : typeof chunk === "string" ? encodeUTF8(chunk) : chunk;
      let newData = new Uint8Array(data.length + binaryChunk.length);
      newData.set(data);
      newData.set(binaryChunk, data.length);
      data = newData;
      let patternIndex;
      while ((patternIndex = findDoubleNewlineIndex(data)) !== -1) {
        yield data.slice(0, patternIndex);
        data = data.slice(patternIndex);
      }
    }
    if (data.length > 0) {
      yield data;
    }
  }
  var SSEDecoder = class {
    constructor() {
      this.event = null;
      this.data = [];
      this.chunks = [];
    }
    decode(line) {
      if (line.endsWith("\r")) {
        line = line.substring(0, line.length - 1);
      }
      if (!line) {
        if (!this.event && !this.data.length)
          return null;
        const sse = {
          event: this.event,
          data: this.data.join("\n"),
          raw: this.chunks
        };
        this.event = null;
        this.data = [];
        this.chunks = [];
        return sse;
      }
      this.chunks.push(line);
      if (line.startsWith(":")) {
        return null;
      }
      let [fieldname, _, value] = partition(line, ":");
      if (value.startsWith(" ")) {
        value = value.substring(1);
      }
      if (fieldname === "event") {
        this.event = value;
      } else if (fieldname === "data") {
        this.data.push(value);
      }
      return null;
    }
  };
  function partition(str2, delimiter) {
    const index = str2.indexOf(delimiter);
    if (index !== -1) {
      return [str2.substring(0, index), delimiter, str2.substring(index + delimiter.length)];
    }
    return [str2, "", ""];
  }

  // node_modules/openai/internal/parse.mjs
  async function defaultParseResponse(client, props) {
    const { response, requestLogID, retryOfRequestLogID, startTime } = props;
    const body = await (async () => {
      if (props.options.stream) {
        loggerFor(client).debug("response", response.status, response.url, response.headers, response.body);
        if (props.options.__streamClass) {
          return props.options.__streamClass.fromSSEResponse(response, props.controller, client, props.options.__synthesizeEventData);
        }
        return Stream.fromSSEResponse(response, props.controller, client, props.options.__synthesizeEventData);
      }
      if (response.status === 204) {
        return null;
      }
      if (props.options.__binaryResponse) {
        return response;
      }
      const contentType = response.headers.get("content-type");
      const mediaType = contentType?.split(";")[0]?.trim();
      const isJSON = mediaType?.includes("application/json") || mediaType?.endsWith("+json");
      if (isJSON) {
        const contentLength = response.headers.get("content-length");
        if (contentLength === "0") {
          return void 0;
        }
        const json = await response.json();
        return addRequestID(json, response);
      }
      const text = await response.text();
      return text;
    })();
    loggerFor(client).debug(`[${requestLogID}] response parsed`, formatRequestDetails({
      retryOfRequestLogID,
      url: response.url,
      status: response.status,
      body,
      durationMs: Date.now() - startTime
    }));
    return body;
  }
  function addRequestID(value, response) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return value;
    }
    return Object.defineProperty(value, "_request_id", {
      value: response.headers.get("x-request-id"),
      enumerable: false
    });
  }

  // node_modules/openai/core/api-promise.mjs
  var _APIPromise_client;
  var APIPromise = class _APIPromise extends Promise {
    constructor(client, responsePromise, parseResponse2 = defaultParseResponse) {
      super((resolve) => {
        resolve(null);
      });
      this.responsePromise = responsePromise;
      this.parseResponse = parseResponse2;
      _APIPromise_client.set(this, void 0);
      __classPrivateFieldSet(this, _APIPromise_client, client, "f");
    }
    _thenUnwrap(transform) {
      return new _APIPromise(__classPrivateFieldGet(this, _APIPromise_client, "f"), this.responsePromise, async (client, props) => addRequestID(transform(await this.parseResponse(client, props), props), props.response));
    }
    /**
     * Gets the raw `Response` instance instead of parsing the response
     * data.
     *
     * If you want to parse the response body but still get the `Response`
     * instance, you can use {@link withResponse()}.
     *
     * 👋 Getting the wrong TypeScript type for `Response`?
     * Try setting `"moduleResolution": "NodeNext"` or add `"lib": ["DOM"]`
     * to your `tsconfig.json`.
     */
    asResponse() {
      return this.responsePromise.then((p) => p.response);
    }
    /**
     * Gets the parsed response data, the raw `Response` instance and the ID of the request,
     * returned via the X-Request-ID header which is useful for debugging requests and reporting
     * issues to OpenAI.
     *
     * If you just want to get the raw `Response` instance without parsing it,
     * you can use {@link asResponse()}.
     *
     * 👋 Getting the wrong TypeScript type for `Response`?
     * Try setting `"moduleResolution": "NodeNext"` or add `"lib": ["DOM"]`
     * to your `tsconfig.json`.
     */
    async withResponse() {
      const [data, response] = await Promise.all([this.parse(), this.asResponse()]);
      return { data, response, request_id: response.headers.get("x-request-id") };
    }
    parse() {
      if (!this.parsedPromise) {
        this.parsedPromise = this.responsePromise.then((data) => this.parseResponse(__classPrivateFieldGet(this, _APIPromise_client, "f"), data));
      }
      return this.parsedPromise;
    }
    then(onfulfilled, onrejected) {
      return this.parse().then(onfulfilled, onrejected);
    }
    catch(onrejected) {
      return this.parse().catch(onrejected);
    }
    finally(onfinally) {
      return this.parse().finally(onfinally);
    }
  };
  _APIPromise_client = /* @__PURE__ */ new WeakMap();

  // node_modules/openai/core/pagination.mjs
  var _AbstractPage_client;
  var AbstractPage = class {
    constructor(client, response, body, options) {
      _AbstractPage_client.set(this, void 0);
      __classPrivateFieldSet(this, _AbstractPage_client, client, "f");
      this.options = options;
      this.response = response;
      this.body = body;
    }
    hasNextPage() {
      const items = this.getPaginatedItems();
      if (!items.length)
        return false;
      return this.nextPageRequestOptions() != null;
    }
    async getNextPage() {
      const nextOptions = this.nextPageRequestOptions();
      if (!nextOptions) {
        throw new OpenAIError("No next page expected; please check `.hasNextPage()` before calling `.getNextPage()`.");
      }
      return await __classPrivateFieldGet(this, _AbstractPage_client, "f").requestAPIList(this.constructor, nextOptions);
    }
    async *iterPages() {
      let page = this;
      yield page;
      while (page.hasNextPage()) {
        page = await page.getNextPage();
        yield page;
      }
    }
    async *[(_AbstractPage_client = /* @__PURE__ */ new WeakMap(), Symbol.asyncIterator)]() {
      for await (const page of this.iterPages()) {
        for (const item of page.getPaginatedItems()) {
          yield item;
        }
      }
    }
  };
  var PagePromise = class extends APIPromise {
    constructor(client, request, Page2) {
      super(client, request, async (client2, props) => new Page2(client2, props.response, await defaultParseResponse(client2, props), props.options));
    }
    /**
     * Allow auto-paginating iteration on an unawaited list call, eg:
     *
     *    for await (const item of client.items.list()) {
     *      console.log(item)
     *    }
     */
    async *[Symbol.asyncIterator]() {
      const page = await this;
      for await (const item of page) {
        yield item;
      }
    }
  };
  var Page = class extends AbstractPage {
    constructor(client, response, body, options) {
      super(client, response, body, options);
      this.data = body.data || [];
      this.object = body.object;
    }
    getPaginatedItems() {
      return this.data ?? [];
    }
    nextPageRequestOptions() {
      return null;
    }
  };
  var CursorPage = class extends AbstractPage {
    constructor(client, response, body, options) {
      super(client, response, body, options);
      this.data = body.data || [];
      this.has_more = body.has_more || false;
    }
    getPaginatedItems() {
      return this.data ?? [];
    }
    hasNextPage() {
      if (this.has_more === false) {
        return false;
      }
      return super.hasNextPage();
    }
    nextPageRequestOptions() {
      const data = this.getPaginatedItems();
      const id = data[data.length - 1]?.id;
      if (!id) {
        return null;
      }
      return {
        ...this.options,
        query: {
          ...maybeObj(this.options.query),
          after: id
        }
      };
    }
  };
  var ConversationCursorPage = class extends AbstractPage {
    constructor(client, response, body, options) {
      super(client, response, body, options);
      this.data = body.data || [];
      this.has_more = body.has_more || false;
      this.last_id = body.last_id || "";
    }
    getPaginatedItems() {
      return this.data ?? [];
    }
    hasNextPage() {
      if (this.has_more === false) {
        return false;
      }
      return super.hasNextPage();
    }
    nextPageRequestOptions() {
      const cursor = this.last_id;
      if (!cursor) {
        return null;
      }
      return {
        ...this.options,
        query: {
          ...maybeObj(this.options.query),
          after: cursor
        }
      };
    }
  };
  var NextCursorPage = class extends AbstractPage {
    constructor(client, response, body, options) {
      super(client, response, body, options);
      this.data = body.data || [];
      this.has_more = body.has_more || false;
      this.next = body.next || null;
    }
    getPaginatedItems() {
      return this.data ?? [];
    }
    hasNextPage() {
      if (this.has_more === false) {
        return false;
      }
      return super.hasNextPage();
    }
    nextPageRequestOptions() {
      const cursor = this.next;
      if (!cursor) {
        return null;
      }
      return {
        ...this.options,
        query: {
          ...maybeObj(this.options.query),
          after: cursor
        }
      };
    }
  };

  // node_modules/openai/auth/workload-identity-auth.mjs
  var SUBJECT_TOKEN_TYPES = {
    jwt: "urn:ietf:params:oauth:token-type:jwt",
    id: "urn:ietf:params:oauth:token-type:id_token"
  };
  var TOKEN_EXCHANGE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:token-exchange";
  var WorkloadIdentityAuth = class {
    constructor(config, fetch2) {
      this.cachedToken = null;
      this.refreshPromise = null;
      this.tokenExchangeUrl = "https://auth.openai.com/oauth/token";
      this.config = config;
      this.fetch = fetch2 ?? getDefaultFetch();
    }
    async getToken() {
      if (!this.cachedToken || this.isTokenExpired(this.cachedToken)) {
        if (this.refreshPromise) {
          return await this.refreshPromise;
        }
        this.refreshPromise = this.refreshToken();
        try {
          const token = await this.refreshPromise;
          return token;
        } finally {
          this.refreshPromise = null;
        }
      }
      if (this.needsRefresh(this.cachedToken) && !this.refreshPromise) {
        this.refreshPromise = this.refreshToken().finally(() => {
          this.refreshPromise = null;
        });
      }
      return this.cachedToken.token;
    }
    async refreshToken() {
      const subjectToken = await this.config.provider.getToken();
      const body = {
        grant_type: TOKEN_EXCHANGE_GRANT_TYPE,
        subject_token: subjectToken,
        subject_token_type: SUBJECT_TOKEN_TYPES[this.config.provider.tokenType],
        identity_provider_id: this.config.identityProviderId,
        service_account_id: this.config.serviceAccountId
      };
      if (this.config.clientId) {
        body["client_id"] = this.config.clientId;
      }
      const response = await this.fetch(this.tokenExchangeUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        const errorText = await response.text();
        let body2 = void 0;
        try {
          body2 = JSON.parse(errorText);
        } catch {
        }
        if (response.status === 400 || response.status === 401 || response.status === 403) {
          throw new OAuthError(response.status, body2, response.headers);
        }
        throw APIError.generate(response.status, body2, `Token exchange failed with status ${response.status}`, response.headers);
      }
      const tokenResponse = await response.json();
      if (typeof tokenResponse !== "object" || tokenResponse === null || !("access_token" in tokenResponse) || typeof tokenResponse.access_token !== "string" || tokenResponse.access_token.trim().length === 0) {
        throw new OpenAIError("Token exchange response missing 'access_token' field");
      }
      const accessToken = tokenResponse.access_token;
      const expiresIn = tokenResponse.expires_in ?? 3600;
      const expiresAt = Date.now() + expiresIn * 1e3;
      this.cachedToken = {
        token: accessToken,
        expiresAt
      };
      return accessToken;
    }
    isTokenExpired(cachedToken) {
      return Date.now() >= cachedToken.expiresAt;
    }
    needsRefresh(cachedToken) {
      const bufferSeconds = this.config.refreshBufferSeconds ?? 1200;
      const bufferMs = bufferSeconds * 1e3;
      return Date.now() >= cachedToken.expiresAt - bufferMs;
    }
    invalidateToken() {
      this.cachedToken = null;
      this.refreshPromise = null;
    }
  };

  // node_modules/openai/internal/headers.mjs
  var brand_privateNullableHeaders = /* @__PURE__ */ Symbol("brand.privateNullableHeaders");
  var httpTokenHeaderName = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
  function* iterateHeaders(headers) {
    if (!headers)
      return;
    if (brand_privateNullableHeaders in headers) {
      const { values, nulls } = headers;
      yield* values.entries();
      for (const name of nulls) {
        yield [name, null];
      }
      return;
    }
    let shouldClear = false;
    let iter;
    if (headers instanceof Headers) {
      iter = headers.entries();
    } else if (isReadonlyArray(headers)) {
      iter = headers;
    } else {
      shouldClear = true;
      iter = Object.entries(headers ?? {});
    }
    for (let row of iter) {
      const name = row[0];
      if (typeof name !== "string")
        throw new TypeError("expected header name to be a string");
      const values = isReadonlyArray(row[1]) ? row[1] : [row[1]];
      let didClear = false;
      for (const value of values) {
        if (value === void 0)
          continue;
        if (shouldClear && !didClear) {
          didClear = true;
          yield [name, null];
        }
        yield [name, value];
      }
    }
  }
  var buildHeaders = (newHeaders) => {
    const targetHeaders = new Headers();
    const nullHeaders = /* @__PURE__ */ new Set();
    for (const headers of newHeaders) {
      const seenHeaders = /* @__PURE__ */ new Set();
      for (const [name, value] of iterateHeaders(headers)) {
        if (!httpTokenHeaderName.test(name)) {
          throw new TypeError(`Header name must be a valid HTTP token ["${name}"]`);
        }
        const lowerName = name.toLowerCase();
        if (!seenHeaders.has(lowerName)) {
          targetHeaders.delete(lowerName);
          seenHeaders.add(lowerName);
        }
        if (value === null) {
          targetHeaders.delete(lowerName);
          nullHeaders.add(lowerName);
        } else {
          targetHeaders.append(lowerName, value);
          nullHeaders.delete(lowerName);
        }
      }
    }
    return { [brand_privateNullableHeaders]: true, values: targetHeaders, nulls: nullHeaders };
  };

  // node_modules/openai/internal/uploads.mjs
  var brand_privateStreamingFile = /* @__PURE__ */ Symbol("brand.privateStreamingFile");
  function toStreamingFile(data, name, options) {
    if (!name) {
      throw new TypeError("toStreamingFile requires a non-empty file name");
    }
    return {
      [brand_privateStreamingFile]: true,
      data,
      name,
      ...options?.type ? { type: options.type } : {}
    };
  }
  var checkFileSupport = () => {
    if (typeof File === "undefined") {
      const { process: process2 } = globalThis;
      const isOldNode = typeof process2?.versions?.node === "string" && parseInt(process2.versions.node.split(".")) < 20;
      throw new Error("`File` is not defined as a global, which is required for file uploads." + (isOldNode ? " Update to a supported Node.js LTS release, or set `globalThis.File` to `import('node:buffer').File`." : ""));
    }
  };
  function makeFile(fileBits, fileName, options) {
    checkFileSupport();
    return new File(fileBits, fileName ?? "unknown_file", options);
  }
  function getName(value) {
    return (typeof value === "object" && value !== null && ("name" in value && value.name && String(value.name) || "url" in value && value.url && String(value.url) || "filename" in value && value.filename && String(value.filename) || "path" in value && value.path && String(value.path)) || "").split(/[\\/]/).pop() || void 0;
  }
  var isAsyncIterable = (value) => value != null && typeof value === "object" && typeof value[Symbol.asyncIterator] === "function";
  var maybeMultipartFormRequestOptions = async (opts, fetch2) => {
    if (!hasUploadableValue(opts.body))
      return opts;
    if (hasStreamingUploadableValue(opts.body)) {
      return createStreamingFormRequestOptions(opts);
    }
    return { ...opts, body: await createForm(opts.body, fetch2) };
  };
  var multipartFormRequestOptions = async (opts, fetch2) => {
    if (hasStreamingUploadableValue(opts.body)) {
      return createStreamingFormRequestOptions(opts);
    }
    return { ...opts, body: await createForm(opts.body, fetch2) };
  };
  var supportsFormDataMap = /* @__PURE__ */ new WeakMap();
  function supportsFormData(fetchObject) {
    const fetch2 = typeof fetchObject === "function" ? fetchObject : fetchObject.fetch;
    const cached = supportsFormDataMap.get(fetch2);
    if (cached)
      return cached;
    const promise = (async () => {
      try {
        const FetchResponse = "Response" in fetch2 ? fetch2.Response : (await fetch2("data:,")).constructor;
        const data = new FormData();
        if (data.toString() === await new FetchResponse(data).text()) {
          return false;
        }
        return true;
      } catch {
        return true;
      }
    })();
    supportsFormDataMap.set(fetch2, promise);
    return promise;
  }
  var createForm = async (body, fetch2) => {
    if (!await supportsFormData(fetch2)) {
      throw new TypeError("The provided fetch function does not support file uploads with the current global FormData class.");
    }
    const form = new FormData();
    await Promise.all(Object.entries(body || {}).map(([key, value]) => addFormValue(form, key, value)));
    return form;
  };
  var isNamedBlob = (value) => value instanceof Blob && "name" in value;
  var isReadableStream = (value) => typeof value === "object" && value !== null && "getReader" in value && typeof value.getReader === "function";
  var isStreamingFile = (value) => typeof value === "object" && value !== null && brand_privateStreamingFile in value;
  var isUploadable = (value) => typeof value === "object" && value !== null && (value instanceof Response || isAsyncIterable(value) || isReadableStream(value) || isStreamingFile(value) || isNamedBlob(value));
  var hasStreamingUploadableValue = (value) => {
    if (isStreamingFile(value) || isAsyncIterable(value) || isReadableStream(value))
      return true;
    if (Array.isArray(value))
      return value.some(hasStreamingUploadableValue);
    if (value && typeof value === "object" && !isNamedBlob(value) && !(value instanceof Response)) {
      for (const k in value) {
        if (hasStreamingUploadableValue(value[k]))
          return true;
      }
    }
    return false;
  };
  var hasUploadableValue = (value) => {
    if (isUploadable(value))
      return true;
    if (Array.isArray(value))
      return value.some(hasUploadableValue);
    if (value && typeof value === "object") {
      for (const k in value) {
        if (hasUploadableValue(value[k]))
          return true;
      }
    }
    return false;
  };
  var createStreamingFormRequestOptions = (opts) => {
    const boundary = `openai-${Math.random().toString(36).slice(2)}`;
    const body = ReadableStreamFrom(iterateMultipartBody(opts.body, boundary));
    return {
      ...opts,
      body,
      headers: buildHeaders([{ "content-type": `multipart/form-data; boundary=${boundary}` }, opts.headers])
    };
  };
  async function* iterateMultipartBody(body, boundary) {
    for await (const { key, value } of iterateFormEntries(body)) {
      yield encodeUTF8(`--${boundary}\r
`);
      if (isUploadable(value)) {
        const filename = getStreamingFileName(value);
        const type = getStreamingFileType(value);
        yield encodeUTF8(`Content-Disposition: form-data; name="${escapeHeaderValue(key)}"; filename="${escapeHeaderValue(filename)}"\r
Content-Type: ${type}\r
\r
`);
        yield* iterateBytes(getStreamingFileData(value));
      } else {
        yield encodeUTF8(`Content-Disposition: form-data; name="${escapeHeaderValue(key)}"\r
\r
${String(value)}`);
      }
      yield encodeUTF8("\r\n");
    }
    yield encodeUTF8(`--${boundary}--\r
`);
  }
  async function* iterateFormEntries(body) {
    if (!body || typeof body !== "object")
      return;
    for (const [key, value] of Object.entries(body)) {
      yield* iterateFormValue(key, value);
    }
  }
  async function* iterateFormValue(key, value) {
    if (value === void 0)
      return;
    if (value == null) {
      throw new TypeError(`Received null for "${key}"; to pass null in FormData, you must use the string 'null'`);
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || isUploadable(value)) {
      yield { key, value };
    } else if (Array.isArray(value)) {
      for (const entry of value) {
        yield* iterateFormValue(key + "[]", entry);
      }
    } else if (typeof value === "object") {
      for (const [name, prop] of Object.entries(value)) {
        yield* iterateFormValue(`${key}[${name}]`, prop);
      }
    } else {
      throw new TypeError(`Invalid value given to form, expected a string, number, boolean, object, Array, File or Blob but got ${value} instead`);
    }
  }
  function getStreamingFileName(value) {
    return isStreamingFile(value) ? value.name : getName(value) ?? "unknown_file";
  }
  function getStreamingFileType(value) {
    if (isStreamingFile(value))
      return value.type || "application/octet-stream";
    if (isNamedBlob(value) && value.type)
      return value.type;
    if (value instanceof Response)
      return value.headers.get("content-type") || "application/octet-stream";
    return "application/octet-stream";
  }
  function getStreamingFileData(value) {
    if (isStreamingFile(value))
      return value.data;
    return value;
  }
  async function* iterateBytes(value) {
    if (typeof value === "string") {
      yield encodeUTF8(value);
    } else if (ArrayBuffer.isView(value)) {
      yield new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    } else if (value instanceof ArrayBuffer) {
      yield new Uint8Array(value);
    } else if (value instanceof Response) {
      if (value.body) {
        yield* iterateBytes(value.body);
      } else {
        yield* iterateBytes(await value.blob());
      }
    } else if (value instanceof Blob) {
      if (typeof value.stream === "function") {
        yield* iterateBytes(value.stream());
      } else {
        yield new Uint8Array(await value.arrayBuffer());
      }
    } else if (isReadableStream(value)) {
      for await (const chunk of ReadableStreamToAsyncIterable(value)) {
        yield* iterateBytes(chunk);
      }
    } else if (isAsyncIterable(value)) {
      for await (const chunk of value) {
        yield* iterateBytes(chunk);
      }
    } else {
      throw new TypeError(`Invalid streaming file chunk: ${String(value)}`);
    }
  }
  function escapeHeaderValue(value) {
    return value.replace(/["\\\r\n]/g, (character) => encodeURIComponent(character));
  }
  var addFormValue = async (form, key, value) => {
    if (value === void 0)
      return;
    if (value == null) {
      throw new TypeError(`Received null for "${key}"; to pass null in FormData, you must use the string 'null'`);
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      form.append(key, String(value));
    } else if (value instanceof Response) {
      form.append(key, makeFile([await value.blob()], getName(value)));
    } else if (isAsyncIterable(value)) {
      form.append(key, makeFile([await new Response(ReadableStreamFrom(value)).blob()], getName(value)));
    } else if (isNamedBlob(value)) {
      form.append(key, value, getName(value));
    } else if (Array.isArray(value)) {
      await Promise.all(value.map((entry) => addFormValue(form, key + "[]", entry)));
    } else if (typeof value === "object") {
      await Promise.all(Object.entries(value).map(([name, prop]) => addFormValue(form, `${key}[${name}]`, prop)));
    } else {
      throw new TypeError(`Invalid value given to form, expected a string, number, boolean, object, Array, File or Blob but got ${value} instead`);
    }
  };

  // node_modules/openai/internal/to-file.mjs
  var isBlobLike = (value) => value != null && typeof value === "object" && typeof value.size === "number" && typeof value.type === "string" && typeof value.text === "function" && typeof value.slice === "function" && typeof value.arrayBuffer === "function";
  var isFileLike = (value) => value != null && typeof value === "object" && typeof value.name === "string" && typeof value.lastModified === "number" && isBlobLike(value);
  var isResponseLike = (value) => value != null && typeof value === "object" && typeof value.url === "string" && typeof value.blob === "function";
  async function toFile(value, name, options) {
    checkFileSupport();
    value = await value;
    if (isFileLike(value)) {
      if (value instanceof File) {
        return value;
      }
      return makeFile([await value.arrayBuffer()], value.name);
    }
    if (isResponseLike(value)) {
      const blob = await value.blob();
      name || (name = new URL(value.url).pathname.split(/[\\/]/).pop());
      return makeFile(await getBytes(blob), name, options);
    }
    const parts = await getBytes(value);
    name || (name = getName(value));
    if (!options?.type) {
      const type = parts.find((part) => typeof part === "object" && "type" in part && part.type);
      if (typeof type === "string") {
        options = { ...options, type };
      }
    }
    return makeFile(parts, name, options);
  }
  async function getBytes(value) {
    let parts = [];
    if (typeof value === "string" || ArrayBuffer.isView(value) || // includes Uint8Array, Buffer, etc.
    value instanceof ArrayBuffer) {
      parts.push(value);
    } else if (isBlobLike(value)) {
      parts.push(value instanceof Blob ? value : await value.arrayBuffer());
    } else if (isAsyncIterable(value)) {
      for await (const chunk of value) {
        parts.push(...await getBytes(chunk));
      }
    } else {
      const constructor = value?.constructor?.name;
      throw new Error(`Unexpected data type: ${typeof value}${constructor ? `; constructor: ${constructor}` : ""}${propsForError(value)}`);
    }
    return parts;
  }
  function propsForError(value) {
    if (typeof value !== "object" || value === null)
      return "";
    const props = Object.getOwnPropertyNames(value);
    return `; props: [${props.map((p) => `"${p}"`).join(", ")}]`;
  }

  // node_modules/openai/core/resource.mjs
  var APIResource = class {
    constructor(client) {
      this._client = client;
    }
  };

  // node_modules/openai/internal/utils/path.mjs
  function encodeURIPath(str2) {
    return str2.replace(/[^A-Za-z0-9\-._~!$&'()*+,;=:@]+/g, encodeURIComponent);
  }
  var EMPTY = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.create(null));
  var createPathTagFunction = (pathEncoder = encodeURIPath) => function path2(statics, ...params) {
    if (statics.length === 1)
      return statics[0];
    let postPath = false;
    const invalidSegments = [];
    const path3 = statics.reduce((previousValue, currentValue, index) => {
      if (/[?#]/.test(currentValue)) {
        postPath = true;
      }
      const value = params[index];
      let encoded = (postPath ? encodeURIComponent : pathEncoder)("" + value);
      if (index !== params.length && (value == null || typeof value === "object" && // handle values from other realms
      value.toString === Object.getPrototypeOf(Object.getPrototypeOf(value.hasOwnProperty ?? EMPTY) ?? EMPTY)?.toString)) {
        encoded = value + "";
        invalidSegments.push({
          start: previousValue.length + currentValue.length,
          length: encoded.length,
          error: `Value of type ${Object.prototype.toString.call(value).slice(8, -1)} is not a valid path parameter`
        });
      }
      return previousValue + currentValue + (index === params.length ? "" : encoded);
    }, "");
    const pathOnly = path3.split(/[?#]/, 1)[0];
    const invalidSegmentPattern = /(?<=^|\/)(?:\.|%2e){1,2}(?=\/|$)/gi;
    let match;
    while ((match = invalidSegmentPattern.exec(pathOnly)) !== null) {
      invalidSegments.push({
        start: match.index,
        length: match[0].length,
        error: `Value "${match[0]}" can't be safely passed as a path parameter`
      });
    }
    invalidSegments.sort((a, b) => a.start - b.start);
    if (invalidSegments.length > 0) {
      let lastEnd = 0;
      const underline = invalidSegments.reduce((acc, segment) => {
        const spaces = " ".repeat(segment.start - lastEnd);
        const arrows = "^".repeat(segment.length);
        lastEnd = segment.start + segment.length;
        return acc + spaces + arrows;
      }, "");
      throw new OpenAIError(`Path parameters result in path with invalid segments:
${invalidSegments.map((e) => e.error).join("\n")}
${path3}
${underline}`);
    }
    return path3;
  };
  var path = /* @__PURE__ */ createPathTagFunction(encodeURIPath);

  // node_modules/openai/resources/chat/completions/messages.mjs
  var Messages = class extends APIResource {
    /**
     * Get the messages in a stored chat completion. Only Chat Completions that have
     * been created with the `store` parameter set to `true` will be returned.
     *
     * @example
     * ```ts
     * // Automatically fetches more pages as needed.
     * for await (const chatCompletionStoreMessage of client.chat.completions.messages.list(
     *   'completion_id',
     * )) {
     *   // ...
     * }
     * ```
     */
    list(completionID, query = {}, options) {
      return this._client.getAPIList(path`/chat/completions/${completionID}/messages`, CursorPage, { query, ...options, __security: { bearerAuth: true } });
    }
  };

  // node_modules/openai/lib/parser.mjs
  function isChatCompletionFunctionTool(tool) {
    return tool !== void 0 && "function" in tool && tool.function !== void 0;
  }
  function isAutoParsableResponseFormat(response_format) {
    return response_format?.["$brand"] === "auto-parseable-response-format";
  }
  function isAutoParsableTool(tool) {
    return tool?.["$brand"] === "auto-parseable-tool";
  }
  function maybeParseChatCompletion(completion, params) {
    if (!params || !hasAutoParseableInput(params)) {
      return {
        ...completion,
        choices: completion.choices.map((choice) => {
          assertToolCallsAreChatCompletionFunctionToolCalls(choice.message.tool_calls);
          return {
            ...choice,
            message: {
              ...choice.message,
              parsed: null,
              ...choice.message.tool_calls ? {
                tool_calls: choice.message.tool_calls
              } : void 0
            }
          };
        })
      };
    }
    return parseChatCompletion(completion, params);
  }
  function parseChatCompletion(completion, params) {
    const choices = completion.choices.map((choice) => {
      if (choice.finish_reason === "length") {
        throw new LengthFinishReasonError();
      }
      if (choice.finish_reason === "content_filter") {
        throw new ContentFilterFinishReasonError();
      }
      assertToolCallsAreChatCompletionFunctionToolCalls(choice.message.tool_calls);
      return {
        ...choice,
        message: {
          ...choice.message,
          ...choice.message.tool_calls ? {
            tool_calls: choice.message.tool_calls?.map((toolCall) => parseToolCall(params, toolCall)) ?? void 0
          } : void 0,
          parsed: choice.message.content && !choice.message.refusal ? parseResponseFormat(params, choice.message.content) : null
        }
      };
    });
    return { ...completion, choices };
  }
  function parseResponseFormat(params, content) {
    if (params.response_format?.type !== "json_schema") {
      return null;
    }
    if (params.response_format?.type === "json_schema") {
      if ("$parseRaw" in params.response_format) {
        const response_format = params.response_format;
        return response_format.$parseRaw(content);
      }
      return JSON.parse(content);
    }
    return null;
  }
  function parseToolCall(params, toolCall) {
    const inputTool = params.tools?.find((inputTool2) => isChatCompletionFunctionTool(inputTool2) && inputTool2.function?.name === toolCall.function.name);
    return {
      ...toolCall,
      function: {
        ...toolCall.function,
        parsed_arguments: isAutoParsableTool(inputTool) ? inputTool.$parseRaw(toolCall.function.arguments) : inputTool?.function.strict ? JSON.parse(toolCall.function.arguments) : null
      }
    };
  }
  function shouldParseToolCall(params, toolCall) {
    if (!params || !("tools" in params) || !params.tools) {
      return false;
    }
    const inputTool = params.tools?.find((inputTool2) => isChatCompletionFunctionTool(inputTool2) && inputTool2.function?.name === toolCall.function.name);
    return isChatCompletionFunctionTool(inputTool) && (isAutoParsableTool(inputTool) || inputTool?.function.strict || false);
  }
  function hasAutoParseableInput(params) {
    if (isAutoParsableResponseFormat(params.response_format)) {
      return true;
    }
    return params.tools?.some((t) => isAutoParsableTool(t) || t.type === "function" && t.function.strict === true) ?? false;
  }
  function assertToolCallsAreChatCompletionFunctionToolCalls(toolCalls) {
    for (const toolCall of toolCalls || []) {
      if (toolCall.type !== "function") {
        throw new OpenAIError(`Currently only \`function\` tool calls are supported; Received \`${toolCall.type}\``);
      }
    }
  }
  function validateInputTools(tools) {
    for (const tool of tools ?? []) {
      if (tool.type !== "function") {
        throw new OpenAIError(`Currently only \`function\` tool types support auto-parsing; Received \`${tool.type}\``);
      }
      if (tool.function.strict !== true) {
        throw new OpenAIError(`The \`${tool.function.name}\` tool is not marked with \`strict: true\`. Only strict function tools can be auto-parsed`);
      }
    }
  }

  // node_modules/openai/lib/chatCompletionUtils.mjs
  var isAssistantMessage = (message) => {
    return message?.role === "assistant";
  };
  var isToolMessage = (message) => {
    return message?.role === "tool";
  };

  // node_modules/openai/lib/EventStream.mjs
  var _EventStream_instances;
  var _EventStream_connectedPromise;
  var _EventStream_resolveConnectedPromise;
  var _EventStream_rejectConnectedPromise;
  var _EventStream_endPromise;
  var _EventStream_resolveEndPromise;
  var _EventStream_rejectEndPromise;
  var _EventStream_listeners;
  var _EventStream_abortListeners;
  var _EventStream_ended;
  var _EventStream_errored;
  var _EventStream_aborted;
  var _EventStream_catchingPromiseCreated;
  var _EventStream_removeAbortListeners;
  var _EventStream_handleError;
  var EventStream = class {
    constructor() {
      _EventStream_instances.add(this);
      this.controller = new AbortController();
      _EventStream_connectedPromise.set(this, void 0);
      _EventStream_resolveConnectedPromise.set(this, () => {
      });
      _EventStream_rejectConnectedPromise.set(this, () => {
      });
      _EventStream_endPromise.set(this, void 0);
      _EventStream_resolveEndPromise.set(this, () => {
      });
      _EventStream_rejectEndPromise.set(this, () => {
      });
      _EventStream_listeners.set(this, {});
      _EventStream_abortListeners.set(this, []);
      _EventStream_ended.set(this, false);
      _EventStream_errored.set(this, false);
      _EventStream_aborted.set(this, false);
      _EventStream_catchingPromiseCreated.set(this, false);
      __classPrivateFieldSet(this, _EventStream_connectedPromise, new Promise((resolve, reject) => {
        __classPrivateFieldSet(this, _EventStream_resolveConnectedPromise, resolve, "f");
        __classPrivateFieldSet(this, _EventStream_rejectConnectedPromise, reject, "f");
      }), "f");
      __classPrivateFieldSet(this, _EventStream_endPromise, new Promise((resolve, reject) => {
        __classPrivateFieldSet(this, _EventStream_resolveEndPromise, resolve, "f");
        __classPrivateFieldSet(this, _EventStream_rejectEndPromise, reject, "f");
      }), "f");
      __classPrivateFieldGet(this, _EventStream_connectedPromise, "f").catch(() => {
      });
      __classPrivateFieldGet(this, _EventStream_endPromise, "f").catch(() => {
      });
    }
    _run(executor) {
      setTimeout(() => {
        Promise.resolve().then(executor).then(() => {
          try {
            this._emitFinal();
          } catch (error) {
            __classPrivateFieldGet(this, _EventStream_instances, "m", _EventStream_handleError).call(this, error);
            return;
          }
          this._emit("end");
        }, __classPrivateFieldGet(this, _EventStream_instances, "m", _EventStream_handleError).bind(this));
      }, 0);
    }
    _connected() {
      if (this.ended)
        return;
      __classPrivateFieldGet(this, _EventStream_resolveConnectedPromise, "f").call(this);
      this._emit("connect");
    }
    get ended() {
      return __classPrivateFieldGet(this, _EventStream_ended, "f");
    }
    get errored() {
      return __classPrivateFieldGet(this, _EventStream_errored, "f");
    }
    get aborted() {
      return __classPrivateFieldGet(this, _EventStream_aborted, "f");
    }
    abort() {
      this.controller.abort();
    }
    _listenForAbort(signal) {
      if (!signal || this.ended)
        return;
      if (signal.aborted) {
        this.controller.abort();
        return;
      }
      const listener = () => this.controller.abort();
      signal.addEventListener("abort", listener, { once: true });
      __classPrivateFieldGet(this, _EventStream_abortListeners, "f").push({ signal, listener });
    }
    /**
     * Adds the listener function to the end of the listeners array for the event.
     * No checks are made to see if the listener has already been added. Multiple calls passing
     * the same combination of event and listener will result in the listener being added, and
     * called, multiple times.
     * @returns this ChatCompletionStream, so that calls can be chained
     */
    on(event, listener) {
      const listeners = __classPrivateFieldGet(this, _EventStream_listeners, "f")[event] || (__classPrivateFieldGet(this, _EventStream_listeners, "f")[event] = []);
      listeners.push({ listener });
      return this;
    }
    /**
     * Removes the specified listener from the listener array for the event.
     * off() will remove, at most, one instance of a listener from the listener array. If any single
     * listener has been added multiple times to the listener array for the specified event, then
     * off() must be called multiple times to remove each instance.
     * @returns this ChatCompletionStream, so that calls can be chained
     */
    off(event, listener) {
      const listeners = __classPrivateFieldGet(this, _EventStream_listeners, "f")[event];
      if (!listeners)
        return this;
      const index = listeners.findIndex((l) => l.listener === listener);
      if (index >= 0)
        listeners.splice(index, 1);
      return this;
    }
    /**
     * Adds a one-time listener function for the event. The next time the event is triggered,
     * this listener is removed and then invoked.
     * @returns this ChatCompletionStream, so that calls can be chained
     */
    once(event, listener) {
      const listeners = __classPrivateFieldGet(this, _EventStream_listeners, "f")[event] || (__classPrivateFieldGet(this, _EventStream_listeners, "f")[event] = []);
      listeners.push({ listener, once: true });
      return this;
    }
    /**
     * This is similar to `.once()`, but returns a Promise that resolves the next time
     * the event is triggered, instead of calling a listener callback.
     * @returns a Promise that resolves the next time given event is triggered,
     * or rejects if an error is emitted.  (If you request the 'error' event,
     * returns a promise that resolves with the error).
     *
     * Example:
     *
     *   const message = await stream.emitted('message') // rejects if the stream errors
     */
    emitted(event) {
      return new Promise((resolve, reject) => {
        __classPrivateFieldSet(this, _EventStream_catchingPromiseCreated, true, "f");
        if (event !== "error")
          this.once("error", reject);
        this.once(event, resolve);
      });
    }
    /**
     * Returns an async iterator that yields every time the event is triggered.
     * The iterator ends when the stream ends and rejects if the stream errors
     * or is aborted. If you request the 'error' or 'abort' event, the iterator
     * yields that event instead of rejecting.
     *
     * Example:
     *
     *   for await (const [message] of stream.events('message')) {
     *     await processMessage(message);
     *   }
     */
    events(event) {
      const pushQueue = [];
      const readQueue = [];
      let ended = this.ended;
      let failure;
      let failureDelivered = false;
      const doneResult = () => ({ value: void 0, done: true });
      const finishReaders = () => {
        while (readQueue.length) {
          readQueue.shift().resolve(doneResult());
        }
      };
      const rejectReader = () => {
        if (!failure || failureDelivered || !readQueue.length)
          return;
        failureDelivered = true;
        readQueue.shift().reject(failure);
      };
      const cleanup = () => {
        this.off(event, onEvent);
        this.off("end", onEnd);
        if (event !== "error")
          this.off("error", onFailure);
        if (event !== "abort")
          this.off("abort", onFailure);
      };
      const onEvent = (...args) => {
        if (ended)
          return;
        const reader = readQueue.shift();
        if (reader) {
          reader.resolve({ value: args, done: false });
        } else {
          pushQueue.push(args);
        }
      };
      const onFailure = (error) => {
        failure = error;
        if (!pushQueue.length)
          rejectReader();
      };
      const onEnd = () => {
        ended = true;
        cleanup();
        if (!pushQueue.length) {
          rejectReader();
          finishReaders();
        }
      };
      if (!ended) {
        this.on(event, onEvent);
        this.on("end", onEnd);
        if (event !== "error")
          this.on("error", onFailure);
        if (event !== "abort")
          this.on("abort", onFailure);
      }
      return {
        next: () => {
          const value = pushQueue.shift();
          if (value)
            return Promise.resolve({ value, done: false });
          if (failure && !failureDelivered) {
            failureDelivered = true;
            return Promise.reject(failure);
          }
          if (ended)
            return Promise.resolve(doneResult());
          return new Promise((resolve, reject) => {
            readQueue.push({ resolve, reject });
          });
        },
        return: () => {
          ended = true;
          pushQueue.length = 0;
          cleanup();
          finishReaders();
          return Promise.resolve(doneResult());
        },
        [Symbol.asyncIterator]() {
          return this;
        }
      };
    }
    async done() {
      __classPrivateFieldSet(this, _EventStream_catchingPromiseCreated, true, "f");
      await __classPrivateFieldGet(this, _EventStream_endPromise, "f");
    }
    _emit(event, ...args) {
      if (__classPrivateFieldGet(this, _EventStream_ended, "f")) {
        return;
      }
      if (event === "end") {
        __classPrivateFieldGet(this, _EventStream_instances, "m", _EventStream_removeAbortListeners).call(this);
        __classPrivateFieldSet(this, _EventStream_ended, true, "f");
        __classPrivateFieldGet(this, _EventStream_resolveEndPromise, "f").call(this);
      }
      const listeners = __classPrivateFieldGet(this, _EventStream_listeners, "f")[event];
      if (listeners) {
        __classPrivateFieldGet(this, _EventStream_listeners, "f")[event] = listeners.filter((l) => !l.once);
        listeners.forEach(({ listener }) => listener(...args));
      }
      if (event === "abort") {
        const error = args[0];
        if (!__classPrivateFieldGet(this, _EventStream_catchingPromiseCreated, "f") && !listeners?.length) {
          Promise.reject(error);
        }
        __classPrivateFieldGet(this, _EventStream_rejectConnectedPromise, "f").call(this, error);
        __classPrivateFieldGet(this, _EventStream_rejectEndPromise, "f").call(this, error);
        this._emit("end");
        return;
      }
      if (event === "error") {
        const error = args[0];
        if (!__classPrivateFieldGet(this, _EventStream_catchingPromiseCreated, "f") && !listeners?.length) {
          Promise.reject(error);
        }
        __classPrivateFieldGet(this, _EventStream_rejectConnectedPromise, "f").call(this, error);
        __classPrivateFieldGet(this, _EventStream_rejectEndPromise, "f").call(this, error);
        this._emit("end");
      }
    }
    _emitFinal() {
    }
  };
  _EventStream_connectedPromise = /* @__PURE__ */ new WeakMap(), _EventStream_resolveConnectedPromise = /* @__PURE__ */ new WeakMap(), _EventStream_rejectConnectedPromise = /* @__PURE__ */ new WeakMap(), _EventStream_endPromise = /* @__PURE__ */ new WeakMap(), _EventStream_resolveEndPromise = /* @__PURE__ */ new WeakMap(), _EventStream_rejectEndPromise = /* @__PURE__ */ new WeakMap(), _EventStream_listeners = /* @__PURE__ */ new WeakMap(), _EventStream_abortListeners = /* @__PURE__ */ new WeakMap(), _EventStream_ended = /* @__PURE__ */ new WeakMap(), _EventStream_errored = /* @__PURE__ */ new WeakMap(), _EventStream_aborted = /* @__PURE__ */ new WeakMap(), _EventStream_catchingPromiseCreated = /* @__PURE__ */ new WeakMap(), _EventStream_instances = /* @__PURE__ */ new WeakSet(), _EventStream_removeAbortListeners = function _EventStream_removeAbortListeners2() {
    for (const { signal, listener } of __classPrivateFieldGet(this, _EventStream_abortListeners, "f").splice(0)) {
      signal.removeEventListener("abort", listener);
    }
  }, _EventStream_handleError = function _EventStream_handleError2(error) {
    __classPrivateFieldSet(this, _EventStream_errored, true, "f");
    if (error instanceof Error && error.name === "AbortError") {
      error = new APIUserAbortError();
    }
    if (error instanceof APIUserAbortError) {
      __classPrivateFieldSet(this, _EventStream_aborted, true, "f");
      return this._emit("abort", error);
    }
    if (error instanceof OpenAIError) {
      return this._emit("error", error);
    }
    if (error instanceof Error) {
      const openAIError = new OpenAIError(error.message);
      openAIError.cause = error;
      return this._emit("error", openAIError);
    }
    return this._emit("error", new OpenAIError(String(error)));
  };

  // node_modules/openai/lib/RunnableFunction.mjs
  function isRunnableFunctionWithParse(fn) {
    return typeof fn.parse === "function";
  }

  // node_modules/openai/lib/AbstractChatCompletionRunner.mjs
  var _AbstractChatCompletionRunner_instances;
  var _AbstractChatCompletionRunner_getFinalContent;
  var _AbstractChatCompletionRunner_getFinalMessage;
  var _AbstractChatCompletionRunner_getFinalFunctionToolCall;
  var _AbstractChatCompletionRunner_getFinalFunctionToolCallResult;
  var _AbstractChatCompletionRunner_calculateTotalUsage;
  var _AbstractChatCompletionRunner_validateParams;
  var _AbstractChatCompletionRunner_stringifyFunctionCallResult;
  var DEFAULT_MAX_CHAT_COMPLETIONS = 10;
  function normalizeToolCallIds(chatCompletion) {
    for (const choice of chatCompletion.choices) {
      for (const toolCall of choice.message.tool_calls ?? []) {
        if (!toolCall.id) {
          toolCall.id = `call_${uuid4()}`;
        }
      }
    }
  }
  function toRequestMessage(message) {
    if (!isAssistantMessage(message))
      return message;
    const requestMessage = { role: "assistant" };
    if (message.audio != null)
      requestMessage.audio = { id: message.audio.id };
    if (message.content !== void 0)
      requestMessage.content = message.content;
    if (message.function_call != null)
      requestMessage.function_call = message.function_call;
    if (message.name !== void 0)
      requestMessage.name = message.name;
    if (message.refusal != null)
      requestMessage.refusal = message.refusal;
    if (message.tool_calls !== void 0) {
      requestMessage.tool_calls = message.tool_calls.map((toolCall) => {
        if (toolCall.type === "custom") {
          return {
            id: toolCall.id,
            type: toolCall.type,
            custom: {
              input: toolCall.custom.input,
              name: toolCall.custom.name
            }
          };
        }
        return {
          id: toolCall.id,
          type: toolCall.type,
          function: {
            arguments: toolCall.function.arguments,
            name: toolCall.function.name
          }
        };
      });
    }
    return requestMessage;
  }
  var AbstractChatCompletionRunner = class extends EventStream {
    constructor() {
      super(...arguments);
      _AbstractChatCompletionRunner_instances.add(this);
      this._chatCompletions = [];
      this.messages = [];
    }
    _addChatCompletion(chatCompletion) {
      normalizeToolCallIds(chatCompletion);
      this._chatCompletions.push(chatCompletion);
      this._emit("chatCompletion", chatCompletion);
      const message = chatCompletion.choices[0]?.message;
      if (message)
        this._addMessage(message);
      return chatCompletion;
    }
    _addMessage(message, emit = true) {
      if (!("content" in message))
        message.content = null;
      this.messages.push(message);
      if (emit) {
        this._emit("message", message);
        if (isToolMessage(message) && message.content) {
          this._emit("functionToolCallResult", message.content);
        } else if (isAssistantMessage(message) && message.tool_calls) {
          for (const tool_call of message.tool_calls) {
            if (tool_call.type === "function") {
              this._emit("functionToolCall", tool_call.function);
            }
          }
        }
      }
    }
    /**
     * @returns a promise that resolves with the final ChatCompletion, or rejects
     * if an error occurred or the stream ended prematurely without producing a ChatCompletion.
     */
    async finalChatCompletion() {
      await this.done();
      const completion = this._chatCompletions[this._chatCompletions.length - 1];
      if (!completion)
        throw new OpenAIError("stream ended without producing a ChatCompletion");
      return completion;
    }
    /**
     * @returns a promise that resolves with the content of the final ChatCompletionMessage, or rejects
     * if an error occurred or the stream ended prematurely without producing a ChatCompletionMessage.
     */
    async finalContent() {
      await this.done();
      return __classPrivateFieldGet(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_getFinalContent).call(this);
    }
    /**
     * @returns a promise that resolves with the final assistant ChatCompletionMessage response,
     * or rejects if an error occurred or the stream ended prematurely without producing a ChatCompletionMessage.
     */
    async finalMessage() {
      await this.done();
      return __classPrivateFieldGet(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_getFinalMessage).call(this);
    }
    /**
     * @returns a promise that resolves with the content of the final FunctionCall, or rejects
     * if an error occurred or the stream ended prematurely without producing a ChatCompletionMessage.
     */
    async finalFunctionToolCall() {
      await this.done();
      return __classPrivateFieldGet(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_getFinalFunctionToolCall).call(this);
    }
    async finalFunctionToolCallResult() {
      await this.done();
      return __classPrivateFieldGet(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_getFinalFunctionToolCallResult).call(this);
    }
    async totalUsage() {
      await this.done();
      return __classPrivateFieldGet(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_calculateTotalUsage).call(this);
    }
    allChatCompletions() {
      return [...this._chatCompletions];
    }
    _emitFinal() {
      const completion = this._chatCompletions[this._chatCompletions.length - 1];
      if (completion)
        this._emit("finalChatCompletion", completion);
      const finalMessage = __classPrivateFieldGet(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_getFinalMessage).call(this);
      if (finalMessage)
        this._emit("finalMessage", finalMessage);
      const finalContent = __classPrivateFieldGet(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_getFinalContent).call(this);
      if (finalContent)
        this._emit("finalContent", finalContent);
      const finalFunctionCall = __classPrivateFieldGet(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_getFinalFunctionToolCall).call(this);
      if (finalFunctionCall)
        this._emit("finalFunctionToolCall", finalFunctionCall);
      const finalFunctionCallResult = __classPrivateFieldGet(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_getFinalFunctionToolCallResult).call(this);
      if (finalFunctionCallResult != null)
        this._emit("finalFunctionToolCallResult", finalFunctionCallResult);
      if (this._chatCompletions.some((c) => c.usage)) {
        this._emit("totalUsage", __classPrivateFieldGet(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_calculateTotalUsage).call(this));
      }
    }
    async _createChatCompletion(client, params, options) {
      this._listenForAbort(options?.signal);
      __classPrivateFieldGet(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_validateParams).call(this, params);
      const chatCompletion = await client.chat.completions.create({ ...params, stream: false }, { ...options, signal: this.controller.signal });
      this._connected();
      return this._addChatCompletion(parseChatCompletion(chatCompletion, params));
    }
    async _runChatCompletion(client, params, options) {
      for (const message of params.messages) {
        this._addMessage(message, false);
      }
      return await this._createChatCompletion(client, params, options);
    }
    async _runTools(client, params, runner, options) {
      const role = "tool";
      const { tool_choice = "auto", stream, toolContext: inputToolContext, ...restParams } = params;
      const toolContext = inputToolContext;
      const singleFunctionToCall = typeof tool_choice !== "string" && tool_choice.type === "function" && tool_choice?.function?.name;
      const { maxChatCompletions = DEFAULT_MAX_CHAT_COMPLETIONS, afterCompletion } = options || {};
      const inputTools = params.tools.map((tool) => {
        if (isAutoParsableTool(tool)) {
          if (!tool.$callback) {
            throw new OpenAIError("Tool given to `.runTools()` that does not have an associated function");
          }
          return {
            type: "function",
            function: {
              function: tool.$callback,
              name: tool.function.name,
              description: tool.function.description || "",
              parameters: tool.function.parameters,
              parse: tool.$parseRaw,
              strict: true
            }
          };
        }
        return tool;
      });
      const functionsByName = {};
      for (const f of inputTools) {
        if (f.type === "function") {
          functionsByName[f.function.name || f.function.function.name] = f.function;
        }
      }
      const tools = "tools" in params ? inputTools.map((t) => t.type === "function" ? {
        type: "function",
        function: {
          name: t.function.name || t.function.function.name,
          parameters: t.function.parameters,
          description: t.function.description,
          strict: t.function.strict
        }
      } : t) : void 0;
      for (const message of params.messages) {
        this._addMessage(message, false);
      }
      const runToolCall = async (toolCall) => {
        if (toolCall.type !== "function")
          return { message: void 0, functionCalled: false };
        const tool_call_id = toolCall.id;
        const { name, arguments: args } = toolCall.function;
        const fn = functionsByName[name];
        if (!fn) {
          const content2 = `Invalid tool_call: ${JSON.stringify(name)}. Available options are: ${Object.keys(functionsByName).map((name2) => JSON.stringify(name2)).join(", ")}. Please try again`;
          return { message: { role, tool_call_id, content: content2 }, functionCalled: false };
        }
        if (singleFunctionToCall && singleFunctionToCall !== name) {
          const content2 = `Invalid tool_call: ${JSON.stringify(name)}. ${JSON.stringify(singleFunctionToCall)} requested. Please try again`;
          return { message: { role, tool_call_id, content: content2 }, functionCalled: false };
        }
        let rawContent;
        if (isRunnableFunctionWithParse(fn)) {
          let parsed;
          try {
            parsed = await fn.parse(args);
          } catch (error) {
            const content2 = error instanceof Error ? error.message : String(error);
            return { message: { role, tool_call_id, content: content2 }, functionCalled: false };
          }
          rawContent = await fn.function(parsed, runner, toolContext);
        } else {
          rawContent = await fn.function(args, runner, toolContext);
        }
        const content = __classPrivateFieldGet(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_stringifyFunctionCallResult).call(this, rawContent);
        return { message: { role, tool_call_id, content }, functionCalled: true };
      };
      for (let i = 0; i < maxChatCompletions; ++i) {
        const chatCompletion = await this._createChatCompletion(client, {
          ...restParams,
          tool_choice,
          tools,
          messages: this.messages.map(toRequestMessage)
        }, options);
        const message = chatCompletion.choices[0]?.message;
        if (!message) {
          throw new OpenAIError(`missing message in ChatCompletion response`);
        }
        if (!message.tool_calls?.length) {
          await afterCompletion?.(chatCompletion, runner);
          return;
        }
        if (singleFunctionToCall || params.parallel_tool_calls === false) {
          for (const toolCall of message.tool_calls) {
            const result = await runToolCall(toolCall);
            if (result.message)
              this._addMessage(result.message);
            if (singleFunctionToCall && result.functionCalled) {
              await afterCompletion?.(chatCompletion, runner);
              return;
            }
          }
        } else {
          const results = await Promise.allSettled(message.tool_calls.map(runToolCall));
          for (const result of results) {
            if (result.status === "rejected")
              throw result.reason;
          }
          for (const result of results) {
            if (result.status === "fulfilled" && result.value.message) {
              this._addMessage(result.value.message);
            }
          }
        }
        await afterCompletion?.(chatCompletion, runner);
      }
      return;
    }
  };
  _AbstractChatCompletionRunner_instances = /* @__PURE__ */ new WeakSet(), _AbstractChatCompletionRunner_getFinalContent = function _AbstractChatCompletionRunner_getFinalContent2() {
    return __classPrivateFieldGet(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_getFinalMessage).call(this).content ?? null;
  }, _AbstractChatCompletionRunner_getFinalMessage = function _AbstractChatCompletionRunner_getFinalMessage2() {
    let i = this.messages.length;
    while (i-- > 0) {
      const message = this.messages[i];
      if (isAssistantMessage(message)) {
        const ret = {
          ...message,
          content: message.content ?? null,
          refusal: message.refusal ?? null
        };
        return ret;
      }
    }
    throw new OpenAIError("stream ended without producing a ChatCompletionMessage with role=assistant");
  }, _AbstractChatCompletionRunner_getFinalFunctionToolCall = function _AbstractChatCompletionRunner_getFinalFunctionToolCall2() {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const message = this.messages[i];
      if (isAssistantMessage(message) && message?.tool_calls?.length) {
        for (let j = message.tool_calls.length - 1; j >= 0; j--) {
          const toolCall = message.tool_calls[j];
          if (toolCall?.type === "function") {
            return toolCall.function;
          }
        }
      }
    }
    return;
  }, _AbstractChatCompletionRunner_getFinalFunctionToolCallResult = function _AbstractChatCompletionRunner_getFinalFunctionToolCallResult2() {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const message = this.messages[i];
      if (isToolMessage(message) && message.content != null && typeof message.content === "string" && this.messages.some((x) => x.role === "assistant" && x.tool_calls?.some((y) => y.type === "function" && y.id === message.tool_call_id))) {
        return message.content;
      }
    }
    return;
  }, _AbstractChatCompletionRunner_calculateTotalUsage = function _AbstractChatCompletionRunner_calculateTotalUsage2() {
    const total = {
      completion_tokens: 0,
      prompt_tokens: 0,
      total_tokens: 0
    };
    for (const { usage } of this._chatCompletions) {
      if (usage) {
        total.completion_tokens += usage.completion_tokens;
        total.prompt_tokens += usage.prompt_tokens;
        total.total_tokens += usage.total_tokens;
      }
    }
    return total;
  }, _AbstractChatCompletionRunner_validateParams = function _AbstractChatCompletionRunner_validateParams2(params) {
    if (params.n != null && params.n > 1) {
      throw new OpenAIError("ChatCompletion convenience helpers only support n=1 at this time. To use n>1, please use chat.completions.create() directly.");
    }
  }, _AbstractChatCompletionRunner_stringifyFunctionCallResult = function _AbstractChatCompletionRunner_stringifyFunctionCallResult2(rawContent) {
    return typeof rawContent === "string" ? rawContent : rawContent === void 0 ? "undefined" : JSON.stringify(rawContent);
  };

  // node_modules/openai/lib/ChatCompletionRunner.mjs
  var ChatCompletionRunner = class _ChatCompletionRunner extends AbstractChatCompletionRunner {
    static runTools(client, params, options) {
      const runner = new _ChatCompletionRunner();
      const opts = {
        ...options,
        headers: { ...options?.headers, "X-Stainless-Helper-Method": "runTools" }
      };
      runner._run(() => runner._runTools(client, params, runner, opts));
      return runner;
    }
    _addMessage(message, emit = true) {
      super._addMessage(message, emit);
      if (isAssistantMessage(message) && message.content) {
        this._emit("content", message.content);
      }
    }
  };

  // node_modules/openai/_vendor/partial-json-parser/parser.mjs
  var STR = 1;
  var NUM = 2;
  var ARR = 4;
  var OBJ = 8;
  var NULL = 16;
  var BOOL = 32;
  var NAN = 64;
  var INFINITY = 128;
  var MINUS_INFINITY = 256;
  var INF = INFINITY | MINUS_INFINITY;
  var SPECIAL = NULL | BOOL | INF | NAN;
  var ATOM = STR | NUM | SPECIAL;
  var COLLECTION = ARR | OBJ;
  var ALL = ATOM | COLLECTION;
  var Allow = {
    STR,
    NUM,
    ARR,
    OBJ,
    NULL,
    BOOL,
    NAN,
    INFINITY,
    MINUS_INFINITY,
    INF,
    SPECIAL,
    ATOM,
    COLLECTION,
    ALL
  };
  var PartialJSON = class extends Error {
  };
  var MalformedJSON = class extends Error {
  };
  function parseJSON(jsonString, allowPartial = Allow.ALL) {
    if (typeof jsonString !== "string") {
      throw new TypeError(`expecting str, got ${typeof jsonString}`);
    }
    if (!jsonString.trim()) {
      throw new Error(`${jsonString} is empty`);
    }
    return _parseJSON(jsonString.trim(), allowPartial);
  }
  var _parseJSON = (jsonString, allow) => {
    const length = jsonString.length;
    let index = 0;
    const markPartialJSON = (msg) => {
      throw new PartialJSON(`${msg} at position ${index}`);
    };
    const throwMalformedError = (msg) => {
      throw new MalformedJSON(`${msg} at position ${index}`);
    };
    const parseAny = () => {
      skipBlank();
      if (index >= length)
        markPartialJSON("Unexpected end of input");
      if (jsonString[index] === '"')
        return parseStr();
      if (jsonString[index] === "{")
        return parseObj();
      if (jsonString[index] === "[")
        return parseArr();
      if (jsonString.substring(index, index + 4) === "null" || Allow.NULL & allow && length - index < 4 && "null".startsWith(jsonString.substring(index))) {
        index += 4;
        return null;
      }
      if (jsonString.substring(index, index + 4) === "true" || Allow.BOOL & allow && length - index < 4 && "true".startsWith(jsonString.substring(index))) {
        index += 4;
        return true;
      }
      if (jsonString.substring(index, index + 5) === "false" || Allow.BOOL & allow && length - index < 5 && "false".startsWith(jsonString.substring(index))) {
        index += 5;
        return false;
      }
      if (jsonString.substring(index, index + 8) === "Infinity" || Allow.INFINITY & allow && length - index < 8 && "Infinity".startsWith(jsonString.substring(index))) {
        index += 8;
        return Infinity;
      }
      if (jsonString.substring(index, index + 9) === "-Infinity" || Allow.MINUS_INFINITY & allow && 1 < length - index && length - index < 9 && "-Infinity".startsWith(jsonString.substring(index))) {
        index += 9;
        return -Infinity;
      }
      if (jsonString.substring(index, index + 3) === "NaN" || Allow.NAN & allow && length - index < 3 && "NaN".startsWith(jsonString.substring(index))) {
        index += 3;
        return NaN;
      }
      return parseNum();
    };
    const parseStr = () => {
      const start = index;
      let escape2 = false;
      index++;
      while (index < length && (jsonString[index] !== '"' || escape2 && jsonString[index - 1] === "\\")) {
        escape2 = jsonString[index] === "\\" ? !escape2 : false;
        index++;
      }
      if (jsonString.charAt(index) == '"') {
        try {
          return JSON.parse(jsonString.substring(start, ++index - Number(escape2)));
        } catch (e) {
          throwMalformedError(String(e));
        }
      } else if (Allow.STR & allow) {
        try {
          return JSON.parse(jsonString.substring(start, index - Number(escape2)) + '"');
        } catch (e) {
          return JSON.parse(jsonString.substring(start, jsonString.lastIndexOf("\\")) + '"');
        }
      }
      markPartialJSON("Unterminated string literal");
    };
    const parseObj = () => {
      index++;
      skipBlank();
      const obj = {};
      try {
        while (jsonString[index] !== "}") {
          skipBlank();
          if (index >= length && Allow.OBJ & allow)
            return obj;
          const key = parseStr();
          skipBlank();
          index++;
          try {
            const value = parseAny();
            Object.defineProperty(obj, key, { value, writable: true, enumerable: true, configurable: true });
          } catch (e) {
            if (Allow.OBJ & allow)
              return obj;
            else
              throw e;
          }
          skipBlank();
          if (jsonString[index] === ",")
            index++;
        }
      } catch (e) {
        if (Allow.OBJ & allow)
          return obj;
        else
          markPartialJSON("Expected '}' at end of object");
      }
      index++;
      return obj;
    };
    const parseArr = () => {
      index++;
      const arr = [];
      try {
        while (jsonString[index] !== "]") {
          arr.push(parseAny());
          skipBlank();
          if (jsonString[index] === ",") {
            index++;
          }
        }
      } catch (e) {
        if (Allow.ARR & allow) {
          return arr;
        }
        markPartialJSON("Expected ']' at end of array");
      }
      index++;
      return arr;
    };
    const parseNum = () => {
      if (index === 0) {
        if (jsonString === "-" && Allow.NUM & allow)
          markPartialJSON("Not sure what '-' is");
        try {
          return JSON.parse(jsonString);
        } catch (e) {
          if (Allow.NUM & allow) {
            try {
              if ("." === jsonString[jsonString.length - 1])
                return JSON.parse(jsonString.substring(0, jsonString.lastIndexOf(".")));
              return JSON.parse(jsonString.substring(0, jsonString.lastIndexOf("e")));
            } catch (e2) {
            }
          }
          throwMalformedError(String(e));
        }
      }
      const start = index;
      if (jsonString[index] === "-")
        index++;
      while (jsonString[index] && !",]}".includes(jsonString[index]))
        index++;
      if (index == length && !(Allow.NUM & allow))
        markPartialJSON("Unterminated number literal");
      try {
        return JSON.parse(jsonString.substring(start, index));
      } catch (e) {
        if (jsonString.substring(start, index) === "-" && Allow.NUM & allow)
          markPartialJSON("Not sure what '-' is");
        try {
          return JSON.parse(jsonString.substring(start, jsonString.lastIndexOf("e")));
        } catch (e2) {
          throwMalformedError(String(e2));
        }
      }
    };
    const skipBlank = () => {
      while (index < length && " \n\r	".includes(jsonString[index])) {
        index++;
      }
    };
    return parseAny();
  };
  var partialParse = (input) => parseJSON(input, Allow.ALL ^ Allow.NUM);

  // node_modules/openai/lib/ChatCompletionStream.mjs
  var _ChatCompletionStream_instances;
  var _ChatCompletionStream_params;
  var _ChatCompletionStream_audioDoneChoiceIndexes;
  var _ChatCompletionStream_choiceEventStates;
  var _ChatCompletionStream_currentChatCompletionSnapshot;
  var _ChatCompletionStream_beginRequest;
  var _ChatCompletionStream_getChoiceEventState;
  var _ChatCompletionStream_addChunk;
  var _ChatCompletionStream_emitToolCallDoneEvent;
  var _ChatCompletionStream_emitContentDoneEvents;
  var _ChatCompletionStream_endRequest;
  var _ChatCompletionStream_getAutoParseableResponseFormat;
  var _ChatCompletionStream_accumulateChatCompletion;
  var CHAT_COMPLETION_READABLE_STREAM_MESSAGE_PREFIX = "chat.completion.chunk.message:";
  function makeChatCompletionReadableStreamMessageChunk(chunk, message, toolCallIds) {
    const payload = {
      type: "message",
      message,
      ...toolCallIds ? { tool_call_ids: toolCallIds } : {}
    };
    return {
      id: chunk.id,
      choices: [],
      created: chunk.created,
      model: chunk.model,
      object: `${CHAT_COMPLETION_READABLE_STREAM_MESSAGE_PREFIX}${JSON.stringify(payload)}`
    };
  }
  function isChatCompletionReadableStreamMessage(item) {
    return "type" in item && item.type === "message" && "message" in item || "object" in item && typeof item.object === "string" && item.object.startsWith(CHAT_COMPLETION_READABLE_STREAM_MESSAGE_PREFIX);
  }
  function getChatCompletionReadableStreamMessage(item) {
    if ("type" in item) {
      return item;
    }
    return JSON.parse(item.object.slice(CHAT_COMPLETION_READABLE_STREAM_MESSAGE_PREFIX.length));
  }
  var ChatCompletionStream = class _ChatCompletionStream extends AbstractChatCompletionRunner {
    constructor(params) {
      super();
      _ChatCompletionStream_instances.add(this);
      _ChatCompletionStream_params.set(this, void 0);
      _ChatCompletionStream_audioDoneChoiceIndexes.set(this, void 0);
      _ChatCompletionStream_choiceEventStates.set(this, void 0);
      _ChatCompletionStream_currentChatCompletionSnapshot.set(this, void 0);
      __classPrivateFieldSet(this, _ChatCompletionStream_params, params, "f");
      __classPrivateFieldSet(this, _ChatCompletionStream_audioDoneChoiceIndexes, /* @__PURE__ */ new Set(), "f");
      __classPrivateFieldSet(this, _ChatCompletionStream_choiceEventStates, [], "f");
    }
    get currentChatCompletionSnapshot() {
      return __classPrivateFieldGet(this, _ChatCompletionStream_currentChatCompletionSnapshot, "f");
    }
    /**
     * Intended for use on the frontend, consuming a stream produced with
     * `.toReadableStream()` on the backend.
     *
     * Note that messages sent to the model do not appear in `.on('message')`
     * in this context.
     */
    static fromReadableStream(stream) {
      const runner = new _ChatCompletionStream(null);
      runner._run(() => runner._fromReadableStream(stream));
      return runner;
    }
    static createChatCompletion(client, params, options) {
      const runner = new _ChatCompletionStream(params);
      runner._run(() => runner._runChatCompletion(client, { ...params, stream: true }, { ...options, headers: { ...options?.headers, "X-Stainless-Helper-Method": "stream" } }));
      return runner;
    }
    async _createChatCompletion(client, params, options) {
      super._createChatCompletion;
      this._listenForAbort(options?.signal);
      __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_beginRequest).call(this);
      const stream = await client.chat.completions.create({ ...params, stream: true }, { ...options, signal: this.controller.signal });
      this._connected();
      for await (const chunk of stream) {
        __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_addChunk).call(this, chunk);
      }
      if (stream.controller.signal?.aborted) {
        throw new APIUserAbortError();
      }
      return this._addChatCompletion(__classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_endRequest).call(this));
    }
    async _fromReadableStream(readableStream, options) {
      this._listenForAbort(options?.signal);
      __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_beginRequest).call(this);
      this._connected();
      const stream = Stream.fromReadableStream(readableStream, this.controller);
      let chatId;
      for await (const item of stream) {
        if (isChatCompletionReadableStreamMessage(item)) {
          const message = getChatCompletionReadableStreamMessage(item);
          if (__classPrivateFieldGet(this, _ChatCompletionStream_currentChatCompletionSnapshot, "f")) {
            const toolCalls = __classPrivateFieldGet(this, _ChatCompletionStream_currentChatCompletionSnapshot, "f").choices[0]?.message.tool_calls;
            for (const [index, id] of message.tool_call_ids?.entries() ?? []) {
              const toolCall = toolCalls?.[index];
              if (toolCall && id) {
                toolCall.id = id;
              }
            }
            this._addChatCompletion(__classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_endRequest).call(this));
            chatId = void 0;
          }
          this._addMessage(message.message);
          continue;
        }
        const chunk = item;
        if (chatId && chunk.id && chatId !== chunk.id) {
          this._addChatCompletion(__classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_endRequest).call(this));
        }
        __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_addChunk).call(this, chunk);
        if (chunk.id)
          chatId = chunk.id;
      }
      if (stream.controller.signal?.aborted) {
        throw new APIUserAbortError();
      }
      if (__classPrivateFieldGet(this, _ChatCompletionStream_currentChatCompletionSnapshot, "f")) {
        return this._addChatCompletion(__classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_endRequest).call(this));
      }
      const lastChatCompletion = this._chatCompletions[this._chatCompletions.length - 1];
      if (lastChatCompletion) {
        return lastChatCompletion;
      }
      throw new OpenAIError(`request ended without sending any chunks`);
    }
    [(_ChatCompletionStream_params = /* @__PURE__ */ new WeakMap(), _ChatCompletionStream_audioDoneChoiceIndexes = /* @__PURE__ */ new WeakMap(), _ChatCompletionStream_choiceEventStates = /* @__PURE__ */ new WeakMap(), _ChatCompletionStream_currentChatCompletionSnapshot = /* @__PURE__ */ new WeakMap(), _ChatCompletionStream_instances = /* @__PURE__ */ new WeakSet(), _ChatCompletionStream_beginRequest = function _ChatCompletionStream_beginRequest2() {
      if (this.ended)
        return;
      __classPrivateFieldSet(this, _ChatCompletionStream_audioDoneChoiceIndexes, /* @__PURE__ */ new Set(), "f");
      __classPrivateFieldSet(this, _ChatCompletionStream_currentChatCompletionSnapshot, void 0, "f");
    }, _ChatCompletionStream_getChoiceEventState = function _ChatCompletionStream_getChoiceEventState2(choice) {
      let state = __classPrivateFieldGet(this, _ChatCompletionStream_choiceEventStates, "f")[choice.index];
      if (state) {
        return state;
      }
      state = {
        content_done: false,
        refusal_done: false,
        logprobs_content_done: false,
        logprobs_refusal_done: false,
        done_tool_calls: /* @__PURE__ */ new Set(),
        current_tool_call_index: null
      };
      __classPrivateFieldGet(this, _ChatCompletionStream_choiceEventStates, "f")[choice.index] = state;
      return state;
    }, _ChatCompletionStream_addChunk = function _ChatCompletionStream_addChunk2(chunk) {
      if (this.ended)
        return;
      const completion = __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_accumulateChatCompletion).call(this, chunk);
      this._emit("chunk", chunk, completion);
      for (const choice of chunk.choices) {
        const choiceSnapshot = completion.choices[choice.index];
        const { delta } = choice;
        if (delta?.content != null && choiceSnapshot.message?.role === "assistant" && choiceSnapshot.message?.content) {
          this._emit("content", delta.content, choiceSnapshot.message.content);
          this._emit("content.delta", {
            delta: delta.content,
            snapshot: choiceSnapshot.message.content,
            parsed: choiceSnapshot.message.parsed
          });
        }
        if (delta?.refusal != null && choiceSnapshot.message?.role === "assistant" && choiceSnapshot.message?.refusal) {
          this._emit("refusal.delta", {
            delta: delta.refusal,
            snapshot: choiceSnapshot.message.refusal
          });
        }
        if (choice.logprobs?.content != null && choiceSnapshot.message?.role === "assistant") {
          this._emit("logprobs.content.delta", {
            content: choice.logprobs?.content,
            snapshot: choiceSnapshot.logprobs?.content ?? []
          });
        }
        if (choice.logprobs?.refusal != null && choiceSnapshot.message?.role === "assistant") {
          this._emit("logprobs.refusal.delta", {
            refusal: choice.logprobs?.refusal,
            snapshot: choiceSnapshot.logprobs?.refusal ?? []
          });
        }
        const state = __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_getChoiceEventState).call(this, choiceSnapshot);
        if (choiceSnapshot.finish_reason) {
          __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_emitContentDoneEvents).call(this, choiceSnapshot);
          if (state.current_tool_call_index != null) {
            __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_emitToolCallDoneEvent).call(this, choiceSnapshot, state.current_tool_call_index);
          }
        }
        for (const toolCall of delta?.tool_calls ?? []) {
          if (state.current_tool_call_index !== toolCall.index) {
            __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_emitContentDoneEvents).call(this, choiceSnapshot);
            if (state.current_tool_call_index != null) {
              __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_emitToolCallDoneEvent).call(this, choiceSnapshot, state.current_tool_call_index);
            }
          }
          state.current_tool_call_index = toolCall.index;
        }
        for (const toolCallDelta of delta?.tool_calls ?? []) {
          const toolCallSnapshot = choiceSnapshot.message.tool_calls?.[toolCallDelta.index];
          if (!toolCallSnapshot?.type) {
            continue;
          }
          if (toolCallSnapshot?.type === "function") {
            this._emit("tool_calls.function.arguments.delta", {
              name: toolCallSnapshot.function?.name,
              index: toolCallDelta.index,
              arguments: toolCallSnapshot.function.arguments,
              parsed_arguments: toolCallSnapshot.function.parsed_arguments,
              arguments_delta: toolCallDelta.function?.arguments ?? ""
            });
          } else {
            assertNever(toolCallSnapshot?.type);
          }
        }
      }
    }, _ChatCompletionStream_emitToolCallDoneEvent = function _ChatCompletionStream_emitToolCallDoneEvent2(choiceSnapshot, toolCallIndex) {
      const state = __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_getChoiceEventState).call(this, choiceSnapshot);
      if (state.done_tool_calls.has(toolCallIndex)) {
        return;
      }
      const toolCallSnapshot = choiceSnapshot.message.tool_calls?.[toolCallIndex];
      if (!toolCallSnapshot) {
        throw new Error("no tool call snapshot");
      }
      if (!toolCallSnapshot.type) {
        throw new Error("tool call snapshot missing `type`");
      }
      if (toolCallSnapshot.type === "function") {
        const inputTool = __classPrivateFieldGet(this, _ChatCompletionStream_params, "f")?.tools?.find((tool) => isChatCompletionFunctionTool(tool) && tool.function.name === toolCallSnapshot.function.name);
        this._emit("tool_calls.function.arguments.done", {
          name: toolCallSnapshot.function.name,
          index: toolCallIndex,
          arguments: toolCallSnapshot.function.arguments,
          parsed_arguments: isAutoParsableTool(inputTool) ? inputTool.$parseRaw(toolCallSnapshot.function.arguments) : inputTool?.function.strict ? JSON.parse(toolCallSnapshot.function.arguments) : null
        });
      } else {
        assertNever(toolCallSnapshot.type);
      }
    }, _ChatCompletionStream_emitContentDoneEvents = function _ChatCompletionStream_emitContentDoneEvents2(choiceSnapshot) {
      const state = __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_getChoiceEventState).call(this, choiceSnapshot);
      if (choiceSnapshot.message.content && !state.content_done) {
        state.content_done = true;
        const responseFormat = __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_getAutoParseableResponseFormat).call(this);
        this._emit("content.done", {
          content: choiceSnapshot.message.content,
          parsed: responseFormat ? responseFormat.$parseRaw(choiceSnapshot.message.content) : null
        });
      }
      if (choiceSnapshot.message.refusal && !state.refusal_done) {
        state.refusal_done = true;
        this._emit("refusal.done", { refusal: choiceSnapshot.message.refusal });
      }
      if (choiceSnapshot.logprobs?.content && !state.logprobs_content_done) {
        state.logprobs_content_done = true;
        this._emit("logprobs.content.done", { content: choiceSnapshot.logprobs.content });
      }
      if (choiceSnapshot.logprobs?.refusal && !state.logprobs_refusal_done) {
        state.logprobs_refusal_done = true;
        this._emit("logprobs.refusal.done", { refusal: choiceSnapshot.logprobs.refusal });
      }
    }, _ChatCompletionStream_endRequest = function _ChatCompletionStream_endRequest2() {
      if (this.ended) {
        throw new OpenAIError(`stream has ended, this shouldn't happen`);
      }
      const snapshot = __classPrivateFieldGet(this, _ChatCompletionStream_currentChatCompletionSnapshot, "f");
      if (!snapshot) {
        throw new OpenAIError(`request ended without sending any chunks`);
      }
      const audioDoneChoiceIndexes = __classPrivateFieldGet(this, _ChatCompletionStream_audioDoneChoiceIndexes, "f");
      __classPrivateFieldSet(this, _ChatCompletionStream_audioDoneChoiceIndexes, /* @__PURE__ */ new Set(), "f");
      __classPrivateFieldSet(this, _ChatCompletionStream_currentChatCompletionSnapshot, void 0, "f");
      __classPrivateFieldSet(this, _ChatCompletionStream_choiceEventStates, [], "f");
      return finalizeChatCompletion(snapshot, __classPrivateFieldGet(this, _ChatCompletionStream_params, "f"), audioDoneChoiceIndexes);
    }, _ChatCompletionStream_getAutoParseableResponseFormat = function _ChatCompletionStream_getAutoParseableResponseFormat2() {
      const responseFormat = __classPrivateFieldGet(this, _ChatCompletionStream_params, "f")?.response_format;
      if (isAutoParsableResponseFormat(responseFormat)) {
        return responseFormat;
      }
      return null;
    }, _ChatCompletionStream_accumulateChatCompletion = function _ChatCompletionStream_accumulateChatCompletion2(chunk) {
      var _a3, _b, _c, _d, _e;
      let snapshot = __classPrivateFieldGet(this, _ChatCompletionStream_currentChatCompletionSnapshot, "f");
      const { choices, ...rest } = chunk;
      if (!snapshot) {
        snapshot = __classPrivateFieldSet(this, _ChatCompletionStream_currentChatCompletionSnapshot, {
          ...rest,
          choices: []
        }, "f");
      } else if (chunk.id) {
        Object.assign(snapshot, rest);
      }
      for (const { delta, finish_reason, index, logprobs = null, ...other } of chunk.choices) {
        let choice = snapshot.choices[index];
        if (!choice) {
          choice = snapshot.choices[index] = { finish_reason, index, message: {}, logprobs, ...other };
        }
        if (logprobs) {
          if (!choice.logprobs) {
            choice.logprobs = Object.assign({}, logprobs);
          } else {
            const { content: content2, refusal: refusal2, ...rest3 } = logprobs;
            assertIsEmpty(rest3);
            Object.assign(choice.logprobs, rest3);
            if (content2) {
              (_a3 = choice.logprobs).content ?? (_a3.content = []);
              choice.logprobs.content.push(...content2);
            }
            if (refusal2) {
              (_b = choice.logprobs).refusal ?? (_b.refusal = []);
              choice.logprobs.refusal.push(...refusal2);
            }
          }
        }
        if (finish_reason) {
          choice.finish_reason = finish_reason;
          if (__classPrivateFieldGet(this, _ChatCompletionStream_params, "f") && hasAutoParseableInput(__classPrivateFieldGet(this, _ChatCompletionStream_params, "f"))) {
            if (finish_reason === "length") {
              throw new LengthFinishReasonError();
            }
            if (finish_reason === "content_filter") {
              throw new ContentFilterFinishReasonError();
            }
          }
        }
        Object.assign(choice, other);
        if (!delta)
          continue;
        __classPrivateFieldGet(this, _ChatCompletionStream_audioDoneChoiceIndexes, "f").delete(index);
        const { audio, content, refusal, function_call, role, tool_calls, ...rest2 } = delta;
        assertIsEmpty(rest2);
        Object.assign(choice.message, rest2);
        if (audio?.expires_at != null && audio.id == null && audio.data == null && audio.transcript == null && content == null && refusal == null && function_call == null && role == null && tool_calls == null && Object.keys(rest2).length === 0) {
          __classPrivateFieldGet(this, _ChatCompletionStream_audioDoneChoiceIndexes, "f").add(index);
        }
        if (refusal) {
          choice.message.refusal = (choice.message.refusal || "") + refusal;
        }
        if (role)
          choice.message.role = role;
        if (audio) {
          const audioSnapshot = (_c = choice.message).audio ?? (_c.audio = {});
          if (audio.id != null)
            audioSnapshot.id = audio.id;
          if (audio.data != null)
            audioSnapshot.data = (audioSnapshot.data ?? "") + audio.data;
          if (audio.transcript != null) {
            audioSnapshot.transcript = (audioSnapshot.transcript ?? "") + audio.transcript;
          }
          if (audio.expires_at != null)
            audioSnapshot.expires_at = audio.expires_at;
        }
        if (function_call) {
          if (!choice.message.function_call) {
            choice.message.function_call = function_call;
          } else {
            if (function_call.name)
              choice.message.function_call.name = function_call.name;
            if (function_call.arguments) {
              (_d = choice.message.function_call).arguments ?? (_d.arguments = "");
              choice.message.function_call.arguments += function_call.arguments;
            }
          }
        }
        if (content) {
          choice.message.content = (choice.message.content || "") + content;
          if (!choice.message.refusal && __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_getAutoParseableResponseFormat).call(this)) {
            choice.message.parsed = choice.message.content.trim() ? partialParse(choice.message.content) : null;
          }
        }
        if (tool_calls) {
          if (!choice.message.tool_calls)
            choice.message.tool_calls = [];
          for (const { index: index2, id, type, function: fn, ...rest3 } of tool_calls) {
            const tool_call = (_e = choice.message.tool_calls)[index2] ?? (_e[index2] = {});
            Object.assign(tool_call, rest3);
            if (id)
              tool_call.id = id;
            if (type)
              tool_call.type = type;
            if (fn)
              tool_call.function ?? (tool_call.function = { name: fn.name ?? "", arguments: "" });
            if (fn?.name)
              tool_call.function.name = fn.name;
            if (fn?.arguments) {
              tool_call.function.arguments += fn.arguments;
              if (shouldParseToolCall(__classPrivateFieldGet(this, _ChatCompletionStream_params, "f"), tool_call)) {
                tool_call.function.parsed_arguments = partialParse(tool_call.function.arguments);
              }
            }
          }
        }
      }
      return snapshot;
    }, Symbol.asyncIterator)]() {
      const pushQueue = [];
      const readQueue = [];
      let done = false;
      this.on("chunk", (chunk) => {
        const reader = readQueue.shift();
        if (reader) {
          reader.resolve(chunk);
        } else {
          pushQueue.push(chunk);
        }
      });
      this.on("end", () => {
        done = true;
        for (const reader of readQueue) {
          reader.resolve(void 0);
        }
        readQueue.length = 0;
      });
      this.on("abort", (err) => {
        done = true;
        for (const reader of readQueue) {
          reader.reject(err);
        }
        readQueue.length = 0;
      });
      this.on("error", (err) => {
        done = true;
        for (const reader of readQueue) {
          reader.reject(err);
        }
        readQueue.length = 0;
      });
      return {
        next: async () => {
          if (!pushQueue.length) {
            if (done) {
              return { value: void 0, done: true };
            }
            return new Promise((resolve, reject) => readQueue.push({ resolve, reject })).then((chunk2) => chunk2 ? { value: chunk2, done: false } : { value: void 0, done: true });
          }
          const chunk = pushQueue.shift();
          return { value: chunk, done: false };
        },
        return: async () => {
          this.abort();
          return { value: void 0, done: true };
        }
      };
    }
    toReadableStream() {
      const stream = new Stream(this[Symbol.asyncIterator].bind(this), this.controller);
      return stream.toReadableStream();
    }
  };
  function finalizeChatCompletion(snapshot, params, audioDoneChoiceIndexes) {
    const { id, choices, created, model, system_fingerprint, ...rest } = snapshot;
    const completion = {
      ...rest,
      id,
      choices: choices.map(({ message, finish_reason, index, logprobs, ...choiceRest }) => {
        const { content = null, function_call, tool_calls, audio, ...messageRest } = message;
        const finishReason = finish_reason ?? (audioDoneChoiceIndexes.has(index) && isCompleteAudio(audio) ? "stop" : null);
        if (!finishReason) {
          throw new OpenAIError(`missing finish_reason for choice ${index}`);
        }
        const audioResponse = audio ? { audio } : {};
        const role = message.role;
        if (!role) {
          throw new OpenAIError(`missing role for choice ${index}`);
        }
        if (function_call) {
          const { arguments: args, name } = function_call;
          if (args == null) {
            throw new OpenAIError(`missing function_call.arguments for choice ${index}`);
          }
          if (!name) {
            throw new OpenAIError(`missing function_call.name for choice ${index}`);
          }
          return {
            ...choiceRest,
            message: {
              ...audioResponse,
              content,
              function_call: { arguments: args, name },
              role,
              refusal: message.refusal ?? null
            },
            finish_reason: finishReason,
            index,
            logprobs
          };
        }
        if (tool_calls) {
          return {
            ...choiceRest,
            index,
            finish_reason: finishReason,
            logprobs,
            message: {
              ...messageRest,
              ...audioResponse,
              role,
              content,
              refusal: message.refusal ?? null,
              tool_calls: tool_calls.map((tool_call, i) => {
                const { function: fn, type, id: id2, ...toolRest } = tool_call;
                const { arguments: args, name, ...fnRest } = fn || {};
                if (type == null) {
                  throw new OpenAIError(`missing choices[${index}].tool_calls[${i}].type
${str(snapshot)}`);
                }
                if (name == null) {
                  throw new OpenAIError(`missing choices[${index}].tool_calls[${i}].function.name
${str(snapshot)}`);
                }
                if (args == null) {
                  throw new OpenAIError(`missing choices[${index}].tool_calls[${i}].function.arguments
${str(snapshot)}`);
                }
                return {
                  ...toolRest,
                  id: id2 || `call_${uuid4()}`,
                  type,
                  function: { ...fnRest, name, arguments: args }
                };
              })
            }
          };
        }
        return {
          ...choiceRest,
          message: { ...messageRest, ...audioResponse, content, role, refusal: message.refusal ?? null },
          finish_reason: finishReason,
          index,
          logprobs
        };
      }),
      created,
      model,
      object: "chat.completion",
      ...system_fingerprint ? { system_fingerprint } : {}
    };
    return maybeParseChatCompletion(completion, params);
  }
  function isCompleteAudio(audio) {
    return audio?.id != null && audio.data != null && audio.transcript != null && audio.expires_at != null;
  }
  function str(x) {
    return JSON.stringify(x);
  }
  function assertIsEmpty(obj) {
    return;
  }
  function assertNever(_x) {
  }

  // node_modules/openai/lib/ChatCompletionStreamingRunner.mjs
  var ChatCompletionStreamingRunner = class _ChatCompletionStreamingRunner extends ChatCompletionStream {
    static fromReadableStream(stream) {
      const runner = new _ChatCompletionStreamingRunner(null);
      runner._run(() => runner._fromReadableStream(stream));
      return runner;
    }
    toReadableStream() {
      const pushQueue = [];
      const readQueue = [];
      let done = false;
      let lastChunk;
      let toolCallIds;
      const pushEvent = (event) => {
        const reader = readQueue.shift();
        if (reader) {
          reader.resolve(event);
        } else {
          pushQueue.push(event);
        }
      };
      this.on("chunk", (chunk) => {
        lastChunk = chunk;
        pushEvent(chunk);
      });
      this.on("message", (message) => {
        if (isAssistantMessage(message)) {
          toolCallIds = message.tool_calls?.map((toolCall) => toolCall.id);
          return;
        }
        if (isToolMessage(message)) {
          if (!lastChunk) {
            throw new OpenAIError("cannot serialize a tool message before receiving any chunks");
          }
          pushEvent(makeChatCompletionReadableStreamMessageChunk(lastChunk, message, toolCallIds));
        }
      });
      this.on("end", () => {
        done = true;
        for (const reader of readQueue) {
          reader.resolve(void 0);
        }
        readQueue.length = 0;
      });
      this.on("abort", (err) => {
        done = true;
        for (const reader of readQueue) {
          reader.reject(err);
        }
        readQueue.length = 0;
      });
      this.on("error", (err) => {
        done = true;
        for (const reader of readQueue) {
          reader.reject(err);
        }
        readQueue.length = 0;
      });
      const iterator = () => ({
        next: async () => {
          if (!pushQueue.length) {
            if (done) {
              return { value: void 0, done: true };
            }
            return new Promise((resolve, reject) => readQueue.push({ resolve, reject })).then((event2) => event2 ? { value: event2, done: false } : { value: void 0, done: true });
          }
          const event = pushQueue.shift();
          if (!event) {
            return { value: void 0, done: true };
          }
          return { value: event, done: false };
        },
        return: async () => {
          this.abort();
          return { value: void 0, done: true };
        }
      });
      const stream = new Stream(iterator, this.controller);
      return stream.toReadableStream();
    }
    static runTools(client, params, options) {
      const runner = new _ChatCompletionStreamingRunner(
        // @ts-expect-error TODO these types are incompatible
        params
      );
      const opts = {
        ...options,
        headers: { ...options?.headers, "X-Stainless-Helper-Method": "runTools" }
      };
      runner._run(() => runner._runTools(client, params, runner, opts));
      return runner;
    }
  };

  // node_modules/openai/resources/chat/completions/completions.mjs
  var Completions = class extends APIResource {
    constructor() {
      super(...arguments);
      this.messages = new Messages(this._client);
    }
    create(body, options) {
      return this._client.post("/chat/completions", {
        body,
        ...options,
        stream: body.stream ?? false,
        __security: { bearerAuth: true }
      });
    }
    /**
     * Get a stored chat completion. Only Chat Completions that have been created with
     * the `store` parameter set to `true` will be returned.
     *
     * @example
     * ```ts
     * const chatCompletion =
     *   await client.chat.completions.retrieve('completion_id');
     * ```
     */
    retrieve(completionID, options) {
      return this._client.get(path`/chat/completions/${completionID}`, {
        ...options,
        __security: { bearerAuth: true }
      });
    }
    /**
     * Modify a stored chat completion. Only Chat Completions that have been created
     * with the `store` parameter set to `true` can be modified. Currently, the only
     * supported modification is to update the `metadata` field.
     *
     * @example
     * ```ts
     * const chatCompletion = await client.chat.completions.update(
     *   'completion_id',
     *   { metadata: { foo: 'string' } },
     * );
     * ```
     */
    update(completionID, body, options) {
      return this._client.post(path`/chat/completions/${completionID}`, {
        body,
        ...options,
        __security: { bearerAuth: true }
      });
    }
    /**
     * List stored Chat Completions. Only Chat Completions that have been stored with
     * the `store` parameter set to `true` will be returned.
     *
     * @example
     * ```ts
     * // Automatically fetches more pages as needed.
     * for await (const chatCompletion of client.chat.completions.list()) {
     *   // ...
     * }
     * ```
     */
    list(query = {}, options) {
      return this._client.getAPIList("/chat/completions", CursorPage, {
        query,
        ...options,
        __security: { bearerAuth: true }
      });
    }
    /**
     * Delete a stored chat completion. Only Chat Completions that have been created
     * with the `store` parameter set to `true` can be deleted.
     *
     * @example
     * ```ts
     * const chatCompletionDeleted =
     *   await client.chat.completions.delete('completion_id');
     * ```
     */
    delete(completionID, options) {
      return this._client.delete(path`/chat/completions/${completionID}`, {
        ...options,
        __security: { bearerAuth: true }
      });
    }
    parse(body, options) {
      validateInputTools(body.tools);
      return this._client.chat.completions.create(body, {
        ...options,
        headers: {
          ...options?.headers,
          "X-Stainless-Helper-Method": "chat.completions.parse"
        }
      })._thenUnwrap((completion) => parseChatCompletion(completion, body));
    }
    runTools(body, options) {
      if (body.stream) {
        return ChatCompletionStreamingRunner.runTools(this._client, body, options);
      }
      return ChatCompletionRunner.runTools(this._client, body, options);
    }
    /**
     * Creates a chat completion stream
     */
    stream(body, options) {
      return ChatCompletionStream.createChatCompletion(this._client, body, options);
    }
  };
  Completions.Messages = Messages;

  // node_modules/openai/resources/chat/chat.mjs
  var Chat = class extends APIResource {
    constructor() {
      super(...arguments);
      this.completions = new Completions(this._client);
    }
  };
  Chat.Completions = Completions;

  // node_modules/openai/resources/admin/organization/admin-api-keys.mjs
  var AdminAPIKeys = class extends APIResource {
    /**
     * Create an organization admin API key
     *
     * @example
     * ```ts
     * const adminAPIKey =
     *   await client.admin.organization.adminAPIKeys.create({
     *     name: 'New Admin Key',
     *   });
     * ```
     */
    create(body, options) {
      return this._client.post("/organization/admin_api_keys", {
        body,
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Retrieve a single organization API key
     *
     * @example
     * ```ts
     * const adminAPIKey =
     *   await client.admin.organization.adminAPIKeys.retrieve(
     *     'key_id',
     *   );
     * ```
     */
    retrieve(keyID, options) {
      return this._client.get(path`/organization/admin_api_keys/${keyID}`, {
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * List organization API keys
     *
     * @example
     * ```ts
     * // Automatically fetches more pages as needed.
     * for await (const adminAPIKey of client.admin.organization.adminAPIKeys.list()) {
     *   // ...
     * }
     * ```
     */
    list(query = {}, options) {
      return this._client.getAPIList("/organization/admin_api_keys", CursorPage, {
        query,
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Delete an organization admin API key
     *
     * @example
     * ```ts
     * const adminAPIKey =
     *   await client.admin.organization.adminAPIKeys.delete(
     *     'key_id',
     *   );
     * ```
     */
    delete(keyID, options) {
      return this._client.delete(path`/organization/admin_api_keys/${keyID}`, {
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
  };

  // node_modules/openai/resources/admin/organization/audit-logs.mjs
  var AuditLogs = class extends APIResource {
    /**
     * List user actions and configuration changes within this organization.
     *
     * @example
     * ```ts
     * // Automatically fetches more pages as needed.
     * for await (const auditLogListResponse of client.admin.organization.auditLogs.list()) {
     *   // ...
     * }
     * ```
     */
    list(query = {}, options) {
      return this._client.getAPIList("/organization/audit_logs", ConversationCursorPage, {
        query,
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
  };

  // node_modules/openai/resources/admin/organization/certificates.mjs
  var Certificates = class extends APIResource {
    /**
     * Upload a certificate to the organization. This does **not** automatically
     * activate the certificate.
     *
     * Organizations can upload up to 50 certificates.
     *
     * @example
     * ```ts
     * const certificate =
     *   await client.admin.organization.certificates.create({
     *     certificate: 'certificate',
     *   });
     * ```
     */
    create(body, options) {
      return this._client.post("/organization/certificates", {
        body,
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Get a certificate that has been uploaded to the organization.
     *
     * You can get a certificate regardless of whether it is active or not.
     *
     * @example
     * ```ts
     * const certificate =
     *   await client.admin.organization.certificates.retrieve(
     *     'certificate_id',
     *   );
     * ```
     */
    retrieve(certificateID, query = {}, options) {
      return this._client.get(path`/organization/certificates/${certificateID}`, {
        query,
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Modify a certificate. Note that only the name can be modified.
     *
     * @example
     * ```ts
     * const certificate =
     *   await client.admin.organization.certificates.update(
     *     'certificate_id',
     *   );
     * ```
     */
    update(certificateID, body, options) {
      return this._client.post(path`/organization/certificates/${certificateID}`, {
        body,
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * List uploaded certificates for this organization.
     *
     * @example
     * ```ts
     * // Automatically fetches more pages as needed.
     * for await (const certificateListResponse of client.admin.organization.certificates.list()) {
     *   // ...
     * }
     * ```
     */
    list(query = {}, options) {
      return this._client.getAPIList("/organization/certificates", ConversationCursorPage, { query, ...options, __security: { adminAPIKeyAuth: true } });
    }
    /**
     * Delete a certificate from the organization.
     *
     * The certificate must be inactive for the organization and all projects.
     *
     * @example
     * ```ts
     * const certificate =
     *   await client.admin.organization.certificates.delete(
     *     'certificate_id',
     *   );
     * ```
     */
    delete(certificateID, options) {
      return this._client.delete(path`/organization/certificates/${certificateID}`, {
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Activate certificates at the organization level.
     *
     * You can atomically and idempotently activate up to 10 certificates at a time.
     *
     * @example
     * ```ts
     * // Automatically fetches more pages as needed.
     * for await (const certificateActivateResponse of client.admin.organization.certificates.activate(
     *   { certificate_ids: ['cert_abc'] },
     * )) {
     *   // ...
     * }
     * ```
     */
    activate(body, options) {
      return this._client.getAPIList("/organization/certificates/activate", Page, {
        body,
        method: "post",
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Deactivate certificates at the organization level.
     *
     * You can atomically and idempotently deactivate up to 10 certificates at a time.
     *
     * @example
     * ```ts
     * // Automatically fetches more pages as needed.
     * for await (const certificateDeactivateResponse of client.admin.organization.certificates.deactivate(
     *   { certificate_ids: ['cert_abc'] },
     * )) {
     *   // ...
     * }
     * ```
     */
    deactivate(body, options) {
      return this._client.getAPIList("/organization/certificates/deactivate", Page, { body, method: "post", ...options, __security: { adminAPIKeyAuth: true } });
    }
  };

  // node_modules/openai/resources/admin/organization/data-retention.mjs
  var DataRetention = class extends APIResource {
    /**
     * Retrieves organization data retention controls.
     *
     * @example
     * ```ts
     * const organizationDataRetention =
     *   await client.admin.organization.dataRetention.retrieve();
     * ```
     */
    retrieve(options) {
      return this._client.get("/organization/data_retention", {
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Updates organization data retention controls.
     *
     * @example
     * ```ts
     * const organizationDataRetention =
     *   await client.admin.organization.dataRetention.update({
     *     retention_type: 'zero_data_retention',
     *   });
     * ```
     */
    update(body, options) {
      return this._client.post("/organization/data_retention", {
        body,
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
  };

  // node_modules/openai/resources/admin/organization/invites.mjs
  var Invites = class extends APIResource {
    /**
     * Create an invite for a user to the organization. The invite must be accepted by
     * the user before they have access to the organization.
     *
     * @example
     * ```ts
     * const invite =
     *   await client.admin.organization.invites.create({
     *     email: 'email',
     *     role: 'reader',
     *   });
     * ```
     */
    create(body, options) {
      return this._client.post("/organization/invites", {
        body,
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Retrieves an invite.
     *
     * @example
     * ```ts
     * const invite =
     *   await client.admin.organization.invites.retrieve(
     *     'invite_id',
     *   );
     * ```
     */
    retrieve(inviteID, options) {
      return this._client.get(path`/organization/invites/${inviteID}`, {
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Returns a list of invites in the organization.
     *
     * @example
     * ```ts
     * // Automatically fetches more pages as needed.
     * for await (const invite of client.admin.organization.invites.list()) {
     *   // ...
     * }
     * ```
     */
    list(query = {}, options) {
      return this._client.getAPIList("/organization/invites", ConversationCursorPage, {
        query,
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Delete an invite. If the invite has already been accepted, it cannot be deleted.
     *
     * @example
     * ```ts
     * const invite =
     *   await client.admin.organization.invites.delete(
     *     'invite_id',
     *   );
     * ```
     */
    delete(inviteID, options) {
      return this._client.delete(path`/organization/invites/${inviteID}`, {
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
  };

  // node_modules/openai/resources/admin/organization/roles.mjs
  var Roles = class extends APIResource {
    /**
     * Creates a custom role for the organization.
     *
     * @example
     * ```ts
     * const role = await client.admin.organization.roles.create({
     *   permissions: ['string'],
     *   role_name: 'role_name',
     * });
     * ```
     */
    create(body, options) {
      return this._client.post("/organization/roles", {
        body,
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Retrieves an organization role.
     *
     * @example
     * ```ts
     * const role = await client.admin.organization.roles.retrieve(
     *   'role_id',
     * );
     * ```
     */
    retrieve(roleID, options) {
      return this._client.get(path`/organization/roles/${roleID}`, {
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Updates an existing organization role.
     *
     * @example
     * ```ts
     * const role = await client.admin.organization.roles.update(
     *   'role_id',
     * );
     * ```
     */
    update(roleID, body, options) {
      return this._client.post(path`/organization/roles/${roleID}`, {
        body,
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Lists the roles configured for the organization.
     *
     * @example
     * ```ts
     * // Automatically fetches more pages as needed.
     * for await (const role of client.admin.organization.roles.list()) {
     *   // ...
     * }
     * ```
     */
    list(query = {}, options) {
      return this._client.getAPIList("/organization/roles", NextCursorPage, {
        query,
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Deletes a custom role from the organization.
     *
     * @example
     * ```ts
     * const role = await client.admin.organization.roles.delete(
     *   'role_id',
     * );
     * ```
     */
    delete(roleID, options) {
      return this._client.delete(path`/organization/roles/${roleID}`, {
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
  };

  // node_modules/openai/resources/admin/organization/spend-alerts.mjs
  var SpendAlerts = class extends APIResource {
    /**
     * Creates an organization spend alert.
     *
     * @example
     * ```ts
     * const organizationSpendAlert =
     *   await client.admin.organization.spendAlerts.create({
     *     currency: 'USD',
     *     interval: 'month',
     *     notification_channel: {
     *       recipients: ['string'],
     *       type: 'email',
     *     },
     *     threshold_amount: 0,
     *   });
     * ```
     */
    create(body, options) {
      return this._client.post("/organization/spend_alerts", {
        body,
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Retrieves an organization spend alert.
     *
     * @example
     * ```ts
     * const organizationSpendAlert =
     *   await client.admin.organization.spendAlerts.retrieve(
     *     'alert_id',
     *   );
     * ```
     */
    retrieve(alertID, options) {
      return this._client.get(path`/organization/spend_alerts/${alertID}`, {
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Updates an organization spend alert.
     *
     * @example
     * ```ts
     * const organizationSpendAlert =
     *   await client.admin.organization.spendAlerts.update(
     *     'alert_id',
     *     {
     *       currency: 'USD',
     *       interval: 'month',
     *       notification_channel: {
     *         recipients: ['string'],
     *         type: 'email',
     *       },
     *       threshold_amount: 0,
     *     },
     *   );
     * ```
     */
    update(alertID, body, options) {
      return this._client.post(path`/organization/spend_alerts/${alertID}`, {
        body,
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Lists organization spend alerts.
     *
     * @example
     * ```ts
     * // Automatically fetches more pages as needed.
     * for await (const organizationSpendAlert of client.admin.organization.spendAlerts.list()) {
     *   // ...
     * }
     * ```
     */
    list(query = {}, options) {
      return this._client.getAPIList("/organization/spend_alerts", ConversationCursorPage, { query, ...options, __security: { adminAPIKeyAuth: true } });
    }
    /**
     * Deletes an organization spend alert.
     *
     * @example
     * ```ts
     * const organizationSpendAlertDeleted =
     *   await client.admin.organization.spendAlerts.delete(
     *     'alert_id',
     *   );
     * ```
     */
    delete(alertID, options) {
      return this._client.delete(path`/organization/spend_alerts/${alertID}`, {
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
  };

  // node_modules/openai/resources/admin/organization/spend-limit.mjs
  var SpendLimit = class extends APIResource {
    /**
     * Get the organization's hard spend limit.
     *
     * @example
     * ```ts
     * const organizationSpendLimit =
     *   await client.admin.organization.spendLimit.retrieve();
     * ```
     */
    retrieve(options) {
      return this._client.get("/organization/spend_limit", {
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Create or replace the organization's hard spend limit.
     *
     * @example
     * ```ts
     * const organizationSpendLimit =
     *   await client.admin.organization.spendLimit.update({
     *     currency: 'USD',
     *     interval: 'month',
     *     threshold_amount: 1,
     *   });
     * ```
     */
    update(body, options) {
      return this._client.post("/organization/spend_limit", {
        body,
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Delete the organization's hard spend limit.
     *
     * @example
     * ```ts
     * const organizationSpendLimitDeleted =
     *   await client.admin.organization.spendLimit.delete();
     * ```
     */
    delete(options) {
      return this._client.delete("/organization/spend_limit", {
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
  };

  // node_modules/openai/resources/admin/organization/usage.mjs
  var Usage = class extends APIResource {
    /**
     * Get audio speeches usage details for the organization.
     *
     * @example
     * ```ts
     * const response =
     *   await client.admin.organization.usage.audioSpeeches({
     *     start_time: 0,
     *   });
     * ```
     */
    audioSpeeches(query, options) {
      return this._client.get("/organization/usage/audio_speeches", {
        query,
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Get audio transcriptions usage details for the organization.
     *
     * @example
     * ```ts
     * const response =
     *   await client.admin.organization.usage.audioTranscriptions(
     *     { start_time: 0 },
     *   );
     * ```
     */
    audioTranscriptions(query, options) {
      return this._client.get("/organization/usage/audio_transcriptions", {
        query,
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Get code interpreter sessions usage details for the organization.
     *
     * @example
     * ```ts
     * const response =
     *   await client.admin.organization.usage.codeInterpreterSessions(
     *     { start_time: 0 },
     *   );
     * ```
     */
    codeInterpreterSessions(query, options) {
      return this._client.get("/organization/usage/code_interpreter_sessions", {
        query,
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Get completions usage details for the organization.
     *
     * @example
     * ```ts
     * const response =
     *   await client.admin.organization.usage.completions({
     *     start_time: 0,
     *   });
     * ```
     */
    completions(query, options) {
      return this._client.get("/organization/usage/completions", {
        query,
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Get costs details for the organization.
     *
     * @example
     * ```ts
     * const response =
     *   await client.admin.organization.usage.costs({
     *     start_time: 0,
     *   });
     * ```
     */
    costs(query, options) {
      return this._client.get("/organization/costs", {
        query,
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Get embeddings usage details for the organization.
     *
     * @example
     * ```ts
     * const response =
     *   await client.admin.organization.usage.embeddings({
     *     start_time: 0,
     *   });
     * ```
     */
    embeddings(query, options) {
      return this._client.get("/organization/usage/embeddings", {
        query,
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Get file search calls usage details for the organization.
     *
     * @example
     * ```ts
     * const response =
     *   await client.admin.organization.usage.fileSearchCalls({
     *     start_time: 0,
     *   });
     * ```
     */
    fileSearchCalls(query, options) {
      return this._client.get("/organization/usage/file_search_calls", {
        query,
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Get images usage details for the organization.
     *
     * @example
     * ```ts
     * const response =
     *   await client.admin.organization.usage.images({
     *     start_time: 0,
     *   });
     * ```
     */
    images(query, options) {
      return this._client.get("/organization/usage/images", {
        query,
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Get moderations usage details for the organization.
     *
     * @example
     * ```ts
     * const response =
     *   await client.admin.organization.usage.moderations({
     *     start_time: 0,
     *   });
     * ```
     */
    moderations(query, options) {
      return this._client.get("/organization/usage/moderations", {
        query,
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Get vector stores usage details for the organization.
     *
     * @example
     * ```ts
     * const response =
     *   await client.admin.organization.usage.vectorStores({
     *     start_time: 0,
     *   });
     * ```
     */
    vectorStores(query, options) {
      return this._client.get("/organization/usage/vector_stores", {
        query,
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Get web search calls usage details for the organization.
     *
     * @example
     * ```ts
     * const response =
     *   await client.admin.organization.usage.webSearchCalls({
     *     start_time: 0,
     *   });
     * ```
     */
    webSearchCalls(query, options) {
      return this._client.get("/organization/usage/web_search_calls", {
        query,
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
  };

  // node_modules/openai/resources/admin/organization/groups/roles.mjs
  var Roles2 = class extends APIResource {
    /**
     * Assigns an organization role to a group within the organization.
     *
     * @example
     * ```ts
     * const role =
     *   await client.admin.organization.groups.roles.create(
     *     'group_id',
     *     { role_id: 'role_id' },
     *   );
     * ```
     */
    create(groupID, body, options) {
      return this._client.post(path`/organization/groups/${groupID}/roles`, {
        body,
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Retrieves an organization role assigned to a group.
     *
     * @example
     * ```ts
     * const role =
     *   await client.admin.organization.groups.roles.retrieve(
     *     'role_id',
     *     { group_id: 'group_id' },
     *   );
     * ```
     */
    retrieve(roleID, params, options) {
      const { group_id } = params;
      return this._client.get(path`/organization/groups/${group_id}/roles/${roleID}`, {
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Lists the organization roles assigned to a group within the organization.
     *
     * @example
     * ```ts
     * // Automatically fetches more pages as needed.
     * for await (const roleListResponse of client.admin.organization.groups.roles.list(
     *   'group_id',
     * )) {
     *   // ...
     * }
     * ```
     */
    list(groupID, query = {}, options) {
      return this._client.getAPIList(path`/organization/groups/${groupID}/roles`, NextCursorPage, { query, ...options, __security: { adminAPIKeyAuth: true } });
    }
    /**
     * Unassigns an organization role from a group within the organization.
     *
     * @example
     * ```ts
     * const role =
     *   await client.admin.organization.groups.roles.delete(
     *     'role_id',
     *     { group_id: 'group_id' },
     *   );
     * ```
     */
    delete(roleID, params, options) {
      const { group_id } = params;
      return this._client.delete(path`/organization/groups/${group_id}/roles/${roleID}`, {
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
  };

  // node_modules/openai/resources/admin/organization/groups/users.mjs
  var Users = class extends APIResource {
    /**
     * Adds a user to a group.
     *
     * @example
     * ```ts
     * const user =
     *   await client.admin.organization.groups.users.create(
     *     'group_id',
     *     { user_id: 'user_id' },
     *   );
     * ```
     */
    create(groupID, body, options) {
      return this._client.post(path`/organization/groups/${groupID}/users`, {
        body,
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Retrieves a user in a group.
     *
     * @example
     * ```ts
     * const user =
     *   await client.admin.organization.groups.users.retrieve(
     *     'user_id',
     *     { group_id: 'group_id' },
     *   );
     * ```
     */
    retrieve(userID, params, options) {
      const { group_id } = params;
      return this._client.get(path`/organization/groups/${group_id}/users/${userID}`, {
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Lists the users assigned to a group.
     *
     * @example
     * ```ts
     * // Automatically fetches more pages as needed.
     * for await (const organizationGroupUser of client.admin.organization.groups.users.list(
     *   'group_id',
     * )) {
     *   // ...
     * }
     * ```
     */
    list(groupID, query = {}, options) {
      return this._client.getAPIList(path`/organization/groups/${groupID}/users`, NextCursorPage, { query, ...options, __security: { adminAPIKeyAuth: true } });
    }
    /**
     * Removes a user from a group.
     *
     * @example
     * ```ts
     * const user =
     *   await client.admin.organization.groups.users.delete(
     *     'user_id',
     *     { group_id: 'group_id' },
     *   );
     * ```
     */
    delete(userID, params, options) {
      const { group_id } = params;
      return this._client.delete(path`/organization/groups/${group_id}/users/${userID}`, {
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
  };

  // node_modules/openai/resources/admin/organization/groups/groups.mjs
  var Groups = class extends APIResource {
    constructor() {
      super(...arguments);
      this.users = new Users(this._client);
      this.roles = new Roles2(this._client);
    }
    /**
     * Creates a new group in the organization.
     *
     * @example
     * ```ts
     * const group = await client.admin.organization.groups.create(
     *   { name: 'x' },
     * );
     * ```
     */
    create(body, options) {
      return this._client.post("/organization/groups", {
        body,
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Retrieves a group.
     *
     * @example
     * ```ts
     * const group =
     *   await client.admin.organization.groups.retrieve(
     *     'group_id',
     *   );
     * ```
     */
    retrieve(groupID, options) {
      return this._client.get(path`/organization/groups/${groupID}`, {
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Updates a group's information.
     *
     * @example
     * ```ts
     * const group = await client.admin.organization.groups.update(
     *   'group_id',
     *   { name: 'x' },
     * );
     * ```
     */
    update(groupID, body, options) {
      return this._client.post(path`/organization/groups/${groupID}`, {
        body,
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Lists all groups in the organization.
     *
     * @example
     * ```ts
     * // Automatically fetches more pages as needed.
     * for await (const group of client.admin.organization.groups.list()) {
     *   // ...
     * }
     * ```
     */
    list(query = {}, options) {
      return this._client.getAPIList("/organization/groups", NextCursorPage, {
        query,
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Deletes a group from the organization.
     *
     * @example
     * ```ts
     * const group = await client.admin.organization.groups.delete(
     *   'group_id',
     * );
     * ```
     */
    delete(groupID, options) {
      return this._client.delete(path`/organization/groups/${groupID}`, {
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
  };
  Groups.Users = Users;
  Groups.Roles = Roles2;

  // node_modules/openai/resources/admin/organization/projects/api-keys.mjs
  var APIKeys = class extends APIResource {
    /**
     * Retrieves an API key in the project.
     *
     * @example
     * ```ts
     * const projectAPIKey =
     *   await client.admin.organization.projects.apiKeys.retrieve(
     *     'api_key_id',
     *     { project_id: 'project_id' },
     *   );
     * ```
     */
    retrieve(apiKeyID, params, options) {
      const { project_id } = params;
      return this._client.get(path`/organization/projects/${project_id}/api_keys/${apiKeyID}`, {
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Returns a list of API keys in the project.
     *
     * @example
     * ```ts
     * // Automatically fetches more pages as needed.
     * for await (const projectAPIKey of client.admin.organization.projects.apiKeys.list(
     *   'project_id',
     * )) {
     *   // ...
     * }
     * ```
     */
    list(projectID, query = {}, options) {
      return this._client.getAPIList(path`/organization/projects/${projectID}/api_keys`, ConversationCursorPage, { query, ...options, __security: { adminAPIKeyAuth: true } });
    }
    /**
     * Deletes an API key from the project.
     *
     * Returns confirmation of the key deletion, or an error if the key belonged to a
     * service account.
     *
     * @example
     * ```ts
     * const apiKey =
     *   await client.admin.organization.projects.apiKeys.delete(
     *     'api_key_id',
     *     { project_id: 'project_id' },
     *   );
     * ```
     */
    delete(apiKeyID, params, options) {
      const { project_id } = params;
      return this._client.delete(path`/organization/projects/${project_id}/api_keys/${apiKeyID}`, {
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
  };

  // node_modules/openai/resources/admin/organization/projects/certificates.mjs
  var Certificates2 = class extends APIResource {
    /**
     * List certificates for this project.
     *
     * @example
     * ```ts
     * // Automatically fetches more pages as needed.
     * for await (const certificateListResponse of client.admin.organization.projects.certificates.list(
     *   'project_id',
     * )) {
     *   // ...
     * }
     * ```
     */
    list(projectID, query = {}, options) {
      return this._client.getAPIList(path`/organization/projects/${projectID}/certificates`, ConversationCursorPage, { query, ...options, __security: { adminAPIKeyAuth: true } });
    }
    /**
     * Activate certificates at the project level.
     *
     * You can atomically and idempotently activate up to 10 certificates at a time.
     *
     * @example
     * ```ts
     * // Automatically fetches more pages as needed.
     * for await (const certificateActivateResponse of client.admin.organization.projects.certificates.activate(
     *   'project_id',
     *   { certificate_ids: ['cert_abc'] },
     * )) {
     *   // ...
     * }
     * ```
     */
    activate(projectID, body, options) {
      return this._client.getAPIList(path`/organization/projects/${projectID}/certificates/activate`, Page, { body, method: "post", ...options, __security: { adminAPIKeyAuth: true } });
    }
    /**
     * Deactivate certificates at the project level. You can atomically and
     * idempotently deactivate up to 10 certificates at a time.
     *
     * @example
     * ```ts
     * // Automatically fetches more pages as needed.
     * for await (const certificateDeactivateResponse of client.admin.organization.projects.certificates.deactivate(
     *   'project_id',
     *   { certificate_ids: ['cert_abc'] },
     * )) {
     *   // ...
     * }
     * ```
     */
    deactivate(projectID, body, options) {
      return this._client.getAPIList(path`/organization/projects/${projectID}/certificates/deactivate`, Page, { body, method: "post", ...options, __security: { adminAPIKeyAuth: true } });
    }
  };

  // node_modules/openai/resources/admin/organization/projects/data-retention.mjs
  var DataRetention2 = class extends APIResource {
    /**
     * Retrieves project data retention controls.
     *
     * @example
     * ```ts
     * const projectDataRetention =
     *   await client.admin.organization.projects.dataRetention.retrieve(
     *     'project_id',
     *   );
     * ```
     */
    retrieve(projectID, options) {
      return this._client.get(path`/organization/projects/${projectID}/data_retention`, {
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Updates project data retention controls.
     *
     * @example
     * ```ts
     * const projectDataRetention =
     *   await client.admin.organization.projects.dataRetention.update(
     *     'project_id',
     *     { retention_type: 'organization_default' },
     *   );
     * ```
     */
    update(projectID, body, options) {
      return this._client.post(path`/organization/projects/${projectID}/data_retention`, {
        body,
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
  };

  // node_modules/openai/resources/admin/organization/projects/hosted-tool-permissions.mjs
  var HostedToolPermissions = class extends APIResource {
    /**
     * Returns hosted tool permissions for a project.
     *
     * @example
     * ```ts
     * const projectHostedToolPermissions =
     *   await client.admin.organization.projects.hostedToolPermissions.retrieve(
     *     'project_id',
     *   );
     * ```
     */
    retrieve(projectID, options) {
      return this._client.get(path`/organization/projects/${projectID}/hosted_tool_permissions`, {
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Updates hosted tool permissions for a project.
     *
     * @example
     * ```ts
     * const projectHostedToolPermissions =
     *   await client.admin.organization.projects.hostedToolPermissions.update(
     *     'project_id',
     *   );
     * ```
     */
    update(projectID, body, options) {
      return this._client.post(path`/organization/projects/${projectID}/hosted_tool_permissions`, {
        body,
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
  };

  // node_modules/openai/resources/admin/organization/projects/model-permissions.mjs
  var ModelPermissions = class extends APIResource {
    /**
     * Returns model permissions for a project.
     *
     * @example
     * ```ts
     * const projectModelPermissions =
     *   await client.admin.organization.projects.modelPermissions.retrieve(
     *     'project_id',
     *   );
     * ```
     */
    retrieve(projectID, options) {
      return this._client.get(path`/organization/projects/${projectID}/model_permissions`, {
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Updates model permissions for a project.
     *
     * @example
     * ```ts
     * const projectModelPermissions =
     *   await client.admin.organization.projects.modelPermissions.update(
     *     'project_id',
     *     { mode: 'allow_list', model_ids: ['string'] },
     *   );
     * ```
     */
    update(projectID, body, options) {
      return this._client.post(path`/organization/projects/${projectID}/model_permissions`, {
        body,
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Deletes model permissions for a project.
     *
     * @example
     * ```ts
     * const projectModelPermissionsDeleted =
     *   await client.admin.organization.projects.modelPermissions.delete(
     *     'project_id',
     *   );
     * ```
     */
    delete(projectID, options) {
      return this._client.delete(path`/organization/projects/${projectID}/model_permissions`, {
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
  };

  // node_modules/openai/resources/admin/organization/projects/rate-limits.mjs
  var RateLimits = class extends APIResource {
    /**
     * Returns the rate limits per model for a project.
     *
     * @example
     * ```ts
     * // Automatically fetches more pages as needed.
     * for await (const projectRateLimit of client.admin.organization.projects.rateLimits.listRateLimits(
     *   'project_id',
     * )) {
     *   // ...
     * }
     * ```
     */
    listRateLimits(projectID, query = {}, options) {
      return this._client.getAPIList(path`/organization/projects/${projectID}/rate_limits`, ConversationCursorPage, { query, ...options, __security: { adminAPIKeyAuth: true } });
    }
    /**
     * Updates a project rate limit.
     *
     * @example
     * ```ts
     * const projectRateLimit =
     *   await client.admin.organization.projects.rateLimits.updateRateLimit(
     *     'rate_limit_id',
     *     { project_id: 'project_id' },
     *   );
     * ```
     */
    updateRateLimit(rateLimitID, params, options) {
      const { project_id, ...body } = params;
      return this._client.post(path`/organization/projects/${project_id}/rate_limits/${rateLimitID}`, {
        body,
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
  };

  // node_modules/openai/resources/admin/organization/projects/roles.mjs
  var Roles3 = class extends APIResource {
    /**
     * Creates a custom role for a project.
     *
     * @example
     * ```ts
     * const role =
     *   await client.admin.organization.projects.roles.create(
     *     'project_id',
     *     { permissions: ['string'], role_name: 'role_name' },
     *   );
     * ```
     */
    create(projectID, body, options) {
      return this._client.post(path`/projects/${projectID}/roles`, {
        body,
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Retrieves a project role.
     *
     * @example
     * ```ts
     * const role =
     *   await client.admin.organization.projects.roles.retrieve(
     *     'role_id',
     *     { project_id: 'project_id' },
     *   );
     * ```
     */
    retrieve(roleID, params, options) {
      const { project_id } = params;
      return this._client.get(path`/projects/${project_id}/roles/${roleID}`, {
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Updates an existing project role.
     *
     * @example
     * ```ts
     * const role =
     *   await client.admin.organization.projects.roles.update(
     *     'role_id',
     *     { project_id: 'project_id' },
     *   );
     * ```
     */
    update(roleID, params, options) {
      const { project_id, ...body } = params;
      return this._client.post(path`/projects/${project_id}/roles/${roleID}`, {
        body,
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Lists the roles configured for a project.
     *
     * @example
     * ```ts
     * // Automatically fetches more pages as needed.
     * for await (const role of client.admin.organization.projects.roles.list(
     *   'project_id',
     * )) {
     *   // ...
     * }
     * ```
     */
    list(projectID, query = {}, options) {
      return this._client.getAPIList(path`/projects/${projectID}/roles`, NextCursorPage, {
        query,
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Deletes a custom role from a project.
     *
     * @example
     * ```ts
     * const role =
     *   await client.admin.organization.projects.roles.delete(
     *     'role_id',
     *     { project_id: 'project_id' },
     *   );
     * ```
     */
    delete(roleID, params, options) {
      const { project_id } = params;
      return this._client.delete(path`/projects/${project_id}/roles/${roleID}`, {
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
  };

  // node_modules/openai/resources/admin/organization/projects/spend-alerts.mjs
  var SpendAlerts2 = class extends APIResource {
    /**
     * Creates a project spend alert.
     *
     * @example
     * ```ts
     * const projectSpendAlert =
     *   await client.admin.organization.projects.spendAlerts.create(
     *     'project_id',
     *     {
     *       currency: 'USD',
     *       interval: 'month',
     *       notification_channel: {
     *         recipients: ['string'],
     *         type: 'email',
     *       },
     *       threshold_amount: 0,
     *     },
     *   );
     * ```
     */
    create(projectID, body, options) {
      return this._client.post(path`/organization/projects/${projectID}/spend_alerts`, {
        body,
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Retrieves a project spend alert.
     *
     * @example
     * ```ts
     * const projectSpendAlert =
     *   await client.admin.organization.projects.spendAlerts.retrieve(
     *     'alert_id',
     *     { project_id: 'project_id' },
     *   );
     * ```
     */
    retrieve(alertID, params, options) {
      const { project_id } = params;
      return this._client.get(path`/organization/projects/${project_id}/spend_alerts/${alertID}`, {
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Updates a project spend alert.
     *
     * @example
     * ```ts
     * const projectSpendAlert =
     *   await client.admin.organization.projects.spendAlerts.update(
     *     'alert_id',
     *     {
     *       project_id: 'project_id',
     *       currency: 'USD',
     *       interval: 'month',
     *       notification_channel: {
     *         recipients: ['string'],
     *         type: 'email',
     *       },
     *       threshold_amount: 0,
     *     },
     *   );
     * ```
     */
    update(alertID, params, options) {
      const { project_id, ...body } = params;
      return this._client.post(path`/organization/projects/${project_id}/spend_alerts/${alertID}`, {
        body,
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Lists project spend alerts.
     *
     * @example
     * ```ts
     * // Automatically fetches more pages as needed.
     * for await (const projectSpendAlert of client.admin.organization.projects.spendAlerts.list(
     *   'project_id',
     * )) {
     *   // ...
     * }
     * ```
     */
    list(projectID, query = {}, options) {
      return this._client.getAPIList(path`/organization/projects/${projectID}/spend_alerts`, ConversationCursorPage, { query, ...options, __security: { adminAPIKeyAuth: true } });
    }
    /**
     * Deletes a project spend alert.
     *
     * @example
     * ```ts
     * const projectSpendAlertDeleted =
     *   await client.admin.organization.projects.spendAlerts.delete(
     *     'alert_id',
     *     { project_id: 'project_id' },
     *   );
     * ```
     */
    delete(alertID, params, options) {
      const { project_id } = params;
      return this._client.delete(path`/organization/projects/${project_id}/spend_alerts/${alertID}`, {
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
  };

  // node_modules/openai/resources/admin/organization/projects/spend-limit.mjs
  var SpendLimit2 = class extends APIResource {
    /**
     * Get a project's hard spend limit.
     *
     * @example
     * ```ts
     * const projectSpendLimit =
     *   await client.admin.organization.projects.spendLimit.retrieve(
     *     'proj_123',
     *   );
     * ```
     */
    retrieve(projectID, options) {
      return this._client.get(path`/organization/projects/${projectID}/spend_limit`, {
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Create or replace a project's hard spend limit.
     *
     * @example
     * ```ts
     * const projectSpendLimit =
     *   await client.admin.organization.projects.spendLimit.update(
     *     'proj_123',
     *     {
     *       currency: 'USD',
     *       interval: 'month',
     *       threshold_amount: 1,
     *     },
     *   );
     * ```
     */
    update(projectID, body, options) {
      return this._client.post(path`/organization/projects/${projectID}/spend_limit`, {
        body,
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Delete a project's hard spend limit.
     *
     * @example
     * ```ts
     * const projectSpendLimitDeleted =
     *   await client.admin.organization.projects.spendLimit.delete(
     *     'proj_123',
     *   );
     * ```
     */
    delete(projectID, options) {
      return this._client.delete(path`/organization/projects/${projectID}/spend_limit`, {
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
  };

  // node_modules/openai/resources/admin/organization/projects/groups/roles.mjs
  var Roles4 = class extends APIResource {
    /**
     * Assigns a project role to a group within a project.
     *
     * @example
     * ```ts
     * const role =
     *   await client.admin.organization.projects.groups.roles.create(
     *     'group_id',
     *     { project_id: 'project_id', role_id: 'role_id' },
     *   );
     * ```
     */
    create(groupID, params, options) {
      const { project_id, ...body } = params;
      return this._client.post(path`/projects/${project_id}/groups/${groupID}/roles`, {
        body,
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Retrieves a project role assigned to a group.
     *
     * @example
     * ```ts
     * const role =
     *   await client.admin.organization.projects.groups.roles.retrieve(
     *     'role_id',
     *     { project_id: 'project_id', group_id: 'group_id' },
     *   );
     * ```
     */
    retrieve(roleID, params, options) {
      const { project_id, group_id } = params;
      return this._client.get(path`/projects/${project_id}/groups/${group_id}/roles/${roleID}`, {
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Lists the project roles assigned to a group within a project.
     *
     * @example
     * ```ts
     * // Automatically fetches more pages as needed.
     * for await (const roleListResponse of client.admin.organization.projects.groups.roles.list(
     *   'group_id',
     *   { project_id: 'project_id' },
     * )) {
     *   // ...
     * }
     * ```
     */
    list(groupID, params, options) {
      const { project_id, ...query } = params;
      return this._client.getAPIList(path`/projects/${project_id}/groups/${groupID}/roles`, NextCursorPage, { query, ...options, __security: { adminAPIKeyAuth: true } });
    }
    /**
     * Unassigns a project role from a group within a project.
     *
     * @example
     * ```ts
     * const role =
     *   await client.admin.organization.projects.groups.roles.delete(
     *     'role_id',
     *     { project_id: 'project_id', group_id: 'group_id' },
     *   );
     * ```
     */
    delete(roleID, params, options) {
      const { project_id, group_id } = params;
      return this._client.delete(path`/projects/${project_id}/groups/${group_id}/roles/${roleID}`, {
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
  };

  // node_modules/openai/resources/admin/organization/projects/groups/groups.mjs
  var Groups2 = class extends APIResource {
    constructor() {
      super(...arguments);
      this.roles = new Roles4(this._client);
    }
    /**
     * Grants a group access to a project.
     *
     * @example
     * ```ts
     * const projectGroup =
     *   await client.admin.organization.projects.groups.create(
     *     'project_id',
     *     { group_id: 'group_id', role: 'role' },
     *   );
     * ```
     */
    create(projectID, body, options) {
      return this._client.post(path`/organization/projects/${projectID}/groups`, {
        body,
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Retrieves a project's group.
     *
     * @example
     * ```ts
     * const projectGroup =
     *   await client.admin.organization.projects.groups.retrieve(
     *     'group_id',
     *     { project_id: 'project_id' },
     *   );
     * ```
     */
    retrieve(groupID, params, options) {
      const { project_id, ...query } = params;
      return this._client.get(path`/organization/projects/${project_id}/groups/${groupID}`, {
        query,
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Lists the groups that have access to a project.
     *
     * @example
     * ```ts
     * // Automatically fetches more pages as needed.
     * for await (const projectGroup of client.admin.organization.projects.groups.list(
     *   'project_id',
     * )) {
     *   // ...
     * }
     * ```
     */
    list(projectID, query = {}, options) {
      return this._client.getAPIList(path`/organization/projects/${projectID}/groups`, NextCursorPage, { query, ...options, __security: { adminAPIKeyAuth: true } });
    }
    /**
     * Revokes a group's access to a project.
     *
     * @example
     * ```ts
     * const group =
     *   await client.admin.organization.projects.groups.delete(
     *     'group_id',
     *     { project_id: 'project_id' },
     *   );
     * ```
     */
    delete(groupID, params, options) {
      const { project_id } = params;
      return this._client.delete(path`/organization/projects/${project_id}/groups/${groupID}`, {
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
  };
  Groups2.Roles = Roles4;

  // node_modules/openai/resources/admin/organization/projects/service-accounts/api-keys.mjs
  var APIKeys2 = class extends APIResource {
    /**
     * Creates an API key for a service account in the project.
     *
     * @example
     * ```ts
     * const apiKey =
     *   await client.admin.organization.projects.serviceAccounts.apiKeys.create(
     *     'service_account_id',
     *     { project_id: 'project_id' },
     *   );
     * ```
     */
    create(serviceAccountID, params, options) {
      const { project_id, ...body } = params;
      return this._client.post(path`/organization/projects/${project_id}/service_accounts/${serviceAccountID}/api_keys`, { body, ...options, __security: { adminAPIKeyAuth: true } });
    }
  };

  // node_modules/openai/resources/admin/organization/projects/service-accounts/service-accounts.mjs
  var ServiceAccounts = class extends APIResource {
    constructor() {
      super(...arguments);
      this.apiKeys = new APIKeys2(this._client);
    }
    /**
     * Creates a new service account in the project. By default, this also returns an
     * unredacted API key for the service account.
     *
     * @example
     * ```ts
     * const serviceAccount =
     *   await client.admin.organization.projects.serviceAccounts.create(
     *     'project_id',
     *     { name: 'name' },
     *   );
     * ```
     */
    create(projectID, body, options) {
      return this._client.post(path`/organization/projects/${projectID}/service_accounts`, {
        body,
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Retrieves a service account in the project.
     *
     * @example
     * ```ts
     * const projectServiceAccount =
     *   await client.admin.organization.projects.serviceAccounts.retrieve(
     *     'service_account_id',
     *     { project_id: 'project_id' },
     *   );
     * ```
     */
    retrieve(serviceAccountID, params, options) {
      const { project_id } = params;
      return this._client.get(path`/organization/projects/${project_id}/service_accounts/${serviceAccountID}`, {
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Updates a service account in the project.
     *
     * @example
     * ```ts
     * const projectServiceAccount =
     *   await client.admin.organization.projects.serviceAccounts.update(
     *     'service_account_id',
     *     { project_id: 'project_id' },
     *   );
     * ```
     */
    update(serviceAccountID, params, options) {
      const { project_id, ...body } = params;
      return this._client.post(path`/organization/projects/${project_id}/service_accounts/${serviceAccountID}`, { body, ...options, __security: { adminAPIKeyAuth: true } });
    }
    /**
     * Returns a list of service accounts in the project.
     *
     * @example
     * ```ts
     * // Automatically fetches more pages as needed.
     * for await (const projectServiceAccount of client.admin.organization.projects.serviceAccounts.list(
     *   'project_id',
     * )) {
     *   // ...
     * }
     * ```
     */
    list(projectID, query = {}, options) {
      return this._client.getAPIList(path`/organization/projects/${projectID}/service_accounts`, ConversationCursorPage, { query, ...options, __security: { adminAPIKeyAuth: true } });
    }
    /**
     * Deletes a service account from the project.
     *
     * Returns confirmation of service account deletion, or an error if the project is
     * archived (archived projects have no service accounts).
     *
     * @example
     * ```ts
     * const serviceAccount =
     *   await client.admin.organization.projects.serviceAccounts.delete(
     *     'service_account_id',
     *     { project_id: 'project_id' },
     *   );
     * ```
     */
    delete(serviceAccountID, params, options) {
      const { project_id } = params;
      return this._client.delete(path`/organization/projects/${project_id}/service_accounts/${serviceAccountID}`, { ...options, __security: { adminAPIKeyAuth: true } });
    }
  };
  ServiceAccounts.APIKeys = APIKeys2;

  // node_modules/openai/resources/admin/organization/projects/users/roles.mjs
  var Roles5 = class extends APIResource {
    /**
     * Assigns a project role to a user within a project.
     *
     * @example
     * ```ts
     * const role =
     *   await client.admin.organization.projects.users.roles.create(
     *     'user_id',
     *     { project_id: 'project_id', role_id: 'role_id' },
     *   );
     * ```
     */
    create(userID, params, options) {
      const { project_id, ...body } = params;
      return this._client.post(path`/projects/${project_id}/users/${userID}/roles`, {
        body,
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Retrieves a project role assigned to a user.
     *
     * @example
     * ```ts
     * const role =
     *   await client.admin.organization.projects.users.roles.retrieve(
     *     'role_id',
     *     { project_id: 'project_id', user_id: 'user_id' },
     *   );
     * ```
     */
    retrieve(roleID, params, options) {
      const { project_id, user_id } = params;
      return this._client.get(path`/projects/${project_id}/users/${user_id}/roles/${roleID}`, {
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Lists the project roles assigned to a user within a project.
     *
     * @example
     * ```ts
     * // Automatically fetches more pages as needed.
     * for await (const roleListResponse of client.admin.organization.projects.users.roles.list(
     *   'user_id',
     *   { project_id: 'project_id' },
     * )) {
     *   // ...
     * }
     * ```
     */
    list(userID, params, options) {
      const { project_id, ...query } = params;
      return this._client.getAPIList(path`/projects/${project_id}/users/${userID}/roles`, NextCursorPage, { query, ...options, __security: { adminAPIKeyAuth: true } });
    }
    /**
     * Unassigns a project role from a user within a project.
     *
     * @example
     * ```ts
     * const role =
     *   await client.admin.organization.projects.users.roles.delete(
     *     'role_id',
     *     { project_id: 'project_id', user_id: 'user_id' },
     *   );
     * ```
     */
    delete(roleID, params, options) {
      const { project_id, user_id } = params;
      return this._client.delete(path`/projects/${project_id}/users/${user_id}/roles/${roleID}`, {
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
  };

  // node_modules/openai/resources/admin/organization/projects/users/users.mjs
  var Users2 = class extends APIResource {
    constructor() {
      super(...arguments);
      this.roles = new Roles5(this._client);
    }
    /**
     * Adds a user to the project. Users must already be members of the organization to
     * be added to a project.
     *
     * @example
     * ```ts
     * const projectUser =
     *   await client.admin.organization.projects.users.create(
     *     'project_id',
     *     { role: 'role' },
     *   );
     * ```
     */
    create(projectID, body, options) {
      return this._client.post(path`/organization/projects/${projectID}/users`, {
        body,
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Retrieves a user in the project.
     *
     * @example
     * ```ts
     * const projectUser =
     *   await client.admin.organization.projects.users.retrieve(
     *     'user_id',
     *     { project_id: 'project_id' },
     *   );
     * ```
     */
    retrieve(userID, params, options) {
      const { project_id } = params;
      return this._client.get(path`/organization/projects/${project_id}/users/${userID}`, {
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Modifies a user's role in the project.
     *
     * @example
     * ```ts
     * const projectUser =
     *   await client.admin.organization.projects.users.update(
     *     'user_id',
     *     { project_id: 'project_id' },
     *   );
     * ```
     */
    update(userID, params, options) {
      const { project_id, ...body } = params;
      return this._client.post(path`/organization/projects/${project_id}/users/${userID}`, {
        body,
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Returns a list of users in the project.
     *
     * @example
     * ```ts
     * // Automatically fetches more pages as needed.
     * for await (const projectUser of client.admin.organization.projects.users.list(
     *   'project_id',
     * )) {
     *   // ...
     * }
     * ```
     */
    list(projectID, query = {}, options) {
      return this._client.getAPIList(path`/organization/projects/${projectID}/users`, ConversationCursorPage, { query, ...options, __security: { adminAPIKeyAuth: true } });
    }
    /**
     * Deletes a user from the project.
     *
     * Returns confirmation of project user deletion, or an error if the project is
     * archived (archived projects have no users).
     *
     * @example
     * ```ts
     * const user =
     *   await client.admin.organization.projects.users.delete(
     *     'user_id',
     *     { project_id: 'project_id' },
     *   );
     * ```
     */
    delete(userID, params, options) {
      const { project_id } = params;
      return this._client.delete(path`/organization/projects/${project_id}/users/${userID}`, {
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
  };
  Users2.Roles = Roles5;

  // node_modules/openai/resources/admin/organization/projects/projects.mjs
  var Projects = class extends APIResource {
    constructor() {
      super(...arguments);
      this.users = new Users2(this._client);
      this.serviceAccounts = new ServiceAccounts(this._client);
      this.apiKeys = new APIKeys(this._client);
      this.rateLimits = new RateLimits(this._client);
      this.modelPermissions = new ModelPermissions(this._client);
      this.hostedToolPermissions = new HostedToolPermissions(this._client);
      this.groups = new Groups2(this._client);
      this.roles = new Roles3(this._client);
      this.dataRetention = new DataRetention2(this._client);
      this.spendLimit = new SpendLimit2(this._client);
      this.spendAlerts = new SpendAlerts2(this._client);
      this.certificates = new Certificates2(this._client);
    }
    /**
     * Create a new project in the organization. Projects can be created and archived,
     * but cannot be deleted.
     *
     * @example
     * ```ts
     * const project =
     *   await client.admin.organization.projects.create({
     *     name: 'name',
     *   });
     * ```
     */
    create(body, options) {
      return this._client.post("/organization/projects", {
        body,
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Retrieves a project.
     *
     * @example
     * ```ts
     * const project =
     *   await client.admin.organization.projects.retrieve(
     *     'project_id',
     *   );
     * ```
     */
    retrieve(projectID, options) {
      return this._client.get(path`/organization/projects/${projectID}`, {
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Modifies a project in the organization.
     *
     * @example
     * ```ts
     * const project =
     *   await client.admin.organization.projects.update(
     *     'project_id',
     *   );
     * ```
     */
    update(projectID, body, options) {
      return this._client.post(path`/organization/projects/${projectID}`, {
        body,
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Returns a list of projects.
     *
     * @example
     * ```ts
     * // Automatically fetches more pages as needed.
     * for await (const project of client.admin.organization.projects.list()) {
     *   // ...
     * }
     * ```
     */
    list(query = {}, options) {
      return this._client.getAPIList("/organization/projects", ConversationCursorPage, {
        query,
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Archives a project in the organization. Archived projects cannot be used or
     * updated.
     *
     * @example
     * ```ts
     * const project =
     *   await client.admin.organization.projects.archive(
     *     'project_id',
     *   );
     * ```
     */
    archive(projectID, options) {
      return this._client.post(path`/organization/projects/${projectID}/archive`, {
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
  };
  Projects.Users = Users2;
  Projects.ServiceAccounts = ServiceAccounts;
  Projects.APIKeys = APIKeys;
  Projects.RateLimits = RateLimits;
  Projects.ModelPermissions = ModelPermissions;
  Projects.HostedToolPermissions = HostedToolPermissions;
  Projects.Groups = Groups2;
  Projects.Roles = Roles3;
  Projects.DataRetention = DataRetention2;
  Projects.SpendLimit = SpendLimit2;
  Projects.SpendAlerts = SpendAlerts2;
  Projects.Certificates = Certificates2;

  // node_modules/openai/resources/admin/organization/users/roles.mjs
  var Roles6 = class extends APIResource {
    /**
     * Assigns an organization role to a user within the organization.
     *
     * @example
     * ```ts
     * const role =
     *   await client.admin.organization.users.roles.create(
     *     'user_id',
     *     { role_id: 'role_id' },
     *   );
     * ```
     */
    create(userID, body, options) {
      return this._client.post(path`/organization/users/${userID}/roles`, {
        body,
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Retrieves an organization role assigned to a user.
     *
     * @example
     * ```ts
     * const role =
     *   await client.admin.organization.users.roles.retrieve(
     *     'role_id',
     *     { user_id: 'user_id' },
     *   );
     * ```
     */
    retrieve(roleID, params, options) {
      const { user_id } = params;
      return this._client.get(path`/organization/users/${user_id}/roles/${roleID}`, {
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Lists the organization roles assigned to a user within the organization.
     *
     * @example
     * ```ts
     * // Automatically fetches more pages as needed.
     * for await (const roleListResponse of client.admin.organization.users.roles.list(
     *   'user_id',
     * )) {
     *   // ...
     * }
     * ```
     */
    list(userID, query = {}, options) {
      return this._client.getAPIList(path`/organization/users/${userID}/roles`, NextCursorPage, { query, ...options, __security: { adminAPIKeyAuth: true } });
    }
    /**
     * Unassigns an organization role from a user within the organization.
     *
     * @example
     * ```ts
     * const role =
     *   await client.admin.organization.users.roles.delete(
     *     'role_id',
     *     { user_id: 'user_id' },
     *   );
     * ```
     */
    delete(roleID, params, options) {
      const { user_id } = params;
      return this._client.delete(path`/organization/users/${user_id}/roles/${roleID}`, {
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
  };

  // node_modules/openai/resources/admin/organization/users/users.mjs
  var Users3 = class extends APIResource {
    constructor() {
      super(...arguments);
      this.roles = new Roles6(this._client);
    }
    /**
     * Retrieves a user by their identifier.
     *
     * @example
     * ```ts
     * const organizationUser =
     *   await client.admin.organization.users.retrieve('user_id');
     * ```
     */
    retrieve(userID, options) {
      return this._client.get(path`/organization/users/${userID}`, {
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Modifies a user's role in the organization.
     *
     * @example
     * ```ts
     * const organizationUser =
     *   await client.admin.organization.users.update('user_id');
     * ```
     */
    update(userID, body, options) {
      return this._client.post(path`/organization/users/${userID}`, {
        body,
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Lists all of the users in the organization.
     *
     * @example
     * ```ts
     * // Automatically fetches more pages as needed.
     * for await (const organizationUser of client.admin.organization.users.list()) {
     *   // ...
     * }
     * ```
     */
    list(query = {}, options) {
      return this._client.getAPIList("/organization/users", ConversationCursorPage, {
        query,
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * Deletes a user from the organization.
     *
     * @example
     * ```ts
     * const user = await client.admin.organization.users.delete(
     *   'user_id',
     * );
     * ```
     */
    delete(userID, options) {
      return this._client.delete(path`/organization/users/${userID}`, {
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
  };
  Users3.Roles = Roles6;

  // node_modules/openai/resources/admin/organization/organization.mjs
  var Organization = class extends APIResource {
    constructor() {
      super(...arguments);
      this.auditLogs = new AuditLogs(this._client);
      this.adminAPIKeys = new AdminAPIKeys(this._client);
      this.usage = new Usage(this._client);
      this.invites = new Invites(this._client);
      this.users = new Users3(this._client);
      this.groups = new Groups(this._client);
      this.roles = new Roles(this._client);
      this.dataRetention = new DataRetention(this._client);
      this.spendLimit = new SpendLimit(this._client);
      this.spendAlerts = new SpendAlerts(this._client);
      this.certificates = new Certificates(this._client);
      this.projects = new Projects(this._client);
    }
  };
  Organization.AuditLogs = AuditLogs;
  Organization.AdminAPIKeys = AdminAPIKeys;
  Organization.Usage = Usage;
  Organization.Invites = Invites;
  Organization.Users = Users3;
  Organization.Groups = Groups;
  Organization.Roles = Roles;
  Organization.DataRetention = DataRetention;
  Organization.SpendLimit = SpendLimit;
  Organization.SpendAlerts = SpendAlerts;
  Organization.Certificates = Certificates;
  Organization.Projects = Projects;

  // node_modules/openai/resources/admin/admin.mjs
  var Admin = class extends APIResource {
    constructor() {
      super(...arguments);
      this.organization = new Organization(this._client);
    }
  };
  Admin.Organization = Organization;

  // node_modules/openai/resources/audio/speech.mjs
  var Speech = class extends APIResource {
    /**
     * Generates audio from the input text.
     *
     * Returns the audio file content, or a stream of audio events.
     *
     * @example
     * ```ts
     * const speech = await client.audio.speech.create({
     *   input: 'input',
     *   model: 'tts-1',
     *   voice: 'alloy',
     * });
     *
     * const content = await speech.blob();
     * console.log(content);
     * ```
     */
    create(body, options) {
      return this._client.post("/audio/speech", {
        body,
        ...options,
        headers: buildHeaders([{ Accept: "application/octet-stream" }, options?.headers]),
        __security: { bearerAuth: true },
        __binaryResponse: true
      });
    }
  };

  // node_modules/openai/resources/audio/transcriptions.mjs
  var Transcriptions = class extends APIResource {
    create(body, options) {
      return this._client.post("/audio/transcriptions", multipartFormRequestOptions({
        body,
        ...options,
        stream: body.stream ?? false,
        __metadata: { model: body.model },
        __security: { bearerAuth: true }
      }, this._client));
    }
  };

  // node_modules/openai/resources/audio/translations.mjs
  var Translations = class extends APIResource {
    create(body, options) {
      return this._client.post("/audio/translations", multipartFormRequestOptions({ body, ...options, __metadata: { model: body.model }, __security: { bearerAuth: true } }, this._client));
    }
  };

  // node_modules/openai/resources/audio/audio.mjs
  var Audio = class extends APIResource {
    constructor() {
      super(...arguments);
      this.transcriptions = new Transcriptions(this._client);
      this.translations = new Translations(this._client);
      this.speech = new Speech(this._client);
    }
  };
  Audio.Transcriptions = Transcriptions;
  Audio.Translations = Translations;
  Audio.Speech = Speech;

  // node_modules/openai/resources/batches.mjs
  var Batches = class extends APIResource {
    /**
     * Creates and executes a batch from an uploaded file of requests
     */
    create(body, options) {
      return this._client.post("/batches", { body, ...options, __security: { bearerAuth: true } });
    }
    /**
     * Retrieves a batch.
     */
    retrieve(batchID, options) {
      return this._client.get(path`/batches/${batchID}`, { ...options, __security: { bearerAuth: true } });
    }
    /**
     * List your organization's batches.
     */
    list(query = {}, options) {
      return this._client.getAPIList("/batches", CursorPage, {
        query,
        ...options,
        __security: { bearerAuth: true }
      });
    }
    /**
     * Cancels an in-progress batch. The batch will be in status `cancelling` for up to
     * 10 minutes, before changing to `cancelled`, where it will have partial results
     * (if any) available in the output file.
     */
    cancel(batchID, options) {
      return this._client.post(path`/batches/${batchID}/cancel`, {
        ...options,
        __security: { bearerAuth: true }
      });
    }
  };

  // node_modules/openai/resources/beta/assistants.mjs
  var Assistants = class extends APIResource {
    /**
     * Create an assistant with a model and instructions.
     *
     * @deprecated
     */
    create(body, options) {
      return this._client.post("/assistants", {
        body,
        ...options,
        headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
        __security: { bearerAuth: true }
      });
    }
    /**
     * Retrieves an assistant.
     *
     * @deprecated
     */
    retrieve(assistantID, options) {
      return this._client.get(path`/assistants/${assistantID}`, {
        ...options,
        headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
        __security: { bearerAuth: true }
      });
    }
    /**
     * Modifies an assistant.
     *
     * @deprecated
     */
    update(assistantID, body, options) {
      return this._client.post(path`/assistants/${assistantID}`, {
        body,
        ...options,
        headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
        __security: { bearerAuth: true }
      });
    }
    /**
     * Returns a list of assistants.
     *
     * @deprecated
     */
    list(query = {}, options) {
      return this._client.getAPIList("/assistants", CursorPage, {
        query,
        ...options,
        headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
        __security: { bearerAuth: true }
      });
    }
    /**
     * Delete an assistant.
     *
     * @deprecated
     */
    delete(assistantID, options) {
      return this._client.delete(path`/assistants/${assistantID}`, {
        ...options,
        headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
        __security: { bearerAuth: true }
      });
    }
  };

  // node_modules/openai/resources/beta/realtime/sessions.mjs
  var Sessions = class extends APIResource {
    /**
     * Create an ephemeral API token for use in client-side applications with the
     * Realtime API. Can be configured with the same session parameters as the
     * `session.update` client event.
     *
     * It responds with a session object, plus a `client_secret` key which contains a
     * usable ephemeral API token that can be used to authenticate browser clients for
     * the Realtime API.
     *
     * @example
     * ```ts
     * const session =
     *   await client.beta.realtime.sessions.create();
     * ```
     */
    create(body, options) {
      return this._client.post("/realtime/sessions", {
        body,
        ...options,
        headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
        __security: { bearerAuth: true }
      });
    }
  };

  // node_modules/openai/resources/beta/realtime/transcription-sessions.mjs
  var TranscriptionSessions = class extends APIResource {
    /**
     * Create an ephemeral API token for use in client-side applications with the
     * Realtime API specifically for realtime transcriptions. Can be configured with
     * the same session parameters as the `transcription_session.update` client event.
     *
     * It responds with a session object, plus a `client_secret` key which contains a
     * usable ephemeral API token that can be used to authenticate browser clients for
     * the Realtime API.
     *
     * @example
     * ```ts
     * const transcriptionSession =
     *   await client.beta.realtime.transcriptionSessions.create();
     * ```
     */
    create(body, options) {
      return this._client.post("/realtime/transcription_sessions", {
        body,
        ...options,
        headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
        __security: { bearerAuth: true }
      });
    }
  };

  // node_modules/openai/resources/beta/realtime/realtime.mjs
  var Realtime = class extends APIResource {
    constructor() {
      super(...arguments);
      this.sessions = new Sessions(this._client);
      this.transcriptionSessions = new TranscriptionSessions(this._client);
    }
  };
  Realtime.Sessions = Sessions;
  Realtime.TranscriptionSessions = TranscriptionSessions;

  // node_modules/openai/resources/beta/chatkit/sessions.mjs
  var Sessions2 = class extends APIResource {
    /**
     * Create a ChatKit session.
     *
     * @example
     * ```ts
     * const chatSession =
     *   await client.beta.chatkit.sessions.create({
     *     user: 'x',
     *     workflow: { id: 'id' },
     *   });
     * ```
     */
    create(body, options) {
      return this._client.post("/chatkit/sessions", {
        body,
        ...options,
        headers: buildHeaders([{ "OpenAI-Beta": "chatkit_beta=v1" }, options?.headers]),
        __security: { bearerAuth: true }
      });
    }
    /**
     * Cancel an active ChatKit session and return its most recent metadata.
     *
     * Cancelling prevents new requests from using the issued client secret.
     *
     * @example
     * ```ts
     * const chatSession =
     *   await client.beta.chatkit.sessions.cancel('cksess_123');
     * ```
     */
    cancel(sessionID, options) {
      return this._client.post(path`/chatkit/sessions/${sessionID}/cancel`, {
        ...options,
        headers: buildHeaders([{ "OpenAI-Beta": "chatkit_beta=v1" }, options?.headers]),
        __security: { bearerAuth: true }
      });
    }
  };

  // node_modules/openai/resources/beta/chatkit/threads.mjs
  var Threads = class extends APIResource {
    /**
     * Retrieve a ChatKit thread by its identifier.
     *
     * @example
     * ```ts
     * const chatkitThread =
     *   await client.beta.chatkit.threads.retrieve('cthr_123');
     * ```
     */
    retrieve(threadID, options) {
      return this._client.get(path`/chatkit/threads/${threadID}`, {
        ...options,
        headers: buildHeaders([{ "OpenAI-Beta": "chatkit_beta=v1" }, options?.headers]),
        __security: { bearerAuth: true }
      });
    }
    /**
     * List ChatKit threads with optional pagination and user filters.
     *
     * @example
     * ```ts
     * // Automatically fetches more pages as needed.
     * for await (const chatkitThread of client.beta.chatkit.threads.list()) {
     *   // ...
     * }
     * ```
     */
    list(query = {}, options) {
      return this._client.getAPIList("/chatkit/threads", ConversationCursorPage, {
        query,
        ...options,
        headers: buildHeaders([{ "OpenAI-Beta": "chatkit_beta=v1" }, options?.headers]),
        __security: { bearerAuth: true }
      });
    }
    /**
     * Delete a ChatKit thread along with its items and stored attachments.
     *
     * @example
     * ```ts
     * const thread = await client.beta.chatkit.threads.delete(
     *   'cthr_123',
     * );
     * ```
     */
    delete(threadID, options) {
      return this._client.delete(path`/chatkit/threads/${threadID}`, {
        ...options,
        headers: buildHeaders([{ "OpenAI-Beta": "chatkit_beta=v1" }, options?.headers]),
        __security: { bearerAuth: true }
      });
    }
    /**
     * List items that belong to a ChatKit thread.
     *
     * @example
     * ```ts
     * // Automatically fetches more pages as needed.
     * for await (const thread of client.beta.chatkit.threads.listItems(
     *   'cthr_123',
     * )) {
     *   // ...
     * }
     * ```
     */
    listItems(threadID, query = {}, options) {
      return this._client.getAPIList(path`/chatkit/threads/${threadID}/items`, ConversationCursorPage, {
        query,
        ...options,
        headers: buildHeaders([{ "OpenAI-Beta": "chatkit_beta=v1" }, options?.headers]),
        __security: { bearerAuth: true }
      });
    }
  };

  // node_modules/openai/resources/beta/chatkit/chatkit.mjs
  var ChatKit = class extends APIResource {
    constructor() {
      super(...arguments);
      this.sessions = new Sessions2(this._client);
      this.threads = new Threads(this._client);
    }
  };
  ChatKit.Sessions = Sessions2;
  ChatKit.Threads = Threads;

  // node_modules/openai/resources/beta/responses/input-items.mjs
  var InputItems = class extends APIResource {
    /**
     * Returns a list of input items for a given response.
     *
     * @example
     * ```ts
     * // Automatically fetches more pages as needed.
     * for await (const betaResponseItem of client.beta.responses.inputItems.list(
     *   'response_id',
     * )) {
     *   // ...
     * }
     * ```
     */
    list(responseID, params = {}, options) {
      const { betas, ...query } = params ?? {};
      return this._client.getAPIList(path`/responses/${responseID}/input_items?beta=true`, CursorPage, {
        query,
        ...options,
        headers: buildHeaders([
          { ...betas?.toString() != null ? { "openai-beta": betas?.toString() } : void 0 },
          options?.headers
        ]),
        __security: { bearerAuth: true }
      });
    }
  };

  // node_modules/openai/resources/beta/responses/input-tokens.mjs
  var InputTokens = class extends APIResource {
    /**
     * Returns input token counts of the request.
     *
     * Returns an object with `object` set to `response.input_tokens` and an
     * `input_tokens` count.
     *
     * @example
     * ```ts
     * const response =
     *   await client.beta.responses.inputTokens.count();
     * ```
     */
    count(params = {}, options) {
      const { betas, ...body } = params ?? {};
      return this._client.post("/responses/input_tokens?beta=true", {
        body,
        ...options,
        headers: buildHeaders([
          { ...betas?.toString() != null ? { "openai-beta": betas?.toString() } : void 0 },
          options?.headers
        ]),
        __security: { bearerAuth: true }
      });
    }
  };

  // node_modules/openai/resources/beta/responses/responses.mjs
  var Responses = class extends APIResource {
    constructor() {
      super(...arguments);
      this.inputItems = new InputItems(this._client);
      this.inputTokens = new InputTokens(this._client);
    }
    create(params, options) {
      const { betas, ...body } = params;
      return this._client.post("/responses?beta=true", {
        body,
        ...options,
        headers: buildHeaders([
          { ...betas?.toString() != null ? { "openai-beta": betas?.toString() } : void 0 },
          options?.headers
        ]),
        stream: params.stream ?? false,
        __security: { bearerAuth: true }
      });
    }
    retrieve(responseID, params = {}, options) {
      const { betas, ...query } = params ?? {};
      return this._client.get(path`/responses/${responseID}?beta=true`, {
        query,
        ...options,
        headers: buildHeaders([
          { ...betas?.toString() != null ? { "openai-beta": betas?.toString() } : void 0 },
          options?.headers
        ]),
        stream: params?.stream ?? false,
        __security: { bearerAuth: true }
      });
    }
    /**
     * Deletes a model response with the given ID.
     *
     * @example
     * ```ts
     * await client.beta.responses.delete(
     *   'resp_677efb5139a88190b512bc3fef8e535d',
     * );
     * ```
     */
    delete(responseID, params = {}, options) {
      const { betas } = params ?? {};
      return this._client.delete(path`/responses/${responseID}?beta=true`, {
        ...options,
        headers: buildHeaders([
          { Accept: "*/*", ...betas?.toString() != null ? { "openai-beta": betas?.toString() } : void 0 },
          options?.headers
        ]),
        __security: { bearerAuth: true }
      });
    }
    /**
     * Cancels a model response with the given ID. Only responses created with the
     * `background` parameter set to `true` can be cancelled.
     * [Learn more](https://platform.openai.com/docs/guides/background).
     *
     * @example
     * ```ts
     * const betaResponse = await client.beta.responses.cancel(
     *   'resp_677efb5139a88190b512bc3fef8e535d',
     * );
     * ```
     */
    cancel(responseID, params = {}, options) {
      const { betas } = params ?? {};
      return this._client.post(path`/responses/${responseID}/cancel?beta=true`, {
        ...options,
        headers: buildHeaders([
          { ...betas?.toString() != null ? { "openai-beta": betas?.toString() } : void 0 },
          options?.headers
        ]),
        __security: { bearerAuth: true }
      });
    }
    /**
     * Compact a conversation. Returns a compacted response object.
     *
     * Learn when and how to compact long-running conversations in the
     * [conversation state guide](https://platform.openai.com/docs/guides/conversation-state#managing-the-context-window).
     * For ZDR-compatible compaction details, see
     * [Compaction (advanced)](https://platform.openai.com/docs/guides/conversation-state#compaction-advanced).
     *
     * @example
     * ```ts
     * const betaCompactedResponse =
     *   await client.beta.responses.compact({
     *     model: 'gpt-5.6-sol',
     *   });
     * ```
     */
    compact(params, options) {
      const { betas, ...body } = params;
      return this._client.post("/responses/compact?beta=true", {
        body,
        ...options,
        headers: buildHeaders([
          { ...betas?.toString() != null ? { "openai-beta": betas?.toString() } : void 0 },
          options?.headers
        ]),
        __security: { bearerAuth: true }
      });
    }
  };
  Responses.InputItems = InputItems;
  Responses.InputTokens = InputTokens;

  // node_modules/openai/resources/beta/threads/messages.mjs
  var Messages2 = class extends APIResource {
    /**
     * Create a message.
     *
     * @deprecated The Assistants API is deprecated in favor of the Responses API
     */
    create(threadID, body, options) {
      return this._client.post(path`/threads/${threadID}/messages`, {
        body,
        ...options,
        headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
        __security: { bearerAuth: true }
      });
    }
    /**
     * Retrieve a message.
     *
     * @deprecated The Assistants API is deprecated in favor of the Responses API
     */
    retrieve(messageID, params, options) {
      const { thread_id } = params;
      return this._client.get(path`/threads/${thread_id}/messages/${messageID}`, {
        ...options,
        headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
        __security: { bearerAuth: true }
      });
    }
    /**
     * Modifies a message.
     *
     * @deprecated The Assistants API is deprecated in favor of the Responses API
     */
    update(messageID, params, options) {
      const { thread_id, ...body } = params;
      return this._client.post(path`/threads/${thread_id}/messages/${messageID}`, {
        body,
        ...options,
        headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
        __security: { bearerAuth: true }
      });
    }
    /**
     * Returns a list of messages for a given thread.
     *
     * @deprecated The Assistants API is deprecated in favor of the Responses API
     */
    list(threadID, query = {}, options) {
      return this._client.getAPIList(path`/threads/${threadID}/messages`, CursorPage, {
        query,
        ...options,
        headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
        __security: { bearerAuth: true }
      });
    }
    /**
     * Deletes a message.
     *
     * @deprecated The Assistants API is deprecated in favor of the Responses API
     */
    delete(messageID, params, options) {
      const { thread_id } = params;
      return this._client.delete(path`/threads/${thread_id}/messages/${messageID}`, {
        ...options,
        headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
        __security: { bearerAuth: true }
      });
    }
  };

  // node_modules/openai/resources/beta/threads/runs/steps.mjs
  var Steps = class extends APIResource {
    /**
     * Retrieves a run step.
     *
     * @deprecated The Assistants API is deprecated in favor of the Responses API
     */
    retrieve(stepID, params, options) {
      const { thread_id, run_id, ...query } = params;
      return this._client.get(path`/threads/${thread_id}/runs/${run_id}/steps/${stepID}`, {
        query,
        ...options,
        headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
        __security: { bearerAuth: true }
      });
    }
    /**
     * Returns a list of run steps belonging to a run.
     *
     * @deprecated The Assistants API is deprecated in favor of the Responses API
     */
    list(runID, params, options) {
      const { thread_id, ...query } = params;
      return this._client.getAPIList(path`/threads/${thread_id}/runs/${runID}/steps`, CursorPage, {
        query,
        ...options,
        headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
        __security: { bearerAuth: true }
      });
    }
  };

  // node_modules/openai/internal/utils/base64.mjs
  var toFloat32Array = (base64Str) => {
    if (typeof Buffer !== "undefined") {
      const buf = Buffer.from(base64Str, "base64");
      return Array.from(new Float32Array(buf.buffer, buf.byteOffset, buf.length / Float32Array.BYTES_PER_ELEMENT));
    } else {
      const binaryStr = atob(base64Str);
      const len = binaryStr.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      return Array.from(new Float32Array(bytes.buffer));
    }
  };

  // node_modules/openai/internal/utils/env.mjs
  var readEnv = (env) => {
    if (typeof globalThis.process !== "undefined") {
      return globalThis.process.env?.[env]?.trim() || void 0;
    }
    if (typeof globalThis.Deno !== "undefined") {
      return globalThis.Deno.env?.get?.(env)?.trim() || void 0;
    }
    return void 0;
  };

  // node_modules/openai/lib/AssistantStream.mjs
  var _AssistantStream_instances;
  var _a;
  var _AssistantStream_events;
  var _AssistantStream_runStepSnapshots;
  var _AssistantStream_messageSnapshots;
  var _AssistantStream_messageSnapshot;
  var _AssistantStream_finalRun;
  var _AssistantStream_currentContentIndex;
  var _AssistantStream_currentContent;
  var _AssistantStream_currentToolCallIndex;
  var _AssistantStream_currentToolCall;
  var _AssistantStream_currentEvent;
  var _AssistantStream_currentRunSnapshot;
  var _AssistantStream_currentRunStepSnapshot;
  var _AssistantStream_addEvent;
  var _AssistantStream_endRequest;
  var _AssistantStream_handleMessage;
  var _AssistantStream_handleRunStep;
  var _AssistantStream_handleEvent;
  var _AssistantStream_accumulateRunStep;
  var _AssistantStream_accumulateMessage;
  var _AssistantStream_accumulateContent;
  var _AssistantStream_handleRun;
  var AssistantStream = class extends EventStream {
    constructor() {
      super(...arguments);
      _AssistantStream_instances.add(this);
      _AssistantStream_events.set(this, []);
      _AssistantStream_runStepSnapshots.set(this, {});
      _AssistantStream_messageSnapshots.set(this, {});
      _AssistantStream_messageSnapshot.set(this, void 0);
      _AssistantStream_finalRun.set(this, void 0);
      _AssistantStream_currentContentIndex.set(this, void 0);
      _AssistantStream_currentContent.set(this, void 0);
      _AssistantStream_currentToolCallIndex.set(this, void 0);
      _AssistantStream_currentToolCall.set(this, void 0);
      _AssistantStream_currentEvent.set(this, void 0);
      _AssistantStream_currentRunSnapshot.set(this, void 0);
      _AssistantStream_currentRunStepSnapshot.set(this, void 0);
    }
    [(_AssistantStream_events = /* @__PURE__ */ new WeakMap(), _AssistantStream_runStepSnapshots = /* @__PURE__ */ new WeakMap(), _AssistantStream_messageSnapshots = /* @__PURE__ */ new WeakMap(), _AssistantStream_messageSnapshot = /* @__PURE__ */ new WeakMap(), _AssistantStream_finalRun = /* @__PURE__ */ new WeakMap(), _AssistantStream_currentContentIndex = /* @__PURE__ */ new WeakMap(), _AssistantStream_currentContent = /* @__PURE__ */ new WeakMap(), _AssistantStream_currentToolCallIndex = /* @__PURE__ */ new WeakMap(), _AssistantStream_currentToolCall = /* @__PURE__ */ new WeakMap(), _AssistantStream_currentEvent = /* @__PURE__ */ new WeakMap(), _AssistantStream_currentRunSnapshot = /* @__PURE__ */ new WeakMap(), _AssistantStream_currentRunStepSnapshot = /* @__PURE__ */ new WeakMap(), _AssistantStream_instances = /* @__PURE__ */ new WeakSet(), Symbol.asyncIterator)]() {
      const pushQueue = [];
      const readQueue = [];
      let done = false;
      this.on("event", (event) => {
        const eventCopy = structuredClone(event);
        const reader = readQueue.shift();
        if (reader) {
          reader.resolve(eventCopy);
        } else {
          pushQueue.push(eventCopy);
        }
      });
      this.on("end", () => {
        done = true;
        for (const reader of readQueue) {
          reader.resolve(void 0);
        }
        readQueue.length = 0;
      });
      this.on("abort", (err) => {
        done = true;
        for (const reader of readQueue) {
          reader.reject(err);
        }
        readQueue.length = 0;
      });
      this.on("error", (err) => {
        done = true;
        for (const reader of readQueue) {
          reader.reject(err);
        }
        readQueue.length = 0;
      });
      return {
        next: async () => {
          if (!pushQueue.length) {
            if (done) {
              return { value: void 0, done: true };
            }
            return new Promise((resolve, reject) => readQueue.push({ resolve, reject })).then((chunk2) => chunk2 ? { value: chunk2, done: false } : { value: void 0, done: true });
          }
          const chunk = pushQueue.shift();
          return { value: chunk, done: false };
        },
        return: async () => {
          this.abort();
          return { value: void 0, done: true };
        }
      };
    }
    static fromReadableStream(stream) {
      const runner = new _a();
      runner._run(() => runner._fromReadableStream(stream));
      return runner;
    }
    async _fromReadableStream(readableStream, options) {
      this._listenForAbort(options?.signal);
      this._connected();
      const stream = Stream.fromReadableStream(readableStream, this.controller);
      for await (const event of stream) {
        __classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_addEvent).call(this, event);
      }
      if (stream.controller.signal?.aborted) {
        throw new APIUserAbortError();
      }
      return this._addRun(__classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_endRequest).call(this));
    }
    toReadableStream() {
      const stream = new Stream(this[Symbol.asyncIterator].bind(this), this.controller);
      return stream.toReadableStream();
    }
    static createToolAssistantStream(runId, runs, params, options) {
      const runner = new _a();
      runner._run(() => runner._runToolAssistantStream(runId, runs, params, {
        ...options,
        headers: { ...options?.headers, "X-Stainless-Helper-Method": "stream" }
      }));
      return runner;
    }
    async _createToolAssistantStream(run, runId, params, options) {
      this._listenForAbort(options?.signal);
      const body = { ...params, stream: true };
      const stream = await run.submitToolOutputs(runId, body, {
        ...options,
        signal: this.controller.signal
      });
      this._connected();
      for await (const event of stream) {
        __classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_addEvent).call(this, event);
      }
      if (stream.controller.signal?.aborted) {
        throw new APIUserAbortError();
      }
      return this._addRun(__classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_endRequest).call(this));
    }
    static createThreadAssistantStream(params, thread, options) {
      const runner = new _a();
      runner._run(() => runner._threadAssistantStream(params, thread, {
        ...options,
        headers: { ...options?.headers, "X-Stainless-Helper-Method": "stream" }
      }));
      return runner;
    }
    static createAssistantStream(threadId, runs, params, options) {
      const runner = new _a();
      runner._run(() => runner._runAssistantStream(threadId, runs, params, {
        ...options,
        headers: { ...options?.headers, "X-Stainless-Helper-Method": "stream" }
      }));
      return runner;
    }
    currentEvent() {
      return __classPrivateFieldGet(this, _AssistantStream_currentEvent, "f");
    }
    currentRun() {
      return __classPrivateFieldGet(this, _AssistantStream_currentRunSnapshot, "f");
    }
    currentMessageSnapshot() {
      return __classPrivateFieldGet(this, _AssistantStream_messageSnapshot, "f");
    }
    currentRunStepSnapshot() {
      return __classPrivateFieldGet(this, _AssistantStream_currentRunStepSnapshot, "f");
    }
    async finalRunSteps() {
      await this.done();
      return Object.values(__classPrivateFieldGet(this, _AssistantStream_runStepSnapshots, "f"));
    }
    async finalMessages() {
      await this.done();
      return Object.values(__classPrivateFieldGet(this, _AssistantStream_messageSnapshots, "f"));
    }
    async finalRun() {
      await this.done();
      if (!__classPrivateFieldGet(this, _AssistantStream_finalRun, "f"))
        throw Error("Final run was not received.");
      return __classPrivateFieldGet(this, _AssistantStream_finalRun, "f");
    }
    async _createThreadAssistantStream(thread, params, options) {
      this._listenForAbort(options?.signal);
      const body = { ...params, stream: true };
      const stream = await thread.createAndRun(body, { ...options, signal: this.controller.signal });
      this._connected();
      for await (const event of stream) {
        __classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_addEvent).call(this, event);
      }
      if (stream.controller.signal?.aborted) {
        throw new APIUserAbortError();
      }
      return this._addRun(__classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_endRequest).call(this));
    }
    async _createAssistantStream(run, threadId, params, options) {
      this._listenForAbort(options?.signal);
      const body = { ...params, stream: true };
      const stream = await run.create(threadId, body, { ...options, signal: this.controller.signal });
      this._connected();
      for await (const event of stream) {
        __classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_addEvent).call(this, event);
      }
      if (stream.controller.signal?.aborted) {
        throw new APIUserAbortError();
      }
      return this._addRun(__classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_endRequest).call(this));
    }
    static accumulateDelta(acc, delta) {
      for (const [key, deltaValue] of Object.entries(delta)) {
        if (!acc.hasOwnProperty(key)) {
          acc[key] = deltaValue;
          continue;
        }
        let accValue = acc[key];
        if (accValue === null || accValue === void 0) {
          acc[key] = deltaValue;
          continue;
        }
        if (key === "index" || key === "type") {
          acc[key] = deltaValue;
          continue;
        }
        if (typeof accValue === "string" && typeof deltaValue === "string") {
          accValue += deltaValue;
        } else if (typeof accValue === "number" && typeof deltaValue === "number") {
          accValue += deltaValue;
        } else if (isObj(accValue) && isObj(deltaValue)) {
          accValue = this.accumulateDelta(accValue, deltaValue);
        } else if (Array.isArray(accValue) && Array.isArray(deltaValue)) {
          if (accValue.every((x) => typeof x === "string" || typeof x === "number")) {
            accValue.push(...deltaValue);
            continue;
          }
          for (const deltaEntry of deltaValue) {
            if (!isObj(deltaEntry)) {
              throw new Error(`Expected array delta entry to be an object but got: ${deltaEntry}`);
            }
            const index = deltaEntry["index"];
            if (index == null) {
              console.error(deltaEntry);
              throw new Error("Expected array delta entry to have an `index` property");
            }
            if (typeof index !== "number") {
              throw new Error(`Expected array delta entry \`index\` property to be a number but got ${index}`);
            }
            const accEntry = accValue[index];
            if (accEntry == null) {
              accValue[index] = deltaEntry;
            } else {
              accValue[index] = this.accumulateDelta(accEntry, deltaEntry);
            }
          }
          continue;
        } else {
          throw Error(`Unhandled record type: ${key}, deltaValue: ${deltaValue}, accValue: ${accValue}`);
        }
        acc[key] = accValue;
      }
      return acc;
    }
    _addRun(run) {
      return run;
    }
    async _threadAssistantStream(params, thread, options) {
      return await this._createThreadAssistantStream(thread, params, options);
    }
    async _runAssistantStream(threadId, runs, params, options) {
      return await this._createAssistantStream(runs, threadId, params, options);
    }
    async _runToolAssistantStream(runId, runs, params, options) {
      return await this._createToolAssistantStream(runs, runId, params, options);
    }
  };
  _a = AssistantStream, _AssistantStream_addEvent = function _AssistantStream_addEvent2(event) {
    if (this.ended)
      return;
    __classPrivateFieldSet(this, _AssistantStream_currentEvent, event, "f");
    __classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_handleEvent).call(this, event);
    switch (event.event) {
      case "thread.created":
        break;
      case "thread.run.created":
      case "thread.run.queued":
      case "thread.run.in_progress":
      case "thread.run.requires_action":
      case "thread.run.completed":
      case "thread.run.incomplete":
      case "thread.run.failed":
      case "thread.run.cancelling":
      case "thread.run.cancelled":
      case "thread.run.expired":
        __classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_handleRun).call(this, event);
        break;
      case "thread.run.step.created":
      case "thread.run.step.in_progress":
      case "thread.run.step.delta":
      case "thread.run.step.completed":
      case "thread.run.step.failed":
      case "thread.run.step.cancelled":
      case "thread.run.step.expired":
        __classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_handleRunStep).call(this, event);
        break;
      case "thread.message.created":
      case "thread.message.in_progress":
      case "thread.message.delta":
      case "thread.message.completed":
      case "thread.message.incomplete":
        __classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_handleMessage).call(this, event);
        break;
      case "error":
        throw new Error("Encountered an error event in event processing - errors should be processed earlier");
      default:
        assertNever2(event);
    }
  }, _AssistantStream_endRequest = function _AssistantStream_endRequest2() {
    if (this.ended) {
      throw new OpenAIError(`stream has ended, this shouldn't happen`);
    }
    if (!__classPrivateFieldGet(this, _AssistantStream_finalRun, "f"))
      throw Error("Final run has not been received");
    return __classPrivateFieldGet(this, _AssistantStream_finalRun, "f");
  }, _AssistantStream_handleMessage = function _AssistantStream_handleMessage2(event) {
    const [accumulatedMessage, newContent] = __classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_accumulateMessage).call(this, event, __classPrivateFieldGet(this, _AssistantStream_messageSnapshot, "f"));
    __classPrivateFieldSet(this, _AssistantStream_messageSnapshot, accumulatedMessage, "f");
    __classPrivateFieldGet(this, _AssistantStream_messageSnapshots, "f")[accumulatedMessage.id] = accumulatedMessage;
    for (const content of newContent) {
      const snapshotContent = accumulatedMessage.content[content.index];
      if (snapshotContent?.type == "text") {
        this._emit("textCreated", snapshotContent.text);
      }
    }
    switch (event.event) {
      case "thread.message.created":
        this._emit("messageCreated", event.data);
        break;
      case "thread.message.in_progress":
        break;
      case "thread.message.delta":
        this._emit("messageDelta", event.data.delta, accumulatedMessage);
        if (event.data.delta.content) {
          for (const content of event.data.delta.content) {
            if (content.type == "text" && content.text) {
              let textDelta = content.text;
              let snapshot = accumulatedMessage.content[content.index];
              if (snapshot && snapshot.type == "text") {
                this._emit("textDelta", textDelta, snapshot.text);
              } else {
                throw Error("The snapshot associated with this text delta is not text or missing");
              }
            }
            if (content.index != __classPrivateFieldGet(this, _AssistantStream_currentContentIndex, "f")) {
              if (__classPrivateFieldGet(this, _AssistantStream_currentContent, "f")) {
                switch (__classPrivateFieldGet(this, _AssistantStream_currentContent, "f").type) {
                  case "text":
                    this._emit("textDone", __classPrivateFieldGet(this, _AssistantStream_currentContent, "f").text, __classPrivateFieldGet(this, _AssistantStream_messageSnapshot, "f"));
                    break;
                  case "image_file":
                    this._emit("imageFileDone", __classPrivateFieldGet(this, _AssistantStream_currentContent, "f").image_file, __classPrivateFieldGet(this, _AssistantStream_messageSnapshot, "f"));
                    break;
                }
              }
              __classPrivateFieldSet(this, _AssistantStream_currentContentIndex, content.index, "f");
            }
            __classPrivateFieldSet(this, _AssistantStream_currentContent, accumulatedMessage.content[content.index], "f");
          }
        }
        break;
      case "thread.message.completed":
      case "thread.message.incomplete":
        if (__classPrivateFieldGet(this, _AssistantStream_currentContentIndex, "f") !== void 0) {
          const currentContent = event.data.content[__classPrivateFieldGet(this, _AssistantStream_currentContentIndex, "f")];
          if (currentContent) {
            switch (currentContent.type) {
              case "image_file":
                this._emit("imageFileDone", currentContent.image_file, __classPrivateFieldGet(this, _AssistantStream_messageSnapshot, "f"));
                break;
              case "text":
                this._emit("textDone", currentContent.text, __classPrivateFieldGet(this, _AssistantStream_messageSnapshot, "f"));
                break;
            }
          }
        }
        if (__classPrivateFieldGet(this, _AssistantStream_messageSnapshot, "f")) {
          this._emit("messageDone", event.data);
        }
        __classPrivateFieldSet(this, _AssistantStream_messageSnapshot, void 0, "f");
    }
  }, _AssistantStream_handleRunStep = function _AssistantStream_handleRunStep2(event) {
    const accumulatedRunStep = __classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_accumulateRunStep).call(this, event);
    __classPrivateFieldSet(this, _AssistantStream_currentRunStepSnapshot, accumulatedRunStep, "f");
    switch (event.event) {
      case "thread.run.step.created":
        this._emit("runStepCreated", event.data);
        break;
      case "thread.run.step.delta":
        const delta = event.data.delta;
        if (delta.step_details && delta.step_details.type == "tool_calls" && delta.step_details.tool_calls && accumulatedRunStep.step_details.type == "tool_calls") {
          for (const toolCall of delta.step_details.tool_calls) {
            if (toolCall.index == __classPrivateFieldGet(this, _AssistantStream_currentToolCallIndex, "f")) {
              this._emit("toolCallDelta", toolCall, accumulatedRunStep.step_details.tool_calls[toolCall.index]);
            } else {
              if (__classPrivateFieldGet(this, _AssistantStream_currentToolCall, "f")) {
                this._emit("toolCallDone", __classPrivateFieldGet(this, _AssistantStream_currentToolCall, "f"));
              }
              __classPrivateFieldSet(this, _AssistantStream_currentToolCallIndex, toolCall.index, "f");
              __classPrivateFieldSet(this, _AssistantStream_currentToolCall, accumulatedRunStep.step_details.tool_calls[toolCall.index], "f");
              if (__classPrivateFieldGet(this, _AssistantStream_currentToolCall, "f"))
                this._emit("toolCallCreated", __classPrivateFieldGet(this, _AssistantStream_currentToolCall, "f"));
            }
          }
        }
        this._emit("runStepDelta", event.data.delta, accumulatedRunStep);
        break;
      case "thread.run.step.completed":
      case "thread.run.step.failed":
      case "thread.run.step.cancelled":
      case "thread.run.step.expired":
        __classPrivateFieldSet(this, _AssistantStream_currentRunStepSnapshot, void 0, "f");
        const details = event.data.step_details;
        if (details.type == "tool_calls") {
          if (__classPrivateFieldGet(this, _AssistantStream_currentToolCall, "f")) {
            this._emit("toolCallDone", __classPrivateFieldGet(this, _AssistantStream_currentToolCall, "f"));
            __classPrivateFieldSet(this, _AssistantStream_currentToolCall, void 0, "f");
          }
        }
        this._emit("runStepDone", event.data, accumulatedRunStep);
        break;
      case "thread.run.step.in_progress":
        break;
    }
  }, _AssistantStream_handleEvent = function _AssistantStream_handleEvent2(event) {
    __classPrivateFieldGet(this, _AssistantStream_events, "f").push(event);
    this._emit("event", event);
  }, _AssistantStream_accumulateRunStep = function _AssistantStream_accumulateRunStep2(event) {
    switch (event.event) {
      case "thread.run.step.created":
        __classPrivateFieldGet(this, _AssistantStream_runStepSnapshots, "f")[event.data.id] = event.data;
        return event.data;
      case "thread.run.step.delta":
        let snapshot = __classPrivateFieldGet(this, _AssistantStream_runStepSnapshots, "f")[event.data.id];
        if (!snapshot) {
          throw Error("Received a RunStepDelta before creation of a snapshot");
        }
        let data = event.data;
        if (data.delta) {
          const accumulated = _a.accumulateDelta(snapshot, data.delta);
          __classPrivateFieldGet(this, _AssistantStream_runStepSnapshots, "f")[event.data.id] = accumulated;
        }
        return __classPrivateFieldGet(this, _AssistantStream_runStepSnapshots, "f")[event.data.id];
      case "thread.run.step.completed":
      case "thread.run.step.failed":
      case "thread.run.step.cancelled":
      case "thread.run.step.expired":
      case "thread.run.step.in_progress":
        __classPrivateFieldGet(this, _AssistantStream_runStepSnapshots, "f")[event.data.id] = event.data;
        break;
    }
    if (__classPrivateFieldGet(this, _AssistantStream_runStepSnapshots, "f")[event.data.id])
      return __classPrivateFieldGet(this, _AssistantStream_runStepSnapshots, "f")[event.data.id];
    throw new Error("No snapshot available");
  }, _AssistantStream_accumulateMessage = function _AssistantStream_accumulateMessage2(event, snapshot) {
    let newContent = [];
    switch (event.event) {
      case "thread.message.created":
        return [event.data, newContent];
      case "thread.message.delta":
        if (!snapshot) {
          throw Error("Received a delta with no existing snapshot (there should be one from message creation)");
        }
        let data = event.data;
        if (data.delta.content) {
          for (const contentElement of data.delta.content) {
            if (contentElement.index in snapshot.content) {
              let currentContent = snapshot.content[contentElement.index];
              snapshot.content[contentElement.index] = __classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_accumulateContent).call(this, contentElement, currentContent);
            } else {
              snapshot.content[contentElement.index] = contentElement;
              newContent.push(contentElement);
            }
          }
        }
        return [snapshot, newContent];
      case "thread.message.in_progress":
      case "thread.message.completed":
      case "thread.message.incomplete":
        if (snapshot) {
          return [snapshot, newContent];
        } else {
          throw Error("Received thread message event with no existing snapshot");
        }
    }
    throw Error("Tried to accumulate a non-message event");
  }, _AssistantStream_accumulateContent = function _AssistantStream_accumulateContent2(contentElement, currentContent) {
    return _a.accumulateDelta(currentContent, contentElement);
  }, _AssistantStream_handleRun = function _AssistantStream_handleRun2(event) {
    __classPrivateFieldSet(this, _AssistantStream_currentRunSnapshot, event.data, "f");
    switch (event.event) {
      case "thread.run.created":
        break;
      case "thread.run.queued":
        break;
      case "thread.run.in_progress":
        break;
      case "thread.run.requires_action":
      case "thread.run.cancelled":
      case "thread.run.failed":
      case "thread.run.completed":
      case "thread.run.expired":
      case "thread.run.incomplete":
        __classPrivateFieldSet(this, _AssistantStream_finalRun, event.data, "f");
        if (__classPrivateFieldGet(this, _AssistantStream_currentToolCall, "f")) {
          this._emit("toolCallDone", __classPrivateFieldGet(this, _AssistantStream_currentToolCall, "f"));
          __classPrivateFieldSet(this, _AssistantStream_currentToolCall, void 0, "f");
        }
        break;
      case "thread.run.cancelling":
        break;
    }
  };
  function assertNever2(_x) {
  }

  // node_modules/openai/resources/beta/threads/runs/runs.mjs
  var Runs = class extends APIResource {
    constructor() {
      super(...arguments);
      this.steps = new Steps(this._client);
    }
    create(threadID, params, options) {
      const { include, ...body } = params;
      return this._client.post(path`/threads/${threadID}/runs`, {
        query: { include },
        body,
        ...options,
        headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
        stream: params.stream ?? false,
        __synthesizeEventData: true,
        __security: { bearerAuth: true }
      });
    }
    /**
     * Retrieves a run.
     *
     * @deprecated The Assistants API is deprecated in favor of the Responses API
     */
    retrieve(runID, params, options) {
      const { thread_id } = params;
      return this._client.get(path`/threads/${thread_id}/runs/${runID}`, {
        ...options,
        headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
        __security: { bearerAuth: true }
      });
    }
    /**
     * Modifies a run.
     *
     * @deprecated The Assistants API is deprecated in favor of the Responses API
     */
    update(runID, params, options) {
      const { thread_id, ...body } = params;
      return this._client.post(path`/threads/${thread_id}/runs/${runID}`, {
        body,
        ...options,
        headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
        __security: { bearerAuth: true }
      });
    }
    /**
     * Returns a list of runs belonging to a thread.
     *
     * @deprecated The Assistants API is deprecated in favor of the Responses API
     */
    list(threadID, query = {}, options) {
      return this._client.getAPIList(path`/threads/${threadID}/runs`, CursorPage, {
        query,
        ...options,
        headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
        __security: { bearerAuth: true }
      });
    }
    /**
     * Cancels a run that is `in_progress`.
     *
     * @deprecated The Assistants API is deprecated in favor of the Responses API
     */
    cancel(runID, params, options) {
      const { thread_id } = params;
      return this._client.post(path`/threads/${thread_id}/runs/${runID}/cancel`, {
        ...options,
        headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
        __security: { bearerAuth: true }
      });
    }
    /**
     * A helper to create a run an poll for a terminal state. More information on Run
     * lifecycles can be found here:
     * https://platform.openai.com/docs/assistants/how-it-works/runs-and-run-steps
     */
    async createAndPoll(threadId, body, options) {
      const run = await this.create(threadId, body, options);
      return await this.poll(run.id, { thread_id: threadId }, options);
    }
    /**
     * Create a Run stream
     *
     * @deprecated use `stream` instead
     */
    createAndStream(threadId, body, options) {
      return AssistantStream.createAssistantStream(threadId, this._client.beta.threads.runs, body, options);
    }
    /**
     * A helper to poll a run status until it reaches a terminal state. More
     * information on Run lifecycles can be found here:
     * https://platform.openai.com/docs/assistants/how-it-works/runs-and-run-steps
     */
    async poll(runId, params, options) {
      const headers = buildHeaders([
        options?.headers,
        {
          "X-Stainless-Poll-Helper": "true",
          "X-Stainless-Custom-Poll-Interval": options?.pollIntervalMs?.toString() ?? void 0
        }
      ]);
      while (true) {
        const { data: run, response } = await this.retrieve(runId, params, {
          ...options,
          headers: { ...options?.headers, ...headers }
        }).withResponse();
        switch (run.status) {
          //If we are in any sort of intermediate state we poll
          case "queued":
          case "in_progress":
          case "cancelling":
            let sleepInterval = 5e3;
            if (options?.pollIntervalMs) {
              sleepInterval = options.pollIntervalMs;
            } else {
              const headerInterval = response.headers.get("openai-poll-after-ms");
              if (headerInterval) {
                const headerIntervalMs = parseInt(headerInterval);
                if (!isNaN(headerIntervalMs)) {
                  sleepInterval = headerIntervalMs;
                }
              }
            }
            await sleep(sleepInterval);
            break;
          //We return the run in any terminal state.
          case "requires_action":
          case "incomplete":
          case "cancelled":
          case "completed":
          case "failed":
          case "expired":
            return run;
        }
      }
    }
    /**
     * Create a Run stream
     */
    stream(threadId, body, options) {
      return AssistantStream.createAssistantStream(threadId, this._client.beta.threads.runs, body, options);
    }
    submitToolOutputs(runID, params, options) {
      const { thread_id, ...body } = params;
      return this._client.post(path`/threads/${thread_id}/runs/${runID}/submit_tool_outputs`, {
        body,
        ...options,
        headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
        stream: params.stream ?? false,
        __synthesizeEventData: true,
        __security: { bearerAuth: true }
      });
    }
    /**
     * A helper to submit a tool output to a run and poll for a terminal run state.
     * More information on Run lifecycles can be found here:
     * https://platform.openai.com/docs/assistants/how-it-works/runs-and-run-steps
     */
    async submitToolOutputsAndPoll(runId, params, options) {
      const run = await this.submitToolOutputs(runId, params, options);
      return await this.poll(run.id, params, options);
    }
    /**
     * Submit the tool outputs from a previous run and stream the run to a terminal
     * state. More information on Run lifecycles can be found here:
     * https://platform.openai.com/docs/assistants/how-it-works/runs-and-run-steps
     */
    submitToolOutputsStream(runId, params, options) {
      return AssistantStream.createToolAssistantStream(runId, this._client.beta.threads.runs, params, options);
    }
  };
  Runs.Steps = Steps;

  // node_modules/openai/resources/beta/threads/threads.mjs
  var Threads2 = class extends APIResource {
    constructor() {
      super(...arguments);
      this.runs = new Runs(this._client);
      this.messages = new Messages2(this._client);
    }
    /**
     * Create a thread.
     *
     * @deprecated The Assistants API is deprecated in favor of the Responses API
     */
    create(body = {}, options) {
      return this._client.post("/threads", {
        body,
        ...options,
        headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
        __security: { bearerAuth: true }
      });
    }
    /**
     * Retrieves a thread.
     *
     * @deprecated The Assistants API is deprecated in favor of the Responses API
     */
    retrieve(threadID, options) {
      return this._client.get(path`/threads/${threadID}`, {
        ...options,
        headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
        __security: { bearerAuth: true }
      });
    }
    /**
     * Modifies a thread.
     *
     * @deprecated The Assistants API is deprecated in favor of the Responses API
     */
    update(threadID, body, options) {
      return this._client.post(path`/threads/${threadID}`, {
        body,
        ...options,
        headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
        __security: { bearerAuth: true }
      });
    }
    /**
     * Delete a thread.
     *
     * @deprecated The Assistants API is deprecated in favor of the Responses API
     */
    delete(threadID, options) {
      return this._client.delete(path`/threads/${threadID}`, {
        ...options,
        headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
        __security: { bearerAuth: true }
      });
    }
    createAndRun(body, options) {
      return this._client.post("/threads/runs", {
        body,
        ...options,
        headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
        stream: body.stream ?? false,
        __synthesizeEventData: true,
        __security: { bearerAuth: true }
      });
    }
    /**
     * A helper to create a thread, start a run and then poll for a terminal state.
     * More information on Run lifecycles can be found here:
     * https://platform.openai.com/docs/assistants/how-it-works/runs-and-run-steps
     */
    async createAndRunPoll(body, options) {
      const run = await this.createAndRun(body, options);
      return await this.runs.poll(run.id, { thread_id: run.thread_id }, options);
    }
    /**
     * Create a thread and stream the run back
     */
    createAndRunStream(body, options) {
      return AssistantStream.createThreadAssistantStream(body, this._client.beta.threads, options);
    }
  };
  Threads2.Runs = Runs;
  Threads2.Messages = Messages2;

  // node_modules/openai/resources/beta/beta.mjs
  var Beta = class extends APIResource {
    constructor() {
      super(...arguments);
      this.realtime = new Realtime(this._client);
      this.responses = new Responses(this._client);
      this.chatkit = new ChatKit(this._client);
      this.assistants = new Assistants(this._client);
      this.threads = new Threads2(this._client);
    }
  };
  Beta.Realtime = Realtime;
  Beta.Responses = Responses;
  Beta.ChatKit = ChatKit;
  Beta.Assistants = Assistants;
  Beta.Threads = Threads2;

  // node_modules/openai/resources/completions.mjs
  var Completions2 = class extends APIResource {
    create(body, options) {
      return this._client.post("/completions", {
        body,
        ...options,
        stream: body.stream ?? false,
        __security: { bearerAuth: true }
      });
    }
  };

  // node_modules/openai/resources/containers/files/content.mjs
  var Content = class extends APIResource {
    /**
     * Retrieve Container File Content
     */
    retrieve(fileID, params, options) {
      const { container_id } = params;
      return this._client.get(path`/containers/${container_id}/files/${fileID}/content`, {
        ...options,
        headers: buildHeaders([{ Accept: "application/binary" }, options?.headers]),
        __security: { bearerAuth: true },
        __binaryResponse: true
      });
    }
  };

  // node_modules/openai/resources/containers/files/files.mjs
  var Files = class extends APIResource {
    constructor() {
      super(...arguments);
      this.content = new Content(this._client);
    }
    /**
     * Create a Container File
     *
     * You can send either a multipart/form-data request with the raw file content, or
     * a JSON request with a file ID.
     */
    create(containerID, body, options) {
      return this._client.post(path`/containers/${containerID}/files`, maybeMultipartFormRequestOptions({ body, ...options, __security: { bearerAuth: true } }, this._client));
    }
    /**
     * Retrieve Container File
     */
    retrieve(fileID, params, options) {
      const { container_id } = params;
      return this._client.get(path`/containers/${container_id}/files/${fileID}`, {
        ...options,
        __security: { bearerAuth: true }
      });
    }
    /**
     * List Container files
     */
    list(containerID, query = {}, options) {
      return this._client.getAPIList(path`/containers/${containerID}/files`, CursorPage, {
        query,
        ...options,
        __security: { bearerAuth: true }
      });
    }
    /**
     * Delete Container File
     */
    delete(fileID, params, options) {
      const { container_id } = params;
      return this._client.delete(path`/containers/${container_id}/files/${fileID}`, {
        ...options,
        headers: buildHeaders([{ Accept: "*/*" }, options?.headers]),
        __security: { bearerAuth: true }
      });
    }
  };
  Files.Content = Content;

  // node_modules/openai/resources/containers/containers.mjs
  var Containers = class extends APIResource {
    constructor() {
      super(...arguments);
      this.files = new Files(this._client);
    }
    /**
     * Create Container
     */
    create(body, options) {
      return this._client.post("/containers", { body, ...options, __security: { bearerAuth: true } });
    }
    /**
     * Retrieve Container
     */
    retrieve(containerID, options) {
      return this._client.get(path`/containers/${containerID}`, {
        ...options,
        __security: { bearerAuth: true }
      });
    }
    /**
     * List Containers
     */
    list(query = {}, options) {
      return this._client.getAPIList("/containers", CursorPage, {
        query,
        ...options,
        __security: { bearerAuth: true }
      });
    }
    /**
     * Delete Container
     */
    delete(containerID, options) {
      return this._client.delete(path`/containers/${containerID}`, {
        ...options,
        headers: buildHeaders([{ Accept: "*/*" }, options?.headers]),
        __security: { bearerAuth: true }
      });
    }
  };
  Containers.Files = Files;

  // node_modules/openai/resources/conversations/items.mjs
  var Items = class extends APIResource {
    /**
     * Create items in a conversation with the given ID.
     */
    create(conversationID, params, options) {
      const { include, ...body } = params;
      return this._client.post(path`/conversations/${conversationID}/items`, {
        query: { include },
        body,
        ...options,
        __security: { bearerAuth: true }
      });
    }
    /**
     * Get a single item from a conversation with the given IDs.
     */
    retrieve(itemID, params, options) {
      const { conversation_id, ...query } = params;
      return this._client.get(path`/conversations/${conversation_id}/items/${itemID}`, {
        query,
        ...options,
        __security: { bearerAuth: true }
      });
    }
    /**
     * List all items for a conversation with the given ID.
     */
    list(conversationID, query = {}, options) {
      return this._client.getAPIList(path`/conversations/${conversationID}/items`, ConversationCursorPage, { query, ...options, __security: { bearerAuth: true } });
    }
    /**
     * Delete an item from a conversation with the given IDs.
     */
    delete(itemID, params, options) {
      const { conversation_id } = params;
      return this._client.delete(path`/conversations/${conversation_id}/items/${itemID}`, {
        ...options,
        __security: { bearerAuth: true }
      });
    }
  };

  // node_modules/openai/resources/conversations/conversations.mjs
  var Conversations = class extends APIResource {
    constructor() {
      super(...arguments);
      this.items = new Items(this._client);
    }
    /**
     * Create a conversation.
     */
    create(body = {}, options) {
      return this._client.post("/conversations", { body, ...options, __security: { bearerAuth: true } });
    }
    /**
     * Get a conversation
     */
    retrieve(conversationID, options) {
      return this._client.get(path`/conversations/${conversationID}`, {
        ...options,
        __security: { bearerAuth: true }
      });
    }
    /**
     * Update a conversation
     */
    update(conversationID, body, options) {
      return this._client.post(path`/conversations/${conversationID}`, {
        body,
        ...options,
        __security: { bearerAuth: true }
      });
    }
    /**
     * Delete a conversation. Items in the conversation will not be deleted.
     */
    delete(conversationID, options) {
      return this._client.delete(path`/conversations/${conversationID}`, {
        ...options,
        __security: { bearerAuth: true }
      });
    }
  };
  Conversations.Items = Items;

  // node_modules/openai/resources/embeddings.mjs
  var Embeddings = class extends APIResource {
    /**
     * Creates an embedding vector representing the input text.
     *
     * @example
     * ```ts
     * const createEmbeddingResponse =
     *   await client.embeddings.create({
     *     input: 'The quick brown fox jumped over the lazy dog',
     *     model: 'text-embedding-3-small',
     *   });
     * ```
     */
    create(body, options) {
      const hasUserProvidedEncodingFormat = !!body.encoding_format;
      let encoding_format = hasUserProvidedEncodingFormat ? body.encoding_format : "base64";
      if (hasUserProvidedEncodingFormat) {
        loggerFor(this._client).debug("embeddings/user defined encoding_format:", body.encoding_format);
      }
      const response = this._client.post("/embeddings", {
        body: {
          ...body,
          encoding_format
        },
        ...options,
        __security: { bearerAuth: true }
      });
      if (hasUserProvidedEncodingFormat) {
        return response;
      }
      loggerFor(this._client).debug("embeddings/decoding base64 embeddings from base64");
      return response._thenUnwrap((response2) => {
        if (response2 && response2.data) {
          response2.data.forEach((embeddingBase64Obj) => {
            const embeddingBase64Str = embeddingBase64Obj.embedding;
            embeddingBase64Obj.embedding = toFloat32Array(embeddingBase64Str);
          });
        }
        return response2;
      });
    }
  };

  // node_modules/openai/resources/evals/runs/output-items.mjs
  var OutputItems = class extends APIResource {
    /**
     * Get an evaluation run output item by ID.
     */
    retrieve(outputItemID, params, options) {
      const { eval_id, run_id } = params;
      return this._client.get(path`/evals/${eval_id}/runs/${run_id}/output_items/${outputItemID}`, {
        ...options,
        __security: { bearerAuth: true }
      });
    }
    /**
     * Get a list of output items for an evaluation run.
     */
    list(runID, params, options) {
      const { eval_id, ...query } = params;
      return this._client.getAPIList(path`/evals/${eval_id}/runs/${runID}/output_items`, CursorPage, { query, ...options, __security: { bearerAuth: true } });
    }
  };

  // node_modules/openai/resources/evals/runs/runs.mjs
  var Runs2 = class extends APIResource {
    constructor() {
      super(...arguments);
      this.outputItems = new OutputItems(this._client);
    }
    /**
     * Kicks off a new run for a given evaluation, specifying the data source, and what
     * model configuration to use to test. The datasource will be validated against the
     * schema specified in the config of the evaluation.
     */
    create(evalID, body, options) {
      return this._client.post(path`/evals/${evalID}/runs`, {
        body,
        ...options,
        __security: { bearerAuth: true }
      });
    }
    /**
     * Get an evaluation run by ID.
     */
    retrieve(runID, params, options) {
      const { eval_id } = params;
      return this._client.get(path`/evals/${eval_id}/runs/${runID}`, {
        ...options,
        __security: { bearerAuth: true }
      });
    }
    /**
     * Get a list of runs for an evaluation.
     */
    list(evalID, query = {}, options) {
      return this._client.getAPIList(path`/evals/${evalID}/runs`, CursorPage, {
        query,
        ...options,
        __security: { bearerAuth: true }
      });
    }
    /**
     * Delete an eval run.
     */
    delete(runID, params, options) {
      const { eval_id } = params;
      return this._client.delete(path`/evals/${eval_id}/runs/${runID}`, {
        ...options,
        __security: { bearerAuth: true }
      });
    }
    /**
     * Cancel an ongoing evaluation run.
     */
    cancel(runID, params, options) {
      const { eval_id } = params;
      return this._client.post(path`/evals/${eval_id}/runs/${runID}`, {
        ...options,
        __security: { bearerAuth: true }
      });
    }
  };
  Runs2.OutputItems = OutputItems;

  // node_modules/openai/resources/evals/evals.mjs
  var Evals = class extends APIResource {
    constructor() {
      super(...arguments);
      this.runs = new Runs2(this._client);
    }
    /**
     * Create the structure of an evaluation that can be used to test a model's
     * performance. An evaluation is a set of testing criteria and the config for a
     * data source, which dictates the schema of the data used in the evaluation. After
     * creating an evaluation, you can run it on different models and model parameters.
     * We support several types of graders and datasources. For more information, see
     * the [Evals guide](https://platform.openai.com/docs/guides/evals).
     */
    create(body, options) {
      return this._client.post("/evals", { body, ...options, __security: { bearerAuth: true } });
    }
    /**
     * Get an evaluation by ID.
     */
    retrieve(evalID, options) {
      return this._client.get(path`/evals/${evalID}`, { ...options, __security: { bearerAuth: true } });
    }
    /**
     * Update certain properties of an evaluation.
     */
    update(evalID, body, options) {
      return this._client.post(path`/evals/${evalID}`, { body, ...options, __security: { bearerAuth: true } });
    }
    /**
     * List evaluations for a project.
     */
    list(query = {}, options) {
      return this._client.getAPIList("/evals", CursorPage, {
        query,
        ...options,
        __security: { bearerAuth: true }
      });
    }
    /**
     * Delete an evaluation.
     */
    delete(evalID, options) {
      return this._client.delete(path`/evals/${evalID}`, { ...options, __security: { bearerAuth: true } });
    }
  };
  Evals.Runs = Runs2;

  // node_modules/openai/resources/files.mjs
  var Files2 = class extends APIResource {
    /**
     * Upload a file that can be used across various endpoints. Individual files can be
     * up to 512 MB, and each project can store up to 2.5 TB of files in total. There
     * is no organization-wide storage limit. Uploads to this endpoint are rate-limited
     * to 1,000 requests per minute per authenticated user.
     *
     * - The Assistants API supports files up to 2 million tokens and of specific file
     *   types. See the
     *   [Assistants Tools guide](https://platform.openai.com/docs/assistants/tools)
     *   for details.
     * - The Fine-tuning API only supports `.jsonl` files. The input also has certain
     *   required formats for fine-tuning
     *   [chat](https://platform.openai.com/docs/api-reference/fine-tuning/chat-input)
     *   or
     *   [completions](https://platform.openai.com/docs/api-reference/fine-tuning/completions-input)
     *   models.
     * - The Batch API only supports `.jsonl` files up to 200 MB in size. The input
     *   also has a specific required
     *   [format](https://platform.openai.com/docs/api-reference/batch/request-input).
     * - For Retrieval or `file_search` ingestion, upload files here first. If you need
     *   to attach multiple uploaded files to the same vector store, use
     *   [`/vector_stores/{vector_store_id}/file_batches`](https://platform.openai.com/docs/api-reference/vector-stores-file-batches/createBatch)
     *   instead of attaching them one by one. Vector store attachment has separate
     *   limits from file upload, including 2,000 attached files per minute per
     *   organization.
     *
     * Please [contact us](https://help.openai.com/) if you need to increase these
     * storage limits.
     */
    create(body, options) {
      return this._client.post("/files", multipartFormRequestOptions({ body, ...options, __security: { bearerAuth: true } }, this._client));
    }
    /**
     * Returns information about a specific file.
     */
    retrieve(fileID, options) {
      return this._client.get(path`/files/${fileID}`, { ...options, __security: { bearerAuth: true } });
    }
    /**
     * Returns a list of files.
     */
    list(query = {}, options) {
      return this._client.getAPIList("/files", CursorPage, {
        query,
        ...options,
        __security: { bearerAuth: true }
      });
    }
    /**
     * Delete a file and remove it from all vector stores.
     */
    delete(fileID, options) {
      return this._client.delete(path`/files/${fileID}`, { ...options, __security: { bearerAuth: true } });
    }
    /**
     * Returns the contents of the specified file.
     */
    content(fileID, options) {
      return this._client.get(path`/files/${fileID}/content`, {
        ...options,
        headers: buildHeaders([{ Accept: "application/binary" }, options?.headers]),
        __security: { bearerAuth: true },
        __binaryResponse: true
      });
    }
    /**
     * Waits for the given file to be processed, default timeout is 30 mins.
     */
    async waitForProcessing(id, { pollInterval = 5e3, maxWait = 30 * 60 * 1e3 } = {}) {
      const TERMINAL_STATES = /* @__PURE__ */ new Set(["processed", "error", "deleted"]);
      const start = Date.now();
      let file = await this.retrieve(id);
      while (!file.status || !TERMINAL_STATES.has(file.status)) {
        await sleep(pollInterval);
        file = await this.retrieve(id);
        if (Date.now() - start > maxWait) {
          throw new APIConnectionTimeoutError({
            message: `Giving up on waiting for file ${id} to finish processing after ${maxWait} milliseconds.`
          });
        }
      }
      return file;
    }
  };

  // node_modules/openai/resources/fine-tuning/methods.mjs
  var Methods = class extends APIResource {
  };

  // node_modules/openai/resources/fine-tuning/alpha/graders.mjs
  var Graders = class extends APIResource {
    /**
     * Run a grader.
     *
     * @example
     * ```ts
     * const response = await client.fineTuning.alpha.graders.run({
     *   grader: {
     *     input: 'input',
     *     name: 'name',
     *     operation: 'eq',
     *     reference: 'reference',
     *     type: 'string_check',
     *   },
     *   model_sample: 'model_sample',
     * });
     * ```
     */
    run(body, options) {
      return this._client.post("/fine_tuning/alpha/graders/run", {
        body,
        ...options,
        __security: { bearerAuth: true }
      });
    }
    /**
     * Validate a grader.
     *
     * @example
     * ```ts
     * const response =
     *   await client.fineTuning.alpha.graders.validate({
     *     grader: {
     *       input: 'input',
     *       name: 'name',
     *       operation: 'eq',
     *       reference: 'reference',
     *       type: 'string_check',
     *     },
     *   });
     * ```
     */
    validate(body, options) {
      return this._client.post("/fine_tuning/alpha/graders/validate", {
        body,
        ...options,
        __security: { bearerAuth: true }
      });
    }
  };

  // node_modules/openai/resources/fine-tuning/alpha/alpha.mjs
  var Alpha = class extends APIResource {
    constructor() {
      super(...arguments);
      this.graders = new Graders(this._client);
    }
  };
  Alpha.Graders = Graders;

  // node_modules/openai/resources/fine-tuning/checkpoints/permissions.mjs
  var Permissions = class extends APIResource {
    /**
     * **NOTE:** Calling this endpoint requires an [admin API key](../admin-api-keys).
     *
     * This enables organization owners to share fine-tuned models with other projects
     * in their organization.
     *
     * @example
     * ```ts
     * // Automatically fetches more pages as needed.
     * for await (const permissionCreateResponse of client.fineTuning.checkpoints.permissions.create(
     *   'ft:gpt-4o-mini-2024-07-18:org:weather:B7R9VjQd',
     *   { project_ids: ['string'] },
     * )) {
     *   // ...
     * }
     * ```
     */
    create(fineTunedModelCheckpoint, body, options) {
      return this._client.getAPIList(path`/fine_tuning/checkpoints/${fineTunedModelCheckpoint}/permissions`, Page, { body, method: "post", ...options, __security: { adminAPIKeyAuth: true } });
    }
    /**
     * **NOTE:** This endpoint requires an [admin API key](../admin-api-keys).
     *
     * Organization owners can use this endpoint to view all permissions for a
     * fine-tuned model checkpoint.
     *
     * @deprecated Retrieve is deprecated. Please swap to the paginated list method instead.
     */
    retrieve(fineTunedModelCheckpoint, query = {}, options) {
      return this._client.get(path`/fine_tuning/checkpoints/${fineTunedModelCheckpoint}/permissions`, {
        query,
        ...options,
        __security: { adminAPIKeyAuth: true }
      });
    }
    /**
     * **NOTE:** This endpoint requires an [admin API key](../admin-api-keys).
     *
     * Organization owners can use this endpoint to view all permissions for a
     * fine-tuned model checkpoint.
     *
     * @example
     * ```ts
     * // Automatically fetches more pages as needed.
     * for await (const permissionListResponse of client.fineTuning.checkpoints.permissions.list(
     *   'ft-AF1WoRqd3aJAHsqc9NY7iL8F',
     * )) {
     *   // ...
     * }
     * ```
     */
    list(fineTunedModelCheckpoint, query = {}, options) {
      return this._client.getAPIList(path`/fine_tuning/checkpoints/${fineTunedModelCheckpoint}/permissions`, ConversationCursorPage, { query, ...options, __security: { adminAPIKeyAuth: true } });
    }
    /**
     * **NOTE:** This endpoint requires an [admin API key](../admin-api-keys).
     *
     * Organization owners can use this endpoint to delete a permission for a
     * fine-tuned model checkpoint.
     *
     * @example
     * ```ts
     * const permission =
     *   await client.fineTuning.checkpoints.permissions.delete(
     *     'cp_zc4Q7MP6XxulcVzj4MZdwsAB',
     *     {
     *       fine_tuned_model_checkpoint:
     *         'ft:gpt-4o-mini-2024-07-18:org:weather:B7R9VjQd',
     *     },
     *   );
     * ```
     */
    delete(permissionID, params, options) {
      const { fine_tuned_model_checkpoint } = params;
      return this._client.delete(path`/fine_tuning/checkpoints/${fine_tuned_model_checkpoint}/permissions/${permissionID}`, { ...options, __security: { adminAPIKeyAuth: true } });
    }
  };

  // node_modules/openai/resources/fine-tuning/checkpoints/checkpoints.mjs
  var Checkpoints = class extends APIResource {
    constructor() {
      super(...arguments);
      this.permissions = new Permissions(this._client);
    }
  };
  Checkpoints.Permissions = Permissions;

  // node_modules/openai/resources/fine-tuning/jobs/checkpoints.mjs
  var Checkpoints2 = class extends APIResource {
    /**
     * List checkpoints for a fine-tuning job.
     *
     * @example
     * ```ts
     * // Automatically fetches more pages as needed.
     * for await (const fineTuningJobCheckpoint of client.fineTuning.jobs.checkpoints.list(
     *   'ft-AF1WoRqd3aJAHsqc9NY7iL8F',
     * )) {
     *   // ...
     * }
     * ```
     */
    list(fineTuningJobID, query = {}, options) {
      return this._client.getAPIList(path`/fine_tuning/jobs/${fineTuningJobID}/checkpoints`, CursorPage, { query, ...options, __security: { bearerAuth: true } });
    }
  };

  // node_modules/openai/resources/fine-tuning/jobs/jobs.mjs
  var Jobs = class extends APIResource {
    constructor() {
      super(...arguments);
      this.checkpoints = new Checkpoints2(this._client);
    }
    /**
     * Creates a fine-tuning job which begins the process of creating a new model from
     * a given dataset.
     *
     * Response includes details of the enqueued job including job status and the name
     * of the fine-tuned models once complete.
     *
     * [Learn more about fine-tuning](https://platform.openai.com/docs/guides/model-optimization)
     *
     * @example
     * ```ts
     * const fineTuningJob = await client.fineTuning.jobs.create({
     *   model: 'gpt-4o-mini',
     *   training_file: 'file-abc123',
     * });
     * ```
     */
    create(body, options) {
      return this._client.post("/fine_tuning/jobs", { body, ...options, __security: { bearerAuth: true } });
    }
    /**
     * Get info about a fine-tuning job.
     *
     * [Learn more about fine-tuning](https://platform.openai.com/docs/guides/model-optimization)
     *
     * @example
     * ```ts
     * const fineTuningJob = await client.fineTuning.jobs.retrieve(
     *   'ft-AF1WoRqd3aJAHsqc9NY7iL8F',
     * );
     * ```
     */
    retrieve(fineTuningJobID, options) {
      return this._client.get(path`/fine_tuning/jobs/${fineTuningJobID}`, {
        ...options,
        __security: { bearerAuth: true }
      });
    }
    /**
     * List your organization's fine-tuning jobs
     *
     * @example
     * ```ts
     * // Automatically fetches more pages as needed.
     * for await (const fineTuningJob of client.fineTuning.jobs.list()) {
     *   // ...
     * }
     * ```
     */
    list(query = {}, options) {
      return this._client.getAPIList("/fine_tuning/jobs", CursorPage, {
        query,
        ...options,
        __security: { bearerAuth: true }
      });
    }
    /**
     * Immediately cancel a fine-tune job.
     *
     * @example
     * ```ts
     * const fineTuningJob = await client.fineTuning.jobs.cancel(
     *   'ft-AF1WoRqd3aJAHsqc9NY7iL8F',
     * );
     * ```
     */
    cancel(fineTuningJobID, options) {
      return this._client.post(path`/fine_tuning/jobs/${fineTuningJobID}/cancel`, {
        ...options,
        __security: { bearerAuth: true }
      });
    }
    /**
     * Get status updates for a fine-tuning job.
     *
     * @example
     * ```ts
     * // Automatically fetches more pages as needed.
     * for await (const fineTuningJobEvent of client.fineTuning.jobs.listEvents(
     *   'ft-AF1WoRqd3aJAHsqc9NY7iL8F',
     * )) {
     *   // ...
     * }
     * ```
     */
    listEvents(fineTuningJobID, query = {}, options) {
      return this._client.getAPIList(path`/fine_tuning/jobs/${fineTuningJobID}/events`, CursorPage, { query, ...options, __security: { bearerAuth: true } });
    }
    /**
     * Pause a fine-tune job.
     *
     * @example
     * ```ts
     * const fineTuningJob = await client.fineTuning.jobs.pause(
     *   'ft-AF1WoRqd3aJAHsqc9NY7iL8F',
     * );
     * ```
     */
    pause(fineTuningJobID, options) {
      return this._client.post(path`/fine_tuning/jobs/${fineTuningJobID}/pause`, {
        ...options,
        __security: { bearerAuth: true }
      });
    }
    /**
     * Resume a fine-tune job.
     *
     * @example
     * ```ts
     * const fineTuningJob = await client.fineTuning.jobs.resume(
     *   'ft-AF1WoRqd3aJAHsqc9NY7iL8F',
     * );
     * ```
     */
    resume(fineTuningJobID, options) {
      return this._client.post(path`/fine_tuning/jobs/${fineTuningJobID}/resume`, {
        ...options,
        __security: { bearerAuth: true }
      });
    }
  };
  Jobs.Checkpoints = Checkpoints2;

  // node_modules/openai/resources/fine-tuning/fine-tuning.mjs
  var FineTuning = class extends APIResource {
    constructor() {
      super(...arguments);
      this.methods = new Methods(this._client);
      this.jobs = new Jobs(this._client);
      this.checkpoints = new Checkpoints(this._client);
      this.alpha = new Alpha(this._client);
    }
  };
  FineTuning.Methods = Methods;
  FineTuning.Jobs = Jobs;
  FineTuning.Checkpoints = Checkpoints;
  FineTuning.Alpha = Alpha;

  // node_modules/openai/resources/graders/grader-models.mjs
  var GraderModels = class extends APIResource {
  };

  // node_modules/openai/resources/graders/graders.mjs
  var Graders2 = class extends APIResource {
    constructor() {
      super(...arguments);
      this.graderModels = new GraderModels(this._client);
    }
  };
  Graders2.GraderModels = GraderModels;

  // node_modules/openai/resources/images.mjs
  var Images = class extends APIResource {
    /**
     * Creates a variation of a given image. This endpoint only supports `dall-e-2`.
     *
     * @example
     * ```ts
     * const imagesResponse = await client.images.createVariation({
     *   image: fs.createReadStream('otter.png'),
     * });
     * ```
     */
    createVariation(body, options) {
      return this._client.post("/images/variations", multipartFormRequestOptions({ body, ...options, __security: { bearerAuth: true } }, this._client));
    }
    edit(body, options) {
      return this._client.post("/images/edits", multipartFormRequestOptions({ body, ...options, stream: body.stream ?? false, __security: { bearerAuth: true } }, this._client));
    }
    generate(body, options) {
      return this._client.post("/images/generations", {
        body,
        ...options,
        stream: body.stream ?? false,
        __security: { bearerAuth: true }
      });
    }
  };

  // node_modules/openai/resources/models.mjs
  var Models = class extends APIResource {
    /**
     * Retrieves a model instance, providing basic information about the model such as
     * the owner and permissioning.
     */
    retrieve(model, options) {
      return this._client.get(path`/models/${model}`, { ...options, __security: { bearerAuth: true } });
    }
    /**
     * Lists the currently available models, and provides basic information about each
     * one such as the owner and availability.
     */
    list(options) {
      return this._client.getAPIList("/models", Page, { ...options, __security: { bearerAuth: true } });
    }
    /**
     * Delete a fine-tuned model. You must have the Owner role in your organization to
     * delete a model.
     */
    delete(model, options) {
      return this._client.delete(path`/models/${model}`, { ...options, __security: { bearerAuth: true } });
    }
  };

  // node_modules/openai/resources/moderations.mjs
  var Moderations = class extends APIResource {
    /**
     * Classifies if text and/or image inputs are potentially harmful. Learn more in
     * the [moderation guide](https://platform.openai.com/docs/guides/moderation).
     */
    create(body, options) {
      return this._client.post("/moderations", { body, ...options, __security: { bearerAuth: true } });
    }
  };

  // node_modules/openai/resources/realtime/calls.mjs
  var Calls = class extends APIResource {
    /**
     * Accept an incoming SIP call and configure the realtime session that will handle
     * it.
     *
     * @example
     * ```ts
     * await client.realtime.calls.accept('call_id', {
     *   type: 'realtime',
     * });
     * ```
     */
    accept(callID, body, options) {
      return this._client.post(path`/realtime/calls/${callID}/accept`, {
        body,
        ...options,
        headers: buildHeaders([{ Accept: "*/*" }, options?.headers]),
        __security: { bearerAuth: true }
      });
    }
    /**
     * End an active Realtime API call, whether it was initiated over SIP or WebRTC.
     *
     * @example
     * ```ts
     * await client.realtime.calls.hangup('call_id');
     * ```
     */
    hangup(callID, options) {
      return this._client.post(path`/realtime/calls/${callID}/hangup`, {
        ...options,
        headers: buildHeaders([{ Accept: "*/*" }, options?.headers]),
        __security: { bearerAuth: true }
      });
    }
    /**
     * Transfer an active SIP call to a new destination using the SIP REFER verb.
     *
     * @example
     * ```ts
     * await client.realtime.calls.refer('call_id', {
     *   target_uri: 'tel:+14155550123',
     * });
     * ```
     */
    refer(callID, body, options) {
      return this._client.post(path`/realtime/calls/${callID}/refer`, {
        body,
        ...options,
        headers: buildHeaders([{ Accept: "*/*" }, options?.headers]),
        __security: { bearerAuth: true }
      });
    }
    /**
     * Decline an incoming SIP call by returning a SIP status code to the caller.
     *
     * @example
     * ```ts
     * await client.realtime.calls.reject('call_id');
     * ```
     */
    reject(callID, body = {}, options) {
      return this._client.post(path`/realtime/calls/${callID}/reject`, {
        body,
        ...options,
        headers: buildHeaders([{ Accept: "*/*" }, options?.headers]),
        __security: { bearerAuth: true }
      });
    }
  };

  // node_modules/openai/resources/realtime/client-secrets.mjs
  var ClientSecrets = class extends APIResource {
    /**
     * Create a Realtime client secret with an associated session configuration.
     *
     * Client secrets are short-lived tokens that can be passed to a client app, such
     * as a web frontend or mobile client, which grants access to the Realtime API
     * without leaking your main API key. You can configure a custom TTL for each
     * client secret.
     *
     * You can also attach session configuration options to the client secret, which
     * will be applied to any sessions created using that client secret, but these can
     * also be overridden by the client connection.
     *
     * [Learn more about authentication with client secrets over WebRTC](https://platform.openai.com/docs/guides/realtime-webrtc).
     *
     * Returns the created client secret and the effective session object. The client
     * secret is a string that looks like `ek_1234`.
     *
     * @example
     * ```ts
     * const clientSecret =
     *   await client.realtime.clientSecrets.create();
     * ```
     */
    create(body, options) {
      return this._client.post("/realtime/client_secrets", {
        body,
        ...options,
        __security: { bearerAuth: true }
      });
    }
  };

  // node_modules/openai/resources/realtime/realtime.mjs
  var Realtime2 = class extends APIResource {
    constructor() {
      super(...arguments);
      this.clientSecrets = new ClientSecrets(this._client);
      this.calls = new Calls(this._client);
    }
  };
  Realtime2.ClientSecrets = ClientSecrets;
  Realtime2.Calls = Calls;

  // node_modules/openai/lib/ResponsesParser.mjs
  function maybeParseResponse(response, params) {
    if (!params || !hasAutoParseableInput2(params)) {
      const parsed = {
        ...response,
        output_parsed: null,
        output: response.output.map((item) => {
          if (item.type === "function_call") {
            return {
              ...item,
              parsed_arguments: null
            };
          }
          if (item.type === "message") {
            return {
              ...item,
              content: item.content.map((content) => ({
                ...content,
                parsed: null
              }))
            };
          } else {
            return item;
          }
        })
      };
      if (needsOutputText(response, parsed)) {
        addOutputText(parsed);
      }
      return parsed;
    }
    return parseResponse(response, params);
  }
  function parseResponse(response, params) {
    const shouldParse = !response.status || response.status === "completed";
    const output = response.output.map((item) => {
      if (item.type === "function_call") {
        return shouldParse ? parseToolCall2(params, item) : { ...item, parsed_arguments: null };
      }
      if (item.type === "message") {
        const content = item.content.map((content2) => {
          if (content2.type === "output_text") {
            return {
              ...content2,
              parsed: shouldParse ? parseTextFormat(params, content2.text) : null
            };
          }
          return content2;
        });
        return {
          ...item,
          content
        };
      }
      return item;
    });
    const parsed = Object.assign({}, response, { output });
    if (needsOutputText(response, parsed)) {
      addOutputText(parsed);
    }
    Object.defineProperty(parsed, "output_parsed", {
      enumerable: true,
      get() {
        for (const output2 of parsed.output) {
          if (output2.type !== "message") {
            continue;
          }
          for (const content of output2.content) {
            if (content.type === "output_text" && content.parsed !== null) {
              return content.parsed;
            }
          }
        }
        return null;
      }
    });
    return parsed;
  }
  function parseTextFormat(params, content) {
    if (params.text?.format?.type !== "json_schema") {
      return null;
    }
    if ("$parseRaw" in params.text?.format) {
      const text_format = params.text?.format;
      return text_format.$parseRaw(content);
    }
    return JSON.parse(content);
  }
  function hasAutoParseableInput2(params) {
    if (isAutoParsableResponseFormat(params.text?.format)) {
      return true;
    }
    return Array.isArray(params.tools) && params.tools.some((tool) => isAutoParsableTool2(tool) || tool.type === "function" && tool.strict === true);
  }
  function isAutoParsableTool2(tool) {
    return tool?.["$brand"] === "auto-parseable-tool";
  }
  function getInputToolByName(input_tools, name) {
    return input_tools.find((tool) => tool.type === "function" && tool.name === name);
  }
  function parseToolCall2(params, toolCall) {
    const inputTool = getInputToolByName(params.tools ?? [], toolCall.name);
    return {
      ...toolCall,
      ...toolCall,
      parsed_arguments: isAutoParsableTool2(inputTool) ? inputTool.$parseRaw(toolCall.arguments) : inputTool?.strict ? JSON.parse(toolCall.arguments) : null
    };
  }
  function needsOutputText(response, target) {
    return !Object.getOwnPropertyDescriptor(response, "output_text") || target.output_text == null;
  }
  function addOutputText(rsp) {
    const texts = [];
    for (const output of rsp.output) {
      if (output.type !== "message") {
        continue;
      }
      for (const content of output.content) {
        if (content.type === "output_text") {
          texts.push(content.text);
        }
      }
    }
    rsp.output_text = texts.join("");
  }

  // node_modules/openai/lib/responses/ResponseAccumulator.mjs
  function accumulateResponse(event, snapshot) {
    if (!snapshot) {
      if (event.type !== "response.created") {
        throw new OpenAIError(`When snapshot hasn't been set yet, expected 'response.created' event, got ${event.type}`);
      }
      return cloneResponse(event.response);
    }
    switch (event.type) {
      case "response.output_item.added": {
        snapshot.output.push(structuredClone(event.item));
        if (event.item.type === "message") {
          addOutputText(snapshot);
        }
        break;
      }
      case "response.output_item.done": {
        getOutput(snapshot, event.output_index);
        snapshot.output[event.output_index] = structuredClone(event.item);
        if (event.item.type === "message") {
          addOutputText(snapshot);
        }
        break;
      }
      case "response.content_part.added": {
        const output = getOutput(snapshot, event.output_index);
        const type = output.type;
        const part = event.part;
        if (type === "message" && part.type !== "reasoning_text") {
          output.content.push(structuredClone(part));
          if (part.type === "output_text") {
            addOutputText(snapshot);
          }
        } else if (type === "reasoning" && part.type === "reasoning_text") {
          if (!output.content) {
            output.content = [];
          }
          output.content.push(structuredClone(part));
        }
        break;
      }
      case "response.content_part.done": {
        const output = getOutput(snapshot, event.output_index);
        const part = event.part;
        if (output.type === "message" && part.type !== "reasoning_text") {
          getContent(output.content, event.content_index);
          output.content[event.content_index] = structuredClone(part);
          if (part.type === "output_text") {
            addOutputText(snapshot);
          }
        } else if (output.type === "reasoning" && part.type === "reasoning_text") {
          const content = output.content;
          if (!content) {
            throw new OpenAIError(`missing content at index ${event.content_index}`);
          }
          getContent(content, event.content_index);
          content[event.content_index] = structuredClone(part);
        }
        break;
      }
      case "response.output_text.delta": {
        const output = getOutput(snapshot, event.output_index);
        if (output.type === "message") {
          const content = getContent(output.content, event.content_index);
          if (content.type !== "output_text") {
            throw new OpenAIError(`expected content to be 'output_text', got ${content.type}`);
          }
          content.text += event.delta;
          snapshot.output_text += event.delta;
        }
        break;
      }
      case "response.output_text.done": {
        const output = getOutput(snapshot, event.output_index);
        if (output.type === "message") {
          const content = getContent(output.content, event.content_index);
          if (content.type !== "output_text") {
            throw new OpenAIError(`expected content to be 'output_text', got ${content.type}`);
          }
          content.text = event.text;
          addOutputText(snapshot);
        }
        break;
      }
      case "response.output_text.annotation.added": {
        const output = getOutput(snapshot, event.output_index);
        if (output.type === "message") {
          const content = getContent(output.content, event.content_index);
          if (content.type !== "output_text") {
            throw new OpenAIError(`expected content to be 'output_text', got ${content.type}`);
          }
          content.annotations[event.annotation_index] = structuredClone(event.annotation);
        }
        break;
      }
      case "response.refusal.delta": {
        const output = getOutput(snapshot, event.output_index);
        if (output.type === "message") {
          const content = getContent(output.content, event.content_index);
          if (content.type !== "refusal") {
            throw new OpenAIError(`expected content to be 'refusal', got ${content.type}`);
          }
          content.refusal += event.delta;
        }
        break;
      }
      case "response.refusal.done": {
        const output = getOutput(snapshot, event.output_index);
        if (output.type === "message") {
          const content = getContent(output.content, event.content_index);
          if (content.type !== "refusal") {
            throw new OpenAIError(`expected content to be 'refusal', got ${content.type}`);
          }
          content.refusal = event.refusal;
        }
        break;
      }
      case "response.function_call_arguments.delta": {
        const output = getOutput(snapshot, event.output_index);
        if (output.type === "function_call") {
          output.arguments += event.delta;
        }
        break;
      }
      case "response.function_call_arguments.done": {
        const output = getOutput(snapshot, event.output_index);
        if (output.type === "function_call") {
          output.arguments = event.arguments;
        }
        break;
      }
      case "response.reasoning_text.delta": {
        const output = getOutput(snapshot, event.output_index);
        if (output.type === "reasoning") {
          if (!output.content) {
            throw new OpenAIError(`missing content at index ${event.content_index}`);
          }
          const content = getContent(output.content, event.content_index);
          if (content.type !== "reasoning_text") {
            throw new OpenAIError(`expected content to be 'reasoning_text', got ${content.type}`);
          }
          content.text += event.delta;
        }
        break;
      }
      case "response.reasoning_text.done": {
        const output = getOutput(snapshot, event.output_index);
        if (output.type === "reasoning") {
          if (!output.content) {
            throw new OpenAIError(`missing content at index ${event.content_index}`);
          }
          const content = getContent(output.content, event.content_index);
          if (content.type !== "reasoning_text") {
            throw new OpenAIError(`expected content to be 'reasoning_text', got ${content.type}`);
          }
          content.text = event.text;
        }
        break;
      }
      case "response.reasoning_summary_part.added": {
        const output = getOutput(snapshot, event.output_index);
        if (output.type === "reasoning") {
          output.summary.push(structuredClone(event.part));
        }
        break;
      }
      case "response.reasoning_summary_part.done": {
        const output = getOutput(snapshot, event.output_index);
        if (output.type === "reasoning") {
          getContent(output.summary, event.summary_index);
          output.summary[event.summary_index] = structuredClone(event.part);
        }
        break;
      }
      case "response.reasoning_summary_text.delta": {
        const output = getOutput(snapshot, event.output_index);
        if (output.type === "reasoning") {
          const part = getContent(output.summary, event.summary_index);
          part.text += event.delta;
        }
        break;
      }
      case "response.reasoning_summary_text.done": {
        const output = getOutput(snapshot, event.output_index);
        if (output.type === "reasoning") {
          const part = getContent(output.summary, event.summary_index);
          part.text = event.text;
        }
        break;
      }
      case "response.custom_tool_call_input.delta": {
        const output = getOutput(snapshot, event.output_index);
        if (output.type === "custom_tool_call") {
          output.input += event.delta;
        }
        break;
      }
      case "response.custom_tool_call_input.done": {
        const output = getOutput(snapshot, event.output_index);
        if (output.type === "custom_tool_call") {
          output.input = event.input;
        }
        break;
      }
      case "response.mcp_call_arguments.delta": {
        const output = getOutput(snapshot, event.output_index);
        if (output.type === "mcp_call") {
          output.arguments += event.delta;
        }
        break;
      }
      case "response.mcp_call_arguments.done": {
        const output = getOutput(snapshot, event.output_index);
        if (output.type === "mcp_call") {
          output.arguments = event.arguments;
        }
        break;
      }
      case "response.code_interpreter_call_code.delta": {
        const output = getOutput(snapshot, event.output_index);
        if (output.type === "code_interpreter_call") {
          output.code = (output.code ?? "") + event.delta;
        }
        break;
      }
      case "response.code_interpreter_call_code.done": {
        const output = getOutput(snapshot, event.output_index);
        if (output.type === "code_interpreter_call") {
          output.code = event.code;
        }
        break;
      }
      case "response.code_interpreter_call.in_progress": {
        const output = getOutput(snapshot, event.output_index);
        if (output.type === "code_interpreter_call") {
          output.status = "in_progress";
        }
        break;
      }
      case "response.code_interpreter_call.interpreting": {
        const output = getOutput(snapshot, event.output_index);
        if (output.type === "code_interpreter_call") {
          output.status = "interpreting";
        }
        break;
      }
      case "response.code_interpreter_call.completed": {
        const output = getOutput(snapshot, event.output_index);
        if (output.type === "code_interpreter_call") {
          output.status = "completed";
        }
        break;
      }
      case "response.file_search_call.in_progress": {
        const output = getOutput(snapshot, event.output_index);
        if (output.type === "file_search_call") {
          output.status = "in_progress";
        }
        break;
      }
      case "response.file_search_call.searching": {
        const output = getOutput(snapshot, event.output_index);
        if (output.type === "file_search_call") {
          output.status = "searching";
        }
        break;
      }
      case "response.file_search_call.completed": {
        const output = getOutput(snapshot, event.output_index);
        if (output.type === "file_search_call") {
          output.status = "completed";
        }
        break;
      }
      case "response.web_search_call.in_progress": {
        const output = getOutput(snapshot, event.output_index);
        if (output.type === "web_search_call") {
          output.status = "in_progress";
        }
        break;
      }
      case "response.web_search_call.searching": {
        const output = getOutput(snapshot, event.output_index);
        if (output.type === "web_search_call") {
          output.status = "searching";
        }
        break;
      }
      case "response.web_search_call.completed": {
        const output = getOutput(snapshot, event.output_index);
        if (output.type === "web_search_call") {
          output.status = "completed";
        }
        break;
      }
      case "response.image_generation_call.in_progress": {
        const output = getOutput(snapshot, event.output_index);
        if (output.type === "image_generation_call") {
          output.status = "in_progress";
        }
        break;
      }
      case "response.image_generation_call.generating": {
        const output = getOutput(snapshot, event.output_index);
        if (output.type === "image_generation_call") {
          output.status = "generating";
        }
        break;
      }
      case "response.image_generation_call.completed": {
        const output = getOutput(snapshot, event.output_index);
        if (output.type === "image_generation_call") {
          output.status = "completed";
        }
        break;
      }
      case "response.mcp_call.in_progress": {
        const output = getOutput(snapshot, event.output_index);
        if (output.type === "mcp_call") {
          output.status = "in_progress";
        }
        break;
      }
      case "response.mcp_call.completed": {
        const output = getOutput(snapshot, event.output_index);
        if (output.type === "mcp_call") {
          output.status = "completed";
        }
        break;
      }
      case "response.mcp_call.failed": {
        const output = getOutput(snapshot, event.output_index);
        if (output.type === "mcp_call") {
          output.status = "failed";
        }
        break;
      }
      case "response.created":
      case "response.queued":
      case "response.in_progress":
      case "response.completed":
      case "response.failed":
      case "response.incomplete": {
        snapshot = cloneResponse(event.response);
        break;
      }
      case "response.audio.delta":
      case "response.audio.done":
      case "response.audio.transcript.delta":
      case "response.audio.transcript.done":
      case "response.image_generation_call.partial_image":
      case "response.mcp_list_tools.in_progress":
      case "response.mcp_list_tools.completed":
      case "response.mcp_list_tools.failed":
      case "keepalive":
      case "error": {
        break;
      }
      default: {
        assertNever3(event);
      }
    }
    return snapshot;
  }
  function cloneResponse(response) {
    const snapshot = structuredClone(response);
    if (!Object.getOwnPropertyDescriptor(snapshot, "output_text") || snapshot.output_text == null) {
      addOutputText(snapshot);
    }
    return snapshot;
  }
  function getOutput(snapshot, outputIndex) {
    const output = snapshot.output[outputIndex];
    if (!output) {
      throw new OpenAIError(`missing output at index ${outputIndex}`);
    }
    return output;
  }
  function getContent(content, contentIndex) {
    const part = content[contentIndex];
    if (!part) {
      throw new OpenAIError(`missing content at index ${contentIndex}`);
    }
    return part;
  }
  function assertNever3(value) {
    throw new OpenAIError(`Unhandled response stream event: ${JSON.stringify(value)}`);
  }

  // node_modules/openai/lib/responses/ResponseStream.mjs
  var _ResponseStream_instances;
  var _ResponseStream_params;
  var _ResponseStream_currentResponseSnapshot;
  var _ResponseStream_finalResponse;
  var _ResponseStream_beginRequest;
  var _ResponseStream_addEvent;
  var _ResponseStream_endRequest;
  var ResponseStream = class _ResponseStream extends EventStream {
    constructor(params) {
      super();
      _ResponseStream_instances.add(this);
      _ResponseStream_params.set(this, void 0);
      _ResponseStream_currentResponseSnapshot.set(this, void 0);
      _ResponseStream_finalResponse.set(this, void 0);
      __classPrivateFieldSet(this, _ResponseStream_params, params, "f");
    }
    static createResponse(client, params, options) {
      const runner = new _ResponseStream(params);
      runner._run(() => runner._createOrRetrieveResponse(client, params, {
        ...options,
        headers: { ...options?.headers, "X-Stainless-Helper-Method": "stream" }
      }));
      return runner;
    }
    static fromReadableStream(stream) {
      const runner = new _ResponseStream(null);
      runner._run(() => runner._fromReadableStream(stream));
      return runner;
    }
    async _createOrRetrieveResponse(client, params, options) {
      this._listenForAbort(options?.signal);
      __classPrivateFieldGet(this, _ResponseStream_instances, "m", _ResponseStream_beginRequest).call(this);
      let stream;
      let starting_after = null;
      if ("response_id" in params) {
        stream = await client.responses.retrieve(params.response_id, { stream: true }, { ...options, signal: this.controller.signal, stream: true });
        starting_after = params.starting_after ?? null;
      } else {
        stream = await client.responses.create({ ...params, stream: true }, { ...options, signal: this.controller.signal });
      }
      this._connected();
      for await (const event of stream) {
        __classPrivateFieldGet(this, _ResponseStream_instances, "m", _ResponseStream_addEvent).call(this, event, starting_after);
      }
      if (stream.controller.signal?.aborted) {
        throw new APIUserAbortError();
      }
      return __classPrivateFieldGet(this, _ResponseStream_instances, "m", _ResponseStream_endRequest).call(this);
    }
    async _fromReadableStream(readableStream, options) {
      this._listenForAbort(options?.signal);
      __classPrivateFieldGet(this, _ResponseStream_instances, "m", _ResponseStream_beginRequest).call(this);
      this._connected();
      const stream = Stream.fromReadableStream(readableStream, this.controller);
      for await (const event of stream) {
        __classPrivateFieldGet(this, _ResponseStream_instances, "m", _ResponseStream_addEvent).call(this, event, null);
      }
      if (stream.controller.signal?.aborted) {
        throw new APIUserAbortError();
      }
      return __classPrivateFieldGet(this, _ResponseStream_instances, "m", _ResponseStream_endRequest).call(this);
    }
    [(_ResponseStream_params = /* @__PURE__ */ new WeakMap(), _ResponseStream_currentResponseSnapshot = /* @__PURE__ */ new WeakMap(), _ResponseStream_finalResponse = /* @__PURE__ */ new WeakMap(), _ResponseStream_instances = /* @__PURE__ */ new WeakSet(), _ResponseStream_beginRequest = function _ResponseStream_beginRequest2() {
      if (this.ended)
        return;
      __classPrivateFieldSet(this, _ResponseStream_currentResponseSnapshot, void 0, "f");
    }, _ResponseStream_addEvent = function _ResponseStream_addEvent2(event, starting_after) {
      if (this.ended)
        return;
      const maybeEmit = (name, event2) => {
        if (starting_after == null || event2.sequence_number > starting_after) {
          this._emit(name, event2);
        }
      };
      const response = accumulateResponse(event, __classPrivateFieldGet(this, _ResponseStream_currentResponseSnapshot, "f"));
      __classPrivateFieldSet(this, _ResponseStream_currentResponseSnapshot, response, "f");
      maybeEmit("event", event);
      switch (event.type) {
        case "response.output_text.delta": {
          const output = response.output[event.output_index];
          if (!output) {
            throw new OpenAIError(`missing output at index ${event.output_index}`);
          }
          if (output.type === "message") {
            const content = output.content[event.content_index];
            if (!content) {
              throw new OpenAIError(`missing content at index ${event.content_index}`);
            }
            if (content.type !== "output_text") {
              throw new OpenAIError(`expected content to be 'output_text', got ${content.type}`);
            }
            maybeEmit("response.output_text.delta", {
              ...event,
              snapshot: content.text
            });
          }
          break;
        }
        case "response.function_call_arguments.delta": {
          const output = response.output[event.output_index];
          if (!output) {
            throw new OpenAIError(`missing output at index ${event.output_index}`);
          }
          if (output.type === "function_call") {
            maybeEmit("response.function_call_arguments.delta", {
              ...event,
              snapshot: output.arguments
            });
          }
          break;
        }
        default:
          maybeEmit(event.type, event);
          break;
      }
    }, _ResponseStream_endRequest = function _ResponseStream_endRequest2() {
      if (this.ended) {
        throw new OpenAIError(`stream has ended, this shouldn't happen`);
      }
      const snapshot = __classPrivateFieldGet(this, _ResponseStream_currentResponseSnapshot, "f");
      if (!snapshot) {
        throw new OpenAIError(`request ended without sending any events`);
      }
      __classPrivateFieldSet(this, _ResponseStream_currentResponseSnapshot, void 0, "f");
      const parsedResponse = finalizeResponse(snapshot, __classPrivateFieldGet(this, _ResponseStream_params, "f"));
      __classPrivateFieldSet(this, _ResponseStream_finalResponse, parsedResponse, "f");
      return parsedResponse;
    }, Symbol.asyncIterator)]() {
      const pushQueue = [];
      const readQueue = [];
      let done = false;
      this.on("event", (event) => {
        const reader = readQueue.shift();
        if (reader) {
          reader.resolve(event);
        } else {
          pushQueue.push(event);
        }
      });
      this.on("end", () => {
        done = true;
        for (const reader of readQueue) {
          reader.resolve(void 0);
        }
        readQueue.length = 0;
      });
      this.on("abort", (err) => {
        done = true;
        for (const reader of readQueue) {
          reader.reject(err);
        }
        readQueue.length = 0;
      });
      this.on("error", (err) => {
        done = true;
        for (const reader of readQueue) {
          reader.reject(err);
        }
        readQueue.length = 0;
      });
      return {
        next: async () => {
          if (!pushQueue.length) {
            if (done) {
              return { value: void 0, done: true };
            }
            return new Promise((resolve, reject) => readQueue.push({ resolve, reject })).then((event2) => event2 ? { value: event2, done: false } : { value: void 0, done: true });
          }
          const event = pushQueue.shift();
          return { value: event, done: false };
        },
        return: async () => {
          this.abort();
          return { value: void 0, done: true };
        }
      };
    }
    /**
     * @returns a promise that resolves with the final Response, or rejects
     * if an error occurred or the stream ended prematurely without producing a REsponse.
     */
    async finalResponse() {
      await this.done();
      const response = __classPrivateFieldGet(this, _ResponseStream_finalResponse, "f");
      if (!response)
        throw new OpenAIError("stream ended without producing a ChatCompletion");
      return response;
    }
  };
  function finalizeResponse(snapshot, params) {
    return maybeParseResponse(snapshot, params);
  }

  // node_modules/openai/resources/responses/input-items.mjs
  var InputItems2 = class extends APIResource {
    /**
     * Returns a list of input items for a given response.
     *
     * @example
     * ```ts
     * // Automatically fetches more pages as needed.
     * for await (const responseItem of client.responses.inputItems.list(
     *   'response_id',
     * )) {
     *   // ...
     * }
     * ```
     */
    list(responseID, query = {}, options) {
      return this._client.getAPIList(path`/responses/${responseID}/input_items`, CursorPage, { query, ...options, __security: { bearerAuth: true } });
    }
  };

  // node_modules/openai/resources/responses/input-tokens.mjs
  var InputTokens2 = class extends APIResource {
    /**
     * Returns input token counts of the request.
     *
     * Returns an object with `object` set to `response.input_tokens` and an
     * `input_tokens` count.
     *
     * @example
     * ```ts
     * const response = await client.responses.inputTokens.count();
     * ```
     */
    count(body = {}, options) {
      return this._client.post("/responses/input_tokens", {
        body,
        ...options,
        __security: { bearerAuth: true }
      });
    }
  };

  // node_modules/openai/resources/responses/responses.mjs
  var Responses2 = class extends APIResource {
    constructor() {
      super(...arguments);
      this.inputItems = new InputItems2(this._client);
      this.inputTokens = new InputTokens2(this._client);
    }
    create(body, options) {
      return this._client.post("/responses", {
        body,
        ...options,
        stream: body.stream ?? false,
        __security: { bearerAuth: true }
      })._thenUnwrap((rsp) => {
        if ("object" in rsp && rsp.object === "response") {
          addOutputText(rsp);
        }
        return rsp;
      });
    }
    retrieve(responseID, query = {}, options) {
      return this._client.get(path`/responses/${responseID}`, {
        query,
        ...options,
        stream: query?.stream ?? false,
        __security: { bearerAuth: true }
      })._thenUnwrap((rsp) => {
        if ("object" in rsp && rsp.object === "response") {
          addOutputText(rsp);
        }
        return rsp;
      });
    }
    /**
     * Deletes a model response with the given ID.
     *
     * @example
     * ```ts
     * await client.responses.delete(
     *   'resp_677efb5139a88190b512bc3fef8e535d',
     * );
     * ```
     */
    delete(responseID, options) {
      return this._client.delete(path`/responses/${responseID}`, {
        ...options,
        headers: buildHeaders([{ Accept: "*/*" }, options?.headers]),
        __security: { bearerAuth: true }
      });
    }
    parse(body, options) {
      return this._client.responses.create(body, options)._thenUnwrap((response) => parseResponse(response, body));
    }
    /**
     * Creates a model response stream
     */
    stream(body, options) {
      return ResponseStream.createResponse(this._client, body, options);
    }
    /**
     * Cancels a model response with the given ID. Only responses created with the
     * `background` parameter set to `true` can be cancelled.
     * [Learn more](https://platform.openai.com/docs/guides/background).
     *
     * @example
     * ```ts
     * const response = await client.responses.cancel(
     *   'resp_677efb5139a88190b512bc3fef8e535d',
     * );
     * ```
     */
    cancel(responseID, options) {
      return this._client.post(path`/responses/${responseID}/cancel`, {
        ...options,
        __security: { bearerAuth: true }
      });
    }
    /**
     * Compact a conversation. Returns a compacted response object.
     *
     * Learn when and how to compact long-running conversations in the
     * [conversation state guide](https://platform.openai.com/docs/guides/conversation-state#managing-the-context-window).
     * For ZDR-compatible compaction details, see
     * [Compaction (advanced)](https://platform.openai.com/docs/guides/conversation-state#compaction-advanced).
     *
     * @example
     * ```ts
     * const compactedResponse = await client.responses.compact({
     *   model: 'gpt-5.6-sol',
     * });
     * ```
     */
    compact(body, options) {
      return this._client.post("/responses/compact", { body, ...options, __security: { bearerAuth: true } });
    }
  };
  Responses2.InputItems = InputItems2;
  Responses2.InputTokens = InputTokens2;

  // node_modules/openai/resources/skills/content.mjs
  var Content2 = class extends APIResource {
    /**
     * Download a skill zip bundle by its ID.
     */
    retrieve(skillID, options) {
      return this._client.get(path`/skills/${skillID}/content`, {
        ...options,
        headers: buildHeaders([{ Accept: "application/binary" }, options?.headers]),
        __security: { bearerAuth: true },
        __binaryResponse: true
      });
    }
  };

  // node_modules/openai/resources/skills/versions/content.mjs
  var Content3 = class extends APIResource {
    /**
     * Download a skill version zip bundle.
     */
    retrieve(version, params, options) {
      const { skill_id } = params;
      return this._client.get(path`/skills/${skill_id}/versions/${version}/content`, {
        ...options,
        headers: buildHeaders([{ Accept: "application/binary" }, options?.headers]),
        __security: { bearerAuth: true },
        __binaryResponse: true
      });
    }
  };

  // node_modules/openai/resources/skills/versions/versions.mjs
  var Versions = class extends APIResource {
    constructor() {
      super(...arguments);
      this.content = new Content3(this._client);
    }
    /**
     * Create a new immutable skill version.
     */
    create(skillID, body = {}, options) {
      return this._client.post(path`/skills/${skillID}/versions`, maybeMultipartFormRequestOptions({ body, ...options, __security: { bearerAuth: true } }, this._client));
    }
    /**
     * Get a specific skill version.
     */
    retrieve(version, params, options) {
      const { skill_id } = params;
      return this._client.get(path`/skills/${skill_id}/versions/${version}`, {
        ...options,
        __security: { bearerAuth: true }
      });
    }
    /**
     * List skill versions for a skill.
     */
    list(skillID, query = {}, options) {
      return this._client.getAPIList(path`/skills/${skillID}/versions`, CursorPage, {
        query,
        ...options,
        __security: { bearerAuth: true }
      });
    }
    /**
     * Delete a skill version.
     */
    delete(version, params, options) {
      const { skill_id } = params;
      return this._client.delete(path`/skills/${skill_id}/versions/${version}`, {
        ...options,
        __security: { bearerAuth: true }
      });
    }
  };
  Versions.Content = Content3;

  // node_modules/openai/resources/skills/skills.mjs
  var Skills = class extends APIResource {
    constructor() {
      super(...arguments);
      this.content = new Content2(this._client);
      this.versions = new Versions(this._client);
    }
    /**
     * Create a new skill.
     */
    create(body = {}, options) {
      return this._client.post("/skills", maybeMultipartFormRequestOptions({ body, ...options, __security: { bearerAuth: true } }, this._client));
    }
    /**
     * Get a skill by its ID.
     */
    retrieve(skillID, options) {
      return this._client.get(path`/skills/${skillID}`, { ...options, __security: { bearerAuth: true } });
    }
    /**
     * Update the default version pointer for a skill.
     */
    update(skillID, body, options) {
      return this._client.post(path`/skills/${skillID}`, {
        body,
        ...options,
        __security: { bearerAuth: true }
      });
    }
    /**
     * List all skills for the current project.
     */
    list(query = {}, options) {
      return this._client.getAPIList("/skills", CursorPage, {
        query,
        ...options,
        __security: { bearerAuth: true }
      });
    }
    /**
     * Delete a skill by its ID.
     */
    delete(skillID, options) {
      return this._client.delete(path`/skills/${skillID}`, { ...options, __security: { bearerAuth: true } });
    }
  };
  Skills.Content = Content2;
  Skills.Versions = Versions;

  // node_modules/openai/resources/uploads/parts.mjs
  var Parts = class extends APIResource {
    /**
     * Adds a
     * [Part](https://platform.openai.com/docs/api-reference/uploads/part-object) to an
     * [Upload](https://platform.openai.com/docs/api-reference/uploads/object) object.
     * A Part represents a chunk of bytes from the file you are trying to upload.
     *
     * Each Part can be at most 64 MB, and you can add Parts until you hit the Upload
     * maximum of 8 GB.
     *
     * It is possible to add multiple Parts in parallel. You can decide the intended
     * order of the Parts when you
     * [complete the Upload](https://platform.openai.com/docs/api-reference/uploads/complete).
     */
    create(uploadID, body, options) {
      return this._client.post(path`/uploads/${uploadID}/parts`, multipartFormRequestOptions({ body, ...options, __security: { bearerAuth: true } }, this._client));
    }
  };

  // node_modules/openai/resources/uploads/uploads.mjs
  var Uploads = class extends APIResource {
    constructor() {
      super(...arguments);
      this.parts = new Parts(this._client);
    }
    /**
     * Creates an intermediate
     * [Upload](https://platform.openai.com/docs/api-reference/uploads/object) object
     * that you can add
     * [Parts](https://platform.openai.com/docs/api-reference/uploads/part-object) to.
     * Currently, an Upload can accept at most 8 GB in total and expires after an hour
     * after you create it.
     *
     * Once you complete the Upload, we will create a
     * [File](https://platform.openai.com/docs/api-reference/files/object) object that
     * contains all the parts you uploaded. This File is usable in the rest of our
     * platform as a regular File object.
     *
     * For certain `purpose` values, the correct `mime_type` must be specified. Please
     * refer to documentation for the
     * [supported MIME types for your use case](https://platform.openai.com/docs/assistants/tools/file-search#supported-files).
     *
     * For guidance on the proper filename extensions for each purpose, please follow
     * the documentation on
     * [creating a File](https://platform.openai.com/docs/api-reference/files/create).
     *
     * Returns the Upload object with status `pending`.
     */
    create(body, options) {
      return this._client.post("/uploads", { body, ...options, __security: { bearerAuth: true } });
    }
    /**
     * Cancels the Upload. No Parts may be added after an Upload is cancelled.
     *
     * Returns the Upload object with status `cancelled`.
     */
    cancel(uploadID, options) {
      return this._client.post(path`/uploads/${uploadID}/cancel`, {
        ...options,
        __security: { bearerAuth: true }
      });
    }
    /**
     * Completes the
     * [Upload](https://platform.openai.com/docs/api-reference/uploads/object).
     *
     * Within the returned Upload object, there is a nested
     * [File](https://platform.openai.com/docs/api-reference/files/object) object that
     * is ready to use in the rest of the platform.
     *
     * You can specify the order of the Parts by passing in an ordered list of the Part
     * IDs.
     *
     * The number of bytes uploaded upon completion must match the number of bytes
     * initially specified when creating the Upload object. No Parts may be added after
     * an Upload is completed. Returns the Upload object with status `completed`,
     * including an additional `file` property containing the created usable File
     * object.
     */
    complete(uploadID, body, options) {
      return this._client.post(path`/uploads/${uploadID}/complete`, {
        body,
        ...options,
        __security: { bearerAuth: true }
      });
    }
  };
  Uploads.Parts = Parts;

  // node_modules/openai/lib/Util.mjs
  var allSettledWithThrow = async (promises) => {
    const results = await Promise.allSettled(promises);
    const rejected = results.filter((result) => result.status === "rejected");
    if (rejected.length) {
      for (const result of rejected) {
        console.error(result.reason);
      }
      throw new Error(`${rejected.length} promise(s) failed - see the above errors`);
    }
    const values = [];
    for (const result of results) {
      if (result.status === "fulfilled") {
        values.push(result.value);
      }
    }
    return values;
  };

  // node_modules/openai/resources/vector-stores/file-batches.mjs
  var FileBatches = class extends APIResource {
    /**
     * Create a vector store file batch.
     */
    create(vectorStoreID, body, options) {
      return this._client.post(path`/vector_stores/${vectorStoreID}/file_batches`, {
        body,
        ...options,
        headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
        __security: { bearerAuth: true }
      });
    }
    /**
     * Retrieves a vector store file batch.
     */
    retrieve(batchID, params, options) {
      const { vector_store_id } = params;
      return this._client.get(path`/vector_stores/${vector_store_id}/file_batches/${batchID}`, {
        ...options,
        headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
        __security: { bearerAuth: true }
      });
    }
    /**
     * Cancel a vector store file batch. This attempts to cancel the processing of
     * files in this batch as soon as possible.
     */
    cancel(batchID, params, options) {
      const { vector_store_id } = params;
      return this._client.post(path`/vector_stores/${vector_store_id}/file_batches/${batchID}/cancel`, {
        ...options,
        headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
        __security: { bearerAuth: true }
      });
    }
    /**
     * Create a vector store batch and poll until all files have been processed.
     */
    async createAndPoll(vectorStoreId, body, options) {
      const batch = await this.create(vectorStoreId, body);
      return await this.poll(vectorStoreId, batch.id, options);
    }
    /**
     * Returns a list of vector store files in a batch.
     */
    listFiles(batchID, params, options) {
      const { vector_store_id, ...query } = params;
      return this._client.getAPIList(path`/vector_stores/${vector_store_id}/file_batches/${batchID}/files`, CursorPage, {
        query,
        ...options,
        headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
        __security: { bearerAuth: true }
      });
    }
    /**
     * Wait for the given file batch to be processed.
     *
     * Note: this will return even if one of the files failed to process, you need to
     * check batch.file_counts.failed_count to handle this case.
     */
    async poll(vectorStoreID, batchID, options) {
      const headers = buildHeaders([
        options?.headers,
        {
          "X-Stainless-Poll-Helper": "true",
          "X-Stainless-Custom-Poll-Interval": options?.pollIntervalMs?.toString() ?? void 0
        }
      ]);
      while (true) {
        const { data: batch, response } = await this.retrieve(batchID, { vector_store_id: vectorStoreID }, {
          ...options,
          headers
        }).withResponse();
        switch (batch.status) {
          case "in_progress":
            let sleepInterval = 5e3;
            if (options?.pollIntervalMs) {
              sleepInterval = options.pollIntervalMs;
            } else {
              const headerInterval = response.headers.get("openai-poll-after-ms");
              if (headerInterval) {
                const headerIntervalMs = parseInt(headerInterval);
                if (!isNaN(headerIntervalMs)) {
                  sleepInterval = headerIntervalMs;
                }
              }
            }
            await sleep(sleepInterval);
            break;
          case "failed":
          case "cancelled":
          case "completed":
            return batch;
        }
      }
    }
    /**
     * Uploads the given files concurrently and then creates a vector store file batch.
     *
     * The concurrency limit is configurable using the `maxConcurrency` parameter.
     */
    async uploadAndPoll(vectorStoreId, { files, fileIds = [] }, options) {
      if (files == null || files.length == 0) {
        throw new Error(`No \`files\` provided to process. If you've already uploaded files you should use \`.createAndPoll()\` instead`);
      }
      const configuredConcurrency = options?.maxConcurrency ?? 5;
      const concurrencyLimit = Math.min(configuredConcurrency, files.length);
      const client = this._client;
      const fileIterator = files.values();
      const allFileIds = [...fileIds];
      async function processFiles(iterator) {
        for (let item of iterator) {
          const fileObj = await client.files.create({ file: item, purpose: "assistants" }, options);
          allFileIds.push(fileObj.id);
        }
      }
      const workers = Array(concurrencyLimit).fill(fileIterator).map(processFiles);
      await allSettledWithThrow(workers);
      return await this.createAndPoll(vectorStoreId, {
        file_ids: allFileIds
      });
    }
  };

  // node_modules/openai/resources/vector-stores/files.mjs
  var Files3 = class extends APIResource {
    /**
     * Create a vector store file by attaching a
     * [File](https://platform.openai.com/docs/api-reference/files) to a
     * [vector store](https://platform.openai.com/docs/api-reference/vector-stores/object).
     */
    create(vectorStoreID, body, options) {
      return this._client.post(path`/vector_stores/${vectorStoreID}/files`, {
        body,
        ...options,
        headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
        __security: { bearerAuth: true }
      });
    }
    /**
     * Retrieves a vector store file.
     */
    retrieve(fileID, params, options) {
      const { vector_store_id } = params;
      return this._client.get(path`/vector_stores/${vector_store_id}/files/${fileID}`, {
        ...options,
        headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
        __security: { bearerAuth: true }
      });
    }
    /**
     * Update attributes on a vector store file.
     */
    update(fileID, params, options) {
      const { vector_store_id, ...body } = params;
      return this._client.post(path`/vector_stores/${vector_store_id}/files/${fileID}`, {
        body,
        ...options,
        headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
        __security: { bearerAuth: true }
      });
    }
    /**
     * Returns a list of vector store files.
     */
    list(vectorStoreID, query = {}, options) {
      return this._client.getAPIList(path`/vector_stores/${vectorStoreID}/files`, CursorPage, {
        query,
        ...options,
        headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
        __security: { bearerAuth: true }
      });
    }
    /**
     * Delete a vector store file. This will remove the file from the vector store but
     * the file itself will not be deleted. To delete the file, use the
     * [delete file](https://platform.openai.com/docs/api-reference/files/delete)
     * endpoint.
     */
    delete(fileID, params, options) {
      const { vector_store_id } = params;
      return this._client.delete(path`/vector_stores/${vector_store_id}/files/${fileID}`, {
        ...options,
        headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
        __security: { bearerAuth: true }
      });
    }
    /**
     * Attach a file to the given vector store and wait for it to be processed.
     */
    async createAndPoll(vectorStoreId, body, options) {
      const file = await this.create(vectorStoreId, body, options);
      return await this.poll(vectorStoreId, file.id, options);
    }
    /**
     * Wait for the vector store file to finish processing.
     *
     * Note: this will return even if the file failed to process, you need to check
     * file.last_error and file.status to handle these cases
     */
    async poll(vectorStoreID, fileID, options) {
      const headers = buildHeaders([
        options?.headers,
        {
          "X-Stainless-Poll-Helper": "true",
          "X-Stainless-Custom-Poll-Interval": options?.pollIntervalMs?.toString() ?? void 0
        }
      ]);
      while (true) {
        const fileResponse = await this.retrieve(fileID, {
          vector_store_id: vectorStoreID
        }, { ...options, headers }).withResponse();
        const file = fileResponse.data;
        switch (file.status) {
          case "in_progress":
            let sleepInterval = 5e3;
            if (options?.pollIntervalMs) {
              sleepInterval = options.pollIntervalMs;
            } else {
              const headerInterval = fileResponse.response.headers.get("openai-poll-after-ms");
              if (headerInterval) {
                const headerIntervalMs = parseInt(headerInterval);
                if (!isNaN(headerIntervalMs)) {
                  sleepInterval = headerIntervalMs;
                }
              }
            }
            await sleep(sleepInterval);
            break;
          case "failed":
          case "completed":
            return file;
        }
      }
    }
    /**
     * Upload a file to the `files` API and then attach it to the given vector store.
     *
     * Note the file will be asynchronously processed (you can use the alternative
     * polling helper method to wait for processing to complete).
     */
    async upload(vectorStoreId, file, options) {
      const fileInfo = await this._client.files.create({ file, purpose: "assistants" }, options);
      return this.create(vectorStoreId, { file_id: fileInfo.id }, options);
    }
    /**
     * Add a file to a vector store and poll until processing is complete.
     */
    async uploadAndPoll(vectorStoreId, file, options) {
      const fileInfo = await this.upload(vectorStoreId, file, options);
      return await this.poll(vectorStoreId, fileInfo.id, options);
    }
    /**
     * Retrieve the parsed contents of a vector store file.
     */
    content(fileID, params, options) {
      const { vector_store_id } = params;
      return this._client.getAPIList(path`/vector_stores/${vector_store_id}/files/${fileID}/content`, Page, {
        ...options,
        headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
        __security: { bearerAuth: true }
      });
    }
  };

  // node_modules/openai/resources/vector-stores/vector-stores.mjs
  var VectorStores = class extends APIResource {
    constructor() {
      super(...arguments);
      this.files = new Files3(this._client);
      this.fileBatches = new FileBatches(this._client);
    }
    /**
     * Create a vector store.
     */
    create(body, options) {
      return this._client.post("/vector_stores", {
        body,
        ...options,
        headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
        __security: { bearerAuth: true }
      });
    }
    /**
     * Retrieves a vector store.
     */
    retrieve(vectorStoreID, options) {
      return this._client.get(path`/vector_stores/${vectorStoreID}`, {
        ...options,
        headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
        __security: { bearerAuth: true }
      });
    }
    /**
     * Modifies a vector store.
     */
    update(vectorStoreID, body, options) {
      return this._client.post(path`/vector_stores/${vectorStoreID}`, {
        body,
        ...options,
        headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
        __security: { bearerAuth: true }
      });
    }
    /**
     * Returns a list of vector stores.
     */
    list(query = {}, options) {
      return this._client.getAPIList("/vector_stores", CursorPage, {
        query,
        ...options,
        headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
        __security: { bearerAuth: true }
      });
    }
    /**
     * Delete a vector store.
     */
    delete(vectorStoreID, options) {
      return this._client.delete(path`/vector_stores/${vectorStoreID}`, {
        ...options,
        headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
        __security: { bearerAuth: true }
      });
    }
    /**
     * Search a vector store for relevant chunks based on a query and file attributes
     * filter.
     */
    search(vectorStoreID, body, options) {
      return this._client.getAPIList(path`/vector_stores/${vectorStoreID}/search`, Page, {
        body,
        method: "post",
        ...options,
        headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
        __security: { bearerAuth: true }
      });
    }
  };
  VectorStores.Files = Files3;
  VectorStores.FileBatches = FileBatches;

  // node_modules/openai/resources/videos.mjs
  var Videos = class extends APIResource {
    /**
     * Create a new video generation job from a prompt and optional reference assets.
     */
    create(body, options) {
      return this._client.post("/videos", multipartFormRequestOptions({ body, ...options, __security: { bearerAuth: true } }, this._client));
    }
    /**
     * Fetch the latest metadata for a generated video.
     */
    retrieve(videoID, options) {
      return this._client.get(path`/videos/${videoID}`, { ...options, __security: { bearerAuth: true } });
    }
    /**
     * List recently generated videos for the current project.
     */
    list(query = {}, options) {
      return this._client.getAPIList("/videos", ConversationCursorPage, {
        query,
        ...options,
        __security: { bearerAuth: true }
      });
    }
    /**
     * Permanently delete a completed or failed video and its stored assets.
     */
    delete(videoID, options) {
      return this._client.delete(path`/videos/${videoID}`, { ...options, __security: { bearerAuth: true } });
    }
    /**
     * Create a character from an uploaded video.
     */
    createCharacter(body, options) {
      return this._client.post("/videos/characters", multipartFormRequestOptions({ body, ...options, __security: { bearerAuth: true } }, this._client));
    }
    /**
     * Download the generated video bytes or a derived preview asset.
     *
     * Streams the rendered video content for the specified video job.
     */
    downloadContent(videoID, query = {}, options) {
      return this._client.get(path`/videos/${videoID}/content`, {
        query,
        ...options,
        headers: buildHeaders([{ Accept: "application/binary" }, options?.headers]),
        __security: { bearerAuth: true },
        __binaryResponse: true
      });
    }
    /**
     * Create a new video generation job by editing a source video or existing
     * generated video.
     */
    edit(body, options) {
      return this._client.post("/videos/edits", multipartFormRequestOptions({ body, ...options, __security: { bearerAuth: true } }, this._client));
    }
    /**
     * Create an extension of a completed video.
     */
    extend(body, options) {
      return this._client.post("/videos/extensions", multipartFormRequestOptions({ body, ...options, __security: { bearerAuth: true } }, this._client));
    }
    /**
     * Fetch a character.
     */
    getCharacter(characterID, options) {
      return this._client.get(path`/videos/characters/${characterID}`, {
        ...options,
        __security: { bearerAuth: true }
      });
    }
    /**
     * Create a remix of a completed video using a refreshed prompt.
     */
    remix(videoID, body, options) {
      return this._client.post(path`/videos/${videoID}/remix`, maybeMultipartFormRequestOptions({ body, ...options, __security: { bearerAuth: true } }, this._client));
    }
  };

  // node_modules/openai/resources/webhooks/webhooks.mjs
  var _Webhooks_instances;
  var _Webhooks_validateSecret;
  var _Webhooks_getRequiredHeader;
  var Webhooks = class extends APIResource {
    constructor() {
      super(...arguments);
      _Webhooks_instances.add(this);
    }
    /**
     * Validates that the given payload was sent by OpenAI and parses the payload.
     */
    async unwrap(payload, headers, secret = this._client.webhookSecret, tolerance = 300) {
      await this.verifySignature(payload, headers, secret, tolerance);
      return JSON.parse(payload);
    }
    /**
     * Validates whether or not the webhook payload was sent by OpenAI.
     *
     * An error will be raised if the webhook payload was not sent by OpenAI.
     *
     * @param payload - The webhook payload
     * @param headers - The webhook headers
     * @param secret - The webhook secret (optional, will use client secret if not provided)
     * @param tolerance - Maximum age of the webhook in seconds (default: 300 = 5 minutes)
     */
    async verifySignature(payload, headers, secret = this._client.webhookSecret, tolerance = 300) {
      if (typeof crypto === "undefined" || typeof crypto.subtle.importKey !== "function" || typeof crypto.subtle.verify !== "function") {
        throw new Error("Webhook signature verification is only supported when the `crypto` global is defined");
      }
      __classPrivateFieldGet(this, _Webhooks_instances, "m", _Webhooks_validateSecret).call(this, secret);
      const headersObj = buildHeaders([headers]).values;
      const signatureHeader = __classPrivateFieldGet(this, _Webhooks_instances, "m", _Webhooks_getRequiredHeader).call(this, headersObj, "webhook-signature");
      const timestamp = __classPrivateFieldGet(this, _Webhooks_instances, "m", _Webhooks_getRequiredHeader).call(this, headersObj, "webhook-timestamp");
      const webhookId = __classPrivateFieldGet(this, _Webhooks_instances, "m", _Webhooks_getRequiredHeader).call(this, headersObj, "webhook-id");
      const timestampSeconds = parseInt(timestamp, 10);
      if (isNaN(timestampSeconds)) {
        throw new InvalidWebhookSignatureError("Invalid webhook timestamp format");
      }
      const nowSeconds = Math.floor(Date.now() / 1e3);
      if (nowSeconds - timestampSeconds > tolerance) {
        throw new InvalidWebhookSignatureError("Webhook timestamp is too old");
      }
      if (timestampSeconds > nowSeconds + tolerance) {
        throw new InvalidWebhookSignatureError("Webhook timestamp is too new");
      }
      const signatures = signatureHeader.split(" ").map((part) => part.startsWith("v1,") ? part.substring(3) : part);
      const decodedSecret = secret.startsWith("whsec_") ? Buffer.from(secret.replace("whsec_", ""), "base64") : Buffer.from(secret, "utf-8");
      const signedPayload = webhookId ? `${webhookId}.${timestamp}.${payload}` : `${timestamp}.${payload}`;
      const key = await crypto.subtle.importKey("raw", decodedSecret, { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
      for (const signature of signatures) {
        try {
          const signatureBytes = Buffer.from(signature, "base64");
          const isValid = await crypto.subtle.verify("HMAC", key, signatureBytes, new TextEncoder().encode(signedPayload));
          if (isValid) {
            return;
          }
        } catch {
          continue;
        }
      }
      throw new InvalidWebhookSignatureError("The given webhook signature does not match the expected signature");
    }
  };
  _Webhooks_instances = /* @__PURE__ */ new WeakSet(), _Webhooks_validateSecret = function _Webhooks_validateSecret2(secret) {
    if (typeof secret !== "string" || secret.length === 0) {
      throw new Error(`The webhook secret must either be set using the env var, OPENAI_WEBHOOK_SECRET, on the client class, OpenAI({ webhookSecret: '123' }), or passed to this function`);
    }
  }, _Webhooks_getRequiredHeader = function _Webhooks_getRequiredHeader2(headers, name) {
    if (!headers) {
      throw new Error(`Headers are required`);
    }
    const value = headers.get(name);
    if (value === null || value === void 0) {
      throw new Error(`Missing required header: ${name}`);
    }
    return value;
  };

  // node_modules/openai/internal/provider.mjs
  var providerDefinitionsKey = /* @__PURE__ */ Symbol.for("openai.node.providerDefinitions.v1");
  var providerGlobal = globalThis;
  var existingProviderDefinitions = providerGlobal[providerDefinitionsKey];
  var providerDefinitions = existingProviderDefinitions ?? /* @__PURE__ */ new WeakMap();
  if (!existingProviderDefinitions) {
    Object.defineProperty(providerGlobal, providerDefinitionsKey, { value: providerDefinitions });
  }
  function configureProvider(provider) {
    const definition = providerDefinitions.get(provider);
    if (!definition) {
      throw new Error("Invalid provider. Providers must be created with createProvider().");
    }
    return definition.configure();
  }

  // node_modules/openai/client.mjs
  var _OpenAI_instances;
  var _a2;
  var _OpenAI_encoder;
  var _OpenAI_baseURLOverridden;
  var WORKLOAD_IDENTITY_API_KEY_PLACEHOLDER = "workload-identity-auth";
  var OpenAI = class {
    /**
     * API Client for interfacing with the OpenAI API.
     *
     * @param {string | null | undefined} [opts.apiKey=process.env['OPENAI_API_KEY'] ?? null]
     * @param {string | null | undefined} [opts.adminAPIKey=process.env['OPENAI_ADMIN_KEY'] ?? null]
     * @param {string | null | undefined} [opts.organization=process.env['OPENAI_ORG_ID'] ?? null]
     * @param {string | null | undefined} [opts.project=process.env['OPENAI_PROJECT_ID'] ?? null]
     * @param {string | null | undefined} [opts.webhookSecret=process.env['OPENAI_WEBHOOK_SECRET'] ?? null]
     * @param {string} [opts.baseURL=process.env['OPENAI_BASE_URL'] ?? https://api.openai.com/v1] - Override the default base URL for the API.
     * @param {Provider} [opts.provider] - Configure a third-party API provider. Mutually exclusive with top-level authentication and base URL options.
     * @param {number} [opts.timeout=10 minutes] - The maximum amount of time (in milliseconds) the client will wait for a response before timing out.
     * @param {MergedRequestInit} [opts.fetchOptions] - Additional `RequestInit` options to be passed to `fetch` calls.
     * @param {Fetch} [opts.fetch] - Specify a custom `fetch` function implementation.
     * @param {number} [opts.maxRetries=2] - The maximum number of times the client will retry a request.
     * @param {HeadersLike} opts.defaultHeaders - Default headers to include with every request to the API.
     * @param {Record<string, string | undefined>} opts.defaultQuery - Default query parameters to include with every request to the API.
     * @param {boolean} [opts.dangerouslyAllowBrowser=false] - By default, client-side use of this library is not allowed, as it risks exposing your secret API credentials to attackers.
     */
    constructor(clientOptions = {}) {
      _OpenAI_instances.add(this);
      _OpenAI_encoder.set(this, void 0);
      this.completions = new Completions2(this);
      this.chat = new Chat(this);
      this.embeddings = new Embeddings(this);
      this.files = new Files2(this);
      this.images = new Images(this);
      this.audio = new Audio(this);
      this.moderations = new Moderations(this);
      this.models = new Models(this);
      this.fineTuning = new FineTuning(this);
      this.graders = new Graders2(this);
      this.vectorStores = new VectorStores(this);
      this.webhooks = new Webhooks(this);
      this.beta = new Beta(this);
      this.batches = new Batches(this);
      this.uploads = new Uploads(this);
      this.admin = new Admin(this);
      this.responses = new Responses2(this);
      this.realtime = new Realtime2(this);
      this.conversations = new Conversations(this);
      this.evals = new Evals(this);
      this.containers = new Containers(this);
      this.skills = new Skills(this);
      this.videos = new Videos(this);
      const provider = clientOptions.provider;
      if (provider) {
        const conflictingOptions = ["apiKey", "adminAPIKey", "workloadIdentity", "baseURL"].filter((key) => clientOptions[key] != null);
        if (conflictingOptions.length) {
          throw new OpenAIError(`The \`provider\` option cannot be used with ${conflictingOptions.map((key) => `\`${key}\``).join(", ")}. Configure authentication and the base URL through the provider instead.`);
        }
      }
      const { baseURL = provider ? null : readEnv("OPENAI_BASE_URL"), apiKey = provider ? null : readEnv("OPENAI_API_KEY") ?? null, adminAPIKey = provider ? null : readEnv("OPENAI_ADMIN_KEY") ?? null, organization = provider ? null : readEnv("OPENAI_ORG_ID") ?? null, project = provider ? null : readEnv("OPENAI_PROJECT_ID") ?? null, webhookSecret = readEnv("OPENAI_WEBHOOK_SECRET") ?? null, workloadIdentity, ...opts } = clientOptions;
      const providerRuntime = provider ? configureProvider(provider) : void 0;
      const options = {
        apiKey,
        adminAPIKey,
        organization,
        project,
        webhookSecret,
        workloadIdentity,
        provider,
        ...opts,
        baseURL: providerRuntime?.baseURL ?? (baseURL || `https://api.openai.com/v1`)
      };
      if (apiKey && workloadIdentity) {
        throw new OpenAIError("The `apiKey` and `workloadIdentity` options are mutually exclusive");
      }
      if (!providerRuntime && !apiKey && !adminAPIKey && !workloadIdentity) {
        throw new OpenAIError("Missing credentials. Please pass an `apiKey`, `workloadIdentity`, `adminAPIKey`, or set the `OPENAI_API_KEY` or `OPENAI_ADMIN_KEY` environment variable.");
      }
      if (!options.dangerouslyAllowBrowser && isRunningInBrowser()) {
        throw new OpenAIError("It looks like you're running in a browser-like environment.\n\nThis is disabled by default, as it risks exposing your secret API credentials to attackers.\nIf you understand the risks and have appropriate mitigations in place,\nyou can set the `dangerouslyAllowBrowser` option to `true`, e.g.,\n\nnew OpenAI({ apiKey, dangerouslyAllowBrowser: true });\n\nhttps://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety\n");
      }
      this.baseURL = options.baseURL;
      this.timeout = options.timeout ?? _a2.DEFAULT_TIMEOUT;
      this.logger = options.logger ?? console;
      const defaultLogLevel = "warn";
      this.logLevel = defaultLogLevel;
      this.logLevel = parseLogLevel(options.logLevel, "ClientOptions.logLevel", this) ?? parseLogLevel(readEnv("OPENAI_LOG"), "process.env['OPENAI_LOG']", this) ?? defaultLogLevel;
      this.fetchOptions = options.fetchOptions;
      this.maxRetries = options.maxRetries ?? 2;
      this.fetch = options.fetch ?? getDefaultFetch();
      __classPrivateFieldSet(this, _OpenAI_encoder, FallbackEncoder, "f");
      const customHeadersEnv = provider ? void 0 : readEnv("OPENAI_CUSTOM_HEADERS");
      if (customHeadersEnv) {
        const parsed = {};
        for (const line of customHeadersEnv.split("\n")) {
          const colon = line.indexOf(":");
          if (colon >= 0) {
            parsed[line.substring(0, colon).trim()] = line.substring(colon + 1).trim();
          }
        }
        options.defaultHeaders = buildHeaders([parsed, options.defaultHeaders]);
      }
      this._options = options;
      this._provider = providerRuntime;
      if (workloadIdentity) {
        this._workloadIdentityAuth = new WorkloadIdentityAuth(workloadIdentity, this.fetch);
      }
      this.apiKey = typeof apiKey === "string" ? apiKey : null;
      this.adminAPIKey = adminAPIKey;
      this.organization = organization;
      this.project = project;
      this.webhookSecret = webhookSecret;
    }
    /**
     * Create a new client instance re-using the same options given to the current client with optional overriding.
     */
    withOptions(options) {
      const inheritedProvider = this._options.provider;
      const provider = options.provider ?? inheritedProvider;
      const inheritedOptions = {
        ...this._options,
        baseURL: this.baseURL,
        maxRetries: this.maxRetries,
        timeout: this.timeout,
        logger: this.logger,
        logLevel: this.logLevel,
        fetch: this.fetch,
        fetchOptions: this.fetchOptions,
        apiKey: this._options.apiKey,
        adminAPIKey: this.adminAPIKey,
        workloadIdentity: this._options.workloadIdentity,
        organization: this.organization,
        project: this.project,
        webhookSecret: this.webhookSecret
      };
      if (provider) {
        delete inheritedOptions.apiKey;
        delete inheritedOptions.adminAPIKey;
        delete inheritedOptions.workloadIdentity;
        delete inheritedOptions.baseURL;
        if (provider !== inheritedProvider) {
          delete inheritedOptions.organization;
          delete inheritedOptions.project;
          delete inheritedOptions.defaultHeaders;
        }
      }
      const client = new this.constructor({
        ...inheritedOptions,
        ...options,
        provider
      });
      return client;
    }
    defaultQuery() {
      return this._options.defaultQuery;
    }
    validateHeaders({ values, nulls }, schemes = {
      bearerAuth: true,
      adminAPIKeyAuth: true
    }) {
      if (values.get("authorization") || values.get("api-key")) {
        return;
      }
      if (nulls.has("authorization") || nulls.has("api-key")) {
        return;
      }
      if (this._workloadIdentityAuth && schemes.bearerAuth) {
        return;
      }
      throw new Error('Could not resolve authentication method. Expected either apiKey or adminAPIKey to be set. Or for one of the "Authorization" or "api-key" headers to be explicitly omitted');
    }
    async authHeaders(opts, schemes = {
      bearerAuth: true,
      adminAPIKeyAuth: true
    }) {
      return buildHeaders([
        schemes.bearerAuth ? await this.bearerAuth(opts) : null,
        schemes.adminAPIKeyAuth ? await this.adminAPIKeyAuth(opts) : null
      ]);
    }
    async bearerAuth(opts) {
      if (this._workloadIdentityAuth) {
        return buildHeaders([{ Authorization: `Bearer ${await this._workloadIdentityAuth.getToken()}` }]);
      }
      if (this.apiKey == null) {
        return void 0;
      }
      return buildHeaders([{ Authorization: `Bearer ${this.apiKey}` }]);
    }
    async adminAPIKeyAuth(opts) {
      if (this.adminAPIKey == null) {
        return void 0;
      }
      return buildHeaders([{ Authorization: `Bearer ${this.adminAPIKey}` }]);
    }
    stringifyQuery(query) {
      return stringifyQuery(query);
    }
    getUserAgent() {
      return `${this.constructor.name}/JS ${VERSION}`;
    }
    defaultIdempotencyKey() {
      return `stainless-node-retry-${uuid4()}`;
    }
    makeStatusError(status, error, message, headers) {
      return APIError.generate(status, error, message, headers);
    }
    async _callApiKey() {
      if (this._provider)
        return false;
      const apiKey = this._options.apiKey;
      if (typeof apiKey !== "function")
        return false;
      let token;
      try {
        token = await apiKey();
      } catch (err) {
        if (err instanceof OpenAIError)
          throw err;
        throw new OpenAIError(
          `Failed to get token from 'apiKey' function: ${err.message}`,
          // @ts-ignore
          { cause: err }
        );
      }
      if (typeof token !== "string" || !token) {
        throw new OpenAIError(`Expected 'apiKey' function argument to return a string but it returned ${token}`);
      }
      this.apiKey = token;
      return true;
    }
    buildURL(path2, query, defaultBaseURL) {
      const baseURL = !__classPrivateFieldGet(this, _OpenAI_instances, "m", _OpenAI_baseURLOverridden).call(this) && defaultBaseURL || this.baseURL;
      const url = isAbsoluteURL(path2) ? new URL(path2) : new URL(baseURL + (baseURL.endsWith("/") && path2.startsWith("/") ? path2.slice(1) : path2));
      const defaultQuery = this.defaultQuery();
      const pathQuery = Object.fromEntries(url.searchParams);
      if (!isEmptyObj(defaultQuery) || !isEmptyObj(pathQuery)) {
        query = { ...pathQuery, ...defaultQuery, ...query };
      }
      if (typeof query === "object" && query && !Array.isArray(query)) {
        url.search = this.stringifyQuery(query);
      }
      return url.toString();
    }
    /**
     * Used as a callback for mutating the given `FinalRequestOptions` object.
     */
    async prepareOptions(options) {
      if (this._provider)
        return;
      const security = options.__security ?? { bearerAuth: true };
      if (security.bearerAuth) {
        await this._callApiKey();
      }
    }
    /**
     * Used as a callback for mutating the given `RequestInit` object.
     *
     * This is useful for cases where you want to add certain headers based off of
     * the request properties, e.g. `method` or `url`.
     */
    async prepareRequest(request, { url, options }) {
    }
    get(path2, opts) {
      return this.methodRequest("get", path2, opts);
    }
    post(path2, opts) {
      return this.methodRequest("post", path2, opts);
    }
    patch(path2, opts) {
      return this.methodRequest("patch", path2, opts);
    }
    put(path2, opts) {
      return this.methodRequest("put", path2, opts);
    }
    delete(path2, opts) {
      return this.methodRequest("delete", path2, opts);
    }
    methodRequest(method, path2, opts) {
      return this.request(Promise.resolve(opts).then((opts2) => {
        return { method, path: path2, ...opts2 };
      }));
    }
    request(options, remainingRetries = null) {
      return new APIPromise(this, this.makeRequest(options, remainingRetries, void 0));
    }
    async makeRequest(optionsInput, retriesRemaining, retryOfRequestLogID) {
      const options = await optionsInput;
      const maxRetries = options.maxRetries ?? this.maxRetries;
      if (retriesRemaining == null) {
        retriesRemaining = maxRetries;
      }
      await this.prepareOptions(options);
      const { req, url, timeout } = await this.buildRequest(options, {
        retryCount: maxRetries - retriesRemaining
      });
      const hasStreamingBody = options.__metadata?.["hasStreamingBody"] === true;
      await this.prepareRequest(req, { url, options });
      await this._provider?.prepareRequest?.(req, { url, options });
      const requestLogID = "log_" + (Math.random() * (1 << 24) | 0).toString(16).padStart(6, "0");
      const retryLogStr = retryOfRequestLogID === void 0 ? "" : `, retryOf: ${retryOfRequestLogID}`;
      const startTime = Date.now();
      loggerFor(this).debug(`[${requestLogID}] sending request`, formatRequestDetails({
        retryOfRequestLogID,
        method: options.method,
        url,
        options,
        headers: req.headers
      }));
      if (options.signal?.aborted) {
        throw new APIUserAbortError();
      }
      const security = options.__security ?? { bearerAuth: true };
      const controller = new AbortController();
      const response = await this.fetchWithAuth(url, req, timeout, controller, security).catch(castToError);
      const headersTime = Date.now();
      if (response instanceof globalThis.Error) {
        const retryMessage = `retrying, ${retriesRemaining} attempts remaining`;
        if (options.signal?.aborted) {
          throw new APIUserAbortError();
        }
        const isTimeout = isAbortError(response) || /timed? ?out/i.test(String(response) + ("cause" in response ? String(response.cause) : ""));
        if (retriesRemaining && !hasStreamingBody) {
          loggerFor(this).info(`[${requestLogID}] connection ${isTimeout ? "timed out" : "failed"} - ${retryMessage}`);
          loggerFor(this).debug(`[${requestLogID}] connection ${isTimeout ? "timed out" : "failed"} (${retryMessage})`, formatRequestDetails({
            retryOfRequestLogID,
            url,
            durationMs: headersTime - startTime,
            message: response.message
          }));
          return this.retryRequest(options, retriesRemaining, retryOfRequestLogID ?? requestLogID);
        }
        const terminalMessage = hasStreamingBody ? "error; streaming body cannot be retried" : "error; no more retries left";
        loggerFor(this).info(`[${requestLogID}] connection ${isTimeout ? "timed out" : "failed"} - ${terminalMessage}`);
        loggerFor(this).debug(`[${requestLogID}] connection ${isTimeout ? "timed out" : "failed"} (${terminalMessage})`, formatRequestDetails({
          retryOfRequestLogID,
          url,
          durationMs: headersTime - startTime,
          message: response.message
        }));
        if (response instanceof OAuthError || response instanceof SubjectTokenProviderError) {
          throw response;
        }
        if (isTimeout) {
          throw new APIConnectionTimeoutError();
        }
        throw new APIConnectionError({
          message: getConnectionErrorMessage(response),
          cause: response
        });
      }
      const specialHeaders = [...response.headers.entries()].filter(([name]) => name === "x-request-id").map(([name, value]) => ", " + name + ": " + JSON.stringify(value)).join("");
      const responseInfo = `[${requestLogID}${retryLogStr}${specialHeaders}] ${req.method} ${url} ${response.ok ? "succeeded" : "failed"} with status ${response.status} in ${headersTime - startTime}ms`;
      if (!response.ok) {
        if (response.status === 401 && this._workloadIdentityAuth && security.bearerAuth && !options.__metadata?.["hasStreamingBody"] && !options.__metadata?.["workloadIdentityTokenRefreshed"]) {
          await CancelReadableStream(response.body);
          this._workloadIdentityAuth.invalidateToken();
          return this.makeRequest({
            ...options,
            __metadata: {
              ...options.__metadata,
              workloadIdentityTokenRefreshed: true
            }
          }, retriesRemaining, retryOfRequestLogID ?? requestLogID);
        }
        const shouldRetry = await this.shouldRetry(response);
        if (retriesRemaining && shouldRetry && !hasStreamingBody) {
          const retryMessage2 = `retrying, ${retriesRemaining} attempts remaining`;
          await CancelReadableStream(response.body);
          loggerFor(this).info(`${responseInfo} - ${retryMessage2}`);
          loggerFor(this).debug(`[${requestLogID}] response error (${retryMessage2})`, formatRequestDetails({
            retryOfRequestLogID,
            url: response.url,
            status: response.status,
            headers: response.headers,
            durationMs: headersTime - startTime
          }));
          return this.retryRequest(options, retriesRemaining, retryOfRequestLogID ?? requestLogID, response.headers);
        }
        const retryMessage = shouldRetry ? hasStreamingBody ? `error; streaming body cannot be retried` : `error; no more retries left` : `error; not retryable`;
        loggerFor(this).info(`${responseInfo} - ${retryMessage}`);
        const errText = await response.text().catch((err2) => castToError(err2).message);
        const errJSON = safeJSON(errText);
        const errMessage = errJSON ? void 0 : errText;
        loggerFor(this).debug(`[${requestLogID}] response error (${retryMessage})`, formatRequestDetails({
          retryOfRequestLogID,
          url: response.url,
          status: response.status,
          headers: response.headers,
          message: errMessage,
          durationMs: Date.now() - startTime
        }));
        const err = this.makeStatusError(response.status, errJSON, errMessage, response.headers);
        throw err;
      }
      loggerFor(this).info(responseInfo);
      loggerFor(this).debug(`[${requestLogID}] response start`, formatRequestDetails({
        retryOfRequestLogID,
        url: response.url,
        status: response.status,
        headers: response.headers,
        durationMs: headersTime - startTime
      }));
      return { response, options, controller, requestLogID, retryOfRequestLogID, startTime };
    }
    getAPIList(path2, Page2, opts) {
      return this.requestAPIList(Page2, opts && "then" in opts ? opts.then((opts2) => ({ method: "get", path: path2, ...opts2 })) : { method: "get", path: path2, ...opts });
    }
    requestAPIList(Page2, options) {
      const request = this.makeRequest(options, null, void 0);
      return new PagePromise(this, request, Page2);
    }
    async fetchWithAuth(url, init, timeout, controller, schemes = {
      bearerAuth: true,
      adminAPIKeyAuth: true
    }) {
      if (this._workloadIdentityAuth && schemes.bearerAuth) {
        const headers = init.headers;
        const authHeader = headers.get("Authorization");
        if (!authHeader || authHeader === `Bearer ${WORKLOAD_IDENTITY_API_KEY_PLACEHOLDER}`) {
          const token = await this._workloadIdentityAuth.getToken();
          headers.set("Authorization", `Bearer ${token}`);
        }
      }
      const response = await this.fetchWithTimeout(url, init, timeout, controller);
      return response;
    }
    async fetchWithTimeout(url, init, ms, controller) {
      const { signal, method, ...options } = init || {};
      const abort = this._makeAbort(controller);
      if (signal)
        signal.addEventListener("abort", abort, { once: true });
      const timeout = setTimeout(abort, ms);
      const isReadableBody = globalThis.ReadableStream && options.body instanceof globalThis.ReadableStream || typeof options.body === "object" && options.body !== null && Symbol.asyncIterator in options.body;
      const fetchOptions = {
        signal: controller.signal,
        ...isReadableBody ? { duplex: "half" } : {},
        method: "GET",
        ...options
      };
      if (method) {
        fetchOptions.method = method.toUpperCase();
      }
      try {
        return await this.fetch.call(void 0, url, fetchOptions);
      } finally {
        clearTimeout(timeout);
      }
    }
    async shouldRetry(response) {
      const shouldRetryHeader = response.headers.get("x-should-retry");
      if (shouldRetryHeader === "true")
        return true;
      if (shouldRetryHeader === "false")
        return false;
      if (response.status === 408)
        return true;
      if (response.status === 409)
        return true;
      if (response.status === 429)
        return true;
      if (response.status >= 500)
        return true;
      return false;
    }
    async retryRequest(options, retriesRemaining, requestLogID, responseHeaders) {
      let timeoutMillis;
      const retryAfterMillisHeader = responseHeaders?.get("retry-after-ms");
      if (retryAfterMillisHeader) {
        const timeoutMs = parseFloat(retryAfterMillisHeader);
        if (!Number.isNaN(timeoutMs)) {
          timeoutMillis = timeoutMs;
        }
      }
      const retryAfterHeader = responseHeaders?.get("retry-after");
      if (retryAfterHeader && !timeoutMillis) {
        const timeoutSeconds = parseFloat(retryAfterHeader);
        if (!Number.isNaN(timeoutSeconds)) {
          timeoutMillis = timeoutSeconds * 1e3;
        } else {
          timeoutMillis = Date.parse(retryAfterHeader) - Date.now();
        }
      }
      if (timeoutMillis === void 0) {
        const maxRetries = options.maxRetries ?? this.maxRetries;
        timeoutMillis = this.calculateDefaultRetryTimeoutMillis(retriesRemaining, maxRetries);
      }
      await sleep(timeoutMillis);
      return this.makeRequest(options, retriesRemaining - 1, requestLogID);
    }
    calculateDefaultRetryTimeoutMillis(retriesRemaining, maxRetries) {
      const initialRetryDelay = 0.5;
      const maxRetryDelay = 8;
      const numRetries = maxRetries - retriesRemaining;
      const sleepSeconds = Math.min(initialRetryDelay * Math.pow(2, numRetries), maxRetryDelay);
      const jitter = 1 - Math.random() * 0.25;
      return sleepSeconds * jitter * 1e3;
    }
    async buildRequest(inputOptions, { retryCount = 0 } = {}) {
      const options = { ...inputOptions };
      const { method, path: path2, query, defaultBaseURL } = options;
      const url = this.buildURL(path2, query, defaultBaseURL);
      if ("timeout" in options)
        validatePositiveInteger("timeout", options.timeout);
      options.timeout = options.timeout ?? this.timeout;
      const { bodyHeaders, body, isStreamingBody } = this.buildBody({ options });
      if (isStreamingBody) {
        inputOptions.__metadata = {
          ...inputOptions.__metadata,
          hasStreamingBody: true
        };
      }
      const reqHeaders = await this.buildHeaders({ options: inputOptions, method, bodyHeaders, retryCount });
      const req = {
        method,
        headers: reqHeaders,
        ...options.signal && { signal: options.signal },
        ...globalThis.ReadableStream && body instanceof globalThis.ReadableStream && { duplex: "half" },
        ...body && { body },
        ...this.fetchOptions ?? {},
        ...options.fetchOptions ?? {}
      };
      return { req, url, timeout: options.timeout };
    }
    async buildHeaders({ options, method, bodyHeaders, retryCount }) {
      let idempotencyHeaders = {};
      if (this.idempotencyHeader && method !== "get") {
        if (!options.idempotencyKey)
          options.idempotencyKey = this.defaultIdempotencyKey();
        idempotencyHeaders[this.idempotencyHeader] = options.idempotencyKey;
      }
      const headers = buildHeaders([
        idempotencyHeaders,
        {
          Accept: "application/json",
          "User-Agent": this.getUserAgent(),
          "X-Stainless-Retry-Count": String(retryCount),
          ...options.timeout ? { "X-Stainless-Timeout": String(Math.trunc(options.timeout / 1e3)) } : {},
          ...getPlatformHeaders(),
          "OpenAI-Organization": this.organization,
          "OpenAI-Project": this.project
        },
        this._provider ? void 0 : await this.authHeaders(options, options.__security ?? { bearerAuth: true }),
        this._options.defaultHeaders,
        bodyHeaders,
        options.headers
      ]);
      if (!this._provider) {
        this.validateHeaders(headers, options.__security ?? { bearerAuth: true });
      }
      return headers.values;
    }
    _makeAbort(controller) {
      return () => controller.abort();
    }
    buildBody({ options }) {
      const { body, headers: rawHeaders } = options;
      if (!body) {
        if (body === void 0 && "body" in options) {
          return { ...__classPrivateFieldGet(this, _OpenAI_encoder, "f").call(this, { body, headers: buildHeaders([rawHeaders]) }), isStreamingBody: false };
        }
        return { bodyHeaders: void 0, body: void 0, isStreamingBody: false };
      }
      const headers = buildHeaders([rawHeaders]);
      const isReadableStream2 = typeof globalThis.ReadableStream !== "undefined" && body instanceof globalThis.ReadableStream;
      const isRetryableBody = !isReadableStream2 && (typeof body === "string" || body instanceof ArrayBuffer || ArrayBuffer.isView(body) || typeof globalThis.Blob !== "undefined" && body instanceof globalThis.Blob || body instanceof URLSearchParams || body instanceof FormData);
      if (
        // Pass raw type verbatim
        ArrayBuffer.isView(body) || body instanceof ArrayBuffer || body instanceof DataView || typeof body === "string" && // Preserve legacy string encoding behavior for now
        headers.values.has("content-type") || // `Blob` is superset of `File`
        globalThis.Blob && body instanceof globalThis.Blob || // `FormData` -> `multipart/form-data`
        body instanceof FormData || // `URLSearchParams` -> `application/x-www-form-urlencoded`
        body instanceof URLSearchParams || // Send chunked stream (each chunk has own `length`)
        isReadableStream2
      ) {
        return { bodyHeaders: void 0, body, isStreamingBody: !isRetryableBody };
      } else if (typeof body === "object" && (Symbol.asyncIterator in body || Symbol.iterator in body && "next" in body && typeof body.next === "function")) {
        return {
          bodyHeaders: void 0,
          body: ReadableStreamFrom(body),
          isStreamingBody: true
        };
      } else if (typeof body === "object" && headers.values.get("content-type") === "application/x-www-form-urlencoded") {
        return {
          bodyHeaders: { "content-type": "application/x-www-form-urlencoded" },
          body: this.stringifyQuery(body),
          isStreamingBody: false
        };
      } else {
        return { ...__classPrivateFieldGet(this, _OpenAI_encoder, "f").call(this, { body, headers }), isStreamingBody: false };
      }
    }
  };
  _a2 = OpenAI, _OpenAI_encoder = /* @__PURE__ */ new WeakMap(), _OpenAI_instances = /* @__PURE__ */ new WeakSet(), _OpenAI_baseURLOverridden = function _OpenAI_baseURLOverridden2() {
    return this._provider !== void 0 || this.baseURL !== "https://api.openai.com/v1";
  };
  OpenAI.OpenAI = _a2;
  OpenAI.DEFAULT_TIMEOUT = 6e5;
  OpenAI.OpenAIError = OpenAIError;
  OpenAI.APIError = APIError;
  OpenAI.APIConnectionError = APIConnectionError;
  OpenAI.APIConnectionTimeoutError = APIConnectionTimeoutError;
  OpenAI.APIUserAbortError = APIUserAbortError;
  OpenAI.NotFoundError = NotFoundError;
  OpenAI.ConflictError = ConflictError;
  OpenAI.RateLimitError = RateLimitError;
  OpenAI.BadRequestError = BadRequestError;
  OpenAI.AuthenticationError = AuthenticationError;
  OpenAI.InternalServerError = InternalServerError;
  OpenAI.PermissionDeniedError = PermissionDeniedError;
  OpenAI.UnprocessableEntityError = UnprocessableEntityError;
  OpenAI.InvalidWebhookSignatureError = InvalidWebhookSignatureError;
  OpenAI.toFile = toFile;
  OpenAI.toStreamingFile = toStreamingFile;
  OpenAI.Completions = Completions2;
  OpenAI.Chat = Chat;
  OpenAI.Embeddings = Embeddings;
  OpenAI.Files = Files2;
  OpenAI.Images = Images;
  OpenAI.Audio = Audio;
  OpenAI.Moderations = Moderations;
  OpenAI.Models = Models;
  OpenAI.FineTuning = FineTuning;
  OpenAI.Graders = Graders2;
  OpenAI.VectorStores = VectorStores;
  OpenAI.Webhooks = Webhooks;
  OpenAI.Beta = Beta;
  OpenAI.Batches = Batches;
  OpenAI.Uploads = Uploads;
  OpenAI.Admin = Admin;
  OpenAI.Responses = Responses2;
  OpenAI.Realtime = Realtime2;
  OpenAI.Conversations = Conversations;
  OpenAI.Evals = Evals;
  OpenAI.Containers = Containers;
  OpenAI.Skills = Skills;
  OpenAI.Videos = Videos;
  function getConnectionErrorMessage(error) {
    if (isUndiciDispatcherVersionMismatchError(error)) {
      return `Connection error. This may be caused by passing an undici dispatcher, such as ProxyAgent, that is incompatible with the fetch implementation. If you are using undici's ProxyAgent, pass the fetch implementation from the same undici package: import { fetch, ProxyAgent } from 'undici'; new OpenAI({ fetch, fetchOptions: { dispatcher: new ProxyAgent(...) } });`;
    }
    return void 0;
  }
  function isUndiciDispatcherVersionMismatchError(error) {
    let current = error;
    for (let i = 0; i < 8 && current && typeof current === "object"; i++) {
      const err = current;
      if (err.code === "UND_ERR_INVALID_ARG" && typeof err.message === "string" && err.message.includes("invalid onRequestStart method")) {
        return true;
      }
      current = err.cause;
    }
    return false;
  }

  // src/background/settings.js
  async function getSettings() {
    try {
      const syncSettings = await chrome.storage.sync.get(SETTING_KEYS);
      if (Object.keys(syncSettings).length > 0) {
        try {
          await chrome.storage.local.set(syncSettings);
        } catch (error) {
          console.error("\u4FDD\u5B58\u8BBE\u7F6E\u5230\u672C\u5730\u5B58\u50A8\u5931\u8D25:", error);
        }
        return { ...defaultSettings, ...syncSettings };
      }
      const localSettings = await chrome.storage.local.get(SETTING_KEYS);
      if (Object.keys(localSettings).length > 0) {
        return { ...defaultSettings, ...localSettings };
      }
      return { ...defaultSettings };
    } catch (error) {
      console.error("\u83B7\u53D6\u4E91\u7AEF\u8BBE\u7F6E\u5931\u8D25\uFF0C\u5C1D\u8BD5\u4ECE\u672C\u5730\u83B7\u53D6:", error);
      try {
        const localSettings = await chrome.storage.local.get(SETTING_KEYS);
        if (Object.keys(localSettings).length > 0) {
          return { ...defaultSettings, ...localSettings };
        }
      } catch (localError) {
        console.error("\u83B7\u53D6\u672C\u5730\u8BBE\u7F6E\u4E5F\u5931\u8D25:", localError);
      }
      return { ...defaultSettings };
    }
  }

  // src/background/translate.js
  var activeRequests = /* @__PURE__ */ new Map();
  var requestBuffers = /* @__PURE__ */ new Map();
  var keyAliases = /* @__PURE__ */ new Map();
  function resolveKey(key) {
    let cur = key;
    const seen = /* @__PURE__ */ new Set();
    while (keyAliases.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      cur = keyAliases.get(cur);
    }
    return cur;
  }
  function hasActiveRequest(tabId) {
    return activeRequests.has(resolveKey(tabId));
  }
  async function cleanupRequest(tabId) {
    const key = resolveKey(tabId);
    if (activeRequests.has(key)) {
      const controller = activeRequests.get(key);
      controller.abort();
      activeRequests.delete(key);
      requestBuffers.delete(key);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    for (const [from, to] of [...keyAliases.entries()]) {
      if (from === key || to === key) keyAliases.delete(from);
    }
  }
  function rebindRequest(fromKey, toKey) {
    if (fromKey === toKey) return activeRequests.has(resolveKey(fromKey));
    const realFrom = resolveKey(fromKey);
    if (!activeRequests.has(realFrom)) return false;
    if (activeRequests.has(toKey) && toKey !== realFrom) {
      try {
        activeRequests.get(toKey).abort();
      } catch (_) {
      }
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
  function getRequestBuffer(key) {
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
      if (!error.message?.includes("Receiving end does not exist")) {
        console.error("\u6D88\u606F\u53D1\u9001\u5931\u8D25:", error);
      }
      return false;
    }
  }
  function isTabKey(requestKey) {
    return typeof requestKey === "number";
  }
  async function sendUpdate(requestKey, payload) {
    const key = resolveKey(requestKey);
    if (isTabKey(key)) {
      return safeSendMessage(key, { action: "updateTranslation", ...payload });
    }
    const target = typeof key === "string" ? key : void 0;
    return await new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: "updateTranslation",
        target,
        ...payload
      }, () => {
        resolve(!chrome.runtime.lastError);
      });
    });
  }
  async function pushBufferToTarget(key) {
    const real = resolveKey(key);
    const buf = requestBuffers.get(real);
    if (!buf) return false;
    const streaming = activeRequests.has(real);
    return sendUpdate(real, {
      content: buf.content || "",
      hasReasoning: !!(buf.reasoning && buf.reasoning.length),
      reasoningContent: buf.reasoning || "",
      done: !streaming,
      streaming,
      original: buf.original
    });
  }
  function extractDelta(chunk) {
    const choice = chunk?.choices?.[0];
    const delta = choice?.delta || {};
    let content = "";
    let reasoning = "";
    if (delta.content != null) content += delta.content;
    if (delta.reasoning_content != null) reasoning += delta.reasoning_content;
    if (delta.reasoning != null) {
      reasoning += typeof delta.reasoning === "string" ? delta.reasoning : "";
    }
    const message = choice?.message;
    if (!content && message?.content) content += message.content;
    if (!reasoning && message?.reasoning_content) reasoning += message.reasoning_content;
    return { content, reasoning };
  }
  function buildUserError(error) {
    if (!error) return "\u7FFB\u8BD1\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5";
    if (error.name === "AbortError" || error.message?.includes("aborted")) {
      return null;
    }
    const status = error.status || error.statusCode;
    const msg = error.message || String(error);
    if (msg.includes("API Key") || status === 401) {
      return "\u8BF7\u5148\u5728\u8BBE\u7F6E\u4E2D\u914D\u7F6E\u6B63\u786E\u7684 API Key";
    }
    if (status === 429 || /rate limit/i.test(msg)) {
      return "\u8BF7\u6C42\u8FC7\u4E8E\u9891\u7E41\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5";
    }
    if (status) {
      return `API \u8BF7\u6C42\u5931\u8D25: ${status}${msg ? ` (${msg})` : ""}`;
    }
    if (/API Key|API 请求失败|rate limit|Failed to fetch|NetworkError|timeout/i.test(msg)) {
      return msg;
    }
    return msg || "\u7FFB\u8BD1\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5";
  }
  async function translateText(text, requestKey) {
    let key = requestKey === null || requestKey === void 0 ? "sidepanel" : requestKey;
    await cleanupRequest(key);
    const controller = new AbortController();
    activeRequests.set(key, controller);
    const config = await getSettings();
    if (!config.apiKey) {
      activeRequests.delete(key);
      throw new Error("\u8BF7\u5148\u5728\u8BBE\u7F6E\u4E2D\u914D\u7F6E API Key");
    }
    const input = (text || "").trim();
    if (!input) {
      activeRequests.delete(key);
      throw new Error("\u6CA1\u6709\u53EF\u7FFB\u8BD1\u7684\u6587\u672C");
    }
    const wasTruncated = input.length > MAX_INPUT_CHARS;
    const truncated = wasTruncated ? input.slice(0, MAX_INPUT_CHARS) : input;
    const promptTemplate = config.promptTemplate || defaultSettings.promptTemplate;
    const prompt = promptTemplate.replace("{text}", truncated);
    const effort = config.reasoningEffort || defaultSettings.reasoningEffort;
    const baseURL = normalizeBaseUrl(config.baseUrl || defaultSettings.baseUrl);
    requestBuffers.set(key, {
      original: truncated,
      content: "",
      reasoning: "",
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
      messages: [{ role: "user", content: prompt }],
      temperature: config.temperature ?? defaultSettings.temperature,
      stream: true
    };
    if (effort) {
      body.reasoning_effort = effort;
    }
    let result = "";
    let reasoningContent = "";
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
        if (effort !== "none") {
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
          hasReasoning: effort !== "none" && reasoningContent.length > 0,
          reasoningContent,
          done: false,
          streaming: true
        });
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
        return;
      }
      await sendUpdate(finalKey, {
        content: result,
        hasReasoning: effort !== "none" && reasoningContent.length > 0,
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
            effort === "none" ? "" : reasoningContent
          );
        } catch (error) {
          console.error("\u4FDD\u5B58\u7FFB\u8BD1\u5386\u53F2\u5931\u8D25:", error);
        }
      }
      activeRequests.delete(finalKey);
      requestBuffers.delete(finalKey);
      return result;
    } catch (error) {
      const finalKey = currentKey();
      activeRequests.delete(finalKey);
      if (error?.name === "AbortError" || controller.signal.aborted) {
        await sendUpdate(finalKey, {
          content: result,
          hasReasoning: effort !== "none" && reasoningContent.length > 0,
          reasoningContent,
          done: true,
          stopped: true,
          streaming: false
        });
        return result || void 0;
      }
      requestBuffers.delete(finalKey);
      const userError = buildUserError(error);
      if (userError) {
        throw new Error(userError);
      }
    }
  }

  // src/background/index.js
  var sidePanelOpen = false;
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== "sidepanel") return;
    sidePanelOpen = true;
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, async (tabs) => {
      const tab = tabs?.[0];
      try {
        if (tab?.id) {
          await handoffFromTab(tab.id);
        }
      } catch (err) {
        console.error("handoff \u5931\u8D25:", err);
      }
      broadcastSidePanelState(true);
    });
    port.onDisconnect.addListener(() => {
      sidePanelOpen = false;
      broadcastSidePanelState(false);
    });
  });
  async function broadcastSidePanelState(open) {
    try {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (!tab.id || !tab.url?.startsWith("http")) continue;
        chrome.tabs.sendMessage(tab.id, {
          action: "sidePanelState",
          open
        }, () => void chrome.runtime.lastError);
      }
    } catch (_) {
    }
  }
  function isSidePanelOpen() {
    return sidePanelOpen;
  }
  async function saveCurrentShortcut() {
    try {
      const commands = await chrome.commands.getAll();
      const translateCommand = commands.find((command) => command.name === "translate-selection");
      const shortcut = translateCommand?.shortcut || "";
      await chrome.storage.local.set({ saved_shortcut: shortcut });
    } catch (error) {
      console.error("\u4FDD\u5B58\u5FEB\u6377\u952E\u4FE1\u606F\u5931\u8D25:", error);
    }
  }
  function createContextMenu() {
    try {
      chrome.contextMenus.removeAll(() => {
        chrome.storage.local.get("saved_shortcut", (data) => {
          const shortcut = data.saved_shortcut ? ` (${data.saved_shortcut})` : "";
          chrome.contextMenus.create({
            id: "translateSelection",
            title: `\u7FFB\u8BD1\u6210\u4EBA\u8BDD${shortcut}`,
            contexts: ["selection"]
          }, () => {
            if (chrome.runtime.lastError) {
              console.error("\u521B\u5EFA\u83DC\u5355\u51FA\u9519:", chrome.runtime.lastError);
            }
          });
        });
      });
    } catch (error) {
      console.error("\u521B\u5EFA\u53F3\u952E\u83DC\u5355\u65F6\u51FA\u9519:", error);
      chrome.contextMenus.create({
        id: "translateSelection",
        title: "\u7FFB\u8BD1\u6210\u4EBA\u8BDD",
        contexts: ["selection"]
      });
    }
  }
  async function enableSidePanelOnActionClick() {
    try {
      if (chrome.sidePanel?.setPanelBehavior) {
        await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
      }
    } catch (error) {
      console.error("\u8BBE\u7F6E\u4FA7\u8FB9\u680F\u884C\u4E3A\u5931\u8D25:", error);
    }
  }
  enableSidePanelOnActionClick();
  if (chrome.action?.onClicked) {
    chrome.action.onClicked.addListener(async () => {
      if (chrome.sidePanel?.open) {
        return;
      }
      try {
        await chrome.runtime.openOptionsPage();
      } catch (error) {
        console.error("\u6253\u5F00\u8BBE\u7F6E\u5931\u8D25:", error);
      }
    });
  }
  chrome.runtime.onInstalled.addListener(() => {
    saveCurrentShortcut();
    createContextMenu();
    enableSidePanelOnActionClick();
  });
  chrome.runtime.onStartup.addListener(() => {
    createContextMenu();
    enableSidePanelOnActionClick();
  });
  if (chrome.commands?.onChanged) {
    chrome.commands.onChanged.addListener((command) => {
      if (command === "translate-selection") {
        saveCurrentShortcut();
        createContextMenu();
      }
    });
  }
  if (chrome.management?.onEnabled) {
    chrome.management.onEnabled.addListener((extensionInfo) => {
      if (extensionInfo.id === chrome.runtime.id) {
        setTimeout(() => {
          saveCurrentShortcut();
          createContextMenu();
          enableSidePanelOnActionClick();
        }, 500);
      }
    });
  }
  async function ensureContentScript(tabId) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => !!window.__humanizeTextContentLoaded
      });
      if (results?.[0]?.result) return true;
    } catch (_) {
    }
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content/content.js"]
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    return true;
  }
  async function storeHandoff(payload) {
    try {
      if (chrome.storage.session) {
        await chrome.storage.session.set({ sidepanelHandoff: payload });
      } else {
        await chrome.storage.local.set({ sidepanelHandoff: payload });
      }
    } catch (_) {
      await chrome.storage.local.set({ sidepanelHandoff: payload });
    }
    try {
      chrome.runtime.sendMessage({
        action: "applyHandoff",
        target: "sidepanel",
        snapshot: payload
      }, () => void chrome.runtime.lastError);
    } catch (_) {
    }
  }
  async function handoffFromTab(tabId) {
    if (!tabId) return null;
    let snapshot = null;
    try {
      await ensureContentScript(tabId);
      snapshot = await chrome.tabs.sendMessage(tabId, { action: "handoffToSidePanel" });
    } catch (_) {
      snapshot = null;
    }
    if (!snapshot || snapshot.empty) {
      if (hasActiveRequest(tabId)) {
        rebindRequest(tabId, "sidepanel");
        await pushBufferToTarget("sidepanel");
        const buf2 = getRequestBuffer("sidepanel");
        if (buf2) {
          const payload2 = {
            original: buf2.original || "",
            translated: buf2.content || "",
            reasoning: buf2.reasoning || "",
            hasReasoning: !!(buf2.reasoning && buf2.reasoning.length),
            status: "streaming",
            at: Date.now()
          };
          await storeHandoff(payload2);
          return payload2;
        }
      }
      return null;
    }
    const buf = getRequestBuffer(tabId);
    if (buf) {
      if (!snapshot.translated && buf.content) snapshot.translated = buf.content;
      if (!snapshot.reasoning && buf.reasoning) snapshot.reasoning = buf.reasoning;
      if (!snapshot.original && buf.original) snapshot.original = buf.original;
      snapshot.hasReasoning = !!(snapshot.reasoning && snapshot.reasoning.length);
    }
    let status = snapshot.status || "done";
    if (status === "streaming" || hasActiveRequest(tabId)) {
      rebindRequest(tabId, "sidepanel");
      const sideBuf = getRequestBuffer("sidepanel") || buf;
      if (sideBuf) {
        snapshot.translated = sideBuf.content || snapshot.translated || "";
        snapshot.reasoning = sideBuf.reasoning || snapshot.reasoning || "";
        snapshot.hasReasoning = !!(snapshot.reasoning && snapshot.reasoning.length);
        snapshot.original = sideBuf.original || snapshot.original || "";
      }
      status = "streaming";
      await pushBufferToTarget("sidepanel");
    } else if (hasActiveRequest(tabId)) {
      await cleanupRequest(tabId);
    }
    if (status === "done" && !snapshot.translated && buf?.content) {
      snapshot.translated = buf.content;
    }
    const payload = {
      original: snapshot.original || "",
      translated: snapshot.translated || "",
      reasoning: snapshot.reasoning || "",
      hasReasoning: !!snapshot.hasReasoning || !!(snapshot.reasoning && snapshot.reasoning.length),
      status,
      error: snapshot.error || "",
      at: Date.now()
    };
    await storeHandoff(payload);
    return payload;
  }
  function openSidePanelFromUserGesture(tab) {
    if (!chrome.sidePanel?.open) return false;
    const windowId = tab?.windowId;
    const tabId = tab?.id;
    if (windowId == null && tabId == null) return false;
    const openPromise = tabId != null && windowId != null ? chrome.sidePanel.open({ windowId, tabId }) : windowId != null ? chrome.sidePanel.open({ windowId }) : chrome.sidePanel.open({ tabId });
    Promise.resolve(openPromise).catch((error) => {
      console.error("\u6253\u5F00\u4FA7\u8FB9\u680F\u5931\u8D25:", error);
    });
    if (tabId) {
      handoffFromTab(tabId).catch((err) => console.error("handoff \u5931\u8D25:", err));
    }
    return true;
  }
  async function routeSelectionTranslation(tabId, text, windowId) {
    const trimmed = (text || "").trim();
    if (!trimmed) return;
    if (sidePanelOpen) {
      try {
        await chrome.tabs.sendMessage(tabId, { action: "dismissPopupOnly" });
      } catch (_) {
      }
      if (hasActiveRequest(tabId)) {
        await cleanupRequest(tabId);
      }
      if (hasActiveRequest("sidepanel")) {
        await cleanupRequest("sidepanel");
      }
      await storeHandoff({
        original: trimmed,
        translated: "",
        reasoning: "",
        hasReasoning: false,
        status: "streaming",
        at: Date.now()
      });
      try {
        await translateText(trimmed, "sidepanel");
      } catch (error) {
        chrome.runtime.sendMessage({
          action: "updateTranslation",
          target: "sidepanel",
          error: error.message || "\u7FFB\u8BD1\u5931\u8D25",
          done: true,
          streaming: false
        }, () => void chrome.runtime.lastError);
      }
      return;
    }
    try {
      await chrome.tabs.sendMessage(tabId, {
        action: "showTranslationPopup",
        text: trimmed
      });
    } catch (_) {
      await ensureContentScript(tabId);
      await chrome.tabs.sendMessage(tabId, {
        action: "showTranslationPopup",
        text: trimmed
      });
    }
  }
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== "translateSelection" || !tab?.id) return;
    try {
      if (!tab.url || !tab.url.startsWith("http")) {
        await notifyUser("\u4E0D\u652F\u6301\u5728\u6B64\u534F\u8BAE\u9875\u9762\u4F7F\u7528\u7FFB\u8BD1\u529F\u80FD", tab.id);
        return;
      }
      await routeSelectionTranslation(tab.id, info.selectionText, tab.windowId);
    } catch (error) {
      console.error("\u5904\u7406\u53F3\u952E\u83DC\u5355\u70B9\u51FB\u5931\u8D25:", error);
      await notifyUser("\u7FFB\u8BD1\u542F\u52A8\u5931\u8D25\uFF0C\u8BF7\u5237\u65B0\u9875\u9762\u540E\u91CD\u8BD5", tab.id);
    }
  });
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "shortcutChanged") {
      chrome.storage.local.set({ saved_shortcut: request.newShortcut }, () => {
        createContextMenu();
        sendResponse({ success: true });
      });
      return true;
    }
    if (request.action === "getHistory") {
      getTranslationHistory().then((history) => sendResponse({ success: true, history })).catch((error) => sendResponse({ success: false, error: error.message }));
      return true;
    }
    if (request.action === "isSidePanelOpen") {
      sendResponse({ open: sidePanelOpen });
      return false;
    }
    if (request.action === "translateSelection") {
      (async () => {
        try {
          const tabId = sender.tab?.id;
          if (!tabId) {
            sendResponse({ success: false });
            return;
          }
          await routeSelectionTranslation(tabId, request.text, sender.tab?.windowId);
          sendResponse({ success: true });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;
    }
    if (request.action === "translate") {
      const requestKey = request.source === "sidepanel" ? "sidepanel" : sender.tab?.id;
      (async () => {
        try {
          await translateText(request.text, requestKey);
          sendResponse({ success: true });
        } catch (error) {
          const message = error.message || "\u7FFB\u8BD1\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5";
          if (request.source === "sidepanel") {
            chrome.runtime.sendMessage({
              action: "updateTranslation",
              target: "sidepanel",
              error: message,
              done: true,
              streaming: false
            }, () => void chrome.runtime.lastError);
          } else if (typeof requestKey === "number") {
            chrome.tabs.sendMessage(requestKey, {
              action: "updateTranslation",
              error: message,
              done: true,
              streaming: false
            }, () => void chrome.runtime.lastError);
          }
          sendResponse({ success: false, error: message });
        }
      })();
      return true;
    }
    if (request.action === "stopTranslation") {
      const requestKey = request.source === "sidepanel" ? "sidepanel" : sender.tab?.id ?? null;
      cleanupRequest(requestKey).then(() => sendResponse({ success: true }));
      return true;
    }
    if (request.action === "cleanup") {
      if (request.skipIfRebound && request.source !== "sidepanel" && sender.tab?.id != null) {
        if (!hasActiveRequest(sender.tab.id)) {
          sendResponse({ success: true });
          return true;
        }
      }
      const requestKey = request.source === "sidepanel" ? "sidepanel" : sender.tab?.id ?? null;
      cleanupRequest(requestKey).then(() => sendResponse({ success: true }));
      return true;
    }
    if (request.action === "deleteHistoryItem") {
      deleteHistoryItem(request.original).then(() => sendResponse({ success: true })).catch((error) => sendResponse({ success: false, error: error.message }));
      return true;
    }
    if (request.action === "clearHistory") {
      clearHistory().then(() => sendResponse({ success: true })).catch((error) => sendResponse({ success: false, error: error.message }));
      return true;
    }
    if (request.action === "importHistory") {
      importHistory(request.history).then((count) => sendResponse({ success: true, count })).catch((error) => sendResponse({ success: false, error: error.message }));
      return true;
    }
    return false;
  });
  chrome.tabs.onRemoved.addListener((tabId) => {
    cleanupRequest(tabId);
  });
  chrome.commands.onCommand.addListener((command) => {
    if (command === "translate-selection") {
      executeTranslation();
    }
    if (command === "open-sidepanel") {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs?.[0];
        if (tab) {
          openSidePanelFromUserGesture(tab);
        }
      });
    }
  });
  async function executeTranslation() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;
      if (!tab.url || !tab.url.startsWith("http")) {
        await notifyUser("\u4E0D\u652F\u6301\u5728\u6B64\u534F\u8BAE\u9875\u9762\u4F7F\u7528\u7FFB\u8BD1\u529F\u80FD", tab.id);
        return;
      }
      let selectedText = "";
      try {
        const [result] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => window.getSelection().toString().trim()
        });
        selectedText = result?.result || "";
      } catch (error) {
        console.error("\u83B7\u53D6\u9009\u4E2D\u6587\u672C\u5931\u8D25:", error);
        await notifyUser("\u65E0\u6CD5\u83B7\u53D6\u9009\u4E2D\u6587\u672C\uFF0C\u8BF7\u5237\u65B0\u9875\u9762\u540E\u91CD\u8BD5", tab.id);
        return;
      }
      if (!selectedText) {
        await notifyUser("\u8BF7\u5148\u9009\u4E2D\u8981\u7FFB\u8BD1\u7684\u6587\u672C", tab.id);
        return;
      }
      try {
        await routeSelectionTranslation(tab.id, selectedText, tab.windowId);
      } catch (error) {
        console.error("\u5FEB\u6377\u952E\u7FFB\u8BD1\u542F\u52A8\u5931\u8D25:", error);
        await notifyUser("\u7FFB\u8BD1\u542F\u52A8\u5931\u8D25\uFF0C\u8BF7\u5237\u65B0\u9875\u9762\u540E\u91CD\u8BD5", tab.id);
      }
    } catch (error) {
      console.error("\u5FEB\u6377\u952E\u7FFB\u8BD1\u6267\u884C\u9519\u8BEF:", error);
    }
  }
})();
