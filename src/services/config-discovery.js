const os = require('os');
const path = require('path');
const { parseJson, stringifyJson } = require('./json-service');
const { pathExists, readTextFile } = require('./file-service');
const { parseToml, stringifyToml } = require('./toml-service');

function createDefaultCodexConfig() {
  return {
    model: 'gpt-5.4',
    model_provider: 'openai',
    model_reasoning_effort: 'high',
    approval_policy: 'on-request',
    sandbox_mode: 'workspace-write',
    web_search: true,
    features: {
      shell_tool: true,
      skills: true,
      multi_agent: true,
      shell_snapshot: true
    },
    model_providers: {}
  };
}

function createDefaultClaudeSettings() {
  return {
    model: 'sonnet',
    alwaysThinkingEnabled: false,
    fastMode: true,
    cleanupPeriodDays: 30,
    env: {},
    permissions: {
      allow: [],
      deny: [],
      ask: []
    },
    hooks: {}
  };
}

function createDefaultJsonDocument(entryId) {
  switch (entryId) {
    case 'claude-global-settings':
    case 'claude-project-settings':
    case 'claude-local-settings':
      return createDefaultClaudeSettings();
    case 'claude-profile':
      return {
        theme: 'dark',
        mcpServers: {}
      };
    case 'claude-project-mcp':
      return {
        mcpServers: {}
      };
    default:
      return {};
  }
}

function createDefaultDocument(entry) {
  if (entry.editor === 'codex' || entry.editor === 'claude') {
    return {};
  }

  if (entry.editor === 'text') {
    return '';
  }

  if (entry.format === 'toml') {
    return createDefaultCodexConfig();
  }

  if (entry.format === 'json') {
    return createDefaultJsonDocument(entry.id);
  }

  return '';
}

function serializeDefaultDocument(entry, parsed) {
  if (entry.format === 'toml') {
    return stringifyToml(parsed);
  }

  if (entry.format === 'json') {
    return stringifyJson(parsed);
  }

  return '';
}

function detectLineEnding(content = '') {
  const match = String(content).match(/\r\n|\n|\r/);
  return match ? match[0] : '\n';
}

function detectTrailingNewline(content = '') {
  return /(?:\r\n|\n|\r)$/.test(String(content));
}

function parseDocument(format, content) {
  if (format === 'toml') {
    return parseToml(content);
  }

  if (format === 'json') {
    return parseJson(content);
  }

  return null;
}

const ASSISTANT_METADATA = {
  codex: {
    label: 'Codex CLI',
    shortLabel: 'Codex',
    order: 1
  },
  claude: {
    label: 'Claude Code',
    shortLabel: 'Claude',
    order: 2
  }
};

const SCOPE_VARIANT_METADATA = {
  'user-default': {
    label: '用户默认',
    scopeLabel: '用户级',
    locationLabel: '用户目录',
    sharingLabel: '个人默认',
    description: '作用于当前用户下的所有项目。',
    order: 1
  },
  'project-shared': {
    label: '项目共享',
    scopeLabel: '项目级',
    locationLabel: '项目目录',
    sharingLabel: '团队共享',
    description: '跟随项目目录，可与团队共享。',
    order: 2
  },
  'project-local': {
    label: '项目本地',
    scopeLabel: '项目级',
    locationLabel: '项目目录',
    sharingLabel: '本机本地',
    description: '仅保存在当前电脑，通常不直接共享。',
    order: 3
  }
};

const OBJECT_METADATA = {
  settings: {
    label: '设置',
    description: '主配置文件',
    order: 1
  },
  rules: {
    label: '规则',
    description: '规则文档',
    order: 2
  },
  mcp: {
    label: 'MCP 配置',
    description: 'MCP 服务清单',
    order: 3
  },
  profile: {
    label: 'Profile',
    description: '配置档案',
    order: 4
  },
  file: {
    label: '文件',
    description: '配置文件',
    order: 99
  }
};

function inferObjectKind(entry = {}) {
  if (entry.objectKind) {
    return entry.objectKind;
  }

  if (String(entry.id || '').includes('rules') || entry.format === 'markdown') {
    return 'rules';
  }

  if (String(entry.id || '').includes('mcp')) {
    return 'mcp';
  }

  if (String(entry.id || '').includes('profile')) {
    return 'profile';
  }

  return 'settings';
}

