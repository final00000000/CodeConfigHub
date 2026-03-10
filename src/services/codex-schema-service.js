const fs = require('fs/promises');
const path = require('path');
const https = require('https');
const { app } = require('electron');

const OFFICIAL_SCHEMA_URL = 'https://openai.github.io/codex/config-schema.json';
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10000;
const MAX_SCHEMA_BYTES = 2 * 1024 * 1024;
const OFFICIAL_DOC_URLS = [
  'https://developers.openai.com/codex/config-basic',
  'https://developers.openai.com/codex/config-advanced',
  'https://developers.openai.com/codex/config-reference',
  'https://developers.openai.com/codex/config-sample'
];

function getCachePath() {
  return path.join(app.getPath('userData'), 'codex-config-schema-cache.json');
}

function fetchJson(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    let finished = false;
    const request = https.get(url, {
      headers: {
        'User-Agent': `CodeConfigHub/${app.getVersion()}`,
        Accept: 'application/json, text/plain;q=0.9, */*;q=0.8'
      }
    }, (response) => {
      const { statusCode = 0, headers } = response;

      if (statusCode >= 300 && statusCode < 400 && headers.location) {
        response.resume();
        if (redirectCount >= 5) {
          reject(new Error('获取官方 schema 时重定向次数过多。'));
          return;
        }

        const nextUrl = new URL(headers.location, url).toString();
        resolve(fetchJson(nextUrl, redirectCount + 1));
        return;
      }

      if (statusCode < 200 || statusCode >= 300) {
        response.resume();
        reject(new Error(`官方 schema 请求失败（HTTP ${statusCode}）。`));
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

        if (bodyBytes > MAX_SCHEMA_BYTES) {
          finished = true;
          request.destroy(new Error('官方 schema 响应过大，已中止读取。'));
        }
      });

      response.on('end', () => {
        if (finished) {
          return;
        }

        finished = true;
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error(`官方 schema JSON 解析失败：${error instanceof Error ? error.message : String(error)}`));
        }
      });

      response.on('error', (error) => {
        if (finished) {
          return;
        }

        finished = true;
        reject(error);
      });
    });

    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      if (finished) {
        return;
      }

      finished = true;
      request.destroy(new Error('获取官方 schema 超时，请稍后重试。'));
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

async function getCodexOfficialSchema(options = {}) {
  const { forceRefresh = false } = options;
  const cached = await readCachedSchema();
  const cacheAgeMs = cached?.fetchedAt ? Date.now() - new Date(cached.fetchedAt).getTime() : Number.POSITIVE_INFINITY;

  if (!forceRefresh && cached?.schema && Number.isFinite(cacheAgeMs) && cacheAgeMs < CACHE_TTL_MS) {
    return {
      ok: true,
      source: 'cache',
      sourceUrl: OFFICIAL_SCHEMA_URL,
      docs: OFFICIAL_DOC_URLS,
      ...cached
    };
  }

  try {
    const schema = await fetchJson(OFFICIAL_SCHEMA_URL);
    const payload = {
      schema,
      fetchedAt: new Date().toISOString(),
      schemaTitle: schema?.title || 'Codex Config Schema'
    };

    await writeCachedSchema(payload);

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
        ...cached
      };
    }

    return {
      ok: false,
      source: 'unavailable',
      sourceUrl: OFFICIAL_SCHEMA_URL,
      docs: OFFICIAL_DOC_URLS,
      schema: null,
      fetchedAt: '',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

module.exports = {
  OFFICIAL_DOC_URLS,
  OFFICIAL_SCHEMA_URL,
  getCodexOfficialSchema
};
