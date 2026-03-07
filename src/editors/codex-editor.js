import {
  renderSectionIntro,
  renderSegmented,
  renderSelect,
  renderTextInput,
  renderToggle,
  escapeHtml
} from '../components/form-controls.js';

const APPROVAL_OPTIONS = [
  { value: 'on-request', label: '按需申请', hint: '默认，需要时提权' },
  { value: 'on-failure', label: '失败后提权', hint: '沙箱失败后升级' },
  { value: 'never', label: '禁止提权', hint: '无交互，自动化' },
  { value: 'untrusted', label: '不可信', hint: '写操作需审批' }
];

const SANDBOX_OPTIONS = [
  { value: 'workspace-write', label: '工作区可写', hint: '日常开发' },
  { value: 'read-only', label: '只读', hint: '审查探索' },
  { value: 'danger-full-access', label: '完全访问', hint: '可信环境' }
];

const REASONING_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'XHigh' }
];

const WEB_SEARCH_OPTIONS = [
  { value: 'off', label: '关闭' },
  { value: 'on', label: '标准检索 (On)' },
  { value: 'live', label: 'Live 实时交互' }
];

const FEATURE_TOGGLES = [
  ['shell_tool', 'Shell Tool', '允许模型执行本地 shell 指令。'],
  ['skills', 'Skills', '启用本地技能系统。'],
  ['multi_agent', 'Multi-Agent', '允许多代理协作。'],
  ['shell_snapshot', 'Snapshot', '保留 shell 输出快照。'],
  ['steer', 'Steering / Rules', '允许 Agent 读取工作区 .rules 等方向指导文件。'],
  ['unified_exec', 'Unified Exec', '启用统一执行协议（默认推荐）。'],
  ['unifiedexec_utf8', 'Unified Exec UTF-8', '强制统一执行环境为 UTF-8 编码。'],
  ['powershell_utf8', 'PowerShell UTF-8', '强制 PowerShell 执行为 UTF-8 编码避免乱码。']
];



function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeRows(objectValue) {
  const entries = Object.entries(objectValue || {}).map(([key, value]) => ({
    key,
    value: String(value)
  }));

  return entries.length > 0 ? entries : [{ key: '', value: '' }];
}

function createEmptyProvider() {
  return {
    name: '',
    base_url: '',
    env_key: '',
    wire_api: 'responses',
    requires_openai_auth: false,
    supports_websockets: false,
    http_headers: [{ key: '', value: '' }]
  };
}

function createEmptyProfile() {
  return {
    name: '',
    model: '',
    model_provider: '',
    approval_policy: '',
    sandbox_mode: ''
  };
}

function createEmptyMcpServer() {
  return {
    name: '',
    command: '',
    args: '',
    envRows: [{ key: '', value: '' }]
  };
}

function parseMcpServers(serversObj) {
  const result = [];
  for (const [name, config] of Object.entries(serversObj || {})) {
    result.push({
      name,
      command: config.command || '',
      args: Array.isArray(config.args) ? config.args.join(' ') : (config.args || ''),
      envRows: normalizeRows(config.env)
    });
  }
  return result;
}

function createWebSearchMode(value) {
  if (value === 'live') {
    return 'live';
  }

  if (value === true) {
    return 'on';
  }

  return 'off';
}

function getNamedCount(items, key) {
  const namedCount = items.filter((item) => String(item[key] || '').trim()).length;
  return namedCount > 0 ? namedCount : items.length;
}

function getEnabledFeatureCount(features) {
  return FEATURE_TOGGLES.filter(([key]) => features[key]).length;
}



function extractGlobally(obj, key) {
  if (obj === null || typeof obj !== 'object') return undefined;
  if (key in obj) return obj[key];
  for (const v of Object.values(obj)) {
    if (v === null || typeof v !== 'object') continue;
    const found = extractGlobally(v, key);
    if (found !== undefined) return found;
  }
  return undefined;
}

