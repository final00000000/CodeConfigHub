import {
  createFieldIds,
  escapeHtml,
  joinAriaIds,
  renderAttributes,
  renderFieldShell,
  renderSelect,
  renderTextInput
} from '../components/form-controls.js';
import {
  createSchemaDraftField,
  findMatchingSchemaEntryByPath,
  formatSchemaFetchedAt,
  formatSchemaSourceLabel,
  humanizeSchemaGroup,
  sortSchemaFields
} from '../services/schema-driven-config.js';

function cloneDraft(draft = {}) {
  return {
    ...draft,
    schemaFields: (draft.schemaFields || []).map((field) => ({
      ...field,
      enumValues: Array.isArray(field.enumValues) ? [...field.enumValues] : field.enumValues,
      suggestedValues: Array.isArray(field.suggestedValues) ? [...field.suggestedValues] : field.suggestedValues
    })),
    availableSchemaFields: (draft.availableSchemaFields || []).map((field) => ({
      ...field,
      enumValues: Array.isArray(field.enumValues) ? [...field.enumValues] : field.enumValues,
      suggestedValues: Array.isArray(field.suggestedValues) ? [...field.suggestedValues] : field.suggestedValues
    })),
    schemaCatalog: (draft.schemaCatalog || []).map((entry) => ({
      ...entry,
      pathParts: Array.isArray(entry.pathParts) ? [...entry.pathParts] : [],
      enumValues: Array.isArray(entry.enumValues) ? [...entry.enumValues] : entry.enumValues,
      suggestedValues: Array.isArray(entry.suggestedValues) ? [...entry.suggestedValues] : entry.suggestedValues
    })),
    starterSuggestions: (draft.starterSuggestions || []).map((field) => ({
      ...field,
      enumValues: Array.isArray(field.enumValues) ? [...field.enumValues] : field.enumValues,
      suggestedValues: Array.isArray(field.suggestedValues) ? [...field.suggestedValues] : field.suggestedValues
    }))
  };
}

function isStructuredPreviewObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

const FIELD_TYPE_OPTIONS = [
  { value: 'string', label: '文本' },
  { value: 'boolean', label: '布尔值' },
  { value: 'integer', label: '整数' },
  { value: 'number', label: '数字' },
  { value: 'array', label: '数组' },
  { value: 'object', label: '对象' },
  { value: 'null', label: 'Null' }
];

const QUICK_FIELD_ORDER = [
  'model',
  'model_provider',
  'model_reasoning_effort',
  'model_context_window',
  'model_auto_compact_token_limit',
  'approval_policy',
  'sandbox_mode',
  'web_search',
  'web_search_mode',
  'permissions.allow',
  'permissions.ask',
  'alwaysThinkingEnabled',
  'fastMode',
  'cleanupPeriodDays'
];

const COMPLEX_SCHEMA_PATH_PRIORITY = [
  'profiles.*.model',
  'profiles.*.model_provider',
  'profiles.*.approval_policy',
  'profiles.*.sandbox_mode',
  'mcp_servers.*.command',
  'mcp_servers.*.url',
  'mcp_servers.*.args',
  'mcp_servers.*.env.*',
  'model_providers.*.base_url',
  'model_providers.*.env_key',
  'model_providers.*.wire_api',
  'model_providers.*.http_headers.*'
];

const QUICK_SECTION_META = {
  execution: {
    label: '模型策略',
    eyebrow: 'Core',
    description: '先处理模型、提供方、上下文窗口和思考策略这些最常改的项。'
  },
  safety: {
    label: '权限与安全',
    eyebrow: 'Safety',
    description: '把审批、沙箱、权限规则集中放一起，减少来回查找。'
  },
  runtime: {
    label: '联网与运行环境',
    eyebrow: 'Runtime',
    description: '联网能力、环境变量和自动化入口放在同一个区块。'
  },
  other: {
    label: '其他常用项',
    eyebrow: 'Other',
    description: '其余高频参数会落在这里，避免混进大列表。'
  }
};

const SCHEMA_GROUP_ORDER = [
  '__root__',
  'profiles',
  'model_providers',
  'mcp_servers',
  'agents',
  'permissions',
  'default_permissions',
  'tools',
  'apps',
  'skills',
  'memories',
  'realtime',
  'audio',
  'projects',
  'analytics',
  'otel',
  'feedback',
  'notice',
  'notify',
  'history',
  'tui',
  'windows',
  'features',
  'env',
  'hooks'
];

const SCHEMA_GROUP_DESCRIPTIONS = {
  __root__: '按官方文档的全局章节拆开查看默认模型、推理限制、审批沙箱、Shell 环境和联网行为。',
  profiles: '按场景管理整套模型、权限和执行策略。',
  model_providers: '这里只放 model_providers.<name>.* 这类提供方实例字段；上下文窗口等顶层限制不归这里。',
  mcp_servers: '按服务管理命令、鉴权、工具范围和环境变量。',
  agents: '对应官方 Agent roles，集中管理 Agent 的并发和执行策略。',
  permissions: '默认审批白名单和提问规则放这里，和审批策略一起看最清晰。',
  default_permissions: '默认权限模板单独归档，避免和运行时实例混在一起。',
  tools: '工具调用能力和默认行为集中放这里。',
  apps: 'App 集成与外部能力入口统一收口。',
  skills: 'Skills 发现、加载和可用性配置放这里。',
  memories: '记忆能力与存储策略集中查看。',
  realtime: '实时会话、流式能力和 WS 行为归到这一组。',
  audio: '音频输入输出和相关模型能力放这里。',
  projects: '项目根识别、项目级覆盖和工作区策略归这一组。',
  analytics: '统计与分析采集配置归档在这里。',
  otel: 'OTel 导出、指标和链路采样归到遥测分组。',
  feedback: '反馈上报和交互反馈控制单独查看更直观。',
  notice: '提示展示策略和引用提示放这里。',
  notify: '系统通知、桌面提醒等通知策略归这里。',
  history: '历史记录持久化与清理策略放这里。',
  tui: '终端 UI、交互行为和显示偏好集中处理。',
  windows: 'Windows / WSL / 沙箱相关兼容项集中管理。',
  features: '功能开关统一归档，便于排查行为差异。',
  env: '当前配置依赖的环境变量都在这一组里。',
  hooks: '自动化触发器和命令入口放在这里。'
};

const ROOT_SECTION_ORDER = [
  'profiles',
  'model_access',
  'model_reasoning',
  'approval_sandbox',
  'web_search',
  'shell_environment',
  'runtime_tools',
  'mcp_oauth',
  'project_instructions',
  'observability',
  'interface_history',
  'feature_flags',
  'other'
];

const ROOT_FIELD_ORDER = [
  'profile',
  'model',
  'model_provider',
  'review_model',
  'service_tier',
  'openai_base_url',
  'chatgpt_base_url',
  'oss_provider',
  'cli_auth_credentials_store',
  'forced_login_method',
  'forced_chatgpt_workspace_id',
  'model_catalog_json',
  'model_reasoning_effort',
  'plan_mode_reasoning_effort',
  'model_reasoning_summary',
  'model_supports_reasoning_summaries',
  'model_verbosity',
  'model_context_window',
  'model_auto_compact_token_limit',
  'tool_output_token_limit',
  'compact_prompt',
  'experimental_compact_prompt_file',
  'personality',
  'approval_policy',
  'approvals_reviewer',
  'sandbox_mode',
  'sandbox_workspace_write',
  'allow_login_shell',
  'permissions',
  'default_permissions',
  'windows',
  'windows_wsl_setup_acknowledged',
  'web_search',
  'web_search_mode',
  'shell_environment_policy',
  'background_terminal_max_timeout',
  'js_repl_node_path',
  'js_repl_node_module_dirs',
  'zsh_path',
  'sqlite_home',
  'agents',
  'tools',
  'apps',
  'skills',
  'memories',
  'realtime',
  'audio',
  'mcp_oauth_callback_port',
  'mcp_oauth_callback_url',
  'mcp_oauth_credentials_store',
  'instructions',
  'developer_instructions',
  'model_instructions_file',
  'project_root_markers',
  'project_doc_fallback_filenames',
  'project_doc_max_bytes',
  'analytics',
  'otel',
  'log_dir',
  'feedback',
  'ghost_snapshot',
  'hide_agent_reasoning',
  'show_raw_agent_reasoning',
  'notify',
  'notice',
  'history',
  'tui',
  'file_opener',
  'check_for_update_on_startup',
  'disable_paste_burst',
  'tool_suggest',
  'commit_attribution',
  'features',
  'experimental_realtime_start_instructions',
  'experimental_realtime_ws_backend_prompt',
  'experimental_realtime_ws_base_url',
  'experimental_realtime_ws_model',
  'experimental_realtime_ws_startup_context',
  'experimental_use_freeform_apply_patch',
  'experimental_use_unified_exec_tool',
  'suppress_unstable_features_warning'
];

const ROOT_SECTION_META = {
  profiles: {
    label: '档案入口',
    metaLabel: 'Profiles',
    description: '对应官方 Profiles；这里只放当前启用的 profile，具体档案定义继续在“配置档案”分组里编辑。'
  },
  model_access: {
    label: '模型与接入',
    metaLabel: 'Default model',
    description: '对应官方默认模型和 provider 相关章节；模型、默认提供方、登录方式与 API 端点集中放一起。'
  },
  model_reasoning: {
    label: '推理与限制',
    metaLabel: 'Model reasoning & limits',
    description: '对应官方 Model reasoning, verbosity, and limits；上下文窗口、verbosity、推理摘要和压缩阈值统一归到这里。'
  },
  approval_sandbox: {
    label: '审批与沙箱',
    metaLabel: 'Approval & sandbox',
    description: '对应官方 Approval policies and sandbox modes；审批策略、沙箱能力和默认权限都在这一栏。'
  },
  web_search: {
    label: '联网搜索',
    metaLabel: 'Web search',
    description: '对应官方常用配置里的 Web search；联网开关和搜索模式单独成栏，避免混进模型区。'
  },
  shell_environment: {
    label: 'Shell 环境',
    metaLabel: 'Shell environment',
    description: '对应官方 Shell environment policy；Shell 注入策略、终端超时和 REPL 路径集中查看。'
  },
  runtime_tools: {
    label: '运行能力',
    metaLabel: 'Agent roles / runtime',
    description: '把 Agent roles、tools、apps、skills、realtime 和 memories 这些运行能力放在同一个章节里。'
  },
  mcp_oauth: {
    label: 'MCP 回调',
    metaLabel: 'MCP servers',
    description: '对应官方 MCP servers 的全局 OAuth 回调设置；真正的服务实例继续在“MCP 服务”分组里维护。'
  },
  project_instructions: {
    label: '项目发现',
    metaLabel: 'Project discovery',
    description: '对应官方 Project root detection 和 Project instructions discovery；项目根识别、说明文件和补充指令都放这里。'
  },
  observability: {
    label: '遥测与反馈',
    metaLabel: 'Observability',
    description: '对应官方 Observability and telemetry 以及反馈控制；日志目录、OTel、反馈和推理可见性归到这一组。'
  },
  interface_history: {
    label: '通知与界面',
    metaLabel: 'Notifications / TUI',
    description: '对应官方 Notifications、History persistence、Clickable citations 和 TUI options；通知、历史、引用跳转和终端体验统一整理。'
  },
  feature_flags: {
    label: '功能开关',
    metaLabel: 'Feature flags',
    description: '对应官方 Feature flags；实验项和不稳定开关单独收口，避免混进常规配置。'
  },
  other: {
    label: '其他顶层项',
    metaLabel: 'Other',
    description: '暂时无法稳定归类的顶层字段先放这里，避免误归到错误章节。'
  }
};

function normalizeDraftFieldPath(value = '') {
  return String(value || '')
    .trim()
    .replace(/[\\/]+/g, '.')
    .replace(/\s+/g, '')
    .replace(/\.+/g, '.')
    .replace(/^\.+|\.+$/g, '');
}

function getManualFieldPath(draft = {}) {
  return normalizeDraftFieldPath(draft.manualFieldPath || draft.officialFieldPath || '');
}

function getManualFieldType(draft = {}) {
  return draft.manualFieldType || 'string';
}

function setDraftFieldInputs(draft = {}, updates = {}) {
  return {
    ...draft,
    manualFieldPath: Object.prototype.hasOwnProperty.call(updates, 'manualFieldPath')
      ? normalizeDraftFieldPath(updates.manualFieldPath || '')
      : getManualFieldPath(draft),
    manualFieldType: Object.prototype.hasOwnProperty.call(updates, 'manualFieldType')
      ? (updates.manualFieldType || 'string')
      : getManualFieldType(draft),
    officialFieldPath: Object.prototype.hasOwnProperty.call(updates, 'officialFieldPath')
      ? normalizeDraftFieldPath(updates.officialFieldPath || '')
      : normalizeDraftFieldPath(draft.officialFieldPath || '')
  };
}

function createNextDraftWithField(currentDraft, nextField) {
  return setDraftFieldInputs({
    ...currentDraft,
    schemaFields: sortSchemaFields([
      ...(currentDraft.schemaFields || []).filter((field) => field.actualPath !== nextField.actualPath),
      nextField
    ]),
    availableSchemaFields: (currentDraft.availableSchemaFields || [])
      .filter((field) => field.actualPath !== nextField.actualPath),
    starterSuggestions: (currentDraft.starterSuggestions || [])
      .filter((field) => field.actualPath !== nextField.actualPath)
  }, {
    manualFieldPath: '',
    officialFieldPath: nextField.actualPath,
    manualFieldType: nextField.type || getManualFieldType(currentDraft)
  });
}

function createNextDraftWithFields(currentDraft, nextFields = []) {
  const dedupedFields = Array.isArray(nextFields) ? nextFields.filter((field) => field?.actualPath) : [];
  if (dedupedFields.length === 0) {
    return currentDraft;
  }

  const nextFieldPathSet = new Set(dedupedFields.map((field) => field.actualPath));
  return setDraftFieldInputs({
    ...currentDraft,
    schemaFields: sortSchemaFields([
      ...(currentDraft.schemaFields || []).filter((field) => !nextFieldPathSet.has(field.actualPath)),
      ...dedupedFields
    ]),
    availableSchemaFields: (currentDraft.availableSchemaFields || [])
      .filter((field) => !nextFieldPathSet.has(field.actualPath)),
    starterSuggestions: (currentDraft.starterSuggestions || [])
      .filter((field) => !nextFieldPathSet.has(field.actualPath))
  }, {
    manualFieldPath: '',
    officialFieldPath: dedupedFields[0]?.actualPath || '',
    manualFieldType: dedupedFields[0]?.type || getManualFieldType(currentDraft)
  });
}

function normalizeTemplateItemName(value = '', fallback = '') {
  const normalized = String(value || '')
    .trim()
    .replace(/[\\/.\s]+/g, '_')
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  return normalized || fallback;
}

const COMPLEX_FIELD_TEMPLATES = [
  {
    key: 'mcp-server',
    label: 'MCP 服务',
    description: '直接生成一个服务的 command / args / env。',
    requiresName: true,
    suggestedName: 'my_server',
    namePlaceholder: '例如 my_server',
    createSpecs: ({ itemName }) => ([
      { path: `mcp_servers.${itemName}.command`, type: 'string', inputValue: '' },
      { path: `mcp_servers.${itemName}.args`, type: 'array', inputValue: '[]' },
      { path: `mcp_servers.${itemName}.env`, type: 'object', inputValue: '{}' }
    ]),
    getFocusPath: ({ itemName }) => `mcp_servers.${itemName}.command`,
    getActiveSectionKey: ({ itemName }) => itemName
  },
  {
    key: 'profile',
    label: '配置档案',
    description: '生成一个 profile 常用字段。',
    requiresName: true,
    suggestedName: 'my_profile',
    namePlaceholder: '例如 my_profile',
    createSpecs: ({ itemName }) => ([
      { path: `profiles.${itemName}.model`, type: 'string', inputValue: '' },
      { path: `profiles.${itemName}.model_provider`, type: 'string', inputValue: '' },
      { path: `profiles.${itemName}.approval_policy`, type: 'string', inputValue: '' },
      { path: `profiles.${itemName}.sandbox_mode`, type: 'string', inputValue: '' }
    ]),
    getFocusPath: ({ itemName }) => `profiles.${itemName}.model`,
    getActiveSectionKey: ({ itemName }) => itemName
  },
  {
    key: 'model-provider',
    label: '模型提供方',
    description: '生成一个模型提供方的常用字段。',
    requiresName: true,
    suggestedName: 'my_provider',
    namePlaceholder: '例如 my_provider',
    createSpecs: ({ itemName }) => ([
      { path: `model_providers.${itemName}.base_url`, type: 'string', inputValue: '' },
      { path: `model_providers.${itemName}.env_key`, type: 'string', inputValue: '' },
      { path: `model_providers.${itemName}.wire_api`, type: 'string', inputValue: '' },
      { path: `model_providers.${itemName}.http_headers`, type: 'object', inputValue: '{}' }
    ]),
    getFocusPath: ({ itemName }) => `model_providers.${itemName}.base_url`,
    getActiveSectionKey: ({ itemName }) => itemName
  },
  {
    key: 'agents',
    label: 'Agent 设置',
    description: '生成 agents 常用的复杂配置。',
    requiresName: false,
    suggestedName: '',
    namePlaceholder: '',
    createSpecs: () => ([
      { path: 'agents.max_threads', type: 'integer', inputValue: '' },
      { path: 'agents.max_depth', type: 'integer', inputValue: '' }
    ]),
    getFocusPath: () => 'agents.max_threads',
    getActiveSectionKey: () => ''
  }
];

function getComplexSchemaPathPriority(path = '') {
  const index = COMPLEX_SCHEMA_PATH_PRIORITY.indexOf(path);
  return index === -1 ? Number.POSITIVE_INFINITY : index;
}

function getDefaultSchemaTemplateName(schemaEntry = {}) {
  const rootKey = Array.isArray(schemaEntry.pathParts) ? schemaEntry.pathParts[0] : '';

  switch (rootKey) {
    case 'mcp_servers':
      return 'my_server';
    case 'profiles':
      return 'my_profile';
    case 'model_providers':
      return 'my_provider';
    case 'hooks':
      return 'my_hook';
    default:
      return 'item';
  }
}

function getSchemaWildcardExampleValue(pathParts = [], index = 0, itemName = 'item') {
  const parentKey = pathParts[index - 1] || '';

  if (parentKey === 'env') {
    return 'ENV_KEY';
  }

  if (parentKey === 'headers' || parentKey === 'http_headers') {
    return 'HEADER_KEY';
  }

  return itemName;
}

function instantiateSchemaSuggestionPath(schemaEntry = {}, templateName = '') {
  const pathParts = Array.isArray(schemaEntry.pathParts)
    ? schemaEntry.pathParts.filter(Boolean)
    : String(schemaEntry.path || '').split('.').filter(Boolean);

  if (pathParts.length === 0) {
    return '';
  }

  const itemName = normalizeTemplateItemName(templateName || '', getDefaultSchemaTemplateName(schemaEntry));
  let hasAssignedObjectName = false;

  return pathParts.map((part, index) => {
    if (part !== '*') {
      return part;
    }

    const parentKey = pathParts[index - 1] || '';
    const isMapKey = parentKey === 'env' || parentKey === 'headers' || parentKey === 'http_headers';

    if (!hasAssignedObjectName && !isMapKey) {
      hasAssignedObjectName = true;
      return itemName;
    }

    return getSchemaWildcardExampleValue(pathParts, index, itemName);
  }).join('.');
}

function findDraftSchemaEntryByPath(draft = {}, fieldPath = '') {
  const normalizedPath = normalizeDraftFieldPath(fieldPath);
  if (!normalizedPath) {
    return null;
  }

  return findMatchingSchemaEntryByPath(normalizedPath, draft.schemaCatalog || [])
    || (draft.availableSchemaFields || []).find((field) => field.actualPath === normalizedPath)
    || null;
}

function buildSchemaAddPathSuggestions(draft = {}, templateName = '') {
  const suggestionOptions = [];
  const seenValues = new Set();
  const existingFieldPaths = new Set((draft.schemaFields || []).map((field) => field.actualPath));

  const pushSuggestion = (value, label = '') => {
    const normalizedValue = normalizeDraftFieldPath(value);
    if (!normalizedValue || seenValues.has(normalizedValue) || existingFieldPaths.has(normalizedValue)) {
      return;
    }

    seenValues.add(normalizedValue);
    suggestionOptions.push(label ? { value: normalizedValue, label } : { value: normalizedValue });
  };

  (draft.availableSchemaFields || []).slice(0, 72).forEach((field) => {
    pushSuggestion(field.actualPath, `${field.title || field.actualPath} · 官方字段`);
  });

  (draft.schemaCatalog || [])
    .filter((entry) => String(entry.path || '').includes('*'))
    .sort((left, right) => {
      const priorityDiff = getComplexSchemaPathPriority(left.path) - getComplexSchemaPathPriority(right.path);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      return String(left.path || '').localeCompare(String(right.path || ''), 'en');
    })
    .slice(0, 24)
    .forEach((entry) => {
      const examplePath = instantiateSchemaSuggestionPath(entry, templateName);
      pushSuggestion(examplePath, `${entry.path} · Schema 复杂路径`);
    });

  return suggestionOptions.slice(0, 120);
}

function createGroupAnchorId(groupKey, position) {
  const normalized = String(groupKey || '__root__')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `schema-group-${normalized || 'root'}-${position}`;
}

function summarizeGroup(group) {
  const totalCount = group.fields.length;
  const officialCount = group.fields.filter(({ field }) => field.isOfficial).length;
  const structuredCount = group.fields.filter(({ field }) => field.type === 'array' || field.type === 'object').length;

  return {
    totalCount,
    officialCount,
    localCount: totalCount - officialCount,
    structuredCount
  };
}

function getDefaultOpenGroupKeys(groups = []) {
  const totalFieldCount = groups.reduce((sum, group) => sum + group.fields.length, 0);

  if (groups.length <= 3 || totalFieldCount <= 12) {
    return groups.map((group) => group.key);
  }

  const defaults = groups
    .filter((group, index) => index < 2 || group.fields.length <= 3)
    .map((group) => group.key);

  return defaults.length > 0 ? defaults : groups.slice(0, 1).map((group) => group.key);
}

function createClusterStateKey(groupKey = '', collectionKey = '') {
  return `${String(groupKey || '__root__')}::${String(collectionKey || '__default__')}`;
}

