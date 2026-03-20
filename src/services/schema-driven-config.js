function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? {}));
}

function humanizeKey(value = '') {
  return String(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function mergeSchemaNodes(baseNode, overrideNode) {
  const base = isPlainObject(baseNode) ? baseNode : {};
  const override = isPlainObject(overrideNode) ? overrideNode : {};

  const merged = {
    ...base,
    ...override
  };

  if (isPlainObject(base.properties) || isPlainObject(override.properties)) {
    merged.properties = {
      ...(isPlainObject(base.properties) ? base.properties : {}),
      ...(isPlainObject(override.properties) ? override.properties : {})
    };
  }

  if (isPlainObject(base.patternProperties) || isPlainObject(override.patternProperties)) {
    merged.patternProperties = {
      ...(isPlainObject(base.patternProperties) ? base.patternProperties : {}),
      ...(isPlainObject(override.patternProperties) ? override.patternProperties : {})
    };
  }

  if (Array.isArray(base.required) || Array.isArray(override.required)) {
    merged.required = [...new Set([...(Array.isArray(base.required) ? base.required : []), ...(Array.isArray(override.required) ? override.required : [])])];
  }

  if (base.additionalProperties && override.additionalProperties) {
    if (isPlainObject(base.additionalProperties) && isPlainObject(override.additionalProperties)) {
      merged.additionalProperties = mergeSchemaNodes(base.additionalProperties, override.additionalProperties);
    } else {
      merged.additionalProperties = override.additionalProperties;
    }
  }

  if (base.items && override.items) {
    if (isPlainObject(base.items) && isPlainObject(override.items)) {
      merged.items = mergeSchemaNodes(base.items, override.items);
    } else {
      merged.items = override.items;
    }
  }

  return merged;
}

function resolveSchemaPointer(rootSchema, ref = '') {
  if (typeof ref !== 'string' || !ref.startsWith('#/')) {
    return null;
  }

  const segments = ref
    .slice(2)
    .split('/')
    .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'));

  let cursor = rootSchema;
  for (const segment of segments) {
    if (!cursor || typeof cursor !== 'object') {
      return null;
    }
    cursor = cursor[segment];
  }

  return cursor ?? null;
}

function normalizeSuggestionValues(values = []) {
  const normalized = [];
  const seen = new Set();

  for (const value of values) {
    if (value === undefined || value === null) {
      continue;
    }

    if (typeof value === 'object') {
      continue;
    }

    const normalizedValue = String(value).trim();
    if (!normalizedValue || seen.has(normalizedValue)) {
      continue;
    }

    seen.add(normalizedValue);
    normalized.push(normalizedValue);
  }

  return normalized;
}

function extractSchemaEnumValues(node = {}) {
  return normalizeSuggestionValues([
    ...(Array.isArray(node?.enum) ? node.enum : []),
    ...(('const' in node) ? [node.const] : [])
  ]);
}

function extractSchemaSuggestedValues(node = {}) {
  return normalizeSuggestionValues([
    ...extractSchemaEnumValues(node),
    ...(Array.isArray(node?.examples) ? node.examples : []),
    ...((node?.default !== undefined) ? [node.default] : [])
  ]);
}

function mergeSuggestionValues(...valueLists) {
  return normalizeSuggestionValues(valueLists.flatMap((values) => (Array.isArray(values) ? values : [])));
}

function resolveSchemaVariant(schema, rootSchema = schema, seenRefs = new Set()) {
  if (!schema || typeof schema !== 'object') {
    return {};
  }

  let node = schema;

  if (typeof node.$ref === 'string' && !seenRefs.has(node.$ref)) {
    const resolvedRef = resolveSchemaPointer(rootSchema, node.$ref);
    if (resolvedRef) {
      const nextSeenRefs = new Set(seenRefs);
      nextSeenRefs.add(node.$ref);
      node = mergeSchemaNodes(resolveSchemaVariant(resolvedRef, rootSchema, nextSeenRefs), {
        ...node,
        $ref: undefined
      });
    }
  }

  if (Array.isArray(node.allOf) && node.allOf.length > 0) {
    node = node.allOf.reduce((acc, entry) => mergeSchemaNodes(acc, resolveSchemaVariant(entry, rootSchema, seenRefs)), {
      ...node,
      allOf: undefined
    });
  }

  const variants = [];
  if (Array.isArray(node.oneOf)) {
    variants.push(...node.oneOf);
  }
  if (Array.isArray(node.anyOf)) {
    variants.push(...node.anyOf);
  }

  if (variants.length === 0) {
    return node;
  }

  const resolvedVariants = variants.map((entry) => resolveSchemaVariant(entry, rootSchema, seenRefs));
  const preferred = resolvedVariants.find((entry) => {
    const type = Array.isArray(entry?.type) ? entry.type : [entry?.type].filter(Boolean);
    return entry?.properties || entry?.additionalProperties || entry?.patternProperties || (type.length > 0 && !type.includes('null'));
  });

  return preferred || resolvedVariants[0] || node;
}

function getSchemaLeafType(schema) {
  const node = resolveSchemaVariant(schema, schema);
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

function flattenSchema(schema, pathParts = [], acc = [], rootSchema = schema) {
  const node = resolveSchemaVariant(schema, rootSchema);
  const schemaType = getSchemaLeafType(node);
  const description = node?.description || node?.markdownDescription || '';

  if (schemaType === 'object') {
    for (const [key, child] of Object.entries(node?.properties || {})) {
      flattenSchema(child, [...pathParts, key], acc, rootSchema);
    }

    const wildcardSources = [];
    if (node?.additionalProperties && typeof node.additionalProperties === 'object') {
      wildcardSources.push(node.additionalProperties);
    }
    if (node?.patternProperties && typeof node.patternProperties === 'object') {
      wildcardSources.push(...Object.values(node.patternProperties));
    }

    for (const childSchema of wildcardSources) {
      flattenSchema(childSchema, [...pathParts, '*'], acc, rootSchema);
    }

    return acc;
  }

  if (pathParts.length === 0) {
    return acc;
  }

  acc.push({
    path: pathParts.join('.'),
    pathParts: [...pathParts],
    type: schemaType,
    title: node?.title || humanizeKey(pathParts[pathParts.length - 1]),
    description,
    enumValues: extractSchemaEnumValues(node),
    suggestedValues: extractSchemaSuggestedValues(node),
    defaultValue: node?.default
  });

  return acc;
}

function flattenConfigLeaves(value, pathParts = [], acc = []) {
  if (isPlainObject(value)) {
    for (const [key, child] of Object.entries(value)) {
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

function findMatchingSchemaEntry(actualParts, schemaEntries = []) {
  const matches = schemaEntries
    .filter((entry) => pathMatchesSchema(actualParts, entry.pathParts))
    .sort((left, right) => {
      const leftScore = left.pathParts.filter((part) => part !== '*').length;
      const rightScore = right.pathParts.filter((part) => part !== '*').length;
      return rightScore - leftScore;
    });

  return matches[0] || null;
}

export function findMatchingSchemaEntryByPath(path = '', schemaEntries = []) {
  const pathParts = normalizeFieldPathParts(path);
  if (pathParts.length === 0) {
    return null;
  }

  return findMatchingSchemaEntry(pathParts, schemaEntries);
}

function toInputValue(value, type) {
  if (value === undefined) {
    return '';
  }

  if (type === 'null') {
    return 'null';
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

function guessFieldType(value) {
  if (value === null) {
    return 'null';
  }

  if (Array.isArray(value)) {
    return 'array';
  }

  if (typeof value === 'boolean') {
    return 'boolean';
  }

  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'integer' : 'number';
  }

  if (isPlainObject(value)) {
    return 'object';
  }

  return 'string';
}

function isCompatibleFieldType(localType, schemaType) {
  if (!localType || !schemaType) {
    return true;
  }

  if (localType === schemaType) {
    return true;
  }

  if (localType === 'integer' && schemaType === 'number') {
    return true;
  }

  return false;
}

function createFieldFromLeaf(leaf, schemaEntry = null) {
  const localType = guessFieldType(leaf.value);
  const schemaType = schemaEntry?.type || '';
  const isTypeConflict = Boolean(schemaType) && !isCompatibleFieldType(localType, schemaType);
  const type = isTypeConflict ? localType : (schemaType || localType);
  const actualPath = leaf.path;

  return {
    actualPath,
    schemaPath: schemaEntry?.path || actualPath,
    pathParts: [...leaf.pathParts],
    title: schemaEntry?.title || humanizeKey(leaf.pathParts[leaf.pathParts.length - 1]),
    description: schemaEntry?.description || '',
    type,
    localType,
    schemaType,
    isTypeConflict,
    enumValues: isTypeConflict ? [] : (schemaEntry?.enumValues || []),
    suggestedValues: isTypeConflict ? [] : (Array.isArray(schemaEntry?.suggestedValues) ? [...schemaEntry.suggestedValues] : []),
    defaultValue: isTypeConflict ? undefined : schemaEntry?.defaultValue,
    inputValue: toInputValue(leaf.value, type),
    isOfficial: Boolean(schemaEntry),
    groupKey: leaf.pathParts.length > 1 ? leaf.pathParts[0] : '__root__'
  };
}

const STARTER_FIELD_PRIORITY = [
  'model',
  'model_provider',
  'model_reasoning_effort',
  'approval_policy',
  'sandbox_mode',
  'web_search',
  'permissions.allow',
  'permissions.ask',
  'fastMode',
  'alwaysThinkingEnabled',
  'cleanupPeriodDays',
  'env',
  'hooks'
];

function getStarterFieldPriority(path = '') {
  const index = STARTER_FIELD_PRIORITY.indexOf(path);
  return index === -1 ? Number.POSITIVE_INFINITY : index;
}

function getDefaultInputValue(defaultValue, type = 'string') {
  if (defaultValue !== undefined) {
    return toInputValue(defaultValue, type);
  }

  switch (type) {
    case 'boolean':
      return 'true';
    case 'integer':
    case 'number':
      return '0';
    case 'array':
      return '[]';
    case 'object':
      return '{}';
    case 'null':
      return 'null';
    default:
      return '';
  }
}

function normalizeFieldPathParts(pathOrParts) {
  const parts = Array.isArray(pathOrParts)
    ? pathOrParts
    : String(pathOrParts || '').split('.');

  return parts
    .map((part) => String(part || '').trim())
    .filter(Boolean);
}

export function isSchemaFieldPathValid(path = '') {
  const parts = normalizeFieldPathParts(path);
  if (!parts.length) {
    return false;
  }

  return parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part));
}

export function sortSchemaFields(fields = []) {
  return [...fields].sort((left, right) => {
    const leftPath = String(left?.actualPath || '');
    const rightPath = String(right?.actualPath || '');
    return leftPath.localeCompare(rightPath, 'en');
  });
}

function createFieldFromSchemaEntry(schemaEntry, overrides = {}) {
  const actualPath = overrides.actualPath || schemaEntry?.path || '';
  const pathParts = normalizeFieldPathParts(overrides.pathParts || actualPath);
  const type = overrides.type || schemaEntry?.type || 'string';

  return {
    actualPath,
    schemaPath: schemaEntry?.path || actualPath,
    pathParts,
    title: overrides.title || schemaEntry?.title || humanizeKey(pathParts[pathParts.length - 1] || actualPath),
    description: overrides.description || schemaEntry?.description || '',
    type,
    localType: type,
    schemaType: schemaEntry?.type || type,
    isTypeConflict: false,
    enumValues: Array.isArray(schemaEntry?.enumValues) ? [...schemaEntry.enumValues] : [],
    suggestedValues: Array.isArray(schemaEntry?.suggestedValues) ? [...schemaEntry.suggestedValues] : [],
    defaultValue: schemaEntry?.defaultValue,
    inputValue: overrides.inputValue ?? getDefaultInputValue(schemaEntry?.defaultValue, type),
    isOfficial: Boolean(schemaEntry),
    groupKey: pathParts.length > 1 ? pathParts[0] : '__root__'
  };
}

export function createSchemaDraftField({ path = '', type = 'string', schemaEntry = null, inputValue } = {}) {
  const normalizedPath = normalizeFieldPathParts(path).join('.');
  if (!isSchemaFieldPathValid(normalizedPath)) {
    throw new Error('字段路径只能包含字母、数字、下划线、中划线，并使用点号表示层级。');
  }

  if (schemaEntry) {
    return createFieldFromSchemaEntry(schemaEntry, {
      actualPath: normalizedPath,
      inputValue
    });
  }

  const pathParts = normalizeFieldPathParts(normalizedPath);
  return {
    actualPath: normalizedPath,
    schemaPath: normalizedPath,
    pathParts,
    title: humanizeKey(pathParts[pathParts.length - 1] || normalizedPath),
    description: '',
    type,
    localType: type,
    schemaType: '',
    isTypeConflict: false,
    enumValues: [],
    suggestedValues: [],
    defaultValue: undefined,
    inputValue: inputValue ?? getDefaultInputValue(undefined, type),
    isOfficial: false,
    groupKey: pathParts.length > 1 ? pathParts[0] : '__root__'
  };
}

export function createSchemaDrivenDraft(parsed = {}, officialSchemaState = null) {
  const localLeaves = flattenConfigLeaves(parsed).sort((left, right) => left.path.localeCompare(right.path, 'en'));
  const officialFieldSuggestions = isPlainObject(officialSchemaState?.fieldSuggestions) ? officialSchemaState.fieldSuggestions : {};
  const schemaEntries = officialSchemaState?.schema
    ? flattenSchema(officialSchemaState.schema).map((entry) => ({
      ...entry,
      suggestedValues: mergeSuggestionValues(entry.suggestedValues, officialFieldSuggestions[entry.path])
    }))
    : [];
  const schemaFields = [];
  const customFields = [];

  for (const leaf of localLeaves) {
    const schemaEntry = findMatchingSchemaEntry(leaf.pathParts, schemaEntries);
    const field = createFieldFromLeaf(leaf, schemaEntry);
    schemaFields.push(field);

    if (!field.isOfficial) {
      customFields.push({
        path: field.actualPath,
        type: field.type,
        inputValue: field.inputValue
      });
    }
  }

  const schemaFieldPathSet = new Set(schemaFields.map((field) => field.actualPath));
  const availableSchemaFields = schemaEntries
    .filter((entry) => !entry.path.includes('*') && !schemaFieldPathSet.has(entry.path))
    .map((entry) => createFieldFromSchemaEntry(entry))
    .sort((left, right) => {
      const priorityDiff = getStarterFieldPriority(left.actualPath) - getStarterFieldPriority(right.actualPath);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      return String(left.actualPath).localeCompare(String(right.actualPath), 'en');
    });
  const starterSuggestions = availableSchemaFields.slice(0, 8);

  return {
    schemaFields: sortSchemaFields(schemaFields),
    officialSync: {
      available: Boolean(officialSchemaState?.schema),
      source: officialSchemaState?.source || 'unavailable',
      fetchedAt: officialSchemaState?.fetchedAt || '',
      totalLocalCount: localLeaves.length,
      matchedOfficialCount: schemaFields.filter((field) => field.isOfficial).length,
      localOnlyCount: schemaFields.filter((field) => !field.isOfficial).length,
      error: officialSchemaState?.error || '',
      sourceUrl: officialSchemaState?.sourceUrl || '',
      docs: officialSchemaState?.docs || []
    },
    customFields,
    schemaCatalog: schemaEntries.map((entry) => ({
      ...entry,
      pathParts: Array.isArray(entry.pathParts) ? [...entry.pathParts] : [],
      enumValues: Array.isArray(entry.enumValues) ? [...entry.enumValues] : [],
      suggestedValues: Array.isArray(entry.suggestedValues) ? [...entry.suggestedValues] : []
    })),
    availableSchemaFields,
    starterSuggestions,
    manualFieldPath: '',
    manualFieldType: 'string',
    officialFieldPath: starterSuggestions[0]?.actualPath || availableSchemaFields[0]?.actualPath || ''
  };
}

function setValueAtPath(root, pathOrParts, value) {
  const parts = Array.isArray(pathOrParts) ? pathOrParts : String(pathOrParts).split('.').filter(Boolean);
  if (parts.length === 0) {
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
  if (parts.length === 0) {
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

function getValueAtPath(root, pathOrParts) {
  const parts = Array.isArray(pathOrParts) ? pathOrParts : String(pathOrParts).split('.').filter(Boolean);
  let cursor = root;

  for (const part of parts) {
    if (!isPlainObject(cursor) || !(part in cursor)) {
      return undefined;
    }

    cursor = cursor[part];
  }

  return cursor;
}

function collectEmptyObjectPaths(value, pathParts = [], acc = []) {
  if (!isPlainObject(value)) {
    return acc;
  }

  const entries = Object.entries(value).filter(([, child]) => child !== undefined && child !== null);
  if (pathParts.length > 0 && entries.length === 0) {
    acc.push([...pathParts]);
  }

  for (const [key, child] of entries) {
    if (isPlainObject(child)) {
      collectEmptyObjectPaths(child, [...pathParts, key], acc);
    }
  }

  return acc;
}

function restoreObjectPaths(root, objectPaths = []) {
  for (const pathParts of objectPaths) {
    if (getValueAtPath(root, pathParts) === undefined) {
      setValueAtPath(root, pathParts, {});
    }
  }
}

function parseSchemaFieldValue(field) {
  const rawValue = field.inputValue;
  if (field.type === 'string') {
    if (rawValue === undefined || rawValue === null) {
      return '';
    }

    return String(rawValue);
  }

  if (field.type === 'null') {
    if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') {
      return undefined;
    }

    return null;
  }

  if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') {
    return undefined;
  }

  if (field.type === 'boolean') {
    if (rawValue === true || rawValue === 'true') {
      return true;
    }
    if (rawValue === false || rawValue === 'false') {
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

export function applySchemaFields(target, fields = []) {
  for (const field of fields) {
    if (!field?.actualPath) {
      continue;
    }

    const parsedValue = parseSchemaFieldValue(field);
    if (parsedValue === undefined) {
      deleteValueAtPath(target, field.actualPath);
      continue;
    }

    setValueAtPath(target, field.actualPath, parsedValue);
  }
}

function formatTomlValue(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => formatTomlValue(entry)).join(', ')}]`;
  }

  if (isPlainObject(value)) {
    const pairs = Object.entries(value)
      .filter(([, entry]) => entry !== undefined && entry !== null)
      .map(([key, entry]) => `${key} = ${formatTomlValue(entry)}`);

    return pairs.length > 0 ? `{ ${pairs.join(', ')} }` : '{}';
  }

  if (typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') {
    return String(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return JSON.stringify(value);
}

function stringifyTomlDocument(value) {
  const rootLines = [];
  const sections = [];

  function walk(node, pathParts = []) {
    const scalars = [];
    const nested = [];

    for (const [key, child] of Object.entries(node || {})) {
      if (child === undefined || child === null) {
        continue;
      }

      if (isPlainObject(child)) {
        nested.push([key, child]);
        continue;
      }

      scalars.push(`${key} = ${formatTomlValue(child)}`);
    }

    if (pathParts.length === 0) {
      rootLines.push(...scalars);
    } else if (scalars.length > 0 || nested.length === 0) {
      sections.push(`[${pathParts.join('.')}]`);
      if (scalars.length > 0) {
        sections.push(...scalars);
      }
      sections.push('');
    }

    for (const [key, nestedChild] of nested) {
      walk(nestedChild, [...pathParts, key]);
    }
  }

  walk(value);

  const content = [...rootLines, ...(rootLines.length > 0 && sections.length > 0 ? [''] : []), ...sections]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return content ? `${content}\n` : '';
}

export function serializeSchemaDrivenDraft(baseConfig = {}, draft, format = 'json') {
  const normalizedBaseConfig = baseConfig && typeof baseConfig === 'object' ? baseConfig : {};
  const output = clone(normalizedBaseConfig);
  const preservedObjectPaths = collectEmptyObjectPaths(normalizedBaseConfig);
  applySchemaFields(output, draft.schemaFields || []);
  restoreObjectPaths(output, preservedObjectPaths);

  return {
    parsed: output,
    content: format === 'toml' ? stringifyTomlDocument(output) : `${JSON.stringify(output, null, 2)}\n`
  };
}

export function formatSchemaSourceLabel(summary = {}) {
  switch (summary.source) {
    case 'network':
      return '官网最新';
    case 'cache':
      return '本地缓存';
    case 'stale-cache':
      return '缓存回退';
    default:
      return '仅本地映射';
  }
}

export function formatSchemaFetchedAt(value) {
  if (!value) {
    return '';
  }

  try {
    return new Date(value).toLocaleString('zh-CN', { hour12: false });
  } catch {
    return value;
  }
}

export function humanizeSchemaGroup(groupKey) {
  const normalized = String(groupKey || '').trim();

  if (normalized === '__root__') {
    return '全局默认';
  }

  if (normalized === 'model_providers') {
    return '模型提供方';
  }

  if (normalized === 'mcp_servers') {
    return 'MCP 服务';
  }

  if (normalized === 'profiles') {
    return '配置档案';
  }

  if (normalized === 'agents') {
    return 'Agent 角色';
  }

  if (normalized === 'permissions') {
    return '权限规则';
  }

  if (normalized === 'default_permissions') {
    return '默认权限';
  }

  if (normalized === 'features') {
    return '功能开关';
  }

  if (normalized === 'tools') {
    return '工具能力';
  }

  if (normalized === 'apps') {
    return 'App 集成';
  }

  if (normalized === 'skills') {
    return 'Skills';
  }

  if (normalized === 'memories') {
    return '记忆设置';
  }

  if (normalized === 'realtime') {
    return '实时能力';
  }

  if (normalized === 'audio') {
    return '音频设置';
  }

  if (normalized === 'projects') {
    return '项目配置';
  }

  if (normalized === 'analytics') {
    return '分析统计';
  }

  if (normalized === 'otel') {
    return '遥测 OTel';
  }

  if (normalized === 'feedback') {
    return '反馈控制';
  }

  if (normalized === 'notice') {
    return '提示展示';
  }

  if (normalized === 'notify') {
    return '通知策略';
  }

  if (normalized === 'history') {
    return '历史持久化';
  }

  if (normalized === 'tui') {
    return '终端界面';
  }

  if (normalized === 'windows') {
    return 'Windows 兼容';
  }

  if (normalized === 'env') {
    return '环境变量';
  }

  if (normalized === 'hooks') {
    return '自动化 Hook';
  }

  return humanizeKey(normalized);
}
