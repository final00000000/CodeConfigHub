const fs = require('fs/promises');
const path = require('path');
const { app } = require('electron');
const { fetchJsonWithFallback } = require('./http-json-service');

const OFFICIAL_SCHEMA_URL = 'https://json.schemastore.org/claude-code-settings.json';
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10000;
const MAX_SCHEMA_BYTES = 2 * 1024 * 1024;
const OFFICIAL_DOC_URLS = [
  'https://docs.anthropic.com/en/docs/claude-code/settings',
  'https://json.schemastore.org/claude-code-settings.json'
];

function getCachePath() {
  return path.join(app.getPath('userData'), 'claude-config-schema-cache.json');
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

async function getClaudeOfficialSchema(options = {}) {
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
    const schema = await fetchJsonWithFallback(OFFICIAL_SCHEMA_URL, {
      timeoutMs: REQUEST_TIMEOUT_MS,
      maxBytes: MAX_SCHEMA_BYTES,
      errorPrefix: '获取 Claude 官方 schema'
    });
    const payload = {
      schema,
      fetchedAt: new Date().toISOString(),
      schemaTitle: schema?.title || 'Claude Code Settings Schema'
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
  getClaudeOfficialSchema
};