function getDefaultOpenClusterKeys(groups = []) {
  const keys = [];

  groups.forEach((group) => {
    const layout = createGroupFieldLayout(group);
    if (!layout.shouldNest) {
      return;
    }

    if (layout.directFields.length > 0) {
      keys.push(createClusterStateKey(group.key, '__direct__'));
    }

    layout.nestedGroups.forEach((nestedGroup, index) => {
      if (layout.nestedGroups.length <= 2 || index === 0 || nestedGroup.fields.length <= 3) {
        keys.push(createClusterStateKey(group.key, nestedGroup.key));
      }
    });
  });

  return keys;
}

function getAvailableClusterStateKeys(groups = []) {
  const keys = [];

  groups.forEach((group) => {
    const layout = createGroupFieldLayout(group);
    if (!layout.shouldNest) {
      return;
    }

    if (layout.directFields.length > 0) {
      keys.push(createClusterStateKey(group.key, '__direct__'));
    }

    layout.nestedGroups.forEach((nestedGroup) => {
      keys.push(createClusterStateKey(group.key, nestedGroup.key));
    });
  });

  return keys;
}

function getOrderedClusterStateKeysForGroup(group = {}) {
  const layout = createGroupFieldLayout(group);
  if (!layout.shouldNest) {
    return [];
  }

  return [
    ...(layout.directFields.length > 0 ? [createClusterStateKey(group.key, '__direct__')] : []),
    ...layout.nestedGroups.map((nestedGroup) => createClusterStateKey(group.key, nestedGroup.key))
  ];
}

function normalizeAccordionGroupKeys(groups = [], openKeys = []) {
  const availableKeys = groups
    .map((group) => group.key)
    .filter(Boolean);

  if (availableKeys.length === 0) {
    return [];
  }

  const preferredKey = (openKeys || []).find((key) => availableKeys.includes(key));
  return preferredKey ? [preferredKey] : availableKeys.slice(0, 1);
}

function normalizeAccordionClusterKeys(groups = [], openClusterKeys = []) {
  const preferredSet = new Set((openClusterKeys || []).filter(Boolean));

  return groups.flatMap((group) => {
    const orderedKeys = getOrderedClusterStateKeysForGroup(group);
    if (orderedKeys.length === 0) {
      return [];
    }

    const matchedKey = orderedKeys.find((key) => preferredSet.has(key));
    return matchedKey ? [matchedKey] : [];
  });
}

function readSchemaUiState(container, entryId) {
  if (!container.dataset.schemaDrivenUiState) {
    return null;
  }

  try {
    const parsed = JSON.parse(container.dataset.schemaDrivenUiState);
    return parsed?.entryId === entryId ? parsed : null;
  } catch {
    return null;
  }
}

function writeSchemaUiState(container, entryId, state) {
  container.dataset.schemaDrivenUiState = JSON.stringify({
    entryId,
    openKeys: Array.isArray(state?.openKeys) ? state.openKeys.filter(Boolean) : [],
    openClusterKeys: Array.isArray(state?.openClusterKeys) ? state.openClusterKeys.filter(Boolean) : [],
    openStructuredKeys: Array.isArray(state?.openStructuredKeys) ? state.openStructuredKeys.filter(Boolean) : [],
    openRawJsonKeys: Array.isArray(state?.openRawJsonKeys) ? state.openRawJsonKeys.filter(Boolean) : [],
    activeGroupKey: state?.activeGroupKey || '',
    activeSectionKey: state?.activeSectionKey || '',
    activeTab: state?.activeTab || 'quick',
    searchQuery: state?.searchQuery || '',
    manualFieldPath: normalizeDraftFieldPath(state?.manualFieldPath || ''),
    manualFieldType: state?.manualFieldType || 'string',
    templateFieldName: normalizeTemplateItemName(state?.templateFieldName || ''),
    officialFieldPath: normalizeDraftFieldPath(state?.officialFieldPath || '')
  });
}

function normalizeFieldSearchQuery(value = '') {
  return String(value || '').trim().toLocaleLowerCase();
}

function getQuickFieldRank(fieldPath = '') {
  const normalizedPath = String(fieldPath || '');
  const exactIndex = QUICK_FIELD_ORDER.indexOf(normalizedPath);

  if (exactIndex !== -1) {
    return exactIndex;
  }

  if (normalizedPath.startsWith('env.')) {
    return QUICK_FIELD_ORDER.length + 1;
  }

  if (normalizedPath.startsWith('hooks.')) {
    return QUICK_FIELD_ORDER.length + 2;
  }

  return Number.POSITIVE_INFINITY;
}

function getQuickFieldItems(fields = []) {
  const mappedFields = fields.map((field, index) => ({ field, index }));
  const prioritized = mappedFields
    .filter(({ field }) => Number.isFinite(getQuickFieldRank(field.actualPath)))
    .sort((left, right) => {
      const rankDiff = getQuickFieldRank(left.field.actualPath) - getQuickFieldRank(right.field.actualPath);
      if (rankDiff !== 0) {
        return rankDiff;
      }

      return String(left.field.actualPath).localeCompare(String(right.field.actualPath), 'en');
    });

  if (prioritized.length >= 6) {
    return prioritized.slice(0, 6);
  }

  const seenPaths = new Set(prioritized.map(({ field }) => field.actualPath));
  const fallback = mappedFields
    .filter(({ field }) => !seenPaths.has(field.actualPath))
    .slice(0, Math.max(0, 6 - prioritized.length));

  return [...prioritized, ...fallback];
}

function getQuickSectionKey(fieldPath = '') {
  const normalizedPath = String(fieldPath || '');

  if (
    [
      'model',
      'model_provider',
      'model_reasoning_effort',
      'model_context_window',
      'model_auto_compact_token_limit',
      'alwaysThinkingEnabled',
      'fastMode',
      'cleanupPeriodDays'
    ].includes(normalizedPath)
  ) {
    return 'execution';
  }

  if (
    [
      'approval_policy',
      'sandbox_mode',
      'permissions.allow',
      'permissions.ask'
    ].includes(normalizedPath)
  ) {
    return 'safety';
  }

  if (
    [
      'web_search',
      'web_search_mode'
    ].includes(normalizedPath) ||
    normalizedPath.startsWith('env.') ||
    normalizedPath.startsWith('hooks.')
  ) {
    return 'runtime';
  }

  return 'other';
}

function buildQuickSections(quickFieldItems = []) {
  const sectionOrder = ['execution', 'safety', 'runtime', 'other'];
  const grouped = new Map(sectionOrder.map((key) => [key, []]));

  quickFieldItems.forEach((item) => {
    const key = getQuickSectionKey(item.field.actualPath);
    grouped.get(key)?.push(item);
  });

  return sectionOrder
    .map((key) => ({
      key,
      ...QUICK_SECTION_META[key],
      items: grouped.get(key) || []
    }))
    .filter((section) => section.items.length > 0);
}

function createSchemaTabId(groupKey = '') {
  return groupKey ? `group:${groupKey}` : 'all';
}

function buildSchemaTabs(groups = [], quickFieldItems = []) {
  const totalFieldCount = groups.reduce((sum, group) => sum + group.fields.length, 0);

  return [
    {
      id: 'quick',
      label: 'Quick',
      count: quickFieldItems.length
    },
    {
      id: 'all',
      label: 'All',
      count: totalFieldCount
    },
    ...groups.map((group) => ({
      id: createSchemaTabId(group.key),
      label: getSchemaTopTabLabel(group.key),
      count: group.fields.length
    }))
  ];
}

function getDefaultSchemaTabId(tabs = []) {
  return tabs[0]?.id || 'quick';
}

function filterGroupsByTab(groups = [], activeTab = 'quick') {
  if (!activeTab || activeTab === 'all' || activeTab === 'quick') {
    return groups;
  }

  const groupKey = activeTab.startsWith('group:') ? activeTab.slice('group:'.length) : '';
  return groups.filter((group) => group.key === groupKey);
}

function findTabIdForFieldPath(fieldPath = '', groups = []) {
  const normalizedPath = normalizeDraftFieldPath(fieldPath);
  if (!normalizedPath) {
    return 'all';
  }

  const groupKey = normalizedPath.includes('.')
    ? normalizedPath.split('.')[0]
    : '__root__';

  return groups.some((group) => group.key === groupKey)
    ? createSchemaTabId(groupKey)
    : 'all';
}

function getFieldSearchText(field = {}) {
  return [
    field.title,
    field.actualPath,
    field.schemaPath,
    field.description,
    field.groupKey,
    field.type
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase();
}

function filterGroups(groups = [], searchQuery = '') {
  const normalizedQuery = normalizeFieldSearchQuery(searchQuery);
  const totalFieldCount = groups.reduce((sum, group) => sum + group.fields.length, 0);

  if (!normalizedQuery) {
    return {
      groups,
      visibleFieldCount: totalFieldCount,
      totalFieldCount
    };
  }

  const filteredGroups = groups
    .map((group) => ({
      ...group,
      fields: group.fields.filter(({ field }) => getFieldSearchText(field).includes(normalizedQuery))
    }))
    .filter((group) => group.fields.length > 0);

  return {
    groups: filteredGroups,
    visibleFieldCount: filteredGroups.reduce((sum, group) => sum + group.fields.length, 0),
    totalFieldCount
  };
}

function renderSchemaToolbar({
  tone,
  searchQuery,
  visibleFieldCount,
  totalFieldCount
}) {
  const hasSearch = Boolean(searchQuery);

  return `
    <section class="field-search-bar field-search-bar--${tone}" aria-label="Schema 字段筛选">
      <span class="field-search-bar__shell">
        <input
          class="text-input field-search-bar__input"
          type="search"
          name="schema-toolbar-search"
          value="${escapeHtml(searchQuery)}"
          placeholder="筛选字段…"
          spellcheck="false"
          autocomplete="off"
        />
        ${hasSearch ? '<button class="mini-button field-search-bar__action" type="button" data-action="clear-schema-search">清空</button>' : ''}
      </span>
      <span class="field-search-bar__count">${visibleFieldCount}/${totalFieldCount}</span>
    </section>
  `;
}

function renderSchemaTabs(tabs = [], activeTab = 'quick', tone = 'codex') {
  return `
    <div class="schema-tabs schema-tabs--${tone}" role="tablist" aria-label="字段分类导航">
      ${tabs.map((tab) => `
        <button
          class="schema-tab ${tab.id === activeTab ? 'is-active' : ''}"
          type="button"
          role="tab"
          aria-selected="${tab.id === activeTab ? 'true' : 'false'}"
          data-action="switch-schema-tab"
          data-tab-id="${escapeHtml(tab.id)}"
        >
          <span class="schema-tab__label">${escapeHtml(tab.label)}</span>
          <span class="schema-tab__count">${tab.count}</span>
        </button>
      `).join('')}
    </div>
  `;
}

function renderCategoryBanner({ activeTab = 'all', tabs = [], visibleGroups = [], tone = 'codex' } = {}) {
  const activeTabMeta = tabs.find((tab) => tab.id === activeTab);
  if (!activeTabMeta || activeTab === 'quick') {
    return '';
  }

  const description = activeTab === 'all'
    ? '当前按完整分类浏览。适合做全局检查，但信息会更多。'
    : '当前只看这一类，干扰更少，适合专注修改。';

  return `
    <section class="category-banner category-banner--${tone}" aria-label="当前分类提示">
      <div class="category-banner__copy">
        <p class="category-banner__eyebrow">当前分类</p>
        <h3>${escapeHtml(activeTabMeta.label)}</h3>
        <p>${escapeHtml(description)}</p>
      </div>
      <div class="category-banner__meta">
        <span class="category-banner__pill">${visibleGroups.length} 组</span>
        <span class="category-banner__pill">${activeTabMeta.count} 项</span>
      </div>
    </section>
  `;
}

function renderSearchResultsBanner({
  searchQuery = '',
  visibleGroups = [],
  visibleFieldCount = 0,
  totalFieldCount = 0,
  tone = 'codex'
} = {}) {
  return `
    <section class="search-results-banner search-results-banner--${tone}" role="status" aria-live="polite">
      <div class="search-results-banner__copy">
        <strong>搜索结果</strong>
        <span>已在全部分类中匹配 “${escapeHtml(searchQuery)}”。</span>
      </div>
      <div class="search-results-banner__meta">
        <span class="search-results-banner__pill">${visibleGroups.length} 组</span>
        <span class="search-results-banner__pill">${visibleFieldCount}/${totalFieldCount} 项</span>
      </div>
    </section>
  `;
}

function renderGroupOutline({
  visibleGroups = [],
  activeGroupKey = '',
  tone = 'codex',
  searchQuery = ''
} = {}) {
  if (!Array.isArray(visibleGroups) || visibleGroups.length <= (searchQuery ? 1 : 3)) {
    return '';
  }

  const eyebrow = searchQuery ? '命中分组' : '本页分组';
  const description = searchQuery
    ? '先跳到命中的组，再看展开详情。'
    : '同层默认单开；如果这一层还很多，可以先跳到目标分组。';

  return `
    <section class="group-outline group-outline--${tone}" aria-label="分组导航">
      <div class="group-outline__header">
        <div class="group-outline__copy">
          <p class="group-outline__eyebrow">${eyebrow}</p>
          <h3>组内快速定位</h3>
          <p>${description}</p>
        </div>
        <span class="group-outline__summary">${visibleGroups.length} 组 · 单开</span>
      </div>
      <div class="group-outline__chips" role="navigation" aria-label="跳转到分组">
        ${visibleGroups.map((group, index) => `
          <button
            class="group-outline-chip ${group.key === activeGroupKey ? 'is-active' : ''}"
            type="button"
            data-action="jump-schema-group"
            data-group-key="${escapeHtml(group.key)}"
            data-group-anchor-id="${escapeHtml(createGroupAnchorId(group.key, index))}"
            aria-pressed="${group.key === activeGroupKey ? 'true' : 'false'}"
          >
            <span class="group-outline-chip__title">${escapeHtml(group.title)}</span>
            <span class="group-outline-chip__count">${group.fields.length}</span>
          </button>
        `).join('')}
      </div>
    </section>
  `;
}

function renderSchemaStage({
  outlineHtml = '',
  contentHtml = ''
} = {}) {
  if (!outlineHtml) {
    return contentHtml;
  }

  return `
    <div class="schema-stage schema-stage--detailed">
      <aside class="schema-stage__rail">
        ${outlineHtml}
      </aside>
      <section class="schema-stage__content">
        ${contentHtml}
      </section>
    </div>
  `;
}

function renderEditorToolbar({
  entry,
  tone = 'codex',
  summary = {},
  statusTone = 'is-muted',
  activeTab = 'quick',
  tabs = [],
  searchQuery = '',
  visibleFieldCount = 0,
  totalFieldCount = 0,
  onRefreshOfficialSchema,
  isRefreshingOfficialSchema = false
} = {}) {
  const activeTabMeta = tabs.find((tab) => tab.id === activeTab);
  const assistantTitle = tone === 'claude' ? 'Claude 可视化配置' : 'Codex 可视化配置';
  const pathLabel = entry.compactPath || entry.path || '';
  const helperCopy = searchQuery
    ? `正在全局搜索字段，当前命中 ${visibleFieldCount} 项。`
    : activeTab === 'quick'
      ? '优先显示高频配置项，适合快速修改。'
      : `当前聚焦 ${activeTabMeta?.label || '当前分类'}，减少无关干扰。`;

  return `
    <header class="editor-toolbar editor-toolbar--${tone}" role="banner">
      <div class="editor-toolbar__brand">
        <div class="editor-toolbar__brand-main">
          <div class="editor-toolbar__title-row">
            <h2>${escapeHtml(entry.navTitle || entry.label)}</h2>
          </div>
          <div class="editor-toolbar__meta">
            <span class="editor-badge editor-badge--${tone}">${entry.exists ? '当前对象' : '待创建'}</span>
            <span class="status-pill ${statusTone}">${escapeHtml(formatSchemaSourceLabel(summary))}</span>
            ${summary.fetchedAt ? `<span class="editor-toolbar__meta-note">同步 ${escapeHtml(formatSchemaFetchedAt(summary.fetchedAt))}</span>` : ''}
          </div>
          ${pathLabel ? `
            <div class="editor-toolbar__path-row">
              <span class="editor-toolbar__path-label">文件</span>
              <code class="editor-toolbar__path" title="${escapeHtml(entry.path || pathLabel)}">${escapeHtml(pathLabel)}</code>
            </div>
          ` : ''}
        </div>
      </div>

      <div class="editor-toolbar__search-panel">
        <div class="editor-toolbar__search">
          <input
            id="schema-toolbar-search-input"
            class="text-input editor-toolbar__search-input"
            type="search"
            name="schema-toolbar-search"
            value="${escapeHtml(searchQuery)}"
            placeholder="按字段名或路径查找…"
            spellcheck="false"
            autocomplete="off"
            aria-label="搜索字段"
          />
          <span class="editor-toolbar__count" aria-live="polite">${visibleFieldCount}/${totalFieldCount}</span>
          ${searchQuery ? '<button class="mini-button editor-toolbar__search-clear" type="button" data-action="clear-schema-search">清空</button>' : ''}
        </div>
      </div>

      <div class="editor-toolbar__actions">
        ${onRefreshOfficialSchema ? `<button class="ghost-button${isRefreshingOfficialSchema ? ' is-loading' : ''}" type="button" data-action="refresh-official-schema" ${isRefreshingOfficialSchema ? 'disabled' : ''} aria-label="刷新官方 Schema">${isRefreshingOfficialSchema ? '刷新中…' : '刷新 Schema'}</button>` : ''}
        <button class="primary-button editor-toolbar__primary" type="button" data-action="open-add-field-modal" aria-label="新建字段">
          <span aria-hidden="true">+</span> 新建字段
        </button>
      </div>
    </header>
  `;
}

function renderSchemaQuickPanel({
  quickSections = [],
  suggestionFields = [],
  groups = [],
  tone = 'codex',
  openStructuredFieldKeySet = new Set()
} = {}) {
  const totalFieldCount = groups.reduce((sum, group) => sum + group.fields.length, 0);
  const officialFieldCount = groups.reduce(
    (sum, group) => sum + group.fields.filter(({ field }) => field.isOfficial).length,
    0
  );
  const customFieldCount = Math.max(0, totalFieldCount - officialFieldCount);

  return `
    <section class="quick-panel quick-panel--${tone}" aria-label="常用字段">
      <div class="quick-panel__hero">
        <div class="quick-panel__intro">
          <p class="quick-panel__eyebrow">快速聚焦</p>
          <h3>先改最常动的字段，再展开完整结构。</h3>
          <p>把模型、权限、联网这些高频参数收拢在同一块工作面里，适合做一次快速巡检。</p>
        </div>
        <div class="quick-panel__stats" aria-label="字段概览">
          <div class="quick-stat">
            <strong>${totalFieldCount}</strong>
            <span>当前字段</span>
          </div>
          <div class="quick-stat">
            <strong>${officialFieldCount}</strong>
            <span>带说明</span>
          </div>
          <div class="quick-stat">
            <strong>${customFieldCount}</strong>
            <span>自定义</span>
          </div>
        </div>
      </div>

      ${quickSections.length > 0 ? `
        <div class="quick-section-grid">
          ${quickSections.map((section) => `
            <section class="quick-section-card quick-section-card--${tone} quick-section-card--${section.key}">
              <div class="quick-section-card__header">
                <div>
                  <p class="quick-section-card__eyebrow">${escapeHtml(section.eyebrow)}</p>
                  <h4>${escapeHtml(section.label)}</h4>
                  <p>${escapeHtml(section.description)}</p>
                </div>
                <span class="quick-section-card__count">${section.items.length} 项</span>
              </div>
              <div class="quick-section-card__fields">
                ${section.items.map(({ field, index }) => renderField(field, index, {
      compact: true,
      openStructuredFieldKeySet
    })).join('')}
              </div>
            </section>
          `).join('')}
        </div>
      ` : `
        <div class="quick-panel__empty">
          当前还没有可直接修改的字段。可以先添加一个常用参数，或者切到具体分类里补充。
        </div>
      `}

      ${(suggestionFields || []).length > 0 ? `
        <section class="quick-panel__section quick-panel__section-card">
          <div class="quick-panel__section-header">
            <div>
              <h4>快速补充</h4>
              <p>缺什么就补什么，不用先翻完整长表单。</p>
            </div>
          </div>
          <div class="quick-panel__chips">
            ${suggestionFields.map((field) => `
              <button
                class="mini-button"
                type="button"
                data-action="add-schema-suggestion"
                data-field-path="${escapeHtml(field.actualPath)}"
                title="${escapeHtml(field.actualPath)}"
              >${escapeHtml(field.title)}</button>
            `).join('')}
          </div>
        </section>
      ` : ''}

      ${groups.length > 0 ? `
        <section class="quick-panel__section quick-panel__section-card">
          <div class="quick-panel__section-header">
            <div>
              <h4>按分类继续</h4>
              <p>不必一直往下翻，直接跳到你要改的那一组。</p>
            </div>
          </div>
          <div class="quick-panel__browse">
            ${groups.map((group) => `
              <button
                class="schema-link-tile"
                type="button"
                data-action="switch-schema-tab"
                data-tab-id="${escapeHtml(createSchemaTabId(group.key))}"
              >
                <span class="schema-link-tile__title">${escapeHtml(group.title)}</span>
                <span class="schema-link-tile__meta">${group.fields.length} 项</span>
              </button>
            `).join('')}
          </div>
        </section>
      ` : ''}
    </section>
  `;
}

function humanizeNestedSegment(value = '') {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return '未命名分组';
  }

  if (/^[A-Z0-9_-]+$/.test(normalized)) {
    return normalized;
  }

  return normalized
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function getSchemaGroupSortRank(groupKey = '') {
  const index = SCHEMA_GROUP_ORDER.indexOf(String(groupKey || ''));
  return index === -1 ? Number.POSITIVE_INFINITY : index;
}

function compareSchemaGroups(leftKey = '', rightKey = '') {
  const rankDiff = getSchemaGroupSortRank(leftKey) - getSchemaGroupSortRank(rightKey);
  if (rankDiff !== 0) {
    return rankDiff;
  }

  return String(leftKey || '').localeCompare(String(rightKey || ''), 'en');
}

function getSchemaGroupDescription(groupKey = '') {
  const normalized = String(groupKey || '').trim();
  return SCHEMA_GROUP_DESCRIPTIONS[normalized] || '';
}

function getSchemaTopTabLabel(groupKey = '') {
  const normalized = String(groupKey || '').trim();
  if (!normalized || normalized === '__root__') {
    return 'Global';
  }

  const segmentMap = {
    mcp: 'MCP',
    otel: 'OTel',
    tui: 'TUI',
    oauth: 'OAuth',
    ws: 'WS',
    wsl: 'WSL',
    repl: 'REPL',
    json: 'JSON',
    env: 'Env'
  };

  return normalized
    .split(/[_-]+/g)
    .filter(Boolean)
    .map((segment) => segmentMap[segment.toLowerCase()] || humanizeNestedSegment(segment))
    .join(' ');
}

function getNestedCollectionLabel(groupKey = '') {
  const normalized = String(groupKey || '').toLowerCase();

  if (normalized.includes('mcp') && normalized.includes('server')) {
    return 'MCP 服务';
  }

  if (normalized.includes('server')) {
    return '服务组';
  }

  if (normalized.includes('profile')) {
    return '配置档案';
  }

  if (normalized.includes('provider')) {
    return '模型提供方';
  }

  return '子分组';
}

function isNestedCollectionFriendlyGroup(groupKey = '') {
  const normalized = String(groupKey || '').toLowerCase();
  return ['server', 'provider', 'profile', 'mcp', 'agent', 'tool'].some((keyword) => normalized.includes(keyword));
}

function isMcpGroupKey(groupKey = '') {
  const normalized = String(groupKey || '').toLowerCase();
  return normalized.includes('mcp') && normalized.includes('server');
}

function isModelProviderGroupKey(groupKey = '') {
  const normalized = String(groupKey || '').toLowerCase();
  return normalized === 'model_providers' || (normalized.includes('model') && normalized.includes('provider'));
}

function getRootSectionMeta(sectionKey = '') {
  return ROOT_SECTION_META[String(sectionKey || '').trim()] || ROOT_SECTION_META.other;
}

function getRootFieldRank(fieldPath = '') {
  const normalizedPath = normalizeDraftFieldPath(fieldPath);
  const exactIndex = ROOT_FIELD_ORDER.indexOf(normalizedPath);

  if (exactIndex !== -1) {
    return exactIndex;
  }

  if (normalizedPath.startsWith('experimental_')) {
    return ROOT_FIELD_ORDER.length + 1;
  }

  return Number.POSITIVE_INFINITY;
}

function sortRootFields(fields = []) {
  return [...fields].sort((left, right) => {
    const rankDiff = getRootFieldRank(left.field?.actualPath || '') - getRootFieldRank(right.field?.actualPath || '');
    if (rankDiff !== 0) {
      return rankDiff;
    }

    return String(left.field?.actualPath || '').localeCompare(String(right.field?.actualPath || ''), 'en');
  });
}

function getRootSemanticSectionKey(actualPath = '') {
  const normalizedPath = normalizeDraftFieldPath(actualPath);
  const leaf = getPathLeafSegment(normalizedPath);

  if (leaf === 'profile') {
    return 'profiles';
  }

  if ([
    'model',
    'model_provider',
    'review_model',
    'service_tier',
    'openai_base_url',
    'chatgpt_base_url',
    'oss_provider',
    'cli_auth_credentials_store',
    'forced_login_method',
    'forced_chatgpt_workspace_id',
    'model_catalog_json'
  ].includes(leaf)) {
    return 'model_access';
  }

  if ([
    'model_reasoning_effort',
    'plan_mode_reasoning_effort',
    'model_reasoning_summary',
    'model_supports_reasoning_summaries',
    'model_verbosity',
    'model_context_window',
    'model_auto_compact_token_limit',
    'tool_output_token_limit',
    'compact_prompt',
    'experimental_compact_prompt_file',
    'personality'
  ].includes(leaf)) {
    return 'model_reasoning';
  }

  if ([
    'approval_policy',
    'approvals_reviewer',
    'sandbox_mode',
    'sandbox_workspace_write',
    'allow_login_shell',
    'permissions',
    'default_permissions',
    'windows',
    'windows_wsl_setup_acknowledged'
  ].includes(leaf)) {
    return 'approval_sandbox';
  }

  if ([
    'web_search',
    'web_search_mode'
  ].includes(leaf)) {
    return 'web_search';
  }

  if ([
    'shell_environment_policy',
    'background_terminal_max_timeout',
    'js_repl_node_path',
    'js_repl_node_module_dirs',
    'zsh_path',
    'sqlite_home'
  ].includes(leaf)) {
    return 'shell_environment';
  }

  if ([
    'agents',
    'tools',
    'apps',
    'skills',
    'memories',
    'realtime',
    'audio'
  ].includes(leaf)) {
    return 'runtime_tools';
  }

  if (leaf.startsWith('mcp_oauth_')) {
    return 'mcp_oauth';
  }

  if ([
    'instructions',
    'developer_instructions',
    'model_instructions_file',
    'project_root_markers',
    'project_doc_fallback_filenames',
    'project_doc_max_bytes'
  ].includes(leaf)) {
    return 'project_instructions';
  }

  if ([
    'analytics',
    'otel',
    'log_dir',
    'feedback',
    'ghost_snapshot',
    'hide_agent_reasoning',
    'show_raw_agent_reasoning'
  ].includes(leaf)) {
    return 'observability';
  }

  if ([
    'notify',
    'notice',
    'history',
    'tui',
    'file_opener',
    'check_for_update_on_startup',
    'disable_paste_burst',
    'tool_suggest',
    'commit_attribution'
  ].includes(leaf)) {
    return 'interface_history';
  }

  if (
    leaf === 'features'
    || leaf === 'suppress_unstable_features_warning'
    || normalizedPath.startsWith('experimental_')
  ) {
    return 'feature_flags';
  }

  return 'other';
}

function buildRootSemanticSections(items = []) {
  const sectionMap = new Map();

  (items || []).forEach((item) => {
    const sectionKey = getRootSemanticSectionKey(item.field?.actualPath || '');
    if (!sectionMap.has(sectionKey)) {
      sectionMap.set(sectionKey, []);
    }
    sectionMap.get(sectionKey).push(item);
  });

  return [...sectionMap.entries()]
    .map(([sectionKey, fields]) => {
      const meta = getRootSectionMeta(sectionKey);
      return {
        key: sectionKey,
        label: meta.label,
        tabLabel: getSchemaTopTabLabel(sectionKey),
        metaLabel: meta.metaLabel,
        description: meta.description,
        count: fields.length,
        fields: sortRootFields(fields)
      };
    })
    .sort((left, right) => {
      const leftIndex = ROOT_SECTION_ORDER.indexOf(left.key);
      const rightIndex = ROOT_SECTION_ORDER.indexOf(right.key);

      if (leftIndex !== -1 || rightIndex !== -1) {
        if (leftIndex === -1) {
          return 1;
        }
        if (rightIndex === -1) {
          return -1;
        }
        return leftIndex - rightIndex;
      }

      return String(left.label).localeCompare(String(right.label), 'zh-Hans-CN');
    });
}

function buildNestedCollectionHint(fields = []) {
  if (!fields.length) {
    return '单独展开查看。';
  }

  return `共 ${fields.length} 项，单独展开查看。`;
}

function createGroupFieldLayout(group = {}) {
  const directFields = [];
  const nestedMap = new Map();

  group.fields.forEach((item) => {
    const pathParts = Array.isArray(item.field?.pathParts) && item.field.pathParts.length > 0
      ? item.field.pathParts
      : String(item.field?.actualPath || '').split('.').filter(Boolean);

    if (pathParts.length >= 3 && pathParts[1]) {
      if (!nestedMap.has(pathParts[1])) {
        nestedMap.set(pathParts[1], []);
      }

      nestedMap.get(pathParts[1]).push(item);
      return;
    }

    directFields.push(item);
  });

  const nestedGroups = [...nestedMap.entries()]
    .map(([key, fields]) => ({
      key,
      title: humanizeNestedSegment(key),
      pathLabel: group.key === '__root__' ? key : [group.key, key].filter(Boolean).join('.'),
      hint: buildNestedCollectionHint(fields),
      fields
    }))
    .sort((left, right) => String(left.key).localeCompare(String(right.key), 'en'));

  const nestedFieldCount = nestedGroups.reduce((sum, nestedGroup) => sum + nestedGroup.fields.length, 0);
  const shouldNest = nestedGroups.length >= 2
    || (
      nestedGroups.length >= 1
      && directFields.length <= 1
      && (isNestedCollectionFriendlyGroup(group.key) || nestedFieldCount >= 3)
    );

  return {
    shouldNest,
    directFields: shouldNest ? directFields : group.fields,
    nestedGroups: shouldNest ? nestedGroups : [],
    nestedCollectionLabel: getNestedCollectionLabel(group.key)
  };
}

function renderGroupOverview() {
  return '';
}

function renderStructuredPreviewText(labels = [], maxVisible = 2) {
  if (!Array.isArray(labels) || labels.length === 0) {
    return '';
  }

  const visibleLabels = labels.slice(0, maxVisible);
  const overflowCount = Math.max(0, labels.length - visibleLabels.length);
  const previewText = [
    ...visibleLabels,
    overflowCount > 0 ? `+${overflowCount}` : ''
  ].filter(Boolean).join(' · ');

  return `<p class="structured-field-shell__preview">预览：${escapeHtml(previewText)}</p>`;
}

function summarizeCollectionFields(fields = []) {
  const list = Array.isArray(fields) ? fields : [];

  return {
    customCount: list.filter(({ field }) => !field?.isOfficial).length,
    structuredCount: list.filter(({ field }) => isStructuredField(field)).length
  };
}

function renderCollectionSummaryText(summary = {}) {
  const items = [
    summary.customCount > 0 ? `${summary.customCount} 个自定义` : '',
    summary.structuredCount > 0 ? `${summary.structuredCount} 个结构项` : ''
  ].filter(Boolean);

  if (items.length === 0) {
    return '';
  }

  return `<span class="group-cluster__support-copy">${escapeHtml(items.join(' · '))}</span>`;
}

const MCP_PRIMARY_FIELD_ORDER = ['command', 'url', 'args', 'cwd'];
const MCP_SECTION_ORDER = ['auth', 'runtime', 'tools', 'headers', 'env', 'other'];
const MODEL_PROVIDER_PRIMARY_FIELD_ORDER = ['base_url', 'env_key', 'wire_api'];
const MODEL_PROVIDER_SECTION_ORDER = ['auth', 'capabilities', 'headers', 'other'];

function formatMcpMetaValue(value = '', maxLength = 48) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return '';
  }

  return normalized.length > maxLength
    ? `${normalized.slice(0, Math.max(0, maxLength - 1))}…`
    : normalized;
}

