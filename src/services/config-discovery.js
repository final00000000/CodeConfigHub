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
        format: 'json',
        editor: null,
        path: path.join(projectPath, '.mcp.json')
      }
    );
  }

  return targets;
}

async function hydrateTarget(entry) {
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

  return {
    ...entry,
    path: resolvedPath,
    content,
    error,
    exists,
    parsed,
    lineEnding,
    hasTrailingNewline
  };
}

async function discoverConfigFiles(projectPath = '') {
  const homeDirectory = os.homedir();
  const entries = await Promise.all(buildTargets(homeDirectory, projectPath).map(hydrateTarget));

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