function inferScopeVariant(entry = {}) {
  if (entry.scopeVariant) {
    return entry.scopeVariant;
  }

  if (entry.id === 'claude-local-settings') {
    return 'project-local';
  }

  return entry.scope === 'project' ? 'project-shared' : 'user-default';
}

function getAssistantMeta(assistant = '') {
  return (
    ASSISTANT_METADATA[assistant] || {
      label: assistant || '未知助手',
      shortLabel: assistant || '未知',
      order: 99
    }
  );
}

function getScopeMeta(entry = {}) {
  const variant = inferScopeVariant(entry);
  const fallbackScopeLabel = entry.scope === 'project' ? '项目级' : '用户级';
  const fallbackLocationLabel = fallbackScopeLabel === '项目级' ? '项目目录' : '用户目录';

  return {
    variant,
    ...(SCOPE_VARIANT_METADATA[variant] || {
      label: fallbackScopeLabel,
      scopeLabel: fallbackScopeLabel,
      locationLabel: fallbackLocationLabel,
      sharingLabel: fallbackScopeLabel === '项目级' ? '项目共享' : '用户默认',
      description: '',
      order: 99
    })
  };
}

function getObjectMeta(entry = {}) {
  const kind = inferObjectKind(entry);

  return {
    kind,
    ...(OBJECT_METADATA[kind] || OBJECT_METADATA.file)
  };
}

function buildEntryStatusMeta(entry = {}) {
  if (entry.error) {
    return {
      label: '解析异常',
      tone: 'danger',
      hint: '原文件已找到，但当前内容无法安全解析。'
    };
  }

  if (entry.exists) {
    return {
      label: '已发现',
      tone: 'success',
      hint: '目标文件已存在，可直接浏览或编辑。'
    };
  }

  return {
    label: '未创建',
    tone: 'muted',
    hint: '目标文件尚未创建，首次保存时会自动生成。'
  };
}