function getMcpSectionMeta(sectionKey = '') {
  const normalized = String(sectionKey || '').trim().toLowerCase();

  if (normalized === 'launch') {
    return {
      title: '启动方式',
      hint: '先确认命令、URL、参数和工作目录。'
    };
  }

  if (normalized === 'auth') {
    return {
      title: '鉴权与 OAuth',
      hint: 'Token、资源标识和 Scope 放这一组。'
    };
  }

  if (normalized === 'runtime') {
    return {
      title: '可用性与超时',
      hint: '是否启用、必需性以及启动超时集中处理。'
    };
  }

  if (normalized === 'tools') {
    return {
      title: '工具范围',
      hint: '启用或禁用哪些工具，放在同一个区块里看。'
    };
  }

  if (normalized === 'env') {
    return {
      title: '环境变量',
      hint: '实例配置集中放这里，避免和命令参数混在一起。'
    };
  }

  if (normalized.includes('header')) {
    return {
      title: '请求头',
      hint: '连接服务器时要带上的 Header 放这里。'
    };
  }

  return {
    title: normalized === 'other' ? '其他设置' : humanizeNestedSegment(sectionKey),
    hint: '不常改的附加设置也集中在一个区块里。'
  };
}

function getMcpSemanticSectionKey(relativePath = '') {
  const normalizedPath = String(relativePath || '').trim().toLowerCase();
  const leaf = getPathLeafSegment(normalizedPath);

  if (['bearer_token', 'bearer_token_env_var', 'oauth_resource', 'scopes'].includes(leaf)) {
    return 'auth';
  }

  if (['enabled', 'required', 'startup_timeout_ms', 'startup_timeout_sec', 'tool_timeout_sec', 'env_vars'].includes(leaf)) {
    return 'runtime';
  }

  if (['enabled_tools', 'disabled_tools'].includes(leaf)) {
    return 'tools';
  }

  if (leaf === 'env' || normalizedPath.startsWith('env.')) {
    return 'env';
  }

  if (leaf === 'http_headers' || leaf === 'env_http_headers' || normalizedPath.includes('header')) {
    return 'headers';
  }

  return 'other';
}

function sortMcpFields(fields = []) {
  return [...fields].sort((left, right) => {
    const leftLeaf = getPathLeafSegment(left.field?.actualPath || '');
    const rightLeaf = getPathLeafSegment(right.field?.actualPath || '');
    const leftIndex = MCP_PRIMARY_FIELD_ORDER.indexOf(leftLeaf);
    const rightIndex = MCP_PRIMARY_FIELD_ORDER.indexOf(rightLeaf);

    if (leftIndex !== -1 || rightIndex !== -1) {
      if (leftIndex === -1) {
        return 1;
      }
      if (rightIndex === -1) {
        return -1;
      }
      if (leftIndex !== rightIndex) {
        return leftIndex - rightIndex;
      }
    }

    return String(left.field?.actualPath || '').localeCompare(String(right.field?.actualPath || ''), 'en');
  });
}

function getModelProviderSectionMeta(sectionKey = '') {
  const normalized = String(sectionKey || '').trim().toLowerCase();

  if (normalized === 'auth') {
    return {
      title: '认证与凭据',
      hint: 'API Key、认证兼容要求等放在这里。'
    };
  }

  if (normalized === 'capabilities') {
    return {
      title: '能力与限制',
      hint: '上下文窗口、协议能力和约束项集中查看。'
    };
  }

  if (normalized === 'headers') {
    return {
      title: '请求头',
      hint: '这个提供方向上游发送的 Header 放这里。'
    };
  }

  return {
    title: normalized === 'other' ? '其他设置' : humanizeNestedSegment(sectionKey),
    hint: '不属于连接和能力的补充项放在这里。'
  };
}

function getModelProviderSemanticSectionKey(relativePath = '') {
  const normalizedPath = String(relativePath || '').trim().toLowerCase();
  const leaf = getPathLeafSegment(normalizedPath);

  if (leaf === 'env_key' || leaf === 'requires_openai_auth' || normalizedPath.includes('auth')) {
    return 'auth';
  }

  if (leaf === 'http_headers' || normalizedPath.startsWith('http_headers.') || normalizedPath.includes('header')) {
    return 'headers';
  }

  if (
    leaf === 'supports_websockets'
    || leaf.includes('context')
    || leaf.includes('window')
    || leaf.includes('limit')
    || leaf.includes('token')
  ) {
    return 'capabilities';
  }

  return 'other';
}

function sortModelProviderFields(fields = []) {
  return [...fields].sort((left, right) => {
    const leftLeaf = getPathLeafSegment(left.field?.actualPath || '');
    const rightLeaf = getPathLeafSegment(right.field?.actualPath || '');
    const leftIndex = MODEL_PROVIDER_PRIMARY_FIELD_ORDER.indexOf(leftLeaf);
    const rightIndex = MODEL_PROVIDER_PRIMARY_FIELD_ORDER.indexOf(rightLeaf);

    if (leftIndex !== -1 || rightIndex !== -1) {
      if (leftIndex === -1) {
        return 1;
      }
      if (rightIndex === -1) {
        return -1;
      }
      if (leftIndex !== rightIndex) {
        return leftIndex - rightIndex;
      }
    }

    return String(left.field?.actualPath || '').localeCompare(String(right.field?.actualPath || ''), 'en');
  });
}

function createModelProviderLayout(collection = {}) {
  const primaryFields = [];
  const sectionMap = new Map();

  (collection.fields || []).forEach((item) => {
    const relativePath = getRelativeFieldPath(item.field?.actualPath || '', collection.pathLabel || '');
    const leaf = getPathLeafSegment(relativePath);

    if (MODEL_PROVIDER_PRIMARY_FIELD_ORDER.includes(leaf)) {
      primaryFields.push(item);
      return;
    }

    const sectionKey = getModelProviderSemanticSectionKey(relativePath);
    if (!sectionMap.has(sectionKey)) {
      sectionMap.set(sectionKey, []);
    }
    sectionMap.get(sectionKey).push(item);
  });

  const sections = [...sectionMap.entries()]
    .map(([sectionKey, fields]) => {
      const meta = getModelProviderSectionMeta(sectionKey);
      return {
        key: sectionKey,
        title: meta.title,
        hint: meta.hint,
        pathLabel: collection.pathLabel || '',
        fields: sortModelProviderFields(fields)
      };
    })
    .sort((left, right) => {
      const leftIndex = MODEL_PROVIDER_SECTION_ORDER.indexOf(left.key);
      const rightIndex = MODEL_PROVIDER_SECTION_ORDER.indexOf(right.key);
      if (leftIndex !== -1 || rightIndex !== -1) {
        if (leftIndex === -1) {
          return 1;
        }
        if (rightIndex === -1) {
          return -1;
        }
        return leftIndex - rightIndex;
      }

      return String(left.title).localeCompare(String(right.title), 'zh-Hans-CN');
    });

  const sortedPrimaryFields = sortModelProviderFields(primaryFields);
  const baseUrlField = sortedPrimaryFields.find(({ field }) => getPathLeafSegment(field?.actualPath || '') === 'base_url');
  const wireApiField = sortedPrimaryFields.find(({ field }) => getPathLeafSegment(field?.actualPath || '') === 'wire_api');
  const envKeyField = sortedPrimaryFields.find(({ field }) => getPathLeafSegment(field?.actualPath || '') === 'env_key');
  const capabilityCount = sections
    .filter((section) => section.key === 'capabilities')
    .reduce((sum, section) => sum + section.fields.length, 0);
  const headerCount = sections
    .filter((section) => section.key === 'headers')
    .reduce((sum, section) => sum + section.fields.length, 0);

  return {
    primaryFields: sortedPrimaryFields,
    sections,
    baseUrlValue: formatMcpMetaValue(baseUrlField?.field?.inputValue || '', 48),
    wireApiValue: formatMcpMetaValue(wireApiField?.field?.inputValue || '', 22),
    envKeyValue: formatMcpMetaValue(envKeyField?.field?.inputValue || '', 28),
    capabilityCount,
    headerCount
  };
}

function getMcpArrayCount(field = {}) {
  const rawValue = String(field?.inputValue || '').trim();
  if (!rawValue) {
    return 0;
  }

  if (field?.type === 'array') {
    const parsed = parseStructuredFieldInputValue(field);
    return parsed.status === 'valid' && Array.isArray(parsed.parsedValue)
      ? parsed.parsedValue.length
      : 0;
  }

  try {
    const parsedValue = JSON.parse(rawValue);
    if (Array.isArray(parsedValue)) {
      return parsedValue.length;
    }
  } catch {
    // Fall back to whitespace splitting for legacy string-based args.
  }

  return rawValue.split(/\s+/).filter(Boolean).length;
}

function createMcpServerLayout(collection = {}) {
  const primaryFields = [];
  const sectionMap = new Map();

  (collection.fields || []).forEach((item) => {
    const relativePath = getRelativeFieldPath(item.field?.actualPath || '', collection.pathLabel || '');
    const leaf = getPathLeafSegment(relativePath);

    if (MCP_PRIMARY_FIELD_ORDER.includes(leaf)) {
      primaryFields.push(item);
      return;
    }

    const sectionKey = getMcpSemanticSectionKey(relativePath);
    if (!sectionMap.has(sectionKey)) {
      sectionMap.set(sectionKey, []);
    }
    sectionMap.get(sectionKey).push(item);
  });

  const sections = [...sectionMap.entries()]
    .map(([sectionKey, fields]) => {
      const meta = getMcpSectionMeta(sectionKey);
      return {
        key: sectionKey,
        title: meta.title,
        hint: meta.hint,
        pathLabel: collection.pathLabel || '',
        fields: sortMcpFields(fields)
      };
    })
    .sort((left, right) => {
      const leftIndex = MCP_SECTION_ORDER.indexOf(left.key);
      const rightIndex = MCP_SECTION_ORDER.indexOf(right.key);
      if (leftIndex !== -1 || rightIndex !== -1) {
        if (leftIndex === -1) {
          return 1;
        }
        if (rightIndex === -1) {
          return -1;
        }
        return leftIndex - rightIndex;
      }

      return String(left.title).localeCompare(String(right.title), 'zh-Hans-CN');
    });

  const sortedPrimaryFields = sortMcpFields(primaryFields);
  const commandField = sortedPrimaryFields.find(({ field }) => getPathLeafSegment(field?.actualPath || '') === 'command');
  const urlField = sortedPrimaryFields.find(({ field }) => getPathLeafSegment(field?.actualPath || '') === 'url');
  const argsField = sortedPrimaryFields.find(({ field }) => getPathLeafSegment(field?.actualPath || '') === 'args');
  const envSection = sections.find((section) => section.key === 'env');
  const toolsSection = sections.find((section) => section.key === 'tools');

  return {
    primaryFields: sortedPrimaryFields,
    sections,
    commandValue: formatMcpMetaValue(commandField?.field?.inputValue || '', 42),
    urlValue: formatMcpMetaValue(urlField?.field?.inputValue || '', 52),
    argsCount: getMcpArrayCount(argsField?.field),
    envCount: envSection?.fields?.length || 0,
    toolsCount: toolsSection?.fields?.length || 0
  };
}

function renderMcpServerSection(section, tone = 'codex', openStructuredFieldKeySet = new Set()) {
  return `
    <section class="mcp-server-section mcp-server-section--${tone}">
      <div class="mcp-server-section__header">
        <div>
          <h5>${escapeHtml(section.title)}</h5>
          <p>${escapeHtml(section.hint)}</p>
        </div>
        <span class="mcp-server-section__count">${section.fields.length} 项</span>
      </div>
      <div class="mcp-server-section__body">
        ${renderFieldList(section.fields, {
      compact: true,
      pathPrefix: section.pathLabel || '',
      openStructuredFieldKeySet,
      presentation: 'mcp'
    })}
      </div>
    </section>
  `;
}

