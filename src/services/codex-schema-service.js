const fs = require('fs/promises');
const https = require('https');
const path = require('path');
const { app } = require('electron');
const { fetchJsonWithFallback } = require('./http-json-service');

const OFFICIAL_SCHEMA_URL = 'https://developers.openai.com/codex/config-schema.json';
const OFFICIAL_MODELS_URL = 'https://developers.openai.com/api/docs/models/all';
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10000;
const MAX_SCHEMA_BYTES = 2 * 1024 * 1024;
const MAX_MODELS_BYTES = 2 * 1024 * 1024;
const OFFICIAL_DOC_URLS = [
  'https://developers.openai.com/codex/config-basic',
  'https://developers.openai.com/codex/config-advanced',
  'https://developers.openai.com/codex/config-reference',
  'https://developers.openai.com/codex/config-sample',
  OFFICIAL_MODELS_URL
];

const MODEL_FIELD_PATHS = [
  'model',
  'review_model',
  'profiles.*.model',
  'experimental_realtime_ws_model'
];

function getCachePath() {
  return path.join(app.getPath('userData'), 'codex-config-schema-cache.json');
}

async function readCachedSchema() {
  try {
    const content = await fs.readFile(getCachePath(), 'utf8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function writeCachedSchema(payload) {
  try {
    await fs.mkdir(path.dirname(getCachePath()), { recursive: true });
    await fs.writeFile(getCachePath(), JSON.stringify(payload, null, 2), 'utf8');
  } catch {
    // ignore cache write errors
  }
}

function fetchTextViaHttps(url, { timeoutMs, maxBytes, errorPrefix }, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    let finished = false;
    const request = https.get(url, {
      headers: {
        'User-Agent': `CodeConfigHub/${typeof app?.getVersion === 'function' ? app.getVersion() : 'unknown'}`,
        Accept: 'text/html, text/plain;q=0.9, */*;q=0.8'
      }
    }, (response) => {
      const { statusCode = 0, headers } = response;

      if (statusCode >= 300 && statusCode < 400 && headers.location) {
        response.resume();
        if (redirectCount >= 5) {
          reject(new Error(`${errorPrefix} 重定向次数过多。`));
          return;
        }

        const nextUrl = new URL(headers.location, url).toString();
        resolve(fetchTextViaHttps(nextUrl, { timeoutMs, maxBytes, errorPrefix }, redirectCount + 1));
        return;
      }

      if (statusCode < 200 || statusCode >= 300) {
        response.resume();
        reject(new Error(`${errorPrefix} 请求失败（HTTP ${statusCode}）。`));
        return;
      }

      response.setEncoding('utf8');
      let body = '';
      let bodyBytes = 0;

      response.on('data', (chunk) => {
        if (finished) {
          return;
        }

        body += chunk;
        bodyBytes += Buffer.byteLength(chunk, 'utf8');

        if (bodyBytes > maxBytes) {
          finished = true;
          request.destroy(new Error(`${errorPrefix} 响应过大，已中止读取。`));
        }
      });

      response.on('end', () => {
        if (finished) {
          return;
        }

        finished = true;
        resolve(body);
      });

      response.on('error', (error) => {
        if (finished) {
          return;
        }

        finished = true;
        reject(error);
      });
    });

    request.setTimeout(timeoutMs, () => {
      if (finished) {
        return;
      }

      finished = true;
      request.destroy(new Error(`${errorPrefix} 超时，请稍后重试。`));
    });

    request.on('error', (error) => {
      if (finished) {
        return;
      }

      finished = true;
      reject(error);
    });
  });
}

function normalizeModelSuggestion(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (!/^gpt-[a-z0-9.-]+$/.test(normalized)) {
    return '';
  }

  if (/\.(png|jpe?g|svg|webp|gif)$/.test(normalized)) {
    return '';
  }

  if (normalized === 'gpt-ui' || normalized.includes('-class')) {
    return '';
  }

  if (/(audio|image|realtime|transcribe|tts|search)/.test(normalized)) {
    return '';
  }

  return normalized;
}

function sortModelSuggestions(left = '', right = '') {
  const leftIsCodex = left.includes('codex');
  const rightIsCodex = right.includes('codex');
  if (leftIsCodex !== rightIsCodex) {
    return leftIsCodex ? -1 : 1;
  }

  const leftIsGpt5 = left.startsWith('gpt-5');
  const rightIsGpt5 = right.startsWith('gpt-5');
  if (leftIsGpt5 !== rightIsGpt5) {
    return leftIsGpt5 ? -1 : 1;
  }

  return left.localeCompare(right, 'en');
}