function isSameOrChildPath(basePath = '', targetPath = '') {
  if (!basePath || !targetPath) {
    return false;
  }

  const relativePath = path.relative(basePath, targetPath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function normalizeDisplayPath(filePath = '') {
  return String(filePath).replace(/[\\/]+/g, '/');
}

function toCompactPath(filePath, { homeDirectory = '', projectPath = '' } = {}) {
  if (!filePath) {
    return '';
  }

  if (homeDirectory && isSameOrChildPath(homeDirectory, filePath)) {
    const relativePath = normalizeDisplayPath(path.relative(homeDirectory, filePath));
    return relativePath ? `~/${relativePath}` : '~';
  }

  if (projectPath && isSameOrChildPath(projectPath, filePath)) {
    const relativePath = normalizeDisplayPath(path.relative(projectPath, filePath));
    return relativePath ? `./${relativePath}` : '.';
  }

  return normalizeDisplayPath(filePath);
}

async function findNearestExistingPath(targetPath = '') {
  let currentPath = targetPath;

  while (currentPath) {
    if (await pathExists(currentPath)) {
      return currentPath;
    }

    const parentPath = path.dirname(currentPath);
    if (!parentPath || parentPath === currentPath) {
      break;
    }

    currentPath = parentPath;
  }

  return targetPath;
}

function buildNavSortKey(entry, assistantMeta, scopeMeta, objectMeta) {
  return [
    String(scopeMeta.order).padStart(2, '0'),
    String(objectMeta.order).padStart(2, '0'),
    String(assistantMeta.order).padStart(2, '0'),
    entry.id
  ].join(':');
}

function buildEntryMetadata(entry, { homeDirectory = '', projectPath = '', revealTargetPath = '' } = {}) {
  const assistantMeta = getAssistantMeta(entry.assistant);
  const scopeMeta = getScopeMeta(entry);
  const objectMeta = getObjectMeta(entry);
  const statusMeta = buildEntryStatusMeta(entry);
  const compactPath = toCompactPath(entry.path, { homeDirectory, projectPath });
  const parentDirectoryPath = path.dirname(entry.path);
  const parentDirectoryLabel = toCompactPath(parentDirectoryPath, { homeDirectory, projectPath });
  const resolvedRevealTargetPath = revealTargetPath || entry.path;
  const revealTargetLabel = toCompactPath(resolvedRevealTargetPath, { homeDirectory, projectPath });

  return {
    assistantLabel: assistantMeta.label,
    assistantShortLabel: assistantMeta.shortLabel,
    scopeLabel: scopeMeta.scopeLabel,
    scopeVariant: scopeMeta.variant,
    scopeVariantLabel: scopeMeta.label,
    scopeDescription: scopeMeta.description,
    sharingLabel: scopeMeta.sharingLabel,
    objectKind: objectMeta.kind,
    objectLabel: objectMeta.label,
    objectDescription: objectMeta.description,
    statusLabel: statusMeta.label,
    statusTone: statusMeta.tone,
    statusHint: statusMeta.hint,
    navTitle: `${scopeMeta.label} · ${objectMeta.label}`,
    navSubtitle: [assistantMeta.label, compactPath].filter(Boolean).join(' · '),
    navGroupKey: `${scopeMeta.variant}:${objectMeta.kind}`,
    navGroupLabel: `${scopeMeta.label} · ${objectMeta.label}`,
    scopeGroupKey: `scope:${scopeMeta.variant}`,
    scopeGroupLabel: scopeMeta.label,
    objectGroupKey: `object:${objectMeta.kind}`,
    objectGroupLabel: objectMeta.label,
    assistantGroupKey: `assistant:${entry.assistant || 'unknown'}`,
    assistantGroupLabel: assistantMeta.label,
    navSortKey: buildNavSortKey(entry, assistantMeta, scopeMeta, objectMeta),
    compactPath,
    locationLabel: [scopeMeta.locationLabel, compactPath].filter(Boolean).join(' · '),
    parentDirectoryPath,
    parentDirectoryLabel,
    revealTargetPath: resolvedRevealTargetPath,
    revealTargetLabel,
    revealMode: entry.exists ? 'file' : 'directory',
    revealHint: entry.exists ? `定位时直接打开 ${revealTargetLabel}` : `目标文件尚未创建，可先打开 ${revealTargetLabel}`,
    creationHint: entry.exists
      ? `当前编辑结果会保存回 ${compactPath}`
      : `首次保存时会在${scopeMeta.locationLabel}写入 ${compactPath}`
  };
}

async function resolveTargetPath(entry) {
  const candidates =
    Array.isArray(entry.pathCandidates) && entry.pathCandidates.length > 0 ? entry.pathCandidates : [entry.path];

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return { path: candidate, exists: true };
    }
  }

  return { path: candidates[0], exists: false };
}