export function createCodexDraft(parsed = {}) {
  const providerEntries = Object.entries(parsed.model_providers || {}).map(([name, provider]) => ({
    name,
    base_url: provider.base_url || '',
    env_key: provider.env_key || '',
    wire_api: provider.wire_api || 'responses',
    requires_openai_auth: Boolean(provider.requires_openai_auth),
    supports_websockets: Boolean(provider.supports_websockets),
    http_headers: normalizeRows(provider.http_headers)
  }));

  const profileEntries = Object.entries(parsed.profiles || {}).map(([name, profile]) => ({
    name,
    model: profile.model || '',
    model_provider: profile.model_provider || '',
    approval_policy: profile.approval_policy || '',
    sandbox_mode: profile.sandbox_mode || ''
  }));

  return {
    model: parsed.model || '',
    model_provider: parsed.model_provider || '',
    model_reasoning_effort: parsed.model_reasoning_effort || 'high',
    approval_policy: parsed.approval_policy || 'on-request',
    sandbox_mode: parsed.sandbox_mode || 'workspace-write',
    web_search_mode: createWebSearchMode(parsed.web_search),
    model_auto_compact_token_limit: extractGlobally(parsed, 'model_auto_compact_token_limit') ?? '',
    model_context_window: extractGlobally(parsed, 'model_context_window') ?? '',
    max_threads: parsed.agents?.max_threads ?? parsed.max_threads ?? '',
    max_depth: parsed.agents?.max_depth ?? parsed.max_depth ?? '',
    features: FEATURE_TOGGLES.reduce((acc, [key]) => {
      acc[key] = Boolean(parsed.features?.[key]);
      return acc;
    }, {}),
    providers: providerEntries.length > 0 ? providerEntries : [createEmptyProvider()],
    profiles: profileEntries,
    mcpServers: parseMcpServers(parsed.mcp_servers)
  };
}

export function serializeCodexDraft(baseConfig = {}, draft) {
  const output = clone(baseConfig && typeof baseConfig === 'object' ? baseConfig : {});

  assignOptional(output, 'model', draft.model);
  assignOptional(output, 'model_provider', draft.model_provider);
  assignOptional(output, 'model_reasoning_effort', draft.model_reasoning_effort);
  assignOptional(output, 'approval_policy', draft.approval_policy);
  assignOptional(output, 'sandbox_mode', draft.sandbox_mode);

  // Advanced Configs
  const topNumericFields = ['model_auto_compact_token_limit', 'model_context_window'];
  for (const field of topNumericFields) {
    const val = draft[field];
    if (val !== '' && val !== undefined && val !== null && !Number.isNaN(Number(val))) {
      output[field] = Number(val);
    } else {
      delete output[field];
    }
  }

  const agentNumericFields = ['max_threads', 'max_depth'];
  for (const field of agentNumericFields) {
    const val = draft[field];
    if (val !== '' && val !== undefined && val !== null && !Number.isNaN(Number(val))) {
      if (!output.agents) output.agents = {};
      output.agents[field] = Number(val);
    } else if (output.agents) {
      delete output.agents[field];
    }
  }

  output.web_search = draft.web_search_mode === 'live' ? 'live' : draft.web_search_mode === 'on';

  const existingFeatures = isPlainObject(output.features) ? output.features : {};
  output.features = { ...existingFeatures };

  for (const [key] of FEATURE_TOGGLES) {
    output.features[key] = Boolean(draft.features[key]);
  }

  if (Object.keys(output.features).length === 0) {
    delete output.features;
  }

  const sourceProviders = isPlainObject(baseConfig.model_providers) ? baseConfig.model_providers : {};
  const nextProviders = {};
  for (const provider of draft.providers) {
    const providerName = provider.name.trim();
    if (!providerName) {
      continue;
    }

    const current = clone(sourceProviders[providerName] || {});
    assignOptional(current, 'base_url', provider.base_url);
    assignOptional(current, 'env_key', provider.env_key);
    assignOptional(current, 'wire_api', provider.wire_api || 'responses');
    current.requires_openai_auth = Boolean(provider.requires_openai_auth);
    current.supports_websockets = Boolean(provider.supports_websockets);

    const headers = {};
    for (const row of provider.http_headers) {
      if (!row.key.trim()) {
        continue;
      }
      headers[row.key.trim()] = row.value;
    }

    if (Object.keys(headers).length > 0) {
      current.http_headers = headers;
    } else {
      delete current.http_headers;
    }

    nextProviders[providerName] = current;
  }

  if (Object.keys(nextProviders).length > 0) {
    output.model_providers = nextProviders;
  } else {
    delete output.model_providers;
  }

  const sourceProfiles = isPlainObject(baseConfig.profiles) ? baseConfig.profiles : {};
  const nextProfiles = {};
  for (const profile of draft.profiles) {
    const profileName = profile.name.trim();
    if (!profileName) {
      continue;
    }

    const current = clone(sourceProfiles[profileName] || {});
    assignOptional(current, 'model', profile.model);
    assignOptional(current, 'model_provider', profile.model_provider);
    assignOptional(current, 'approval_policy', profile.approval_policy);
    assignOptional(current, 'sandbox_mode', profile.sandbox_mode);
    nextProfiles[profileName] = current;
  }

  if (Object.keys(nextProfiles).length > 0) {
    output.profiles = nextProfiles;
  } else {
    delete output.profiles;
  }

  // MCP Servers
  const nextMcpServers = {};
  for (const server of draft.mcpServers) {
    const serverName = server.name.trim();
    if (!serverName || !server.command.trim()) continue;

    const serverConfig = {
      command: server.command.trim(),
      args: server.args.trim() ? server.args.trim().split(' ').filter(Boolean) : []
    };

    const env = {};
    for (const row of server.envRows) {
      if (row.key.trim()) env[row.key.trim()] = row.value;
    }
    if (Object.keys(env).length > 0) serverConfig.env = env;

    nextMcpServers[serverName] = serverConfig;
  }

  if (Object.keys(nextMcpServers).length > 0) {
    output.mcp_servers = nextMcpServers;
  } else {
    delete output.mcp_servers;
  }

  return {
    parsed: output,
    content: stringifyTomlDocument(output)
  };
}