function renderMcpServerCard(collection, tone = 'codex', openStructuredFieldKeySet = new Set()) {
  const layout = createMcpServerLayout(collection);
  const summaryParts = [
    layout.primaryFields.length > 0 ? `${layout.primaryFields.length} 个启动项` : '',
    layout.argsCount > 0 ? `${layout.argsCount} 个参数` : '',
    layout.envCount > 0 ? `${layout.envCount} 个环境变量` : '',
    layout.toolsCount > 0 ? `${layout.toolsCount} 组工具规则` : ''
  ].filter(Boolean);
  const serviceTarget = layout.commandValue
    ? `命令 ${layout.commandValue}`
    : layout.urlValue
      ? `地址 ${layout.urlValue}`
      : '';

  return `
    <section class="mcp-server-card mcp-server-card--${tone}">
      <div class="mcp-server-card__header">
        <div class="mcp-server-card__copy">
          <h4>${escapeHtml(collection.title || '未命名服务')}</h4>
          <p>${escapeHtml(collection.hint || '一张卡只处理一个服务，启动、鉴权、工具和变量分区查看。')}</p>
          <div class="mcp-server-card__meta">
            ${serviceTarget ? `<p class="mcp-server-card__target" title="${escapeHtml(serviceTarget)}">${escapeHtml(serviceTarget)}</p>` : ''}
            ${summaryParts.length > 0 ? `<p class="mcp-server-card__meta-copy">${escapeHtml(summaryParts.join(' · '))}</p>` : ''}
            ${collection.pathLabel ? `<code class="mcp-server-card__path" title="${escapeHtml(collection.pathLabel)}">${escapeHtml(collection.pathLabel)}</code>` : ''}
          </div>
        </div>
        <span class="mcp-server-card__count">${(collection.fields || []).length} 项</span>
      </div>

      ${layout.primaryFields.length > 0 ? `
        <section class="mcp-server-section mcp-server-section--${tone} mcp-server-section--primary">
          <div class="mcp-server-section__header">
            <div>
              <h5>启动方式</h5>
              <p>优先确认本地命令或远程 URL，再看参数和工作目录。</p>
            </div>
            <span class="mcp-server-section__count">${layout.primaryFields.length} 项</span>
          </div>
          <div class="mcp-server-section__body">
            ${renderFieldList(layout.primaryFields, {
      compact: true,
      pathPrefix: collection.pathLabel || '',
      openStructuredFieldKeySet,
      presentation: 'mcp'
    })}
          </div>
        </section>
      ` : ''}

      ${layout.sections.length > 0 ? `
        <div class="mcp-server-card__sections">
          ${layout.sections.map((section) => renderMcpServerSection(section, tone, openStructuredFieldKeySet)).join('')}
        </div>
      ` : ''}
    </section>
  `;
}

function renderMcpGroupLayout(group, tone = 'codex', openStructuredFieldKeySet = new Set()) {
  const layout = createGroupFieldLayout(group);

  return `
    <div class="mcp-server-layout">
      ${layout.directFields.length > 0 ? `
        <section class="mcp-server-layout__intro">
          <div class="mcp-server-layout__intro-copy">
            <h4>全局默认</h4>
            <p>所有服务共用的默认项放这里，实例级设置放在各自服务里。</p>
          </div>
          ${renderFieldList(layout.directFields, {
        compact: true,
        pathPrefix: group.key === '__root__' ? '' : group.key,
        openStructuredFieldKeySet,
        presentation: 'mcp'
      })}
        </section>
      ` : ''}

      ${layout.nestedGroups.length > 0 ? `
        <div class="mcp-server-grid">
          ${layout.nestedGroups.map((nestedGroup) => renderMcpServerCard({
        ...nestedGroup,
        hint: '命令、鉴权、工具和环境变量已经按服务拆开，改一张卡就够。'
      }, tone, openStructuredFieldKeySet)).join('')}
        </div>
      ` : `
        <div class="mcp-server-layout__empty">当前还没有实例化的 MCP 服务字段。</div>
      `}
    </div>
  `;
}

function renderNestedCollection(
  collection,
  tone = 'codex',
  variant = 'nested',
  isOpen = false,
  stateKey = '',
  { collapsible = true, openStructuredFieldKeySet = new Set() } = {}
) {
  const useCompactLayout = shouldUseCompactCollectionLayout(collection);
  const collectionSummary = summarizeCollectionFields(collection.fields);
  const supportDetails = [
    collection.pathLabel ? `<code class="group-cluster__path group-cluster__path--inline" title="${escapeHtml(collection.pathLabel)}">${escapeHtml(collection.pathLabel)}</code>` : '',
    renderCollectionSummaryText(collectionSummary)
  ].filter(Boolean).join('');
  const headerHtml = `
    <div class="group-cluster__header">
      <div class="group-cluster__copy">
        <h4>${escapeHtml(collection.title)}</h4>
        ${!useCompactLayout && collection.hint ? `<p class="group-cluster__hint">${escapeHtml(collection.hint)}</p>` : ''}
        ${supportDetails ? `<div class="group-cluster__support">${supportDetails}</div>` : ''}
      </div>
      <div class="group-cluster__meta">
        <div class="group-cluster__meta-row">
          <span class="group-cluster__count">${collection.fields.length} 项</span>
          ${collapsible ? '<span class="group-cluster__chevron" aria-hidden="true">⌄</span>' : ''}
        </div>
      </div>
    </div>
  `;

  if (!collapsible) {
    return `
      <section class="group-cluster group-cluster--${tone} group-cluster--${variant}${useCompactLayout ? ' group-cluster--compact' : ''} group-cluster--static">
        <div class="group-cluster__summary group-cluster__summary--static">
          ${headerHtml}
        </div>
        <div class="group-cluster__body group-cluster__body--static">
          <div class="group-cluster__fields">
            ${renderFieldList(collection.fields, {
      compact: useCompactLayout,
      pathPrefix: collection.pathLabel || '',
      openStructuredFieldKeySet
    })}
          </div>
        </div>
      </section>
    `;
  }

  return `
    <details
      class="group-cluster group-cluster--${tone} group-cluster--${variant}${useCompactLayout ? ' group-cluster--compact' : ''}"
      data-cluster-key="${escapeHtml(stateKey)}"
      ${isOpen ? 'open' : ''}
    >
      <summary class="group-cluster__summary">
        ${headerHtml}
      </summary>
      <div class="group-cluster__body">
        <div class="group-cluster__fields">
          ${renderFieldList(collection.fields, {
    compact: useCompactLayout,
    pathPrefix: collection.pathLabel || '',
    openStructuredFieldKeySet
  })}
        </div>
      </div>
    </details>
  `;
}

function renderFocusedSchemaGroup(group, tone = 'codex', openStructuredFieldKeySet = new Set()) {
  const stats = summarizeGroup(group);
  const layout = createGroupFieldLayout(group);
  if (isMcpGroupKey(group.key)) {
    return `
      <section class="group-card group-card--${tone} group-card--flat ${group.key === '__root__' ? 'group-card--root' : ''}">
        <div class="group-card__header group-card__header--flat">
          <div class="group-card__header-copy">
            <p class="group-card__eyebrow">MCP 服务</p>
            <h3>${escapeHtml(group.title)}</h3>
            <p class="group-card__hint">按服务拆卡展示，命令、参数、环境变量放到同一张卡里处理。</p>
          </div>
          <span class="group-card__meta">
            <span class="group-card__cluster-count">${layout.nestedGroups.length} 个服务</span>
            <span class="group-card__count">${stats.totalCount} 项</span>
          </span>
        </div>
        <div class="group-card__body">
          ${renderGroupOverview(stats, layout, tone)}
          ${renderMcpGroupLayout(group, tone, openStructuredFieldKeySet)}
        </div>
      </section>
    `;
  }
  const hint = layout.shouldNest
    ? `当前直接进入 ${layout.nestedCollectionLabel} 明细，减少一层展开层级。`
    : '当前直接进入这个分类本身，可以连续编辑，不再额外套一层分组折叠。';

  return `
    <section class="group-card group-card--${tone} group-card--flat ${group.key === '__root__' ? 'group-card--root' : ''}">
      <div class="group-card__header group-card__header--flat">
        <div class="group-card__header-copy">
          <p class="group-card__eyebrow">${escapeHtml(layout.shouldNest ? layout.nestedCollectionLabel : '当前分类')}</p>
          <h3>${escapeHtml(group.title)}</h3>
          <p class="group-card__hint">${escapeHtml(hint)}</p>
        </div>
        <span class="group-card__meta">
          ${layout.shouldNest ? `<span class="group-card__cluster-count">${layout.nestedGroups.length + (layout.directFields.length > 0 ? 1 : 0)} 块</span>` : ''}
          <span class="group-card__count">${stats.totalCount} 项</span>
        </span>
      </div>
      <div class="group-card__body">
        ${layout.shouldNest ? `
          ${layout.directFields.length > 0 ? renderNestedCollection({
    eyebrow: '直接字段',
    title: '基础项',
    hint: '挂在当前分类下，保持展开便于连续编辑。',
    pathLabel: group.key === '__root__' ? '' : group.key,
    fields: layout.directFields
  }, tone, 'direct', true, '', { collapsible: false, openStructuredFieldKeySet }) : ''}
          <div class="group-card__clusters">
            ${layout.nestedGroups.map((nestedGroup) => renderNestedCollection({
    ...nestedGroup,
    eyebrow: layout.nestedCollectionLabel
  }, tone, 'nested', true, '', { collapsible: false, openStructuredFieldKeySet })).join('')}
          </div>
        ` : `
          <div class="group-card__fields">
            ${renderFieldList(group.fields, {
    pathPrefix: group.key === '__root__' ? '' : group.key,
    openStructuredFieldKeySet
  })}
          </div>
        `}
      </div>
    </section>
  `;
}

function renderSchemaGroup(group, tone, position, isOpen, openClusterKeySet = new Set(), openStructuredFieldKeySet = new Set()) {
  const stats = summarizeGroup(group);
  const layout = createGroupFieldLayout(group);
  const anchorId = createGroupAnchorId(group.key, position);
  const isMcpGroup = isMcpGroupKey(group.key);
  const useDenseLayout = !layout.shouldNest && shouldUseDenseFieldLayout(group.fields);
  const hint = isMcpGroup
    ? '按服务拆卡展示，减少命令、参数、环境变量之间的跳转。'
    : layout.shouldNest
    ? `已按 ${layout.nestedCollectionLabel} 分块；同层默认单开，一次只看一块更清楚。`
    : useDenseLayout
      ? '当前按双列展开，优先减少纵向滚动。'
    : stats.officialCount > 0
      ? `${stats.officialCount} 项带官方说明。`
      : stats.structuredCount > 0
        ? `含 ${stats.structuredCount} 项结构字段。`
        : '这一组可以直接编辑。';
  const eyebrow = layout.shouldNest ? layout.nestedCollectionLabel : '字段组';

  return `
    <details
      class="group-card group-card--${tone} ${layout.shouldNest ? 'group-card--clustered' : ''} ${group.key === '__root__' ? 'group-card--root' : ''}"
      id="${anchorId}"
      data-group-key="${escapeHtml(group.key)}"
      ${isOpen ? 'open' : ''}
    >
      <summary class="group-card__header">
        <div class="group-card__header-copy">
          <p class="group-card__eyebrow">${escapeHtml(eyebrow)}</p>
          <h3>${escapeHtml(group.title)}</h3>
          <p class="group-card__hint">${escapeHtml(hint)}</p>
        </div>
        <span class="group-card__meta">
          ${layout.shouldNest ? `<span class="group-card__cluster-count">${isMcpGroup ? `${layout.nestedGroups.length} 个服务` : `${layout.nestedGroups.length + (layout.directFields.length > 0 ? 1 : 0)} 块`}</span>` : ''}
          <span class="group-card__count">${stats.totalCount} 项</span>
          <span class="group-card__chevron" aria-hidden="true">⌄</span>
        </span>
      </summary>
      <div class="group-card__body">
        ${renderGroupOverview(stats, layout, tone)}
        ${isMcpGroup ? renderMcpGroupLayout(group, tone, openStructuredFieldKeySet) : layout.shouldNest ? `
          ${layout.directFields.length > 0 ? renderNestedCollection({
    eyebrow: '直接字段',
    title: '基础项',
    hint: '挂在当前分组下，单独看更清楚。',
    pathLabel: group.key === '__root__' ? '' : group.key,
    fields: layout.directFields
  }, tone, 'direct', openClusterKeySet.has(createClusterStateKey(group.key, '__direct__')), createClusterStateKey(group.key, '__direct__'), {
    openStructuredFieldKeySet
  }) : ''}
          <div class="group-card__clusters">
            ${layout.nestedGroups.map((nestedGroup) => renderNestedCollection({
    ...nestedGroup,
    eyebrow: layout.nestedCollectionLabel
  }, tone, 'nested', openClusterKeySet.has(createClusterStateKey(group.key, nestedGroup.key)), createClusterStateKey(group.key, nestedGroup.key), {
    openStructuredFieldKeySet
  })).join('')}
          </div>
        ` : `
          <div class="group-card__fields">
            ${renderFieldList(group.fields, {
    pathPrefix: group.key === '__root__' ? '' : group.key,
    openStructuredFieldKeySet
  })}
          </div>
        `}
      </div>
    </details>
  `;
}

function resolveActiveGroupKey(scrollRoot, toolbar, groupElements) {
  if (!scrollRoot || groupElements.length === 0) {
    return '';
  }

  const rootRect = scrollRoot.getBoundingClientRect();
  const stickyOffset = Math.min((toolbar?.offsetHeight || 0) + 32, 168);
  const threshold = rootRect.top + stickyOffset;

  let activeGroup = groupElements[0];

  groupElements.forEach((groupElement) => {
    if (groupElement.getBoundingClientRect().top <= threshold) {
      activeGroup = groupElement;
    }
  });

  return activeGroup?.getAttribute('data-group-key') || '';
}

function renderFieldBadge(label, tone = 'neutral') {
  return `<span class="field-badge field-badge--${tone}">${escapeHtml(label)}</span>`;
}

function shortenFieldDescription(value = '', maxLength = 48) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }

  const normalizedMaxLength = Math.max(120, maxLength);

  if (normalized.length <= normalizedMaxLength) {
    return normalized;
  }

  return `${normalized.slice(0, normalizedMaxLength).trimEnd()}…`;
}

function getFieldTypeLabel(type = '') {
  switch (String(type || '').toLowerCase()) {
    case 'boolean':
      return '布尔';
    case 'integer':
      return '整数';
    case 'number':
      return '数字';
    case 'array':
      return '数组';
    case 'object':
      return '对象';
    case 'null':
      return 'Null';
    default:
      return '文本';
  }
}

function getFieldPrimaryTone(field = {}) {
  const path = String(field.actualPath || '');

  if (path === 'sandbox_mode' && field.inputValue === 'danger-full-access') {
    return 'danger';
  }

  if (
    path === 'sandbox_mode' ||
    path === 'approval_policy' ||
    path.startsWith('permissions.')
  ) {
    return 'safety';
  }

  if (path === 'web_search' || path === 'web_search_mode') {
    return 'network';
  }

  if (path.startsWith('hooks.')) {
    return 'automation';
  }

  if (path.startsWith('env.')) {
    return 'runtime';
  }

  if (
    [
      'model',
      'model_provider',
      'model_reasoning_effort',
      'model_context_window',
      'model_auto_compact_token_limit',
      'alwaysThinkingEnabled',
      'fastMode',
      'cleanupPeriodDays'
    ].includes(path)
  ) {
    return 'core';
  }

  if (!field.isOfficial) {
    return 'custom';
  }

  return 'neutral';
}

function getMcpFieldSummaryCopy(field = {}, relativePath = '') {
  const normalizedPath = String(relativePath || field.actualPath || '').toLowerCase();
  const leaf = getPathLeafSegment(normalizedPath);

  if (leaf === 'command') {
    return '启动本地 MCP 服务时执行的命令。';
  }

  if (leaf === 'url') {
    return '连接远程 MCP 服务的入口地址。';
  }

  if (leaf === 'args') {
    return '按顺序传给命令的参数列表。';
  }

  if (leaf === 'cwd') {
    return '命令启动时使用的工作目录。';
  }

  if (leaf === 'bearer_token') {
    return '直接填写访问服务所需的 Bearer Token。';
  }

  if (leaf === 'bearer_token_env_var') {
    return '从哪个环境变量读取 Bearer Token。';
  }

  if (leaf === 'oauth_resource') {
    return 'OAuth 资源标识。';
  }

  if (leaf === 'scopes') {
    return 'OAuth 申请的权限范围。';
  }

  if (leaf === 'enabled') {
    return '控制这个 MCP 服务是否启用。';
  }

  if (leaf === 'required') {
    return '标记为必需后，缺失会直接影响整体可用性。';
  }

  if (leaf === 'startup_timeout_ms' || leaf === 'startup_timeout_sec') {
    return '服务启动最长允许等待多久。';
  }

  if (leaf === 'tool_timeout_sec') {
    return '单次工具调用的超时上限。';
  }

  if (leaf === 'enabled_tools') {
    return '只允许这一组工具暴露给客户端。';
  }

  if (leaf === 'disabled_tools') {
    return '这一组工具会被显式禁用。';
  }

  if (leaf === 'env') {
    return '服务启动时注入的环境变量集合。';
  }

  if (normalizedPath.startsWith('env.')) {
    return '服务启动时注入的环境变量值。';
  }

  if (leaf === 'http_headers') {
    return '连接服务时直接附带的请求头。';
  }

  if (leaf === 'env_http_headers') {
    return '从环境变量读取并转成请求头。';
  }

  if (leaf === 'env_vars') {
    return '允许透传给服务的环境变量名。';
  }

  return shortenFieldDescription(field.description || '');
}

function getFieldSummaryCopy(field = {}, { presentation = 'default', relativePath = '' } = {}) {
  const path = String(field.actualPath || '');

  if (presentation === 'mcp') {
    return getMcpFieldSummaryCopy(field, relativePath);
  }

  if (path === 'model') {
    return '当前入口模型。';
  }

  if (path === 'model_provider') {
    return '模型走哪一个提供方。';
  }

  if (path === 'model_reasoning_effort') {
    return '默认思考深度。';
  }

  if (path === 'model_context_window') {
    return '限制模型默认可用的上下文窗口。';
  }

  if (path === 'model_auto_compact_token_limit') {
    return '达到阈值后自动触发压缩。';
  }

  if (path === 'approval_policy') {
    return '需要提权时怎么处理。';
  }

  if (path === 'sandbox_mode') {
    return '决定 Agent 能碰到多深的本机权限。';
  }

  if (path === 'web_search' || path === 'web_search_mode') {
    return '控制模型能不能联网。';
  }

  if (path === 'permissions.allow') {
    return '这些工具默认直接放行。';
  }

  if (path === 'permissions.ask') {
    return '这些工具命中时先询问。';
  }

  if (path === 'alwaysThinkingEnabled') {
    return '默认启用更深的思考模式。';
  }

  if (path === 'fastMode') {
    return '优先更快响应。';
  }

  if (path === 'cleanupPeriodDays') {
    return '控制清理周期。';
  }

  if (path.startsWith('env.')) {
    return '实例运行环境变量。';
  }

  if (path.startsWith('hooks.')) {
    return '自动化回调入口。';
  }

  return shortenFieldDescription(field.description || '');
}

function getFieldNoteCopy(field = {}) {
  const path = String(field.actualPath || '');

  if (field.isTypeConflict && field.schemaType) {
    return `官方声明为 ${field.schemaType}，当前保留本地 ${field.localType || field.type}。`;
  }

  if (path === 'sandbox_mode' && field.inputValue === 'danger-full-access') {
    return '当前值风险最高，保存前请再次确认。';
  }

  if (!field.isOfficial) {
    return '本地扩展字段，保存时会原样回写。';
  }

  return '';
}

function getRelativeFieldPath(actualPath = '', pathPrefix = '') {
  const normalizedPath = normalizeDraftFieldPath(actualPath);
  const normalizedPrefix = normalizeDraftFieldPath(pathPrefix);

  if (!normalizedPath) {
    return '';
  }

  if (!normalizedPrefix) {
    return normalizedPath;
  }

  if (normalizedPath === normalizedPrefix) {
    return '';
  }

  return normalizedPath.startsWith(`${normalizedPrefix}.`)
    ? normalizedPath.slice(normalizedPrefix.length + 1)
    : normalizedPath;
}

function getPathLeafSegment(value = '') {
  return String(value || '')
    .split('.')
    .filter(Boolean)
    .at(-1) || '';
}

function normalizeFieldCompareToken(value = '') {
  return String(value || '')
    .toLocaleLowerCase()
    .replace(/[\s._/-]+/g, '');
}

function shouldHideCompactFieldPath(pathLabel = '', title = '') {
  const normalizedTitle = normalizeFieldCompareToken(title);
  if (!normalizedTitle) {
    return false;
  }

  const normalizedPath = normalizeFieldCompareToken(pathLabel);
  const normalizedLeaf = normalizeFieldCompareToken(getPathLeafSegment(pathLabel));

  return normalizedTitle === normalizedPath || normalizedTitle === normalizedLeaf;
}

function shouldShowFieldNote(noteCopy = '', { compact = false } = {}) {
  if (!noteCopy) {
    return false;
  }

  if (noteCopy === '本地扩展字段，保存时会原样回写。') {
    return false;
  }

  return true;
}

function renderCompactFieldMeta({ pathLabel = '', actualPath = '', showNote = false, noteCopy = '', tone = 'neutral' } = {}) {
  const items = [];

  if (pathLabel) {
    items.push(`<code class="field-inline-chip field-inline-chip--path" title="${escapeHtml(actualPath || pathLabel)}">${escapeHtml(pathLabel)}</code>`);
  }

  if (showNote) {
    items.push(`<span class="field-inline-note field-inline-note--${tone}" title="${escapeHtml(noteCopy)}">${escapeHtml(noteCopy)}</span>`);
  }

  if (items.length === 0) {
    return '';
  }

  return `
    <span class="field-meta-inline">
      ${items.join('')}
    </span>
  `;
}

function renderMcpFieldMeta({ pathLabel = '', actualPath = '', showNote = false, noteCopy = '', tone = 'neutral' } = {}) {
  const items = [];

  if (pathLabel) {
    items.push(`<code class="field-inline-chip field-inline-chip--path" title="${escapeHtml(actualPath || pathLabel)}">${escapeHtml(pathLabel)}</code>`);
  }

  if (showNote) {
    items.push(`<span class="field-inline-note field-inline-note--${tone}" title="${escapeHtml(noteCopy)}">${escapeHtml(noteCopy)}</span>`);
  }

  if (items.length === 0) {
    return '';
  }

  return `
    <span class="field-meta-inline field-meta-inline--mcp">
      ${items.join('')}
    </span>
  `;
}