function buildTargets(homeDirectory, projectPath) {
  const targets = [
    {
      id: 'codex-user',
      assistant: 'codex',
      label: 'Codex 用户级配置',
      description: '全局默认配置，作用于所有 Codex CLI 项目。',
      scope: 'user',
      scopeVariant: 'user-default',
      objectKind: 'settings',
      format: 'toml',
      editor: 'codex',
      path: path.join(homeDirectory, '.codex', 'config.toml')
    },
    {
      id: 'codex-user-rules',
      assistant: 'codex',
      label: 'Codex 全局规则',
      description: '全局 AGENTS.md 规则文件，会作用于所有 Codex CLI 会话。',
      scope: 'user',
      scopeVariant: 'user-default',
      objectKind: 'rules',
      format: 'markdown',
      editor: 'text',
      pathCandidates: [path.join(homeDirectory, '.codex', 'AGENTS.md')],
      path: path.join(homeDirectory, '.codex', 'AGENTS.md')
    },
    {
      id: 'claude-global-settings',
      assistant: 'claude',
      label: 'Claude 全局设置',
      description: '全局 settings.json，覆盖模型、权限和生命周期钩子。',
      scope: 'user',
      scopeVariant: 'user-default',
      objectKind: 'settings',
      format: 'json',
      editor: 'claude',
      path: path.join(homeDirectory, '.claude', 'settings.json')
    },
    {
      id: 'claude-global-rules',
      assistant: 'claude',
      label: 'Claude 全局规则',
      description: 'CLAUDE.md 指令文件，会作用于所有 Claude 会话。',
      scope: 'user',
      scopeVariant: 'user-default',
      objectKind: 'rules',
      format: 'markdown',
      editor: 'text',
      path: path.join(homeDirectory, '.claude', 'CLAUDE.md')
    }
  ];

  if (projectPath) {
    targets.push(
      {
        id: 'codex-project',
        assistant: 'codex',
        label: 'Codex 项目级配置',
        description: '当前项目中的 .codex/config.toml，会覆盖用户级设置。',
        scope: 'project',
        scopeVariant: 'project-shared',
        objectKind: 'settings',
        format: 'toml',
        editor: 'codex',
        path: path.join(projectPath, '.codex', 'config.toml')
      },
      {
        id: 'codex-project-rules',
        assistant: 'codex',
        label: 'Codex 项目规则',
        description: '项目根目录 AGENTS.md，会覆盖 Codex 全局规则。',
        scope: 'project',
        scopeVariant: 'project-shared',
        objectKind: 'rules',
        format: 'markdown',
        editor: 'text',
        pathCandidates: [path.join(projectPath, 'AGENTS.md')],
        path: path.join(projectPath, 'AGENTS.md')
      },
      {
        id: 'claude-project-settings',
        assistant: 'claude',
        label: 'Claude 项目设置',
        description: '共享的项目级 settings.json。',
        scope: 'project',
        scopeVariant: 'project-shared',
        objectKind: 'settings',
        format: 'json',
        editor: 'claude',
        path: path.join(projectPath, '.claude', 'settings.json')
      },
      {
        id: 'claude-local-settings',
        assistant: 'claude',
        label: 'Claude 本地设置',
        description: '个人本地 settings.local.json。',
        scope: 'project',
        scopeVariant: 'project-local',
        objectKind: 'settings',
        format: 'json',
        editor: 'claude',
        path: path.join(projectPath, '.claude', 'settings.local.json')
      },
      {
        id: 'claude-project-rules',
        assistant: 'claude',
        label: 'Claude 项目规则',
        description: '项目根目录 CLAUDE.md，会作用于当前项目的 Claude 会话。',
        scope: 'project',
        scopeVariant: 'project-shared',
        objectKind: 'rules',
        format: 'markdown',
        editor: 'text',
        path: path.join(projectPath, 'CLAUDE.md')
      },
      {
        id: 'claude-project-mcp',
        assistant: 'claude',
        label: 'Claude MCP 配置',
        description: '项目级 .mcp.json，MVP 中仅做只读预览。',
        scope: 'project',
        scopeVariant: 'project-shared',
        objectKind: 'mcp',
        format: 'json',
        editor: null,
        path: path.join(projectPath, '.mcp.json')
      }
    );
  }

  return targets;
}

async function hydrateTarget(entry, context = {}) {
  const { path: resolvedPath, exists } = await resolveTargetPath(entry);
  const defaultDocument = createDefaultDocument(entry);
  let parsed = exists ? null : defaultDocument;
  let content = serializeDefaultDocument(entry, defaultDocument);
  let error = null;
  let lineEnding = '\n';
  let hasTrailingNewline = false;

  if (exists) {
    try {
      content = await readTextFile(resolvedPath);
      lineEnding = detectLineEnding(content);
      hasTrailingNewline = detectTrailingNewline(content);
      parsed = parseDocument(entry.format, content);
    } catch (caughtError) {
      error = caughtError instanceof Error ? caughtError.message : String(caughtError);
      parsed = null;
      lineEnding = detectLineEnding(content);
      hasTrailingNewline = detectTrailingNewline(content);
    }
  }

  if (!exists) {
    lineEnding = detectLineEnding(content);
    hasTrailingNewline = detectTrailingNewline(content);
  }

  const revealTargetPath = await findNearestExistingPath(resolvedPath);
  const hydratedEntry = {
    ...entry,
    path: resolvedPath,
    content,
    error,
    exists,
    parsed,
    lineEnding,
    hasTrailingNewline
  };

  return {
    ...hydratedEntry,
    ...buildEntryMetadata(hydratedEntry, {
      ...context,
      revealTargetPath
    })
  };
}

async function discoverConfigFiles(projectPath = '') {
  const homeDirectory = os.homedir();
  const entries = await Promise.all(
    buildTargets(homeDirectory, projectPath).map((entry) =>
      hydrateTarget(entry, {
        homeDirectory,
        projectPath
      })
    )
  );

  return {
    entries,
    homeDirectory,
    os: process.platform,
    projectPath
  };
}

module.exports = {
  createDefaultClaudeSettings,
  createDefaultCodexConfig,
  discoverConfigFiles
};