function assignOptional(target, key, value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    delete target[key];
    return;
  }

  target[key] = value;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function formatTomlValue(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => formatTomlValue(entry)).join(', ')}]`;
  }

  if (typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
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
    } else if (scalars.length > 0) {
      sections.push(`[${pathParts.join('.')}]`, ...scalars, '');
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

  return `${content}\n`;
}

function renderProviderCard(provider, providerIndex) {
  return `
    <article class="nested-card">
      <div class="nested-card__header">
        <div>
          <h4>${escapeHtml(provider.name || `供应商 ${providerIndex + 1}`)}</h4>
          <p>维护单个 provider 的地址、密钥字段和 HTTP Header。</p>
        </div>
        <button class="mini-button" type="button" data-action="remove-provider" data-index="${providerIndex}">移除</button>
      </div>

      <div class="field-grid field-grid--nested">
        ${renderTextInput({
    label: '供应商名称',
    name: `provider:${providerIndex}:name`,
    value: provider.name,
    placeholder: '例如 openai / azure / aio'
  })}
        ${renderTextInput({
    label: 'Base URL',
    name: `provider:${providerIndex}:base_url`,
    value: provider.base_url,
    placeholder: 'https://api.example.com/v1'
  })}
        ${renderTextInput({
    label: '环境变量 Key',
    name: `provider:${providerIndex}:env_key`,
    value: provider.env_key,
    placeholder: 'OPENAI_API_KEY'
  })}
        ${renderTextInput({
    label: 'Wire API',
    name: `provider:${providerIndex}:wire_api`,
    value: provider.wire_api,
    placeholder: 'responses'
  })}
        ${renderToggle({
    label: '需要 OpenAI Auth',
    name: `provider:${providerIndex}:requires_openai_auth`,
    checked: provider.requires_openai_auth,
    description: '为 OpenAI 兼容供应商启用鉴权头。'
  })}
        ${renderToggle({
    label: '支持 WebSocket',
    name: `provider:${providerIndex}:supports_websockets`,
    checked: provider.supports_websockets,
    description: '可启用实时流式通道。'
  })}
      </div>

      <div class="rows-editor">
        <div class="rows-editor__header">
          <div>
            <h5>请求头</h5>
            <p>支持动态增加自定义请求头。</p>
          </div>
          <button class="mini-button" type="button" data-action="add-provider-header" data-index="${providerIndex}">添加 Header</button>
        </div>

        <div class="rows-editor__body">
          ${provider.http_headers
      .map(
        (row, headerIndex) => `
                <div class="kv-row">
                  <input
                    class="text-input"
                    type="text"
                    name="provider-header:${providerIndex}:${headerIndex}:key"
                    value="${escapeHtml(row.key)}"
                    placeholder="Header 名称"
                  />
                  <input
                    class="text-input"
                    type="text"
                    name="provider-header:${providerIndex}:${headerIndex}:value"
                    value="${escapeHtml(row.value)}"
                    placeholder="Header 值"
                  />
                  <button
                    class="icon-button"
                    type="button"
                    data-action="remove-provider-header"
                    data-index="${providerIndex}"
                    data-header-index="${headerIndex}"
                    aria-label="移除 Header"
                  >
                    ×
                  </button>
                </div>
              `
      )
      .join('')}
        </div>
      </div>
    </article>
  `;
}

function renderProfileCard(profile, profileIndex) {
  return `
    <article class="nested-card nested-card--profile">
      <div class="nested-card__header">
        <div>
          <h4>${escapeHtml(profile.name || `Profile ${profileIndex + 1}`)}</h4>
          <p>为不同工作流准备独立的模型与安全配置。</p>
        </div>
        <button class="mini-button" type="button" data-action="remove-profile" data-index="${profileIndex}">移除</button>
      </div>

      <div class="field-grid field-grid--nested">
        ${renderTextInput({
    label: 'Profile 名称',
    name: `profile:${profileIndex}:name`,
    value: profile.name,
    placeholder: 'reviewer / worker / default'
  })}
        ${renderTextInput({
    label: '模型',
    name: `profile:${profileIndex}:model`,
    value: profile.model,
    placeholder: '继承全局设置'
  })}
        ${renderTextInput({
    label: '供应商',
    name: `profile:${profileIndex}:model_provider`,
    value: profile.model_provider,
    placeholder: '继承全局设置'
  })}
        ${renderSelect({
    label: '审批策略',
    name: `profile:${profileIndex}:approval_policy`,
    value: profile.approval_policy,
    options: [{ value: '', label: '继承全局设置' }, ...APPROVAL_OPTIONS.map((item) => ({ value: item.value, label: item.label }))]
  })}
        ${renderSelect({
    label: '沙箱模式',
    name: `profile:${profileIndex}:sandbox_mode`,
    value: profile.sandbox_mode,
    options: [{ value: '', label: '继承全局设置' }, ...SANDBOX_OPTIONS.map((item) => ({ value: item.value, label: item.label }))]
  })}
      </div>
    </article>
  `;
}

function renderCodexOverviewSection(draft) {
  return `
    <section class="section-card section-card--codex">
      ${renderSectionIntro({
    eyebrow: '执行配置',
    title: '全局模型与执行安全',
    description: '优先把最关键的模型、安全策略和联网模式集中在一个页面里。',
    accent: 'codex'
  })}
      <div class="field-grid">
        ${renderTextInput({
    label: 'Model',
    name: 'model',
    value: draft.model,
    placeholder: 'gpt-4o / claude-3-5-sonnet'
  })}
        ${renderTextInput({
    label: '模型供应商',
    name: 'model_provider',
    value: draft.model_provider,
    placeholder: 'openai / anthropic / azure / aio'
  })}
        ${renderSelect({
    label: 'Reasoning Effort',
    name: 'model_reasoning_effort',
    value: draft.model_reasoning_effort,
    options: REASONING_OPTIONS
  })}
        ${renderSelect({
    label: 'Web Search',
    name: 'web_search_mode',
    value: draft.web_search_mode,
    options: WEB_SEARCH_OPTIONS,
    description: '设置模型的联网能力：关闭，标准单次检索，或允许实时交互浏览网页。'
  })}
        ${renderSegmented({
    label: 'Approval Policy',
    name: 'approval_policy',
    value: draft.approval_policy,
    options: APPROVAL_OPTIONS
  })}
        ${renderSegmented({
    label: 'Sandbox Mode',
    name: 'sandbox_mode',
    value: draft.sandbox_mode,
    options: SANDBOX_OPTIONS
  })}
      </div>
    </section>
  `;
}

function renderCodexFeaturesSection(draft) {
  return `
    <section class="section-card">
      ${renderSectionIntro({
    eyebrow: '功能开关',
    title: '体验开关',
    description: `当前已启用 ${getEnabledFeatureCount(draft.features)} / ${FEATURE_TOGGLES.length} 个高频功能。`,
    accent: 'neutral'
  })}
      <div class="field-grid">
        ${FEATURE_TOGGLES.map(
    ([key, label, description]) =>
      renderToggle({
        label,
        name: `feature:${key}`,
        checked: draft.features[key],
        description
      })
  ).join('')}
      </div>
    </section>
  `;
}

function renderCodexProvidersSection(draft) {
  return `
    <section class="section-card">
      ${renderSectionIntro({
    eyebrow: '供应商配置',
    title: '供应商配置',
    description: '只在需要的时候切进来管理 provider，避免平时被一长串卡片拖慢浏览。',
    accent: 'neutral'
  })}
      <div class="stack-actions">
        <button class="secondary-button" type="button" data-action="add-provider">新增供应商</button>
      </div>
      <div class="card-stack">
        ${draft.providers.map((provider, index) => renderProviderCard(provider, index)).join('')}
      </div>
    </section>
  `;
}

function renderCodexProfilesSection(draft) {
  return `
    <section class="section-card">
      ${renderSectionIntro({
    eyebrow: '命名配置集',
    title: '命名配置集',
    description: '将不同工作场景拆成独立 Profile，按需编辑，不再和基础配置混在同一长页里。',
    accent: 'neutral'
  })}
      <div class="stack-actions">
        <button class="secondary-button" type="button" data-action="add-profile">新增 Profile</button>
      </div>
      <div class="card-stack">
        ${draft.profiles.length > 0 ? draft.profiles.map((profile, index) => renderProfileCard(profile, index)).join('') : '<div class="empty-inline">还没有 Profile，点击上方按钮即可新增。</div>'}
      </div>
    </section>
  `;
}

function renderCodexAdvancedSection(draft) {
  return `
    <section class="section-card">
      ${renderSectionIntro({
    eyebrow: '引擎深入',
    title: '高阶引擎配置',
    description: '如果你需要调整底层 Agent 的上下文长度、最大并发或相关实验性参数，可在此设置。留空则表示使用框架默认值。',
    accent: 'neutral'
  })}
      <div class="field-grid">
        ${renderTextInput({
    label: 'Model Context Window',
    name: 'model_context_window',
    value: draft.model_context_window,
    type: 'number',
    placeholder: '留空使用默认',
    description: '模型最大上下文窗口（Token），影响长文截断。'
  })}
        ${renderTextInput({
    label: 'Auto-Compact Token Limit',
    name: 'model_auto_compact_token_limit',
    value: draft.model_auto_compact_token_limit,
    type: 'number',
    placeholder: '留空使用默认',
    description: '触发自动上下文压缩（如 Summarization）的 Token 水位线。'
  })}
        ${renderTextInput({
    label: 'Max Threads (并发)',
    name: 'max_threads',
    value: draft.max_threads,
    type: 'number',
    placeholder: '留空使用默认',
    description: '代理执行最大并发线程数。'
  })}
        ${renderTextInput({
    label: 'Max Depth (递归)',
    name: 'max_depth',
    value: draft.max_depth,
    type: 'number',
    placeholder: '留空使用默认',
    description: '子代理或多轮对话的最大深度限制。'
  })}
      </div>
    </section>
  `;
}

function renderCodexMcpServerCard(server, index) {
  return `
    <details class="nested-card nested-card--codex">
      <summary class="nested-card__header">
        <div>
          <h4>${escapeHtml(server.name || 'MCP Server')}</h4>
          <p>提供工具、资源或提示词的外部服务器。</p>
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
          <button class="mini-button" type="button" data-action="remove-mcp" data-index="${index}" onclick="event.stopPropagation();">移除</button>
          <svg style="width: 14px; height: 14px; fill: var(--text-dim);" class="summary-caret" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5H7z"/></svg>
        </div>
      </summary>
      <div class="field-grid field-grid--nested" style="padding-top: 16px;">
        ${renderTextInput({ label: '服务名称', name: `mcp:${index}:name`, value: server.name, placeholder: 'filesystem / postgres' })}
        ${renderTextInput({ label: '执行命令', name: `mcp:${index}:command`, value: server.command, placeholder: 'npx / uvx / docker' })}
        ${renderTextInput({ label: '运行参数 (空格分隔)', name: `mcp:${index}:args`, value: server.args, span: 'full', placeholder: '-y @modelcontextprotocol/server-filesystem /path/to/dir' })}
        <div class="field-card field-card--full nested-group">
          <div class="nested-group__header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <strong style="font-size: 0.88rem; color: var(--text-dim);">环境变量</strong>
            <button class="ghost-button mini-button" type="button" data-action="add-mcp-env-row" data-index="${index}">+ 添加</button>
          </div>
          <div class="rows-editor__body rows-editor__body--dense">
            ${server.envRows.map((row, rowIndex) => `
              <div class="kv-row">
                <input class="text-input" type="text" name="mcp:${index}:env:${rowIndex}:key" value="${escapeHtml(row.key)}" placeholder="变量名" />
                <input class="text-input" type="text" name="mcp:${index}:env:${rowIndex}:value" value="${escapeHtml(row.value)}" placeholder="变量值" />
                <button class="icon-button" type="button" data-action="remove-mcp-env-row" data-index="${index}" data-row="${rowIndex}">×</button>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </details>
  `;
}

function renderCodexMcpSection(draft) {
  return `
    <section class="section-card section-card--codex">
      ${renderSectionIntro({
    eyebrow: 'Extensions',
    title: 'MCP Servers',
    description: '通过 Model Context Protocol 挂载外部工具和资源，扩展 Codex CLI 的调用能力。',
    accent: 'neutral'
  })}
      <div class="stack-actions">
        <button class="secondary-button" type="button" data-action="add-mcp">新增服务器</button>
      </div>
      <div class="card-stack">
        ${draft.mcpServers.length > 0 ? draft.mcpServers.map((s, i) => renderCodexMcpServerCard(s, i)).join('') : '<div class="empty-inline">尚未配置 MCP 服务器。点击上方新增。</div>'}
      </div>
    </section>
  `;
}

export function renderCodexEditor(container, { entry, draft, onDraftChange }) {
  let currentDraft = clone(draft);

  container.innerHTML = `
    <div class="panel-shell panel-shell--editor">
      <div class="panel-heading">
        <div>
          <p class="panel-kicker">Codex 可视化编辑</p>
          <h2>${escapeHtml(entry.label)}</h2>
          <p>${escapeHtml(entry.exists ? entry.description : '当前文件不存在，保存后会自动创建并写入目标路径。')}</p>
        </div>
        <span class="editor-badge editor-badge--codex">${entry.exists ? '已加载文件' : '待创建'}</span>
      </div>

      ${renderCodexOverviewSection(currentDraft)}
      ${renderCodexFeaturesSection(currentDraft)}
      ${renderCodexAdvancedSection(currentDraft)}
      ${renderCodexMcpSection(currentDraft)}
      ${renderCodexProvidersSection(currentDraft)}
      ${renderCodexProfilesSection(currentDraft)}
    </div>
  `;

  function commit({ rerender = false } = {}) {
    onDraftChange(clone(currentDraft));
    if (rerender) {
      renderCodexEditor(container, { entry, draft: currentDraft, onDraftChange });
    }
  }

  container.oninput = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
      return;
    }

    const { name } = target;
    const value = target.type === 'checkbox' ? target.checked : target.value;

    if (name in currentDraft) {
      currentDraft[name] = value;
      commit();
      return;
    }

    if (name.startsWith('feature:')) {
      const featureKey = name.split(':')[1];
      currentDraft.features[featureKey] = Boolean(value);
      commit();
      return;
    }

    if (name.startsWith('provider:')) {
      const [, providerIndex, field] = name.split(':');
      currentDraft.providers[Number(providerIndex)][field] = value;
      commit();
      return;
    }

    if (name.startsWith('provider-header:')) {
      const [, providerIndex, headerIndex, field] = name.split(':');
      currentDraft.providers[Number(providerIndex)].http_headers[Number(headerIndex)][field] = value;
      commit();
      return;
    }

    if (name.startsWith('profile:')) {
      const [, profileIndex, field] = name.split(':');
      currentDraft.profiles[Number(profileIndex)][field] = value;
      commit();
      return;
    }

    if (name.startsWith('mcp:')) {
      const parts = name.split(':');
      const index = Number(parts[1]);
      const field = parts[2];

      if (field === 'env') {
        const rowIndex = Number(parts[3]);
        const envField = parts[4];
        currentDraft.mcpServers[index].envRows[rowIndex][envField] = value;
      } else {
        currentDraft.mcpServers[index][field] = value;
      }
      commit();
    }
  };

  container.onclick = (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) {
      return;
    }

    const action = button.getAttribute('data-action');
    const index = Number(button.getAttribute('data-index'));
    const headerIndex = Number(button.getAttribute('data-header-index'));
    const nextTab = button.getAttribute('data-tab');



    if (action === 'add-provider') {
      currentDraft.providers.push(createEmptyProvider());

      commit({ rerender: true });
      return;
    }

    if (action === 'remove-provider') {
      currentDraft.providers.splice(index, 1);
      if (currentDraft.providers.length === 0) {
        currentDraft.providers.push(createEmptyProvider());
      }
      commit({ rerender: true });
      return;
    }

    if (action === 'add-provider-header') {
      currentDraft.providers[index].http_headers.push({ key: '', value: '' });
      commit({ rerender: true });
      return;
    }

    if (action === 'remove-provider-header') {
      currentDraft.providers[index].http_headers.splice(headerIndex, 1);
      if (currentDraft.providers[index].http_headers.length === 0) {
        currentDraft.providers[index].http_headers.push({ key: '', value: '' });
      }
      commit({ rerender: true });
      return;
    }

    if (action === 'add-profile') {
      currentDraft.profiles.push(createEmptyProfile());

      commit({ rerender: true });
      return;
    }

    if (action === 'remove-profile') {
      currentDraft.profiles.splice(index, 1);
      commit({ rerender: true });
      return;
    }

    if (action === 'add-mcp') {
      currentDraft.mcpServers.push(createEmptyMcpServer());
      commit({ rerender: true });
      return;
    }

    if (action === 'remove-mcp') {
      currentDraft.mcpServers.splice(index, 1);
      commit({ rerender: true });
      return;
    }

    if (action === 'add-mcp-env-row') {
      currentDraft.mcpServers[index].envRows.push({ key: '', value: '' });
      commit({ rerender: true });
      return;
    }

    if (action === 'remove-mcp-env-row') {
      const rowIndex = Number(button.getAttribute('data-row'));
      currentDraft.mcpServers[index].envRows.splice(rowIndex, 1);
      if (currentDraft.mcpServers[index].envRows.length === 0) {
        currentDraft.mcpServers[index].envRows.push({ key: '', value: '' });
      }
      commit({ rerender: true });
    }
  };
}