function getFieldMetaPresentation(field = {}, { compact = false, pathPrefix = '', presentation = 'default' } = {}) {
  const tone = getFieldPrimaryTone(field);
  const badges = [];
  const typeLabel = getFieldTypeLabel(field.type || field.schemaType || 'string');
  const relativePath = getRelativeFieldPath(field.actualPath, pathPrefix);
  const isMcpPresentation = presentation === 'mcp';
  const normalizedType = String(field.type || field.schemaType || 'string');
  const shouldShowTypeBadge = normalizedType !== 'string' || field.isTypeConflict;

  if (shouldShowTypeBadge) {
    badges.push(renderFieldBadge(
      typeLabel,
      field.type === 'array' || field.type === 'object' ? 'structured' : 'official'
    ));
  }

  if (!field.isOfficial) {
    badges.push(renderFieldBadge('自定义', 'custom'));
  }

  const pathLabel = relativePath;
  const shouldRenderPath = Boolean(pathLabel) && !shouldHideCompactFieldPath(pathLabel, field.title);
  const pathChip = shouldRenderPath
    ? `<code class="field-path-chip" title="${escapeHtml(field.actualPath)}">${escapeHtml(pathLabel)}</code>`
    : '';
  const noteCopy = getFieldNoteCopy(field);
  const showNote = shouldShowFieldNote(noteCopy, { compact });
  const detailsHtml = compact
    ? (isMcpPresentation
        ? renderMcpFieldMeta({
          pathLabel: shouldRenderPath ? pathLabel : '',
          actualPath: field.actualPath,
          showNote,
          noteCopy,
          tone
        })
        : renderCompactFieldMeta({
      pathLabel: shouldRenderPath ? pathLabel : '',
      actualPath: field.actualPath,
      showNote,
      noteCopy,
      tone
    }))
    : (isMcpPresentation
        ? (showNote
            ? `
              <span class="field-meta-stack">
                <span class="field-note-line field-note-line--${tone}">${escapeHtml(noteCopy)}</span>
              </span>
            `
            : '')
        : (pathChip || showNote
        ? `
          <span class="field-meta-stack">
            ${pathChip ? `<span class="field-detail-line field-detail-line--path">${pathChip}</span>` : ''}
            ${showNote ? `<span class="field-note-line field-note-line--${tone}">${escapeHtml(noteCopy)}</span>` : ''}
          </span>
        `
        : ''));

  return {
    tone,
    labelMeta: badges.length > 0 ? `<span class="field-label-meta">${badges.join('')}</span>` : '',
    description: getFieldSummaryCopy(field, { presentation, relativePath }),
    detailsHtml
  };
}

function isStructuredField(field = {}) {
  return field.type === 'array' || field.type === 'object';
}

function createStructuredFieldStateKey(field = {}) {
  return String(field.actualPath || field.schemaPath || '');
}

function parseStructuredFieldInputValue(field = {}) {
  const rawValue = String(field.inputValue ?? '').trim();

  if (!rawValue) {
    return {
      status: 'empty',
      parsedValue: field.type === 'array' ? [] : {},
      error: '',
      rawValue
    };
  }

  try {
    const parsedValue = JSON.parse(rawValue);

    if (field.type === 'array' && !Array.isArray(parsedValue)) {
      return {
        status: 'invalid',
        parsedValue: null,
        error: '当前内容不是 JSON 数组。',
        rawValue
      };
    }

    if (field.type === 'object' && !isStructuredPreviewObject(parsedValue)) {
      return {
        status: 'invalid',
        parsedValue: null,
        error: '当前内容不是 JSON 对象。',
        rawValue
      };
    }

    return {
      status: 'valid',
      parsedValue,
      error: '',
      rawValue
    };
  } catch (error) {
    return {
      status: 'invalid',
      parsedValue: null,
      error: error instanceof Error ? error.message : String(error),
      rawValue
    };
  }
}

