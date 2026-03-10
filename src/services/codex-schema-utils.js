const STATIC_SUPPORTED_PATHS = new Set([
  'model',
  'model_provider',
  'model_reasoning_effort',
  'approval_policy',
  'sandbox_mode',
  'web_search',
  'model_auto_compact_token_limit',
  'model_context_window',
  'max_threads',
  'max_depth',
  'agents.max_threads',
  'agents.max_depth',
  'features.shell_tool',
  'features.skills',
  'features.multi_agent',
  'features.shell_snapshot',
  'features.steer',
  'features.unified_exec',
  'features.unifiedexec_utf8',
  'features.powershell_utf8',
  'model_providers.*.base_url',
  'model_providers.*.env_key',
  'model_providers.*.wire_api',
  'model_providers.*.requires_openai_auth',
  'model_providers.*.supports_websockets',
  'model_providers.*.http_headers.*',
  'profiles.*.model',
  'profiles.*.model_provider',
  'profiles.*.approval_policy',
  'profiles.*.sandbox_mode',
  'mcp_servers.*.command',
  'mcp_servers.*.args',
  'mcp_servers.*.env.*'
]);

const schemaEntryCache = new WeakMap();
const RESERVED_PATH_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);
const MAX_SCHEMA_ENTRY_COUNT = 1500;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function humanizeKey(value = '') {
  return String(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function isSafePathSegment(value) {
  return !RESERVED_PATH_SEGMENTS.has(String(value));
}

function hasUnsafePathSegment(parts = []) {
  return parts.some((part) => !isSafePathSegment(part));
}

function resolveSchemaVariant(schema) {
  if (!schema || typeof schema !== 'object') {
    return {};
  }

  const variants = [];
  if (Array.isArray(schema.oneOf)) {
    variants.push(...schema.oneOf);
  }
  if (Array.isArray(schema.anyOf)) {
    variants.push(...schema.anyOf);
  }

  if (variants.length === 0) {
    return schema;
  }

  const preferred = variants.find((entry) => {
    const type = Array.isArray(entry?.type) ? entry.type : [entry?.type].filter(Boolean);
    return entry?.properties || entry?.additionalProperties || entry?.patternProperties || (type.length > 0 && !type.includes('null'));
  });

  return preferred || variants[0] || schema;
}

function getSchemaLeafType(schema) {
  const node = resolveSchemaVariant(schema);
  const typeList = Array.isArray(node?.type) ? node.type.filter((item) => item !== 'null') : [node?.type].filter(Boolean);

  if (typeList.includes('object') || node?.properties || node?.additionalProperties || node?.patternProperties) {
    return 'object';
  }

  if (typeList.includes('array')) {
    return 'array';
  }

  if (typeList.includes('boolean')) {
    return 'boolean';
  }

  if (typeList.includes('integer')) {
    return 'integer';
  }

  if (typeList.includes('number')) {
    return 'number';
  }

  return 'string';
}

function flattenSchema(schema, pathParts = [], acc = []) {
  const node = resolveSchemaVariant(schema);
  const schemaType = getSchemaLeafType(node);
  const description = node?.description || node?.markdownDescription || '';

  if (acc.length >= MAX_SCHEMA_ENTRY_COUNT || hasUnsafePathSegment(pathParts)) {
    return acc;
  }

  if (schemaType === 'object') {
    for (const [key, child] of Object.entries(node?.properties || {})) {
      if (!isSafePathSegment(key)) {
        continue;
      }
      flattenSchema(child, [...pathParts, key], acc);
    }

    const wildcardSources = [];
    if (node?.additionalProperties && typeof node.additionalProperties === 'object') {
      wildcardSources.push(node.additionalProperties);
    }
    if (node?.patternProperties && typeof node.patternProperties === 'object') {
      wildcardSources.push(...Object.values(node.patternProperties));
    }

    for (const childSchema of wildcardSources) {
      flattenSchema(childSchema, [...pathParts, '*'], acc);
    }

    return acc;
  }

  if (pathParts.length === 0) {
    return acc;
  }

  acc.push({
    path: pathParts.join('.'),
    pathParts: [...pathParts],
    normalizedPath: pathParts.join('.'),
    type: schemaType,
    title: node?.title || humanizeKey(pathParts[pathParts.length - 1]),
    description,
    enumValues: Array.isArray(node?.enum) ? [...node.enum] : [],
    defaultValue: node?.default
  });

  return acc;
}

function getFlattenedSchemaEntries(schema) {
  if (!schema || typeof schema !== 'object') {
    return [];
  }

  const cachedEntries = schemaEntryCache.get(schema);
  if (cachedEntries) {
    return cachedEntries;
  }

  const entries = flattenSchema(schema);
  schemaEntryCache.set(schema, entries);
  return entries;
}

function flattenConfigLeaves(value, pathParts = [], acc = []) {
  if (hasUnsafePathSegment(pathParts)) {
    return acc;
  }

  if (isPlainObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (!isSafePathSegment(key)) {
        continue;
      }
      flattenConfigLeaves(child, [...pathParts, key], acc);
    }
    return acc;
  }

  if (pathParts.length === 0) {
    return acc;
  }

  acc.push({
    path: pathParts.join('.'),
    pathParts: [...pathParts],
    value
  });

  return acc;
}

function pathMatchesSchema(actualParts, schemaParts) {
  if (actualParts.length !== schemaParts.length) {
    return false;
  }

  for (let index = 0; index < schemaParts.length; index += 1) {
    if (schemaParts[index] !== '*' && schemaParts[index] !== actualParts[index]) {
      return false;
    }
  }

  return true;
}

function getValueAtPath(root, pathOrParts) {
  const parts = Array.isArray(pathOrParts) ? pathOrParts : String(pathOrParts).split('.').filter(Boolean);
  if (hasUnsafePathSegment(parts)) {
    return undefined;
  }

  let cursor = root;

  for (const part of parts) {
    if (!isPlainObject(cursor) || !(part in cursor)) {
      return undefined;
    }
    cursor = cursor[part];
  }

  return cursor;
}

function buildActualPathsForSchema(node, schemaParts, index = 0, built = []) {
  if (index >= schemaParts.length) {
    return [built.join('.')];
  }

  const segment = schemaParts[index];

  if (segment === '*') {
    if (!isPlainObject(node)) {
      return [];
    }

    return Object.keys(node)
      .filter((key) => isSafePathSegment(key))
      .flatMap((key) => buildActualPathsForSchema(node[key], schemaParts, index + 1, [...built, key]));
  }

  const nextNode = isPlainObject(node) ? node[segment] : undefined;
  return buildActualPathsForSchema(nextNode, schemaParts, index + 1, [...built, segment]);
}

function toInputValue(value, type) {
  if (value === undefined) {
    return '';
  }

  if (type === 'boolean') {
    return value === true ? 'true' : value === false ? 'false' : '';
  }

  if (type === 'array' || type === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return '';
    }
  }

  return String(value);
}