async function fetchCodexModelSuggestions() {
  try {
    const body = await fetchTextViaHttps(OFFICIAL_MODELS_URL, {
      timeoutMs: REQUEST_TIMEOUT_MS,
      maxBytes: MAX_MODELS_BYTES,
      errorPrefix: '获取 Codex 模型建议'
    });
    const matches = body.match(/\bgpt-[a-z0-9.-]+\b/gi) || [];
    const suggestions = [...new Set(matches.map((value) => normalizeModelSuggestion(value)).filter(Boolean))]
      .sort(sortModelSuggestions)
      .slice(0, 36);

    return suggestions;
  } catch {
    return [];
  }
}

function createFieldSuggestions(modelSuggestions = []) {
  if (!Array.isArray(modelSuggestions) || modelSuggestions.length === 0) {
    return {};
  }

  return MODEL_FIELD_PATHS.reduce((result, fieldPath) => {
    result[fieldPath] = [...modelSuggestions];
    return result;
  }, {});
}

function hasFieldSuggestions(value) {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).length > 0;
}

let pendingModelSuggestionRefresh = null;

function refreshCodexModelSuggestionsInBackground(basePayload = null) {
  if (pendingModelSuggestionRefresh) {
    return pendingModelSuggestionRefresh;
  }

  pendingModelSuggestionRefresh = (async () => {
    const modelSuggestions = await fetchCodexModelSuggestions();
    const fieldSuggestions = createFieldSuggestions(modelSuggestions);
    if (!hasFieldSuggestions(fieldSuggestions)) {
      return;
    }

    const currentCache = await readCachedSchema();
    const nextPayload = {
      ...(basePayload && typeof basePayload === 'object' ? basePayload : {}),
      // Preserve the latest schema metadata from cache if it changed after basePayload was captured.
      ...(currentCache && typeof currentCache === 'object' ? currentCache : {}),
      fieldSuggestions
    };

    await writeCachedSchema(nextPayload);
  })()
    .catch(() => {
      // Model suggestions are optional and must never fail the schema path.
    })
    .finally(() => {
      pendingModelSuggestionRefresh = null;
    });

  return pendingModelSuggestionRefresh;
}

async function getCodexOfficialSchema(options = {}) {
  const { forceRefresh = false } = options;
  const cached = await readCachedSchema();
  const cacheAgeMs = cached?.fetchedAt ? Date.now() - new Date(cached.fetchedAt).getTime() : Number.POSITIVE_INFINITY;
  const cachedFieldSuggestions = hasFieldSuggestions(cached?.fieldSuggestions) ? cached.fieldSuggestions : {};

  if (!forceRefresh && cached?.schema && Number.isFinite(cacheAgeMs) && cacheAgeMs < CACHE_TTL_MS) {
    if (!hasFieldSuggestions(cachedFieldSuggestions)) {
      void refreshCodexModelSuggestionsInBackground(cached);
    }

    return {
      ok: true,
      source: 'cache',
      sourceUrl: OFFICIAL_SCHEMA_URL,
      docs: OFFICIAL_DOC_URLS,
      ...cached,
      fieldSuggestions: cachedFieldSuggestions
    };
  }

  try {
    const schema = await fetchJsonWithFallback(OFFICIAL_SCHEMA_URL, {
      timeoutMs: REQUEST_TIMEOUT_MS,
      maxBytes: MAX_SCHEMA_BYTES,
      errorPrefix: '获取 Codex 官方 schema'
    });
    const payload = {
      schema,
      fetchedAt: new Date().toISOString(),
      schemaTitle: schema?.title || 'Codex Config Schema',
      fieldSuggestions: cachedFieldSuggestions
    };

    await writeCachedSchema(payload);
    void refreshCodexModelSuggestionsInBackground(payload);

    return {
      ok: true,
      source: 'network',
      sourceUrl: OFFICIAL_SCHEMA_URL,
      docs: OFFICIAL_DOC_URLS,
      ...payload
    };
  } catch (error) {
    if (cached?.schema) {
      return {
        ok: true,
        source: 'stale-cache',
        sourceUrl: OFFICIAL_SCHEMA_URL,
        docs: OFFICIAL_DOC_URLS,
        error: error instanceof Error ? error.message : String(error),
        ...cached,
        fieldSuggestions: cachedFieldSuggestions
      };
    }

    return {
      ok: false,
      source: 'unavailable',
      sourceUrl: OFFICIAL_SCHEMA_URL,
      docs: OFFICIAL_DOC_URLS,
      schema: null,
      fetchedAt: '',
      fieldSuggestions: {},
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

module.exports = {
  OFFICIAL_DOC_URLS,
  OFFICIAL_SCHEMA_URL,
  getCodexOfficialSchema
};