function shortenStructuredPreviewLabel(value = '', maxLength = 20) {
  const normalized = String(value ?? '').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1))}…`;
}

function formatStructuredPreviewItem(value) {
  if (Array.isArray(value)) {
    return `数组(${value.length})`;
  }

  if (isStructuredPreviewObject(value)) {
    const keys = Object.keys(value);
    if (keys.length === 0) {
      return '{}';
    }

    return `{${shortenStructuredPreviewLabel(keys.slice(0, 2).join(', '), 18)}}`;
  }

  if (value === null) {
    return 'null';
  }

  return shortenStructuredPreviewLabel(String(value), 18);
}

function getStructuredFieldSummary(field = {}) {
  const parsed = parseStructuredFieldInputValue(field);
  const kindLabel = field.type === 'array' ? '数组' : '对象';

  if (parsed.status === 'empty') {
    return {
      ...parsed,
      kindLabel,
      countLabel: field.type === 'array' ? '空数组' : '空对象',
      helperText: '先看摘要，需要时再展开原始 JSON。',
      previewLabels: []
    };
  }

  if (parsed.status === 'invalid') {
    return {
      ...parsed,
      kindLabel,
      countLabel: 'JSON 无效',
      helperText: '当前内容不合法，展开后修正再保存。',
      previewLabels: []
    };
  }

  if (field.type === 'array') {
    const previewLabels = parsed.parsedValue.slice(0, 4).map((item) => formatStructuredPreviewItem(item));
    return {
      ...parsed,
      kindLabel,
      countLabel: parsed.parsedValue.length === 0 ? '空数组' : `${parsed.parsedValue.length} 项`,
      helperText: parsed.parsedValue.length > 0 ? '已折叠原始 JSON，按需展开编辑。' : '当前为空，展开后可直接粘贴 JSON 数组。',
      previewLabels
    };
  }

  const keys = Object.keys(parsed.parsedValue);
  return {
    ...parsed,
    kindLabel,
    countLabel: keys.length === 0 ? '空对象' : `${keys.length} 个键`,
    helperText: keys.length > 0 ? '已折叠原始 JSON，按需展开编辑。' : '当前为空，展开后可直接粘贴 JSON 对象。',
    previewLabels: keys.slice(0, 4)
  };
}

function isStructuredScalarValue(value) {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

function getStructuredFieldLeafMeta(field = {}) {
  const leaf = getPathLeafSegment(field.actualPath || '');

  if (leaf === 'args') {
    return {
      editor: 'list',
      title: '参数列表',
      hint: '一行一个参数，空行可以继续补。'
    };
  }

  if (['scopes', 'env_vars', 'enabled_tools', 'disabled_tools'].includes(leaf)) {
    return {
      editor: 'list',
      title: '列表编辑',
      hint: '一行一项，适合连续维护。'
    };
  }

  if (['env', 'http_headers', 'env_http_headers'].includes(leaf)) {
    return {
      editor: 'map',
      title: '键值对',
      hint: '左边填键名，右边填值；空行可继续添加。'
    };
  }

  return {
    editor: '',
    title: '',
    hint: ''
  };
}

function getStructuredFieldEditorMode(field = {}, summary = getStructuredFieldSummary(field)) {
  const leafMeta = getStructuredFieldLeafMeta(field);

  if (summary.status === 'invalid') {
    return {
      kind: 'raw',
      title: '',
      hint: ''
    };
  }

  if (leafMeta.editor === 'list' || leafMeta.editor === 'map') {
    return {
      kind: leafMeta.editor,
      title: leafMeta.title,
      hint: leafMeta.hint
    };
  }

  if (field.type === 'array' && summary.status === 'valid' && summary.parsedValue.every((item) => isStructuredScalarValue(item))) {
    return {
      kind: 'list',
      title: '列表编辑',
      hint: '一行一项，空行可以继续补。'
    };
  }

  if (
    field.type === 'object'
    && summary.status === 'valid'
    && Object.values(summary.parsedValue).every((item) => isStructuredScalarValue(item))
  ) {
    return {
      kind: 'map',
      title: '键值对',
      hint: '左边是键，右边是值；空行可继续添加。'
    };
  }

  return {
    kind: 'raw',
    title: '',
    hint: ''
  };
}

function normalizeStructuredListRows(field = {}, summary = getStructuredFieldSummary(field)) {
  if (summary.status === 'valid' && Array.isArray(summary.parsedValue)) {
    return [
      ...summary.parsedValue.map((item) => String(item ?? '')),
      ''
    ];
  }

  return [''];
}

function normalizeStructuredMapRows(field = {}, summary = getStructuredFieldSummary(field)) {
  if (summary.status === 'valid' && isStructuredPreviewObject(summary.parsedValue)) {
    return [
      ...Object.entries(summary.parsedValue).map(([key, value]) => ({
        key: String(key ?? ''),
        value: String(value ?? '')
      })),
      { key: '', value: '' }
    ];
  }

  return [{ key: '', value: '' }];
}

function serializeStructuredListValues(values = []) {
  return JSON.stringify(
    values
      .map((value) => String(value ?? ''))
      .filter((value) => value.trim() !== ''),
    null,
    2
  );
}

function serializeStructuredMapValues(rows = []) {
  const output = {};

  rows.forEach((row) => {
    const key = String(row?.key ?? '').trim();
    if (!key) {
      return;
    }

    output[key] = String(row?.value ?? '');
  });

  return JSON.stringify(output, null, 2);
}

function renderStructuredListEditor(field, index, editorMeta, summary) {
  const rows = normalizeStructuredListRows(field, summary);

  return `
    <section class="structured-field-editor structured-field-editor--list" data-structured-field-editor="list" data-field-index="${index}">
      <div class="structured-field-editor__header">
        <h5>${escapeHtml(editorMeta.title || '列表编辑')}</h5>
        <span class="structured-field-editor__meta">${Math.max(0, rows.length - 1)} 项</span>
      </div>
      ${editorMeta.hint ? `<p class="structured-field-editor__hint">${escapeHtml(editorMeta.hint)}</p>` : ''}
      <div class="structured-field-editor__rows">
        ${rows.map((value, rowIndex) => `
          <div class="structured-field-row structured-field-row--list" data-structured-row-index="${rowIndex}">
            <input
              class="text-input"
              type="text"
              name="schema-structured-list:${index}:${rowIndex}"
              value="${escapeHtml(value)}"
              placeholder="输入一项内容"
            />
            <button
              class="icon-button structured-field-row__remove"
              type="button"
              data-action="remove-structured-list-row"
              data-field-index="${index}"
              data-row-index="${rowIndex}"
              aria-label="移除这一项"
            >×</button>
          </div>
        `).join('')}
      </div>
    </section>
  `;
}

function renderStructuredMapEditor(field, index, editorMeta, summary) {
  const rows = normalizeStructuredMapRows(field, summary);

  return `
    <section class="structured-field-editor structured-field-editor--map" data-structured-field-editor="map" data-field-index="${index}">
      <div class="structured-field-editor__header">
        <h5>${escapeHtml(editorMeta.title || '键值对')}</h5>
        <span class="structured-field-editor__meta">${Math.max(0, rows.length - 1)} 组</span>
      </div>
      ${editorMeta.hint ? `<p class="structured-field-editor__hint">${escapeHtml(editorMeta.hint)}</p>` : ''}
      <div class="structured-field-editor__rows">
        ${rows.map((row, rowIndex) => `
          <div class="structured-field-row structured-field-row--map" data-structured-row-index="${rowIndex}">
            <input
              class="text-input"
              type="text"
              name="schema-structured-map:${index}:${rowIndex}:key"
              data-role="key"
              value="${escapeHtml(row.key)}"
              placeholder="键名"
            />
            <input
              class="text-input"
              type="text"
              name="schema-structured-map:${index}:${rowIndex}:value"
              data-role="value"
              value="${escapeHtml(row.value)}"
              placeholder="值"
            />
            <button
              class="icon-button structured-field-row__remove"
              type="button"
              data-action="remove-structured-map-row"
              data-field-index="${index}"
              data-row-index="${rowIndex}"
              aria-label="移除这一组键值"
            >×</button>
          </div>
        `).join('')}
      </div>
    </section>
  `;
}

function shouldStructuredFieldStartExpanded(field = {}) {
  const summary = getStructuredFieldSummary(field);
  return summary.status !== 'valid';
}

function renderStructuredField(field, index, meta, fieldAttributes, isExpanded = false) {
  const summary = getStructuredFieldSummary(field);
  const editorMode = getStructuredFieldEditorMode(field, summary);
  const fieldKey = createStructuredFieldStateKey(field);
  const { controlId, labelId, descriptionId } = createFieldIds(`schema-field:${index}`);
  const bodyId = `${controlId}-panel`;
  const description = meta.description || '';
  const describedByIds = joinAriaIds(description ? descriptionId : '');
  const previewTextHtml = renderStructuredPreviewText(summary.previewLabels, field.type === 'array' ? 2 : 3);
  const summaryHint = [editorMode.title || '', summary.helperText].filter(Boolean).join(' · ');
  const editorHtml = editorMode.kind === 'list'
    ? renderStructuredListEditor(field, index, editorMode, summary)
    : editorMode.kind === 'map'
      ? renderStructuredMapEditor(field, index, editorMode, summary)
      : '';

  return renderFieldShell({
    as: 'div',
    label: field.title,
    description,
    labelMeta: meta.labelMeta,
    detailsHtml: meta.detailsHtml,
    span: 'full',
    labelId,
    descriptionId,
    fieldAttributes,
    controlClassName: 'field-control--structured',
    control: `
      <div class="structured-field-shell ${isExpanded ? 'is-expanded' : ''} structured-field-shell--${summary.status}" data-structured-field-key="${escapeHtml(fieldKey)}">
        <div class="structured-field-shell__toolbar">
          <div class="structured-field-shell__summary">
            <div class="structured-field-shell__summary-row">
              <span class="structured-field-shell__count">${escapeHtml(summary.countLabel)}</span>
              ${summary.status === 'invalid' ? `<span class="structured-field-shell__state structured-field-shell__state--danger">${escapeHtml(summary.error || '当前 JSON 无效')}</span>` : ''}
            </div>
            ${summaryHint ? `<p class="structured-field-shell__hint">${escapeHtml(summaryHint)}</p>` : ''}
            ${previewTextHtml}
          </div>
          <div class="structured-field-shell__actions">
            <button
              class="mini-button structured-field-shell__action"
              type="button"
              data-action="toggle-structured-field"
              data-structured-field-key="${escapeHtml(fieldKey)}"
              aria-expanded="${isExpanded ? 'true' : 'false'}"
              aria-controls="${escapeHtml(bodyId)}"
            >${isExpanded ? '收起 JSON' : '查看 JSON'}</button>
            <button
              class="mini-button structured-field-shell__action"
              type="button"
              data-action="format-structured-field"
              data-field-index="${index}"
              ${summary.status !== 'valid' ? 'disabled' : ''}
            >格式化</button>
          </div>
        </div>
        ${editorHtml}
        <div class="structured-field-shell__body" id="${escapeHtml(bodyId)}" ${isExpanded ? '' : 'hidden'}>
          <textarea${renderAttributes({
      class: 'text-area text-area--structured-json',
      id: controlId,
      name: `schema-field:${index}`,
      rows: 7,
      placeholder: field.type === 'array' ? '[]' : '{}',
      'aria-labelledby': labelId,
      'aria-describedby': describedByIds
    })}>${escapeHtml(field.inputValue)}</textarea>
        </div>
      </div>
    `
  });
}

function shouldUseDenseFieldLayout(fields = [], { compact = false } = {}) {
  if (compact || !Array.isArray(fields) || fields.length < 5) {
    return false;
  }

  const structuredCount = fields.filter(({ field }) => isStructuredField(field)).length;
  const primitiveCount = fields.length - structuredCount;

  return primitiveCount >= 4 || (fields.length >= 6 && structuredCount <= 2);
}

function shouldUseCompactCollectionLayout(collection = {}) {
  const fields = Array.isArray(collection.fields) ? collection.fields : [];
  if (fields.length < 3) {
    return false;
  }

  const context = [
    collection.eyebrow,
    collection.title,
    collection.pathLabel
  ].filter(Boolean).join(' ').toLowerCase();
  const structuredCount = fields.filter(({ field }) => isStructuredField(field)).length;
  const primitiveCount = fields.length - structuredCount;

  return /mcp|server|provider|profile/.test(context)
    || (fields.length >= 4 && primitiveCount >= 3 && structuredCount <= 1);
}

function renderFieldList(
  fields = [],
  { compact = false, pathPrefix = '', openStructuredFieldKeySet = new Set(), presentation = 'default' } = {}
) {
  if (!Array.isArray(fields) || fields.length === 0) {
    return '';
  }

  const useDenseLayout = shouldUseDenseFieldLayout(fields, { compact });

  return `
    <div class="schema-field-list ${compact ? 'schema-field-list--compact' : ''} ${useDenseLayout ? 'schema-field-list--dense' : ''} ${presentation === 'mcp' ? 'schema-field-list--mcp' : ''}">
      ${fields.map(({ field, index }) => renderField(field, index, {
      compact,
      pathPrefix,
      openStructuredFieldKeySet,
      presentation
    })).join('')}
    </div>
  `;
}

function renderField(
  field,
  index,
  { compact = false, pathPrefix = '', openStructuredFieldKeySet = new Set(), presentation = 'default' } = {}
) {
  const meta = getFieldMetaPresentation(field, { compact, pathPrefix, presentation });
  const fieldAttributes = {
    class: `schema-field-card schema-field-card--${meta.tone}${compact ? ' schema-field-card--compact' : ''}`
  };

  if (field.type === 'boolean') {
    return renderSelect({
      label: field.title,
      name: `schema-field:${index}`,
      value: field.inputValue,
      description: meta.description,
      labelMeta: meta.labelMeta,
      detailsHtml: meta.detailsHtml,
      fieldAttributes,
      options: [
        { value: '', label: '未设置 / 删除该字段' },
        { value: 'true', label: 'true' },
        { value: 'false', label: 'false' }
      ]
    });
  }

  if (field.type === 'null') {
    return renderSelect({
      label: field.title,
      name: `schema-field:${index}`,
      value: field.inputValue,
      description: meta.description ? `${meta.description} · 当前值为 null。` : '当前值为 null。',
      labelMeta: meta.labelMeta,
      detailsHtml: meta.detailsHtml,
      fieldAttributes,
      options: [
        { value: '', label: '删除该字段' },
        { value: 'null', label: 'null' }
      ]
    });
  }

  if (Array.isArray(field.enumValues) && field.enumValues.length > 0) {
    return renderSelect({
      label: field.title,
      name: `schema-field:${index}`,
      value: field.inputValue,
      description: meta.description,
      labelMeta: meta.labelMeta,
      detailsHtml: meta.detailsHtml,
      fieldAttributes,
      options: [{ value: '', label: '未设置 / 删除该字段' }, ...field.enumValues.map((option) => ({ value: String(option), label: String(option) }))]
    });
  }

  if (field.type === 'array' || field.type === 'object') {
    return renderStructuredField(
      field,
      index,
      meta,
      fieldAttributes,
      openStructuredFieldKeySet.has(createStructuredFieldStateKey(field))
    );
  }

  const datalist = Array.isArray(field.suggestedValues) && field.suggestedValues.length > 0
    ? field.suggestedValues.map((option) => ({ value: String(option), label: String(option) }))
    : null;

  return renderTextInput({
    label: field.title,
    name: `schema-field:${index}`,
    value: field.inputValue,
    description: meta.description,
    labelMeta: meta.labelMeta,
    detailsHtml: meta.detailsHtml,
    type: field.type === 'integer' || field.type === 'number' ? 'number' : 'text',
    placeholder: field.type === 'string'
      ? (field.defaultValue === undefined ? '留空将保留为空字符串' : `默认：${field.defaultValue}`)
      : (field.defaultValue === undefined ? '留空表示删除该字段' : `默认：${field.defaultValue}`),
    datalist,
    fieldAttributes
  });
}

function renderSchemaSyncNote(summary = {}) {
  if (!summary?.error) {
    return '';
  }

  if (summary.source === 'stale-cache') {
    return `
      <div class="schema-note schema-note--warning">
        <strong>本次联网刷新失败，当前继续使用最近一次缓存 schema。</strong>
        <p>界面仍会基于上次成功同步的官方字段信息增强本地映射；你可以稍后再次点击刷新。</p>
        <code class="schema-note__code">${escapeHtml(summary.error)}</code>
      </div>
    `;
  }

  return `
    <div class="schema-note schema-note--warning">
      <strong>暂未拿到官方 schema，当前按本地字段结构推断展示。</strong>
      <p>只要本地配置里已经写了字段，仍然可以继续编辑并回写；后续刷新成功后会自动补齐官方元数据。</p>
      <code class="schema-note__code">${escapeHtml(summary.error)}</code>
    </div>
  `;
}

function renderEditorFooter({
  summary = {},
  tone = 'codex',
  fieldCount = 0
} = {}) {
  const matchedCount = summary.matchedOfficialCount || 0;
  const localOnlyCount = summary.localOnlyCount ?? Math.max(0, fieldCount - matchedCount);

  return `
    <footer class="editor-footer editor-footer--${tone}">
      <div class="editor-footer__bar">
        <span class="editor-footer__stat">${matchedCount} 匹配官方</span>
        <span class="editor-footer__sep" aria-hidden="true">·</span>
        <span class="editor-footer__stat">${localOnlyCount} 本地扩展</span>
      </div>
      ${renderSchemaSyncNote(summary)}
    </footer>
  `;
}

function groupFields(fields = []) {
  const groups = new Map();

  fields.forEach((field, index) => {
    const key = field.groupKey || '__root__';
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push({ field, index });
  });

  return [...groups.entries()]
    .sort((left, right) => compareSchemaGroups(left[0], right[0]))
    .map(([key, items]) => ({ key, title: humanizeSchemaGroup(key), fields: items }));
}

const SETTING_ACTION_LABELS = {
  select: '选择',
  input: '输入',
  expand: '展开'
};

function createSettingDetailKey(value = '') {
  return `detail:${String(value || '')}`;
}

function createMcpDetailKey(groupKey = '') {
  return createSettingDetailKey(`mcp:${groupKey}`);
}

function createRawJsonStateKey(field = {}) {
  return `raw:${String(field.actualPath || field.title || '')}`;
}

function isSecretLikeField(field = {}) {
  const normalized = String(field.actualPath || field.title || '').toLowerCase();
  return /(token|secret|password|api[_-]?key|bearer[_-]?token|private[_-]?key)/.test(normalized);
}

function truncateSettingValue(value = '', maxLength = 48) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return '未设置';
  }

  return normalized.length > maxLength
    ? `${normalized.slice(0, Math.max(0, maxLength - 1))}…`
    : normalized;
}

function summarizeStructuredValue(field = {}, source = 'current') {
  if (source === 'default') {
    if (field.defaultValue === undefined) {
      return '未设置';
    }

    if (field.type === 'array') {
      return Array.isArray(field.defaultValue) ? `${field.defaultValue.length} 项` : '未设置';
    }

    if (field.type === 'object') {
      return isStructuredPreviewObject(field.defaultValue) ? `${Object.keys(field.defaultValue).length} 项` : '未设置';
    }

    return '未设置';
  }

  const summary = getStructuredFieldSummary(field);
  if (summary.status === 'invalid') {
    return 'JSON 无效';
  }

  if (summary.status === 'empty') {
    return '0 项';
  }

  if (field.type === 'array') {
    return Array.isArray(summary.parsedValue) ? `${summary.parsedValue.length} 项` : '0 项';
  }

  return isStructuredPreviewObject(summary.parsedValue)
    ? `${Object.keys(summary.parsedValue).length} 项`
    : '0 项';
}

function formatFieldValueSummary(field = {}, source = 'current') {
  if (field.type === 'array' || field.type === 'object') {
    return summarizeStructuredValue(field, source);
  }

  const rawValue = source === 'default'
    ? field.defaultValue
    : String(field.inputValue || '').trim();

  if (source === 'default') {
    if (rawValue === undefined) {
      return '未设置';
    }

    if (rawValue === null) {
      return 'null';
    }

    if (typeof rawValue === 'boolean') {
      return rawValue ? 'true' : 'false';
    }

    if (typeof rawValue === 'number') {
      return String(rawValue);
    }

    if (isSecretLikeField(field) && String(rawValue).trim()) {
      return '已设置';
    }

    return truncateSettingValue(rawValue);
  }

  if (field.type === 'null') {
    return rawValue === 'null' ? 'null' : '未设置';
  }

  if (field.type === 'boolean') {
    return rawValue === 'true' || rawValue === 'false' ? rawValue : '未设置';
  }

  if (!rawValue) {
    return '未设置';
  }

  if (isSecretLikeField(field)) {
    return '已设置';
  }

  return truncateSettingValue(rawValue);
}

function getFieldActionKind(field = {}) {
  if (field.type === 'array' || field.type === 'object') {
    return 'expand';
  }

  if (
    field.type === 'boolean'
    || field.type === 'null'
    || (Array.isArray(field.enumValues) && field.enumValues.length > 0)
    || (Array.isArray(field.suggestedValues) && field.suggestedValues.length > 0)
  ) {
    return 'select';
  }

  return 'input';
}

function getFieldChoiceOptions(field = {}) {
  if (field.type === 'boolean') {
    return [
      { value: '', label: '未设置' },
      { value: 'true', label: 'true' },
      { value: 'false', label: 'false' }
    ];
  }

  if (field.type === 'null') {
    return [
      { value: '', label: '未设置' },
      { value: 'null', label: 'null' }
    ];
  }

  if (Array.isArray(field.enumValues) && field.enumValues.length > 0) {
    return [
      { value: '', label: '未设置' },
      ...field.enumValues.map((option) => ({
        value: String(option),
        label: String(option)
      }))
    ];
  }

  if (Array.isArray(field.suggestedValues) && field.suggestedValues.length > 0) {
    return [
      { value: '', label: '未设置' },
      ...field.suggestedValues.map((option) => ({
        value: String(option),
        label: String(option)
      }))
    ];
  }

  return [];
}

function renderSettingActionBadge(actionKind = 'input') {
  const label = SETTING_ACTION_LABELS[actionKind] || SETTING_ACTION_LABELS.input;
  return `<span class="config-setting-action config-setting-action--${actionKind}">${escapeHtml(label)}</span>`;
}

function renderSettingChoiceControl(field, index) {
  const actionKind = getFieldActionKind(field);
  const controlKey = `field-${index}`;
  const panelId = `config-choice-panel-${index}`;
  const options = getFieldChoiceOptions(field);
  const currentLabel = formatFieldValueSummary(field);

  if (actionKind === 'select' && Array.isArray(field.suggestedValues) && field.suggestedValues.length > 0 && !Array.isArray(field.enumValues)) {
    return `
      <div class="config-choice config-choice--combobox" data-choice-control="${escapeHtml(controlKey)}">
        <div class="config-choice__shell">
          <input
            class="config-choice__input"
            type="text"
            name="schema-field:${index}"
            value="${escapeHtml(field.inputValue || '')}"
            data-field-focus="${index}"
            placeholder="输入或选择"
            autocomplete="off"
            spellcheck="false"
            data-choice-filter="true"
            data-choice-control-key="${escapeHtml(controlKey)}"
            aria-expanded="false"
            aria-haspopup="listbox"
            aria-controls="${escapeHtml(panelId)}"
          />
          <button
            class="config-choice__toggle"
            type="button"
            data-action="toggle-setting-choice"
            data-choice-control-key="${escapeHtml(controlKey)}"
            aria-label="展开可选项"
            aria-expanded="false"
            aria-haspopup="listbox"
            aria-controls="${escapeHtml(panelId)}"
          >⌄</button>
        </div>
        <div class="config-choice__panel" id="${escapeHtml(panelId)}" role="listbox" hidden>
          ${options.map((option) => `
            <button
              class="config-choice__option ${String(option.value) === String(field.inputValue || '') ? 'is-selected' : ''}"
              type="button"
              role="option"
              data-action="select-setting-choice"
              data-field-index="${index}"
              data-choice-control-key="${escapeHtml(controlKey)}"
              data-choice-value="${escapeHtml(encodeURIComponent(option.value))}"
            >${escapeHtml(option.label)}</button>
          `).join('')}
        </div>
      </div>
    `;
  }

  if (actionKind === 'select') {
    return `
      <div class="config-choice config-choice--select" data-choice-control="${escapeHtml(controlKey)}">
        <input type="hidden" name="schema-field:${index}" value="${escapeHtml(field.inputValue || '')}" />
        <button
          class="config-choice__button"
          type="button"
          data-field-focus="${index}"
          data-action="toggle-setting-choice"
          data-choice-control-key="${escapeHtml(controlKey)}"
          aria-label="展开可选项"
          aria-expanded="false"
          aria-haspopup="listbox"
          aria-controls="${escapeHtml(panelId)}"
        >
          <span class="config-choice__button-label">${escapeHtml(currentLabel)}</span>
          <span class="config-choice__button-icon" aria-hidden="true">⌄</span>
        </button>
        <div class="config-choice__panel" id="${escapeHtml(panelId)}" role="listbox" hidden>
          ${options.map((option) => `
            <button
              class="config-choice__option ${String(option.value) === String(field.inputValue || '') ? 'is-selected' : ''}"
              type="button"
              role="option"
              data-action="select-setting-choice"
              data-field-index="${index}"
              data-choice-control-key="${escapeHtml(controlKey)}"
              data-choice-value="${escapeHtml(encodeURIComponent(option.value))}"
            >${escapeHtml(option.label)}</button>
          `).join('')}
        </div>
      </div>
    `;
  }

  return `
    <input
      class="config-setting-input"
      type="${field.type === 'integer' || field.type === 'number' ? 'number' : 'text'}"
      name="schema-field:${index}"
      data-field-focus="${index}"
      value="${escapeHtml(field.inputValue || '')}"
      placeholder="请输入"
      autocomplete="off"
      spellcheck="false"
    />
  `;
}

function renderStructuredSettingDetail(field, index, openRawJsonKeySet = new Set()) {
  const summary = getStructuredFieldSummary(field);
  const editorMode = getStructuredFieldEditorMode(field, summary);
  const editorHtml = editorMode.kind === 'list'
    ? renderStructuredListEditor(field, index, editorMode, summary)
    : editorMode.kind === 'map'
      ? renderStructuredMapEditor(field, index, editorMode, summary)
      : '';
  const rawJsonKey = createRawJsonStateKey(field);
  const shouldShowRawJson = editorMode.kind === 'raw' || summary.status !== 'valid' || openRawJsonKeySet.has(rawJsonKey);

  const fieldDescription = field.description ? shortenFieldDescription(field.description, 240) : '';
  const fieldPath = field.actualPath || '';
  const typeLabel = getFieldTypeLabel(field.type);

  return `
    <div class="config-setting-detail">
      <div class="config-setting-detail__meta">
        <div class="config-setting-detail__identity">
          <code class="config-setting-detail__path">${escapeHtml(fieldPath)}</code>
          <span class="config-setting-detail__type">${escapeHtml(typeLabel)}</span>
        </div>
        <div class="config-setting-detail__actions">
          ${editorMode.kind !== 'raw' ? `
            <button
              class="mini-button"
              type="button"
              data-action="toggle-setting-raw-json"
              data-raw-json-key="${escapeHtml(rawJsonKey)}"
            >${shouldShowRawJson ? '收起 JSON' : '原始 JSON'}</button>
          ` : ''}
          <button
            class="mini-button"
            type="button"
            data-action="format-structured-field"
            data-field-index="${index}"
            ${summary.status !== 'valid' ? 'disabled' : ''}
          >格式化</button>
        </div>
      </div>
      ${fieldDescription ? `<p class="config-setting-detail__desc">${escapeHtml(fieldDescription)}</p>` : ''}
      ${summary.helperText ? `<p class="config-setting-detail__helper">${escapeHtml(summary.helperText)}</p>` : ''}
      ${editorHtml}
      ${shouldShowRawJson ? `
        <textarea${renderAttributes({
      class: 'text-area text-area--structured-json config-setting-detail__json',
      name: `schema-field:${index}`,
      rows: 7,
      placeholder: field.type === 'array' ? '[]' : '{}'
    })}>${escapeHtml(field.inputValue || '')}</textarea>
      ` : ''}
    </div>
  `;
}

function getMcpGroupCurrentSummary(group = {}) {
  const layout = createGroupFieldLayout(group);
  return `${layout.nestedGroups.length} 个服务`;
}

function getModelProviderGroupCurrentSummary(group = {}) {
  const layout = createGroupFieldLayout(group);
  return `${layout.nestedGroups.length} 个提供方`;
}

function getGroupDetailKey(groupKey = '') {
  if (isMcpGroupKey(groupKey)) {
    return createMcpDetailKey(groupKey);
  }

  if (isModelProviderGroupKey(groupKey)) {
    return createSettingDetailKey(`provider:${groupKey}`);
  }

  return '';
}

function getAvailableDetailKeys(groups = []) {
  const keys = [];

  groups.forEach((group) => {
    const groupDetailKey = getGroupDetailKey(group.key);
    if (groupDetailKey) {
      keys.push(groupDetailKey);
    }

    group.fields.forEach(({ field }) => {
      if (isStructuredField(field)) {
        keys.push(createSettingDetailKey(field.actualPath));
      }
    });
  });

  return keys.filter(Boolean);
}

function getAvailableRawJsonKeys(groups = []) {
  return groups.flatMap((group) => group.fields
    .map(({ field }) => isStructuredField(field) ? createRawJsonStateKey(field) : '')
    .filter(Boolean));
}

function renderFieldSettingRow(
  item,
  {
    detailKeySet = new Set(),
    openRawJsonKeySet = new Set(),
    detailScope = '',
    nested = false
  } = {}
) {
  const { field, index } = item;
  const actionKind = getFieldActionKind(field);
  const detailKey = createSettingDetailKey(field.actualPath);
  const isExpanded = actionKind === 'expand' && detailKeySet.has(detailKey);

  return `
    <section class="config-setting-row ${nested ? 'config-setting-row--nested' : ''} ${isExpanded ? 'is-expanded' : ''}" data-setting-key="${escapeHtml(field.actualPath)}">
      <div class="config-setting-row__grid">
        <div class="config-setting-row__name" title="${escapeHtml(field.actualPath || field.title)}">
          <span class="config-setting-row__title">${escapeHtml(field.title)}</span>
          ${field.description ? `<span class="config-setting-row__desc">${escapeHtml(field.description)}</span>` : ''}
        </div>
        <div class="config-setting-row__current">
          ${actionKind === 'expand'
    ? `
              <button
                class="config-setting-summary"
                type="button"
                data-field-focus="${index}"
                data-action="toggle-setting-detail"
                data-detail-key="${escapeHtml(detailKey)}"
                data-detail-scope="${escapeHtml(detailScope)}"
                aria-expanded="${isExpanded ? 'true' : 'false'}"
              >${escapeHtml(formatFieldValueSummary(field))}</button>
            `
    : renderSettingChoiceControl(field, index)}
        </div>
        <div class="config-setting-row__default">默认：${escapeHtml(formatFieldValueSummary(field, 'default'))}</div>
        <div class="config-setting-row__action-cell">
          ${renderSettingActionBadge(actionKind)}
        </div>
      </div>
      ${isExpanded ? `
        <div class="config-setting-row__detail">
          ${renderStructuredSettingDetail(field, index, openRawJsonKeySet)}
        </div>
      ` : ''}
    </section>
  `;
}

function renderSettingRows(
  items = [],
  {
    detailKeySet = new Set(),
    openRawJsonKeySet = new Set(),
    detailScope = '',
    nested = false
  } = {}
) {
  if (!Array.isArray(items) || items.length === 0) {
    return '';
  }

  return items.map((item) => renderFieldSettingRow(item, {
    detailKeySet,
    openRawJsonKeySet,
    detailScope,
    nested
  })).join('');
}

function renderConfigSubsection({
  title = '',
  hint = '',
  count = 0,
  meta = '',
  bodyHtml = '',
  modifier = ''
} = {}) {
  if (!bodyHtml) {
    return '';
  }

  return `
    <section class="config-subsection ${modifier ? `config-subsection--${modifier}` : ''}">
      <div class="config-subsection__header">
        <div class="config-subsection__header-copy">
          <strong>${escapeHtml(title)}</strong>
          ${hint ? `<p class="config-subsection__hint">${escapeHtml(hint)}</p>` : ''}
        </div>
        <span>${count} 项</span>
      </div>
      ${meta ? `<div class="config-subsection__meta">${escapeHtml(meta)}</div>` : ''}
      <div class="config-subsection__body">
        ${bodyHtml}
      </div>
    </section>
  `;
}

function renderMcpServiceOverview(layout = {}) {
  const overviewItems = [
    layout.commandValue ? `命令 · ${layout.commandValue}` : '',
    layout.urlValue ? `地址 · ${layout.urlValue}` : '',
    layout.argsCount > 0 ? `${layout.argsCount} 个参数` : '',
    layout.envCount > 0 ? `${layout.envCount} 个环境变量` : '',
    layout.toolsCount > 0 ? `${layout.toolsCount} 组工具规则` : ''
  ].filter(Boolean);

  if (overviewItems.length === 0) {
    return '';
  }

  return `
    <div class="config-mcp-service-overview">
      ${overviewItems.map((item) => `<span class="config-mcp-service-overview__item">${escapeHtml(item)}</span>`).join('')}
    </div>
  `;
}

function renderMcpServiceDetail(
  activeService,
  groupKey = '',
  detailKeySet = new Set(),
  openRawJsonKeySet = new Set()
) {
  if (!activeService) {
    return '<div class="config-mcp-empty">当前还没有 MCP 服务实例。</div>';
  }

  const layout = createMcpServerLayout({
    fields: activeService.fields,
    pathLabel: activeService.pathLabel || ''
  });
  const launchBody = layout.primaryFields.length > 0
    ? renderSettingRows(layout.primaryFields, {
      detailKeySet,
      openRawJsonKeySet,
      detailScope: `${groupKey}::${activeService.key}::launch`,
      nested: true
    })
    : '';
  const sectionBodies = layout.sections.map((section) => renderConfigSubsection({
    title: section.title,
    hint: section.hint,
    count: section.fields.length,
    meta: section.pathLabel || '',
    bodyHtml: renderSettingRows(section.fields, {
      detailKeySet,
      openRawJsonKeySet,
      detailScope: `${groupKey}::${activeService.key}::${section.key}`,
      nested: true
    })
  })).join('');

  return `
    ${renderMcpServiceOverview(layout)}
    ${launchBody ? renderConfigSubsection({
      title: '连接与启动',
      hint: '先确认命令、URL、参数和工作目录。',
      count: layout.primaryFields.length,
      meta: activeService.pathLabel || '',
      bodyHtml: launchBody,
      modifier: 'mcp-active'
    }) : ''}
    ${sectionBodies || (!launchBody ? '<div class="config-mcp-empty">当前服务还没有可显示的配置项。</div>' : '')}
  `;
}

function renderModelProviderOverview(layout = {}) {
  const overviewItems = [
    layout.baseUrlValue ? `地址 · ${layout.baseUrlValue}` : '',
    layout.wireApiValue ? `协议 · ${layout.wireApiValue}` : '',
    layout.envKeyValue ? `凭据键 · ${layout.envKeyValue}` : '',
    layout.capabilityCount > 0 ? `${layout.capabilityCount} 项能力限制` : '',
    layout.headerCount > 0 ? `${layout.headerCount} 个请求头` : ''
  ].filter(Boolean);

  if (overviewItems.length === 0) {
    return '';
  }

  return `
    <div class="config-provider-overview">
      ${overviewItems.map((item) => `<span class="config-provider-overview__item">${escapeHtml(item)}</span>`).join('')}
    </div>
  `;
}

function renderModelProviderDetail(
  activeProvider,
  groupKey = '',
  detailKeySet = new Set(),
  openRawJsonKeySet = new Set()
) {
  if (!activeProvider) {
    return '<div class="config-provider-empty">当前还没有模型提供方实例。</div>';
  }

  const layout = createModelProviderLayout({
    fields: activeProvider.fields,
    pathLabel: activeProvider.pathLabel || ''
  });
  const connectionBody = layout.primaryFields.length > 0
    ? renderSettingRows(layout.primaryFields, {
      detailKeySet,
      openRawJsonKeySet,
      detailScope: `${groupKey}::${activeProvider.key}::connection`,
      nested: true
    })
    : '';
  const sectionBodies = layout.sections.map((section) => renderConfigSubsection({
    title: section.title,
    hint: section.hint,
    count: section.fields.length,
    meta: section.pathLabel || '',
    bodyHtml: renderSettingRows(section.fields, {
      detailKeySet,
      openRawJsonKeySet,
      detailScope: `${groupKey}::${activeProvider.key}::${section.key}`,
      nested: true
    })
  })).join('');

  return `
    ${renderModelProviderOverview(layout)}
    ${connectionBody ? renderConfigSubsection({
      title: '连接与协议',
      hint: '提供方的地址、凭据键和 wire_api 放在这里。',
      count: layout.primaryFields.length,
      meta: activeProvider.pathLabel || '',
      bodyHtml: connectionBody,
      modifier: 'provider-active'
    }) : ''}
    ${sectionBodies || (!connectionBody ? '<div class="config-provider-empty">当前提供方还没有可显示的配置项。</div>' : '')}
  `;
}

function renderModelProviderGroupDetail(
  group,
  detailKeySet = new Set(),
  openRawJsonKeySet = new Set(),
  {
    activeProviderKey = '',
    tone = 'codex'
  } = {}
) {
  const layout = createGroupFieldLayout(group);
  const providerSections = layout.nestedGroups.map((nestedGroup) => ({
    key: nestedGroup.key,
    label: nestedGroup.title,
    metaLabel: nestedGroup.pathLabel || '',
    count: nestedGroup.fields.length,
    pathLabel: nestedGroup.pathLabel || '',
    fields: nestedGroup.fields
  }));
  const activeProvider = providerSections.find((section) => section.key === activeProviderKey) || providerSections[0] || null;

  return `
    <div class="config-setting-detail config-setting-detail--provider">
      <div class="config-provider-summary">
        <span class="config-provider-summary__item">${layout.nestedGroups.length} 个提供方</span>
        ${layout.directFields.length > 0 ? `<span class="config-provider-summary__item">${layout.directFields.length} 项共享默认</span>` : ''}
        ${activeProvider ? `<span class="config-provider-summary__item config-provider-summary__item--active">当前提供方 · ${escapeHtml(activeProvider.label)}</span>` : ''}
      </div>
      ${layout.directFields.length > 0 ? `
        ${renderConfigSubsection({
      title: '共享默认',
      hint: '所有提供方共用的默认项放这里，实例设置优先覆盖。',
      count: layout.directFields.length,
      bodyHtml: renderSettingRows(layout.directFields, {
      detailKeySet,
      openRawJsonKeySet,
      detailScope: `${group.key}::shared`,
      nested: true
    }),
      modifier: 'provider-shared'
    })}
      ` : ''}
      ${providerSections.length > 1 ? `
        <div class="config-provider-tabs">
          ${renderSettingsSectionTabs(providerSections, activeProvider?.key || '', tone)}
        </div>
      ` : ''}
      ${renderModelProviderDetail(activeProvider, group.key, detailKeySet, openRawJsonKeySet)}
    </div>
  `;
}

function renderMcpGroupDetail(
  group,
  detailKeySet = new Set(),
  openRawJsonKeySet = new Set(),
  {
    activeServiceKey = '',
    tone = 'codex'
  } = {}
) {
  const layout = createGroupFieldLayout(group);
  const serviceSections = layout.nestedGroups.map((nestedGroup) => ({
    key: nestedGroup.key,
    label: nestedGroup.title,
    metaLabel: nestedGroup.pathLabel || '',
    count: nestedGroup.fields.length,
    pathLabel: nestedGroup.pathLabel || '',
    fields: nestedGroup.fields
  }));
  const activeService = serviceSections.find((section) => section.key === activeServiceKey) || serviceSections[0] || null;

  return `
    <div class="config-setting-detail config-setting-detail--mcp">
      <div class="config-mcp-summary">
        <span class="config-mcp-summary__item">${layout.nestedGroups.length} 个服务</span>
        ${layout.directFields.length > 0 ? `<span class="config-mcp-summary__item">${layout.directFields.length} 项全局默认</span>` : ''}
        ${activeService ? `<span class="config-mcp-summary__item config-mcp-summary__item--active">当前服务 · ${escapeHtml(activeService.label)}</span>` : ''}
      </div>
      ${layout.directFields.length > 0 ? `
        ${renderConfigSubsection({
      title: '全局默认',
      hint: '所有服务共用的默认项放这里，实例级设置在各自服务里覆盖。',
      count: layout.directFields.length,
      bodyHtml: renderSettingRows(layout.directFields, {
      detailKeySet,
      openRawJsonKeySet,
      detailScope: `${group.key}::shared`,
      nested: true
    }),
      modifier: 'mcp-shared'
    })}
      ` : ''}
      ${serviceSections.length > 1 ? `
        <div class="config-mcp-tabs">
          ${renderSettingsSectionTabs(serviceSections, activeService?.key || '', tone)}
        </div>
      ` : ''}
      ${renderMcpServiceDetail(activeService, group.key, detailKeySet, openRawJsonKeySet)}
    </div>
  `;
}

function renderSettingsSectionTabs(
  sections = [],
  activeSectionKey = '',
  tone = 'codex',
  {
    showMetaLabel = true,
    compact = false
  } = {}
) {
  if (!Array.isArray(sections) || sections.length <= 1) {
    return '';
  }

  return `
    <div class="schema-tabs schema-tabs--${tone} config-inline-tabs ${compact ? 'config-inline-tabs--compact' : ''}" role="tablist" aria-label="当前分组子项">
      ${sections.map((section) => `
        <button
          class="schema-tab ${section.key === activeSectionKey ? 'is-active' : ''}"
          type="button"
          role="tab"
          aria-selected="${section.key === activeSectionKey ? 'true' : 'false'}"
          data-action="activate-schema-section"
          data-section-key="${escapeHtml(section.key)}"
        >
          <span class="config-inline-tab__content">
            <span class="schema-tab__label">${escapeHtml(section.tabLabel || section.label)}</span>
            ${showMetaLabel && section.metaLabel && section.metaLabel !== (section.tabLabel || section.label) ? `<span class="config-inline-tab__meta">${escapeHtml(section.metaLabel)}</span>` : ''}
          </span>
          <span class="schema-tab__count">${section.count}</span>
        </button>
      `).join('')}
    </div>
  `;
}

function renderSettingsSectionTabsPanel(
  sections = [],
  activeSectionKey = '',
  tone = 'codex',
  {
    title = '二级分类',
    description = '把同一分组下的内容拆开看，避免所有字段堆在一起。',
    compact = false,
    showMetaLabel = true
  } = {}
) {
  if (!Array.isArray(sections) || sections.length <= 1) {
    return '';
  }

  return `
    <section class="config-subtabs-panel config-subtabs-panel--${tone} ${compact ? 'config-subtabs-panel--compact' : ''}">
      <div class="config-subtabs-panel__header">
        <div>
          <span class="config-subtabs-panel__eyebrow">${escapeHtml(title)}</span>
          <p class="config-subtabs-panel__description">${escapeHtml(description)}</p>
        </div>
        <span class="config-subtabs-panel__count">${sections.length} 个视图</span>
      </div>
      ${renderSettingsSectionTabs(sections, activeSectionKey, tone, {
        showMetaLabel,
        compact
      })}
    </section>
  `;
}

function renderSettingsWorkspace({
  groups = [],
  activeGroupKey = '',
  activeSectionKey = '',
  searchQuery = '',
  activeTab = 'all',
  tone = 'codex',
  detailKeySet = new Set(),
  openRawJsonKeySet = new Set()
} = {}) {
  if (!Array.isArray(groups) || groups.length === 0) {
    return `
      <div class="editor-empty-state">
        <p class="empty-state-title">没有可显示的设置</p>
        <p class="empty-state-description">可以清空搜索，或者先添加一个字段。</p>
      </div>
    `;
  }

  const activeGroup = groups.find((group) => group.key === activeGroupKey) || groups[0];
  if (!activeGroup) {
    return '';
  }

  const layout = createGroupFieldLayout(activeGroup);
  const rootSections = activeGroup.key === '__root__'
    ? buildRootSemanticSections(activeGroup.fields)
    : [];
  const mcpSections = isMcpGroupKey(activeGroup.key)
    ? layout.nestedGroups.map((section) => ({
      key: section.key,
      label: section.title,
      metaLabel: section.pathLabel || '',
      count: section.fields.length,
      fields: section.fields,
      pathLabel: section.pathLabel || ''
    }))
    : [];
  const modelProviderSections = isModelProviderGroupKey(activeGroup.key)
    ? layout.nestedGroups.map((section) => ({
      key: section.key,
      label: section.title,
      metaLabel: section.pathLabel || '',
      count: section.fields.length,
      fields: section.fields,
      pathLabel: section.pathLabel || ''
    }))
    : [];
  const nestedSections = !isMcpGroupKey(activeGroup.key) && !isModelProviderGroupKey(activeGroup.key) && layout.shouldNest
    ? [
      ...(layout.directFields.length > 0 ? [{
        key: '__direct__',
        label: '基础项',
        metaLabel: activeGroup.key === '__root__' ? '直接字段' : activeGroup.key,
        count: layout.directFields.length,
        fields: layout.directFields
      }] : []),
      ...layout.nestedGroups.map((section) => ({
        key: section.key,
        label: section.title,
        metaLabel: section.pathLabel || '',
        count: section.fields.length,
        fields: section.fields,
        pathLabel: section.pathLabel || ''
      }))
    ]
    : [];
  const activeSectionPool = activeGroup.key === '__root__'
    ? rootSections
    : isMcpGroupKey(activeGroup.key)
    ? mcpSections
    : isModelProviderGroupKey(activeGroup.key)
      ? modelProviderSections
      : nestedSections;
  const activeSection = activeSectionPool.find((section) => section.key === activeSectionKey) || activeSectionPool[0] || null;
  const contextPath = activeSection?.pathLabel || (activeGroup.key !== '__root__' ? activeGroup.key : '');
  const activeGroupDescription = getSchemaGroupDescription(activeGroup.key);
  const activeSectionDescription = activeSection?.description
    || `当前查看 ${activeSection?.label || activeGroup.title}，共 ${activeSection?.fields?.length || activeGroup.fields.length} 项设置。`;
  const activeSectionTabs = activeGroup.key === '__root__'
    ? rootSections
    : nestedSections;

  const listHeader = `
    <div class="config-setting-list__header" aria-hidden="true">
      <span>设置</span>
      <span>当前值</span>
      <span>默认值</span>
      <span>动作</span>
    </div>
  `;

  const listBody = isMcpGroupKey(activeGroup.key)
    ? `
      <section class="config-setting-row ${detailKeySet.has(getGroupDetailKey(activeGroup.key)) ? 'is-expanded' : ''}" data-setting-key="${escapeHtml(activeGroup.key)}">
        <div class="config-setting-row__grid">
          <div class="config-setting-row__name">
            <span class="config-setting-row__title">MCP 服务</span>
          </div>
          <div class="config-setting-row__current">
            <button
              class="config-setting-summary"
              type="button"
              data-action="toggle-setting-detail"
              data-detail-key="${escapeHtml(getGroupDetailKey(activeGroup.key))}"
              data-detail-scope="${escapeHtml(activeGroup.key)}"
              aria-expanded="${detailKeySet.has(getGroupDetailKey(activeGroup.key)) ? 'true' : 'false'}"
            >${escapeHtml(getMcpGroupCurrentSummary(activeGroup))}</button>
          </div>
          <div class="config-setting-row__default">默认：未设置</div>
          <div class="config-setting-row__action-cell">${renderSettingActionBadge('expand')}</div>
        </div>
        ${detailKeySet.has(getGroupDetailKey(activeGroup.key)) ? `
          <div class="config-setting-row__detail">
            ${renderMcpGroupDetail(activeGroup, detailKeySet, openRawJsonKeySet, {
      activeServiceKey: activeSection?.key || '',
      tone
    })}
          </div>
        ` : ''}
      </section>
    `
    : isModelProviderGroupKey(activeGroup.key)
      ? `
      <section class="config-setting-row ${detailKeySet.has(getGroupDetailKey(activeGroup.key)) ? 'is-expanded' : ''}" data-setting-key="${escapeHtml(activeGroup.key)}">
        <div class="config-setting-row__grid">
          <div class="config-setting-row__name">
            <span class="config-setting-row__title">模型提供方</span>
          </div>
          <div class="config-setting-row__current">
            <button
              class="config-setting-summary"
              type="button"
              data-action="toggle-setting-detail"
              data-detail-key="${escapeHtml(getGroupDetailKey(activeGroup.key))}"
              data-detail-scope="${escapeHtml(activeGroup.key)}"
              aria-expanded="${detailKeySet.has(getGroupDetailKey(activeGroup.key)) ? 'true' : 'false'}"
            >${escapeHtml(getModelProviderGroupCurrentSummary(activeGroup))}</button>
          </div>
          <div class="config-setting-row__default">默认：未设置</div>
          <div class="config-setting-row__action-cell">${renderSettingActionBadge('expand')}</div>
        </div>
        ${detailKeySet.has(getGroupDetailKey(activeGroup.key)) ? `
          <div class="config-setting-row__detail">
            ${renderModelProviderGroupDetail(activeGroup, detailKeySet, openRawJsonKeySet, {
      activeProviderKey: activeSection?.key || '',
      tone
    })}
          </div>
        ` : ''}
      </section>
    `
    : activeSection
      ? renderSettingRows(activeSection.fields, {
        detailKeySet,
        openRawJsonKeySet,
        detailScope: `${activeGroup.key}::${activeSection.key}`
      })
    : renderSettingRows(activeGroup.fields, {
      detailKeySet,
      openRawJsonKeySet,
      detailScope: activeGroup.key
    });

  const shouldShowRail = groups.length > 1 && activeTab === 'all';

  return `
    <div class="config-workspace ${shouldShowRail ? '' : 'config-workspace--single'}">
      ${shouldShowRail ? `
      <aside class="config-rail" aria-label="设置分组">
        <div class="config-rail__label">分组</div>
        <div class="config-rail__items">
          ${groups.map((group) => `
            <button
              class="config-rail__item ${group.key === activeGroup.key ? 'is-active' : ''}"
              type="button"
              data-action="activate-schema-group"
              data-group-key="${escapeHtml(group.key)}"
            >
              <span class="config-rail__item-title">${escapeHtml(group.title)}</span>
              <span class="config-rail__item-count">${group.fields.length}</span>
            </button>
          `).join('')}
        </div>
      </aside>
      ` : ''}
      <section class="config-main">
        <div class="config-main__header">
          <div>
            <div class="config-main__context">
              <span class="config-main__context-chip">分类 · ${escapeHtml(activeGroup.title)}</span>
              ${activeGroup.key === '__root__' && activeSection?.metaLabel ? `<span class="config-main__context-chip">官方章节 · ${escapeHtml(activeSection.metaLabel)}</span>` : ''}
              ${activeSection ? `<span class="config-main__context-chip config-main__context-chip--active">对象 · ${escapeHtml(activeSection.label)}</span>` : ''}
              ${contextPath ? `<code class="config-main__context-path">${escapeHtml(contextPath)}</code>` : ''}
            </div>
            <h3>${escapeHtml(activeGroup.title)}</h3>
            <p>${escapeHtml(searchQuery ? `当前搜索命中 ${activeGroup.fields.length} 项。` : activeSection ? activeSectionDescription : (activeGroupDescription || `当前分组共 ${activeGroup.fields.length} 项设置。`))}</p>
          </div>
          <div class="config-main__meta">
            <span>${groups.length} 个分组</span>
            <span>${activeSection ? activeSection.fields.length : activeGroup.fields.length} 项</span>
          </div>
        </div>
        ${activeSectionTabs.length > 0 ? renderSettingsSectionTabsPanel(
      activeSectionTabs,
      activeSection?.key || '',
      tone,
      activeGroup.key === '__root__'
        ? {
          title: '官方章节',
          description: '按官方章节切换查看；像 Agent、权限、搜索这些能力不会再混在同一屏里。',
          compact: false,
          showMetaLabel: true
        }
        : {
          title: `${activeGroup.title} 子分类`,
          description: '按当前分组内的对象切换，减少底部长表单的理解成本。',
          compact: true,
          showMetaLabel: false
        }
    ) : ''}
        ${activeSection?.pathLabel ? `<div class="config-main__submeta">${escapeHtml(activeSection.pathLabel)}</div>` : ''}
        <div class="config-setting-list">
          ${listHeader}
          ${listBody}
        </div>
      </section>
    </div>
  `;
}

function renderSchemaDrivenEditorV2(container, { entry, draft, onDraftChange, onRefreshOfficialSchema, isRefreshingOfficialSchema = false }) {
  let currentDraft = cloneDraft(draft);
  const storedUiState = readSchemaUiState(container, entry.id);
  currentDraft = setDraftFieldInputs(currentDraft, {
    manualFieldPath: storedUiState?.manualFieldPath || currentDraft.manualFieldPath,
    manualFieldType: storedUiState?.manualFieldType || currentDraft.manualFieldType,
    officialFieldPath: storedUiState?.officialFieldPath || currentDraft.officialFieldPath
  });

  const groups = groupFields(currentDraft.schemaFields || []);
  const summary = currentDraft.officialSync || {};
  const tone = entry.assistant === 'claude' ? 'claude' : 'codex';
  const statusTone = summary.available && summary.source !== 'stale-cache' ? 'is-success' : 'is-muted';
  const searchQuery = storedUiState?.searchQuery || '';
  const tabs = [
    {
      id: 'all',
      label: 'All',
      count: groups.reduce((sum, group) => sum + group.fields.length, 0)
    },
    ...groups.map((group) => ({
      id: createSchemaTabId(group.key),
      label: getSchemaTopTabLabel(group.key),
      count: group.fields.length
    }))
  ];
  const storedActiveTab = storedUiState?.activeTab || 'all';
  const activeTab = tabs.some((tab) => tab.id === storedActiveTab)
    ? storedActiveTab
    : 'all';
  const baseGroups = searchQuery ? groups : filterGroupsByTab(groups, activeTab);
  const filteredView = filterGroups(baseGroups, searchQuery);
  const visibleGroups = filteredView.groups;
  const availableDetailKeySet = new Set(getAvailableDetailKeys(visibleGroups));
  const availableRawJsonKeySet = new Set(getAvailableRawJsonKeys(visibleGroups));
  const storedDetailKeys = Array.isArray(storedUiState?.openStructuredKeys)
    ? storedUiState.openStructuredKeys.filter((key) => availableDetailKeySet.has(key))
    : [];
  const storedOpenRawJsonKeys = Array.isArray(storedUiState?.openRawJsonKeys)
    ? storedUiState.openRawJsonKeys.filter((key) => availableRawJsonKeySet.has(key))
    : [];
  const initialActiveSectionKey = storedUiState?.activeSectionKey || '';
  const initialTemplateFieldName = normalizeTemplateItemName(storedUiState?.templateFieldName || '');
  const initialActiveGroupKey = visibleGroups.some((group) => group.key === storedUiState?.activeGroupKey)
    ? storedUiState.activeGroupKey
    : (visibleGroups[0]?.key || '');
  const addFieldPathSuggestions = buildSchemaAddPathSuggestions(currentDraft, initialTemplateFieldName);

  container.innerHTML = `
    <div class="panel-shell panel-shell--editor-v2">
      ${renderEditorToolbar({
    entry,
    tone,
    summary,
    statusTone,
    activeTab,
    tabs,
    searchQuery,
    visibleFieldCount: filteredView.visibleFieldCount,
    totalFieldCount: filteredView.totalFieldCount,
    onRefreshOfficialSchema,
    isRefreshingOfficialSchema
  })}

      ${renderSchemaTabs(tabs, activeTab, tone)}

      <main id="schema-view-panel" class="editor-content" role="main">
        ${renderSettingsWorkspace({
    groups: visibleGroups,
    activeGroupKey: initialActiveGroupKey,
    activeSectionKey: initialActiveSectionKey,
    searchQuery,
    activeTab,
    tone,
    detailKeySet: new Set(storedDetailKeys),
    openRawJsonKeySet: new Set(storedOpenRawJsonKeys)
  })}
      </main>

      ${renderEditorFooter({
    summary,
    tone,
    fieldCount: currentDraft.schemaFields?.length || 0
  })}

      <dialog class="add-field-modal" aria-labelledby="add-field-modal-title">
        <div class="modal-backdrop" data-action="close-add-field-modal"></div>
        <div class="modal-content modal-content--${tone}">
          <header class="modal-header">
            <h3 id="add-field-modal-title">添加配置项</h3>
            <button class="modal-close" type="button" data-action="close-add-field-modal" aria-label="关闭对话框">×</button>
          </header>
          <form class="modal-body">
            ${renderTextInput({
    label: '字段路径',
    name: 'schema-add-path',
    value: getManualFieldPath(currentDraft),
    placeholder: summary.available ? '例如 model 或 mcp_servers.my_server.command' : '例如 env.NODE_ENV',
    description: '支持任意完整路径，也可以直接从下拉里选择系统 schema 给出的字段建议。',
    datalist: addFieldPathSuggestions
  })}
            ${renderSelect({
    label: '类型',
    name: 'schema-add-type',
    value: getManualFieldType(currentDraft),
    options: FIELD_TYPE_OPTIONS
            })}
            <div class="modal-suggestions modal-suggestions--template">
              <label class="form-label" for="schema-template-name">实例名称</label>
              <p class="modal-template-note">用于替换复杂路径里的名称段，例如 <code>mcp_servers.&lt;name&gt;.*</code>、<code>profiles.&lt;name&gt;.*</code>，也可以直接点下面模板生成。</p>
              <input
                id="schema-template-name"
                class="text-input"
                type="text"
                name="schema-template-name"
                value="${escapeHtml(initialTemplateFieldName)}"
                placeholder="例如 my_server / my_profile"
                autocomplete="off"
                spellcheck="false"
              />
              <div class="modal-suggestions__chips modal-suggestions__chips--templates">
                ${COMPLEX_FIELD_TEMPLATES.map((template) => `
                  <button
                    class="mini-button"
                    type="button"
                    data-action="add-schema-template"
                    data-template-key="${escapeHtml(template.key)}"
                    title="${escapeHtml(template.description)}"
                  >${escapeHtml(template.label)}</button>
                `).join('')}
              </div>
            </div>
            ${(currentDraft.starterSuggestions || []).slice(0, 6).length > 0 ? `
              <div class="modal-suggestions">
                <label class="form-label">快速选择</label>
                <div class="modal-suggestions__chips">
                  ${(currentDraft.starterSuggestions || []).slice(0, 6).map((field) => `
                    <button
                      class="mini-button"
                      type="button"
                      data-action="add-schema-suggestion"
                      data-field-path="${escapeHtml(field.actualPath)}"
                      title="${escapeHtml(field.actualPath)}"
                    >${escapeHtml(field.title)}</button>
                  `).join('')}
                </div>
              </div>
            ` : ''}
          </form>
          <footer class="modal-footer">
            <button class="secondary-button" type="button" data-action="close-add-field-modal">取消</button>
            <button class="primary-button" type="button" data-action="add-schema-field">添加</button>
          </footer>
        </div>
      </dialog>
    </div>
  `;

  const modal = container.querySelector('.add-field-modal');
  let searchInputTimer = 0;
  let isSearchComposing = false;
  let modalOpenTrigger = null;
  let choiceOpenKey = '';
  let currentUiState = {
    openKeys: Array.isArray(storedUiState?.openKeys) ? storedUiState.openKeys.filter(Boolean) : [],
    openClusterKeys: Array.isArray(storedUiState?.openClusterKeys) ? storedUiState.openClusterKeys.filter(Boolean) : [],
    openStructuredKeys: storedDetailKeys,
    openRawJsonKeys: storedOpenRawJsonKeys,
    activeGroupKey: initialActiveGroupKey,
    activeSectionKey: initialActiveSectionKey,
    activeTab,
    searchQuery,
    manualFieldPath: getManualFieldPath(currentDraft),
    manualFieldType: getManualFieldType(currentDraft),
    templateFieldName: initialTemplateFieldName,
    officialFieldPath: normalizeDraftFieldPath(currentDraft.officialFieldPath || '')
  };

  function persistUiState() {
    writeSchemaUiState(container, entry.id, currentUiState);
  }

  function syncSchemaAddPathSuggestions() {
    const pathInput = container.querySelector('input[name="schema-add-path"]');
    if (!(pathInput instanceof HTMLInputElement)) {
      return;
    }

    const listId = pathInput.getAttribute('list');
    if (!listId) {
      return;
    }

    const datalist = document.getElementById(listId);
    if (!(datalist instanceof HTMLDataListElement)) {
      return;
    }

    const suggestions = buildSchemaAddPathSuggestions(currentDraft, currentUiState.templateFieldName || '');
    datalist.innerHTML = suggestions
      .map((option) => `<option${renderAttributes({ value: option.value, label: option.label })}></option>`)
      .join('');
  }

  function syncSchemaAddTypeControl(nextType = '') {
    const typeSelect = container.querySelector('select[name="schema-add-type"]');
    if (typeSelect instanceof HTMLSelectElement && nextType) {
      typeSelect.value = nextType;
    }
  }

  function getFieldIndexByPath(fieldPath = '') {
    return currentDraft.schemaFields.findIndex((field) => field.actualPath === fieldPath);
  }

  function focusSchemaField(fieldPath = '') {
    const fieldIndex = getFieldIndexByPath(fieldPath);
    if (fieldIndex === -1) {
      return;
    }

    const targetField = container.querySelector(`[data-field-focus="${fieldIndex}"]`)
      || container.querySelector(`[name="schema-field:${fieldIndex}"]`);

    if (targetField instanceof HTMLElement) {
      targetField.focus({ preventScroll: true });
    }
  }

  function focusChoiceControl(controlKey = '') {
    if (!controlKey) {
      return;
    }

    const choiceControl = container.querySelector(`[data-choice-control="${controlKey}"]`);
    if (!(choiceControl instanceof HTMLElement)) {
      return;
    }

    const focusTarget = choiceControl.querySelector('[data-choice-filter="true"]')
      || choiceControl.querySelector('.config-choice__button');

    if (focusTarget instanceof HTMLElement) {
      focusTarget.focus({ preventScroll: true });
    }
  }

  function rerenderEditor({
    preserveSearchFocus = false,
    focusFieldPath = '',
    focusControlName = '',
    focusChoiceControlKey = ''
  } = {}) {
    renderSchemaDrivenEditor(container, {
      entry,
      draft: currentDraft,
      onDraftChange,
      onRefreshOfficialSchema,
      isRefreshingOfficialSchema
    });

    if (preserveSearchFocus) {
      const nextSearchInput = container.querySelector('[name="schema-toolbar-search"]');
      if (nextSearchInput instanceof HTMLInputElement) {
        nextSearchInput.focus({ preventScroll: true });
        const caretPosition = nextSearchInput.value.length;
        nextSearchInput.setSelectionRange(caretPosition, caretPosition);
      }
    }

    if (focusChoiceControlKey) {
      window.requestAnimationFrame(() => {
        focusChoiceControl(focusChoiceControlKey);
      });
      return;
    }

    if (focusControlName) {
      window.requestAnimationFrame(() => {
        const targetControl = container.querySelector(`[name="${focusControlName}"]`);
        if (targetControl instanceof HTMLElement) {
          targetControl.focus({ preventScroll: true });
        }
      });
      return;
    }

    if (focusFieldPath) {
      window.requestAnimationFrame(() => {
        focusSchemaField(focusFieldPath);
      });
    }
  }

  function updateSchemaFieldValue(fieldIndex, nextValue, rerenderOptions = null) {
    if (!Number.isInteger(fieldIndex) || fieldIndex < 0 || fieldIndex >= currentDraft.schemaFields.length) {
      return;
    }

    currentDraft = {
      ...currentDraft,
      schemaFields: currentDraft.schemaFields.map((field, currentIndex) => (
        currentIndex === fieldIndex
          ? { ...field, inputValue: nextValue }
          : field
      ))
    };
    onDraftChange(currentDraft);

    if (rerenderOptions) {
      rerenderEditor(rerenderOptions);
    }
  }

  function readStructuredListValues(fieldIndex) {
    const editorRoot = container.querySelector(`[data-structured-field-editor="list"][data-field-index="${fieldIndex}"]`);
    if (!(editorRoot instanceof HTMLElement)) {
      return [];
    }

    return [...editorRoot.querySelectorAll(`input[name^="schema-structured-list:${fieldIndex}:"]`)]
      .map((input) => (input instanceof HTMLInputElement ? input.value : ''));
  }

  function readStructuredMapRows(fieldIndex) {
    const editorRoot = container.querySelector(`[data-structured-field-editor="map"][data-field-index="${fieldIndex}"]`);
    if (!(editorRoot instanceof HTMLElement)) {
      return [];
    }

    return [...editorRoot.querySelectorAll('.structured-field-row')]
      .map((row) => {
        const keyInput = row.querySelector('input[data-role="key"]');
        const valueInput = row.querySelector('input[data-role="value"]');
        return {
          key: keyInput instanceof HTMLInputElement ? keyInput.value : '',
          value: valueInput instanceof HTMLInputElement ? valueInput.value : ''
        };
      });
  }

  function closeChoicePanels({ exceptKey = '' } = {}) {
    container.querySelectorAll('[data-choice-control]').forEach((choiceControl) => {
      const controlKey = choiceControl.getAttribute('data-choice-control') || '';
      if (exceptKey && controlKey === exceptKey) {
        return;
      }

      choiceControl.classList.remove('is-open');
      choiceControl.querySelectorAll('[aria-expanded]').forEach((node) => {
        node.setAttribute('aria-expanded', 'false');
      });

      const panel = choiceControl.querySelector('.config-choice__panel');
      if (panel instanceof HTMLElement) {
        panel.hidden = true;
      }
    });

    choiceOpenKey = exceptKey || '';
  }

  function filterChoiceOptions(controlKey = '', query = '') {
    const choiceControl = container.querySelector(`[data-choice-control="${controlKey}"]`);
    if (!(choiceControl instanceof HTMLElement)) {
      return;
    }

    const normalizedQuery = normalizeFieldSearchQuery(query);
    choiceControl.querySelectorAll('.config-choice__option').forEach((option) => {
      const optionText = normalizeFieldSearchQuery(option.textContent || '');
      option.hidden = normalizedQuery ? !optionText.includes(normalizedQuery) : false;
    });
  }

  function openChoicePanel(controlKey = '', { focusInput = false } = {}) {
    if (!controlKey) {
      return;
    }

    const choiceControl = container.querySelector(`[data-choice-control="${controlKey}"]`);
    if (!(choiceControl instanceof HTMLElement)) {
      return;
    }

    closeChoicePanels({ exceptKey: controlKey });
    choiceControl.classList.add('is-open');
    choiceControl.querySelectorAll('[aria-expanded]').forEach((node) => {
      node.setAttribute('aria-expanded', 'true');
    });

    const panel = choiceControl.querySelector('.config-choice__panel');
    if (panel instanceof HTMLElement) {
      panel.hidden = false;
    }

    const filterInput = choiceControl.querySelector('[data-choice-filter="true"]');
    if (filterInput instanceof HTMLInputElement) {
      filterChoiceOptions(controlKey, filterInput.value);
      if (focusInput) {
        filterInput.focus({ preventScroll: true });
      }
    }

    choiceOpenKey = controlKey;
  }

  function toggleChoicePanel(controlKey = '') {
    const choiceControl = container.querySelector(`[data-choice-control="${controlKey}"]`);
    if (!(choiceControl instanceof HTMLElement)) {
      return;
    }

    if (choiceControl.classList.contains('is-open')) {
      closeChoicePanels();
      return;
    }

    openChoicePanel(controlKey, { focusInput: true });
  }

  function focusFirstVisibleChoiceOption(controlKey = '') {
    const choiceControl = container.querySelector(`[data-choice-control="${controlKey}"]`);
    if (!(choiceControl instanceof HTMLElement)) {
      return;
    }

    const option = [...choiceControl.querySelectorAll('.config-choice__option')]
      .find((candidate) => !candidate.hidden);

    if (option instanceof HTMLElement) {
      option.focus({ preventScroll: true });
    }
  }

  function toggleSettingDetail(detailKey = '', detailScope = '') {
    if (!detailKey || !availableDetailKeySet.has(detailKey)) {
      return;
    }

    const isOpen = currentUiState.openStructuredKeys.includes(detailKey);
    const scopeGroupKey = String(detailScope || '').split('::')[0];
    const parentGroupDetailKey = getGroupDetailKey(scopeGroupKey);
    const nextDetailKeys = isOpen
      ? (parentGroupDetailKey && detailKey !== parentGroupDetailKey ? [parentGroupDetailKey] : [])
      : [...new Set([parentGroupDetailKey, detailKey].filter(Boolean))];

    currentUiState = {
      ...currentUiState,
      openStructuredKeys: nextDetailKeys,
      openRawJsonKeys: isOpen ? [] : currentUiState.openRawJsonKeys.filter((key) => availableRawJsonKeySet.has(key))
    };
    persistUiState();

    const focusFieldPath = detailKey.startsWith('detail:mcp:')
      || detailKey.startsWith('detail:provider:')
      ? ''
      : detailKey.replace(/^detail:/, '');
    rerenderEditor({ focusFieldPath });
  }

  function toggleSettingRawJson(rawJsonKey = '') {
    if (!rawJsonKey || !availableRawJsonKeySet.has(rawJsonKey)) {
      return;
    }

    const nextKeys = new Set(currentUiState.openRawJsonKeys);
    if (nextKeys.has(rawJsonKey)) {
      nextKeys.delete(rawJsonKey);
    } else {
      nextKeys.add(rawJsonKey);
    }

    currentUiState = {
      ...currentUiState,
      openRawJsonKeys: [...nextKeys]
    };
    persistUiState();
    rerenderEditor();
  }

  function formatStructuredField(fieldIndex) {
    const targetIndex = Number(fieldIndex);
    if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= currentDraft.schemaFields.length) {
      return;
    }

    const targetField = currentDraft.schemaFields[targetIndex];
    if (!isStructuredField(targetField)) {
      return;
    }

    const summaryMeta = getStructuredFieldSummary(targetField);
    if (summaryMeta.status !== 'valid') {
      return;
    }

    const detailKey = createSettingDetailKey(targetField.actualPath);
    const nextValue = JSON.stringify(summaryMeta.parsedValue, null, 2);

    if (nextValue !== targetField.inputValue) {
      currentDraft = {
        ...currentDraft,
        schemaFields: currentDraft.schemaFields.map((field, index) => (
          index === targetIndex
            ? { ...field, inputValue: nextValue }
            : field
        ))
      };
      onDraftChange(currentDraft);
    }

    const parentGroupDetailKey = getGroupDetailKey(targetField.groupKey);
    currentUiState = {
      ...currentUiState,
      openStructuredKeys: availableDetailKeySet.has(detailKey)
        ? [...new Set([parentGroupDetailKey, detailKey].filter(Boolean))]
        : currentUiState.openStructuredKeys
    };
    persistUiState();
    rerenderEditor({ focusFieldPath: targetField.actualPath });
  }

  function closeModal() {
    if (!modal) {
      return;
    }

    if (typeof modal.close === 'function') {
      modal.close();
    } else {
      modal.removeAttribute('open');
      modal.style.display = 'none';
    }

    if (modalOpenTrigger instanceof HTMLElement) {
      modalOpenTrigger.focus({ preventScroll: true });
      modalOpenTrigger = null;
    }
  }

  function addSchemaField(pathValue = '') {
    const normalizedPath = normalizeDraftFieldPath(pathValue || currentUiState.manualFieldPath || currentUiState.officialFieldPath);
    if (!normalizedPath) {
      window.alert('请先输入字段路径。');
      return;
    }

    if ((currentDraft.schemaFields || []).some((field) => field.actualPath === normalizedPath)) {
      focusSchemaField(normalizedPath);
      closeModal();
      return;
    }

    const matchedOfficialField = findDraftSchemaEntryByPath(currentDraft, normalizedPath);

    try {
      const nextField = createSchemaDraftField({
        path: normalizedPath,
        type: matchedOfficialField?.type || currentUiState.manualFieldType || 'string',
        schemaEntry: matchedOfficialField || null
      });
      currentDraft = createNextDraftWithField(currentDraft, nextField);
      const nextGroups = groupFields(currentDraft.schemaFields || []);
      const nextGroupKey = nextGroups.find((group) => (
        group.fields.some(({ field }) => field.actualPath === normalizedPath)
      ))?.key || '';

      currentUiState = {
        ...currentUiState,
        activeGroupKey: nextGroupKey,
        activeSectionKey: '',
        activeTab: findTabIdForFieldPath(normalizedPath, nextGroups),
        manualFieldPath: '',
        officialFieldPath: normalizedPath,
        manualFieldType: nextField.type || currentUiState.manualFieldType
      };
      persistUiState();
      onDraftChange(currentDraft);
      closeModal();
      rerenderEditor({ focusFieldPath: normalizedPath });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  }

  function addSchemaTemplate(templateKey = '') {
    const template = COMPLEX_FIELD_TEMPLATES.find((entry) => entry.key === templateKey);
    if (!template) {
      return;
    }

    const itemName = template.requiresName
      ? normalizeTemplateItemName(currentUiState.templateFieldName || '', template.suggestedName)
      : '';

    if (template.requiresName && !itemName) {
      window.alert('请先填写模板名称。');
      return;
    }

    try {
      const nextSpecs = template.createSpecs({ itemName });
      const nextFields = nextSpecs.map((spec) => {
        const matchedOfficialField = findDraftSchemaEntryByPath(currentDraft, spec.path);
        return createSchemaDraftField({
          path: spec.path,
          type: matchedOfficialField?.type || spec.type || 'string',
          schemaEntry: matchedOfficialField || null,
          inputValue: spec.inputValue
        });
      });
      const currentFieldPathSet = new Set((currentDraft.schemaFields || []).map((field) => field.actualPath));
      const fieldsToAdd = nextFields.filter((field) => !currentFieldPathSet.has(field.actualPath));
      const focusPath = template.getFocusPath({ itemName });

      if (fieldsToAdd.length === 0) {
        const nextGroups = groupFields(currentDraft.schemaFields || []);
        currentUiState = {
          ...currentUiState,
          activeGroupKey: focusPath.includes('.') ? focusPath.split('.')[0] : '__root__',
          activeSectionKey: template.getActiveSectionKey({ itemName }) || '',
          activeTab: findTabIdForFieldPath(focusPath, nextGroups)
        };
        persistUiState();
        closeModal();
        rerenderEditor({ focusFieldPath: focusPath });
        return;
      }

      currentDraft = createNextDraftWithFields(currentDraft, fieldsToAdd);
      const nextGroups = groupFields(currentDraft.schemaFields || []);
      currentUiState = {
        ...currentUiState,
        activeGroupKey: fieldsToAdd[0]?.groupKey || '',
        activeSectionKey: template.getActiveSectionKey({ itemName }) || '',
        activeTab: findTabIdForFieldPath(focusPath, nextGroups),
        templateFieldName: itemName,
        manualFieldPath: '',
        officialFieldPath: focusPath,
        manualFieldType: fieldsToAdd[0]?.type || currentUiState.manualFieldType
      };
      persistUiState();
      onDraftChange(currentDraft);
      closeModal();
      rerenderEditor({ focusFieldPath: focusPath });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  }

  if (modal) {
    modal.addEventListener('cancel', (event) => {
      event.preventDefault();
      closeModal();
    });
    modal.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' || event.key === 'Esc') {
        event.preventDefault();
        event.stopPropagation();
        closeModal();
      }
    });
  }

  persistUiState();
  container.oncompositionstart = (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.name === 'schema-toolbar-search') {
      isSearchComposing = true;
    }
  };

  container.oncompositionend = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.name !== 'schema-toolbar-search') {
      return;
    }

    isSearchComposing = false;
    currentUiState = {
      ...currentUiState,
      searchQuery: target.value
    };
    persistUiState();
    rerenderEditor({ preserveSearchFocus: true });
  };

  container.oninput = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) {
      return;
    }

    if (target.name === 'schema-toolbar-search') {
      currentUiState = {
        ...currentUiState,
        searchQuery: target.value
      };
      persistUiState();

      if (isSearchComposing) {
        return;
      }

      if (searchInputTimer) {
        window.clearTimeout(searchInputTimer);
      }

      searchInputTimer = window.setTimeout(() => {
        searchInputTimer = 0;
        rerenderEditor({ preserveSearchFocus: true });
      }, 120);
      return;
    }

    if (target.name === 'schema-add-path') {
      const normalizedPath = normalizeDraftFieldPath(target.value);
      const matchedOfficialField = findDraftSchemaEntryByPath(currentDraft, normalizedPath);
      currentUiState = {
        ...currentUiState,
        manualFieldPath: normalizedPath,
        officialFieldPath: normalizedPath,
        manualFieldType: matchedOfficialField?.type || currentUiState.manualFieldType
      };
      persistUiState();
      syncSchemaAddTypeControl(currentUiState.manualFieldType);
      return;
    }

    if (target.name === 'schema-add-type') {
      currentUiState = {
        ...currentUiState,
        manualFieldType: target.value || 'string'
      };
      persistUiState();
      return;
    }

    if (target.name === 'schema-template-name') {
      currentUiState = {
        ...currentUiState,
        templateFieldName: normalizeTemplateItemName(target.value)
      };
      persistUiState();
      syncSchemaAddPathSuggestions();
      return;
    }

    const listMatch = target.name.match(/^schema-structured-list:(\d+):\d+$/);
    if (listMatch) {
      const fieldIndex = Number(listMatch[1]);
      updateSchemaFieldValue(fieldIndex, serializeStructuredListValues(readStructuredListValues(fieldIndex)));
      return;
    }

    const mapMatch = target.name.match(/^schema-structured-map:(\d+):\d+:(key|value)$/);
    if (mapMatch) {
      const fieldIndex = Number(mapMatch[1]);
      updateSchemaFieldValue(fieldIndex, serializeStructuredMapValues(readStructuredMapRows(fieldIndex)));
      return;
    }

    if (!target.name.startsWith('schema-field:')) {
      return;
    }

    const fieldIndex = Number(target.name.split(':')[1]);
    updateSchemaFieldValue(fieldIndex, target.value);

    if (target instanceof HTMLInputElement && target.dataset.choiceFilter === 'true') {
      const controlKey = target.getAttribute('data-choice-control-key') || '';
      openChoicePanel(controlKey);
      filterChoiceOptions(controlKey, target.value);
    }
  };

  container.onkeydown = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    if (target instanceof HTMLInputElement && target.name === 'schema-add-path' && event.key === 'Enter' && !event.isComposing) {
      event.preventDefault();
      addSchemaField(target.value);
      return;
    }

    const choiceControl = target.closest('[data-choice-control]');
    if (!choiceControl) {
      if (event.key === 'Escape' && choiceOpenKey) {
        closeChoicePanels();
      }
      return;
    }

    const controlKey = choiceControl.getAttribute('data-choice-control') || '';
    if (!controlKey) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      closeChoicePanels();
      focusChoiceControl(controlKey);
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      openChoicePanel(controlKey);
      focusFirstVisibleChoiceOption(controlKey);
      return;
    }

    if (event.key === 'Tab') {
      closeChoicePanels();
    }
  };

  container.onclick = (event) => {
    if (!(event.target instanceof Element)) {
      return;
    }

    const button = event.target.closest('[data-action]');
    if (!button) {
      if (!event.target.closest('[data-choice-control]')) {
        closeChoicePanels();
      }
      return;
    }

    const action = button.getAttribute('data-action');

    if (action === 'refresh-official-schema') {
      onRefreshOfficialSchema?.();
      return;
    }

    if (action === 'add-schema-field') {
      addSchemaField();
      return;
    }

    if (action === 'add-schema-suggestion') {
      addSchemaField(button.getAttribute('data-field-path') || '');
      return;
    }

    if (action === 'add-schema-template') {
      addSchemaTemplate(button.getAttribute('data-template-key') || '');
      return;
    }

    if (action === 'clear-schema-search') {
      closeChoicePanels();
      currentUiState = {
        ...currentUiState,
        searchQuery: '',
        activeGroupKey: '',
        activeSectionKey: ''
      };
      persistUiState();
      rerenderEditor({ preserveSearchFocus: true });
      return;
    }

    if (action === 'switch-schema-tab') {
      closeChoicePanels();
      currentUiState = {
        ...currentUiState,
        activeTab: button.getAttribute('data-tab-id') || 'all',
        activeGroupKey: '',
        activeSectionKey: '',
        openStructuredKeys: [],
        openRawJsonKeys: []
      };
      persistUiState();
      rerenderEditor();
      return;
    }

    if (action === 'activate-schema-group') {
      closeChoicePanels();
      currentUiState = {
        ...currentUiState,
        activeGroupKey: button.getAttribute('data-group-key') || '',
        activeSectionKey: '',
        openStructuredKeys: [],
        openRawJsonKeys: []
      };
      persistUiState();
      rerenderEditor();
      return;
    }

    if (action === 'activate-schema-section') {
      closeChoicePanels();
      const currentGroupKey = currentUiState.activeGroupKey || visibleGroups[0]?.key || '';
      const parentGroupDetailKey = getGroupDetailKey(currentGroupKey);
      currentUiState = {
        ...currentUiState,
        activeSectionKey: button.getAttribute('data-section-key') || '',
        openStructuredKeys: parentGroupDetailKey ? [parentGroupDetailKey] : [],
        openRawJsonKeys: []
      };
      persistUiState();
      rerenderEditor();
      return;
    }

    if (action === 'toggle-setting-detail') {
      closeChoicePanels();
      toggleSettingDetail(
        button.getAttribute('data-detail-key') || '',
        button.getAttribute('data-detail-scope') || ''
      );
      return;
    }

    if (action === 'toggle-setting-raw-json') {
      closeChoicePanels();
      toggleSettingRawJson(button.getAttribute('data-raw-json-key') || '');
      return;
    }

    if (action === 'toggle-setting-choice') {
      event.preventDefault();
      toggleChoicePanel(button.getAttribute('data-choice-control-key') || '');
      return;
    }

    if (action === 'select-setting-choice') {
      event.preventDefault();
      const fieldIndex = Number(button.getAttribute('data-field-index'));
      const nextValue = decodeURIComponent(button.getAttribute('data-choice-value') || '');
      const controlKey = button.getAttribute('data-choice-control-key') || '';
      closeChoicePanels();
      updateSchemaFieldValue(fieldIndex, nextValue);
      rerenderEditor({ focusChoiceControlKey: controlKey });
      return;
    }

    if (action === 'format-structured-field') {
      closeChoicePanels();
      formatStructuredField(button.getAttribute('data-field-index'));
      return;
    }

    if (action === 'remove-structured-list-row') {
      closeChoicePanels();
      const fieldIndex = Number(button.getAttribute('data-field-index'));
      const rowIndex = Number(button.getAttribute('data-row-index'));
      const nextRows = readStructuredListValues(fieldIndex).filter((_, currentIndex) => currentIndex !== rowIndex);
      updateSchemaFieldValue(
        fieldIndex,
        serializeStructuredListValues(nextRows),
        { focusControlName: `schema-structured-list:${fieldIndex}:${Math.max(0, rowIndex - 1)}` }
      );
      return;
    }

    if (action === 'remove-structured-map-row') {
      closeChoicePanels();
      const fieldIndex = Number(button.getAttribute('data-field-index'));
      const rowIndex = Number(button.getAttribute('data-row-index'));
      const nextRows = readStructuredMapRows(fieldIndex).filter((_, currentIndex) => currentIndex !== rowIndex);
      updateSchemaFieldValue(
        fieldIndex,
        serializeStructuredMapValues(nextRows),
        { focusControlName: `schema-structured-map:${fieldIndex}:${Math.max(0, rowIndex - 1)}:key` }
      );
      return;
    }

    if (action === 'open-add-field-modal') {
      closeChoicePanels();
      modalOpenTrigger = button instanceof HTMLElement ? button : null;
      if (modal && typeof modal.showModal === 'function') {
        modal.showModal();
        const firstInput = modal.querySelector('input[name="schema-add-path"]');
        if (firstInput instanceof HTMLElement) {
          firstInput.focus();
        }
      } else if (modal) {
        modal.setAttribute('open', '');
        modal.style.display = 'flex';
      }
      return;
    }

    if (action === 'close-add-field-modal') {
      closeModal();
    }
  };
}

export function renderSchemaDrivenEditor(container, { entry, draft, onDraftChange, onRefreshOfficialSchema, isRefreshingOfficialSchema = false }) {
  return renderSchemaDrivenEditorV2(container, {
    entry,
    draft,
    onDraftChange,
    onRefreshOfficialSchema,
    isRefreshingOfficialSchema
  });
}