function formatPreviewValue(value) {
  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function createDynamicField(entry, actualPath, value) {
  return {
    schemaPath: entry.path,
    actualPath,
    title: entry.title,
    description: entry.description,
    type: entry.type,
    enumValues: entry.enumValues,
    defaultValue: entry.defaultValue,
    inputValue: toInputValue(value, entry.type),
    present: value !== undefined
  };
}

function createDynamicFields(parsed, schemaEntries) {
  const fields = [];

  for (const entry of schemaEntries) {
    if (STATIC_SUPPORTED_PATHS.has(entry.normalizedPath)) {
      continue;
    }

    if (entry.pathParts.includes('*')) {
      const actualPaths = buildActualPathsForSchema(parsed, entry.pathParts);
      for (const actualPath of actualPaths) {
        fields.push(createDynamicField(entry, actualPath, getValueAtPath(parsed, actualPath)));
      }
      continue;
    }

    fields.push(createDynamicField(entry, entry.path, getValueAtPath(parsed, entry.pathParts)));
  }

  return fields.sort((left, right) => left.actualPath.localeCompare(right.actualPath, 'en'));
}

function createCustomFields(parsed, schemaEntries) {
  return flattenConfigLeaves(parsed)
    .filter((field) => !schemaEntries.some((entry) => pathMatchesSchema(field.pathParts, entry.pathParts)))
    .map((field) => ({
      path: field.path,
      value: formatPreviewValue(field.value)
    }))
    .sort((left, right) => left.path.localeCompare(right.path, 'en'));
}

export function createCodexSchemaOverlay(parsed = {}, officialSchemaState = null) {
  if (!officialSchemaState?.schema) {
    return {
      dynamicFields: [],
      customFields: [],
      summary: {
        available: false,
        source: officialSchemaState?.source || 'unavailable',
        fetchedAt: officialSchemaState?.fetchedAt || '',
        totalOfficialCount: 0,
        builtinOfficialCount: 0,
        dynamicOfficialCount: 0,
        renderedDynamicCount: 0,
        customCount: 0,
        error: officialSchemaState?.error || '',
        sourceUrl: officialSchemaState?.sourceUrl || '',
        docs: officialSchemaState?.docs || []
      }
    };
  }

  const schemaEntries = getFlattenedSchemaEntries(officialSchemaState.schema);
  const dynamicOfficialEntries = schemaEntries.filter((entry) => !STATIC_SUPPORTED_PATHS.has(entry.normalizedPath));
  const builtinOfficialEntries = schemaEntries.filter((entry) => STATIC_SUPPORTED_PATHS.has(entry.normalizedPath));
  const dynamicFields = createDynamicFields(parsed, dynamicOfficialEntries);
  const customFields = createCustomFields(parsed, schemaEntries);

  return {
    dynamicFields,
    customFields,
    summary: {
      available: true,
      source: officialSchemaState.source || 'unknown',
      fetchedAt: officialSchemaState.fetchedAt || '',
      totalOfficialCount: schemaEntries.length,
      builtinOfficialCount: builtinOfficialEntries.length,
      dynamicOfficialCount: dynamicOfficialEntries.length,
      renderedDynamicCount: dynamicFields.length,
      customCount: customFields.length,
      error: officialSchemaState.error || '',
      sourceUrl: officialSchemaState.sourceUrl || '',
      docs: officialSchemaState.docs || []
    }
  };
}

function setValueAtPath(root, pathOrParts, value) {
  const parts = Array.isArray(pathOrParts) ? pathOrParts : String(pathOrParts).split('.').filter(Boolean);
  if (parts.length === 0 || hasUnsafePathSegment(parts)) {
    return;
  }

  let cursor = root;
  for (const part of parts.slice(0, -1)) {
    if (!isPlainObject(cursor[part])) {
      cursor[part] = {};
    }
    cursor = cursor[part];
  }

  cursor[parts[parts.length - 1]] = value;
}

function deleteValueAtPath(root, pathOrParts) {
  const parts = Array.isArray(pathOrParts) ? pathOrParts : String(pathOrParts).split('.').filter(Boolean);
  if (parts.length === 0 || hasUnsafePathSegment(parts)) {
    return;
  }

  const parents = [];
  let cursor = root;

  for (const part of parts.slice(0, -1)) {
    if (!isPlainObject(cursor[part])) {
      return;
    }

    parents.push([cursor, part]);
    cursor = cursor[part];
  }

  if (!isPlainObject(cursor)) {
    return;
  }

  delete cursor[parts[parts.length - 1]];

  for (let index = parents.length - 1; index >= 0; index -= 1) {
    const [parent, key] = parents[index];
    if (isPlainObject(parent[key]) && Object.keys(parent[key]).length === 0) {
      delete parent[key];
      continue;
    }
    break;
  }
}

function parseDynamicFieldValue(field) {
  const rawValue = field.inputValue;
  if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') {
    return undefined;
  }

  if (field.type === 'boolean') {
    if (rawValue === 'true' || rawValue === true) {
      return true;
    }
    if (rawValue === 'false' || rawValue === false) {
      return false;
    }
    return undefined;
  }

  if (field.type === 'integer' || field.type === 'number') {
    const parsedNumber = Number(rawValue);
    if (Number.isNaN(parsedNumber)) {
      throw new Error(`${field.actualPath} 需要填写合法数字。`);
    }
    return field.type === 'integer' ? Math.trunc(parsedNumber) : parsedNumber;
  }

  if (field.type === 'array' || field.type === 'object') {
    let parsedJson;

    try {
      parsedJson = JSON.parse(rawValue);
    } catch (error) {
      throw new Error(`${field.actualPath} 需要填写合法 JSON：${error instanceof Error ? error.message : String(error)}`);
    }

    if (field.type === 'array' && !Array.isArray(parsedJson)) {
      throw new Error(`${field.actualPath} 必须是 JSON 数组。`);
    }

    if (field.type === 'object' && !isPlainObject(parsedJson)) {
      throw new Error(`${field.actualPath} 必须是 JSON 对象。`);
    }

    return parsedJson;
  }

  return String(rawValue);
}

export function applyDynamicFields(target, fields = []) {
  for (const field of fields) {
    if (!field?.actualPath) {
      continue;
    }

    const parsedValue = parseDynamicFieldValue(field);
    if (parsedValue === undefined) {
      deleteValueAtPath(target, field.actualPath);
      continue;
    }

    setValueAtPath(target, field.actualPath, parsedValue);
  }
}

