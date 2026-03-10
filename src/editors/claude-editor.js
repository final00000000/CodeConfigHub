import {
  renderSectionIntro,
  renderTextArea,
  renderTextInput,
  renderToggle,
  escapeHtml
} from '../components/form-controls.js';



function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function mapObjectRows(objectValue) {
  const rows = Object.entries(objectValue || {}).map(([key, value]) => ({
    key,
    value: String(value)
  }));

  return rows.length > 0 ? rows : [{ key: '', value: '' }];
}

function flattenHooks(hooksValue) {
  const rows = [];

  for (const [eventName, blocks] of Object.entries(hooksValue || {})) {
    for (const block of blocks || []) {
      for (const hook of block.hooks || []) {
        rows.push({
          event: eventName,
          matcher: block.matcher || '',
          type: hook.type || 'command',
          value: hook.command || hook.url || hook.prompt || ''
        });
      }
    }
  }

  return rows;
}

function createHookDraft() {
  return {
    event: 'Notification',
    matcher: '',
    type: 'command',
    value: ''
  };
}

function normalizeList(value) {
  if (Array.isArray(value)) {
    return value;
  }

  return [];
}

function parseMcpServers(serversObj) {
  const result = [];
  for (const [name, config] of Object.entries(serversObj || {})) {
    result.push({
      name,
      command: config.command || '',
      args: Array.isArray(config.args) ? config.args.join(' ') : (config.args || ''),
      envRows: mapObjectRows(config.env)
    });
  }
  return result;
}

function createMcpServerDraft() {
  return {
    name: 'new-server',
    command: 'npx',
    args: '-y @modelcontextprotocol/server-memory',
    envRows: [{ key: '', value: '' }]
  };
}

function isFilledValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function hasKeyValueRowsData(rows = []) {
  return rows.some((row) => isFilledValue(row?.key) || isFilledValue(row?.value));
}

function hasHookData(hook = {}) {
  return isFilledValue(hook.matcher) || isFilledValue(hook.value);
}

function hasMcpServerData(server = {}) {
  return isFilledValue(server.name)
    || isFilledValue(server.command)
    || isFilledValue(server.args)
    || hasKeyValueRowsData(server.envRows);
}



export function createClaudeDraft(parsed = {}) {
  return {
    model: parsed.model || '',
    alwaysThinkingEnabled: Boolean(parsed.alwaysThinkingEnabled),
    fastMode: Boolean(parsed.fastMode),
    cleanupPeriodDays: parsed.cleanupPeriodDays ?? '',
    envRows: mapObjectRows(parsed.env),
    permissions: {
      allow: normalizeList(parsed.permissions?.allow),
      deny: normalizeList(parsed.permissions?.deny),
      ask: normalizeList(parsed.permissions?.ask)
    },
    hooks: flattenHooks(parsed.hooks),
    mcpServers: parseMcpServers(parsed.mcpServers)
  };
}

export function serializeClaudeDraft(baseConfig = {}, draft) {
  const output = clone(baseConfig && typeof baseConfig === 'object' ? baseConfig : {});

  if (draft.model.trim()) {
    output.model = draft.model.trim();
  } else {
    delete output.model;
  }

  output.alwaysThinkingEnabled = Boolean(draft.alwaysThinkingEnabled);
  output.fastMode = Boolean(draft.fastMode);

  if (draft.cleanupPeriodDays === '' || Number.isNaN(Number(draft.cleanupPeriodDays))) {
    delete output.cleanupPeriodDays;
  } else {
    output.cleanupPeriodDays = Number(draft.cleanupPeriodDays);
  }

  const env = {};
  for (const row of draft.envRows) {
    if (!row.key.trim()) {
      continue;
    }
    env[row.key.trim()] = row.value;
  }
  output.env = env;

  output.permissions = {
    ...(output.permissions && typeof output.permissions === 'object' ? output.permissions : {}),
    allow: parseMultilineEntries(draft.permissions.allow),
    deny: parseMultilineEntries(draft.permissions.deny),
    ask: parseMultilineEntries(draft.permissions.ask)
  };

  const hooks = {};
  for (const row of draft.hooks) {
    if (!row.event.trim() || !row.value.trim()) {
      continue;
    }

    if (!hooks[row.event]) {
      hooks[row.event] = [];
    }

    hooks[row.event].push({
      matcher: row.matcher,
      hooks: [
        row.type === 'http'
          ? { type: 'http', url: row.value }
          : row.type === 'prompt'
            ? { type: 'prompt', prompt: row.value }
            : { type: 'command', command: row.value }
      ]
    });
  }
  output.hooks = hooks;

  const mcpServers = {};
  for (const server of draft.mcpServers) {
    if (!server.name.trim() || !server.command.trim()) continue;

    const serverConfig = {
      command: server.command.trim(),
      args: server.args.trim() ? server.args.trim().split(' ').filter(Boolean) : []
    };

    const env = {};
    for (const row of server.envRows) {
      if (row.key.trim()) env[row.key.trim()] = row.value;
    }
    if (Object.keys(env).length > 0) serverConfig.env = env;

    mcpServers[server.name.trim()] = serverConfig;
  }

  if (Object.keys(mcpServers).length > 0) {
    output.mcpServers = mcpServers;
  } else {
    delete output.mcpServers;
  }

  return {
    parsed: output,
    content: `${JSON.stringify(output, null, 2)}\n`
  };
}

function parseMultilineEntries(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }

  return String(value)
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function renderHookCard(hook, index) {
  const placeholder =
    hook.type === 'http'
      ? 'https://example.com/hooks/notify'
      : hook.type === 'prompt'
        ? '请在任务停止时生成一条摘要'
        : 'powershell -ExecutionPolicy Bypass -File "...notify.ps1" stop';

  return `
    <article class="nested-card nested-card--claude">
      <div class="nested-card__header">
        <div>
          <h4>${escapeHtml(hook.event || `Hook ${index + 1}`)}</h4>
          <p>每个卡片对应一条 Claude 生命周期 Hook。</p>
        </div>
        <button class="mini-button" type="button" data-action="remove-hook" data-index="${index}">移除</button>
      </div>

      <div class="field-grid field-grid--nested">
        ${renderTextInput({
    label: 'Hook Event',
    name: `hook:${index}:event`,
    value: hook.event,
    placeholder: 'Notification / Stop / PreToolUse'
  })}
        ${renderTextInput({
    label: 'Matcher',
    name: `hook:${index}:matcher`,
    value: hook.matcher,
    placeholder: '可留空，表示匹配全部'
  })}
        <label class="field-card">
          <span class="field-copy">
            <span class="field-label">类型</span>
            <span class="field-description">命令 / HTTP / 提示词。</span>
          </span>
          <span class="field-control">
            <select class="select-input" name="hook:${index}:type">
              <option value="command" ${hook.type === 'command' ? 'selected' : ''}>命令</option>
              <option value="http" ${hook.type === 'http' ? 'selected' : ''}>HTTP</option>
              <option value="prompt" ${hook.type === 'prompt' ? 'selected' : ''}>提示词</option>
            </select>
          </span>
        </label>
        <label class="field-card field-card--full">
          <span class="field-copy">
            <span class="field-label">${hook.type === 'http' ? 'URL' : hook.type === 'prompt' ? '提示词' : '命令'}</span>
            <span class="field-description">根据类型录入 URL、提示词文本或命令行。</span>
          </span>
          <span class="field-control">
            <input class="text-input" type="text" name="hook:${index}:value" value="${escapeHtml(hook.value)}" placeholder="${escapeHtml(placeholder)}" />
          </span>
        </label>
      </div>
    </article>
  `;
}

function renderClaudeBehaviorSection(draft) {
  return `
    <section class="section-card section-card--claude">
      ${renderSectionIntro({
    eyebrow: '核心行为',
    title: '核心行为配置',
    description: '把最常改的模型、快速模式和思考策略放到第一屏，不再和权限、钩子混在一长页里。',
    accent: 'claude'
  })}
      <div class="field-grid">
        ${renderTextInput({
    label: 'Model',
    name: 'model',
    value: draft.model,
    placeholder: 'opus / sonnet'
  })}
        ${renderTextInput({
    label: 'Cleanup Period Days',
    name: 'cleanupPeriodDays',
    value: draft.cleanupPeriodDays,
    type: 'number',
    placeholder: '30'
  })}
        ${renderToggle({
    label: 'Always Thinking',
    name: 'alwaysThinkingEnabled',
    checked: draft.alwaysThinkingEnabled,
    description: '让 Claude 在默认情况下总是进入深思考。'
  })}
        ${renderToggle({
    label: 'Fast Mode',
    name: 'fastMode',
    checked: draft.fastMode,
    description: '偏向更快响应的执行模式。'
  })}
      </div>
    </section>
  `;
}

function renderClaudePermissionsSection(draft) {
  return `
    <section class="section-card">
      ${renderSectionIntro({
    eyebrow: 'Permissions',
    title: '权限规则',
    description: '单独切页管理 allow / deny / ask，避免基础设置被大段规则列表淹没。',
    accent: 'neutral'
  })}
      <div class="field-grid">
        ${renderTextArea({
    label: 'Allow',
    name: 'permissions:allow',
    value: draft.permissions.allow.join('\n'),
    rows: 7,
    span: 'full',
    placeholder: 'Bash(git add:*)'
  })}
        ${renderTextArea({
    label: 'Deny',
    name: 'permissions:deny',
    value: draft.permissions.deny.join('\n'),
    rows: 5,
    span: 'full',
    placeholder: 'Bash(rm -rf:*)'
  })}
        ${renderTextArea({
    label: 'Ask',
    name: 'permissions:ask',
    value: draft.permissions.ask.join('\n'),
    rows: 5,
    span: 'full',
    placeholder: 'mcp__playwright__browser_click'
  })}
      </div>
    </section>
  `;
}

function renderClaudeEnvironmentSection(draft) {
  return `
    <section class="section-card">
      ${renderSectionIntro({
    eyebrow: 'Environment',
    title: '环境变量',
    description: '把 env 列表独立出来，平时不用就不占可视空间。',
    accent: 'neutral'
  })}
      <div class="stack-actions">
        <button class="secondary-button" type="button" data-action="add-env-row">新增环境变量</button>
      </div>
      <div class="rows-editor">
        <div class="rows-editor__body rows-editor__body--dense">
          ${draft.envRows
      .map(
        (row, index) => `
                <div class="kv-row">
                  <input class="text-input" type="text" name="env:${index}:key" value="${escapeHtml(row.key)}" placeholder="变量名" />
                  <input class="text-input" type="text" name="env:${index}:value" value="${escapeHtml(row.value)}" placeholder="变量值" />
                  <button class="icon-button" type="button" data-action="remove-env-row" data-index="${index}" aria-label="移除环境变量">×</button>
                </div>
              `
      )
      .join('')}
        </div>
      </div>
    </section>
  `;
}

function renderClaudeHooksSection(draft) {
  return `
    <section class="section-card">
      ${renderSectionIntro({
    eyebrow: '生命周期钩子',
    title: '生命周期钩子',
    description: '仅在需要编排 Hook 时打开这个页签，减少日常浏览路径。',
    accent: 'neutral'
  })}
      <div class="stack-actions">
        <button class="secondary-button" type="button" data-action="add-hook">新增 Hook</button>
      </div>
      <div class="card-stack">
        ${draft.hooks.length > 0 ? draft.hooks.map((hook, index) => renderHookCard(hook, index)).join('') : '<div class="empty-inline">还没有 Hook，点击上方按钮新增。</div>'}
      </div>
    </section>
  `;
}

function renderMcpServerCard(server, index) {
  return `
    <details class="nested-card nested-card--claude">
      <summary class="nested-card__header">
        <div>
          <h4>${escapeHtml(server.name || 'MCP Server')}</h4>
          <p>提供工具、资源或提示词的外部服务器。</p>
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
          <button class="mini-button" type="button" data-action="remove-mcp" data-index="${index}" data-stop-summary-toggle="true">移除</button>
          <svg style="width: 14px; height: 14px; fill: var(--text-dim);" class="summary-caret" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5H7z"/></svg>
        </div>
      </summary>

      <div class="field-grid field-grid--nested" style="padding-top: 16px;">
        ${renderTextInput({ label: '服务名称', name: `mcp:${index}:name`, value: server.name, placeholder: 'sqlite' })}
        ${renderTextInput({ label: '执行命令', name: `mcp:${index}:command`, value: server.command, placeholder: 'npx / uvx / docker' })}
        ${renderTextInput({ label: '运行参数 (空格分隔)', name: `mcp:${index}:args`, value: server.args, span: 'full', placeholder: '-y @modelcontextprotocol/server-postgres' })}
        
        <div class="field-card field-card--full nested-group">
          <div class="nested-group__header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <strong style="font-size: 0.88rem; color: var(--text-dim);">环境变量</strong>
            <button class="ghost-button mini-button" type="button" data-action="add-mcp-env-row" data-index="${index}">+ 添加实例配置</button>
          </div>
          <div class="rows-editor__body rows-editor__body--dense">
            ${server.envRows.map((row, rowIndex) => `
              <div class="kv-row">
                <input class="text-input" type="text" name="mcp:${index}:env:${rowIndex}:key" value="${escapeHtml(row.key)}" placeholder="变量名 (如 DB_PASS)" />
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

function renderClaudeMcpSection(draft) {
  return `
    <section class="section-card section-card--claude">
      ${renderSectionIntro({
    eyebrow: 'Extensions',
    title: 'MCP Servers',
    description: '通过 Model Context Protocol 挂载外部工具、资源库和提示词，大幅扩展 Claude Desktop 核心能力。',
    accent: 'neutral'
  })}
      <div class="stack-actions">
        <button class="secondary-button" type="button" data-action="add-mcp">新增服务器</button>
      </div>
      <div class="card-stack">
        ${draft.mcpServers.length > 0 ? draft.mcpServers.map((s, i) => renderMcpServerCard(s, i)).join('') : '<div class="empty-inline">尚未配置 MCP 服务器。点击上方新增。</div>'}
      </div>
    </section>
  `;
}

export function renderClaudeEditor(container, { entry, draft, onDraftChange }) {
  let currentDraft = clone(draft);

  container.innerHTML = `
    <div class="panel-shell panel-shell--editor">
      <div class="panel-heading">
        <div>
          <p class="panel-kicker">Claude 可视化编辑</p>
          <h2>${escapeHtml(entry.label)}</h2>
          <p>${escapeHtml(entry.exists ? entry.description : '当前文件不存在，保存后会自动创建目标 settings.json。')}</p>
        </div>
        <span class="editor-badge editor-badge--claude">${entry.exists ? '已加载文件' : '待创建'}</span>
      </div>

      ${renderClaudeBehaviorSection(currentDraft)}
      ${renderClaudeMcpSection(currentDraft)}
      ${renderClaudePermissionsSection(currentDraft)}
      ${renderClaudeEnvironmentSection(currentDraft)}
      ${renderClaudeHooksSection(currentDraft)}
    </div>
  `;

  container.querySelectorAll('[data-stop-summary-toggle="true"]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
    });
  });

  function commit({ rerender = false } = {}) {
    onDraftChange(clone(currentDraft));
    if (rerender) {
      renderClaudeEditor(container, { entry, draft: currentDraft, onDraftChange });
    }
  }

  container.oninput = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) {
      return;
    }

    const { name } = target;
    const value = target.type === 'checkbox' ? target.checked : target.value;

    if (name in currentDraft) {
      currentDraft[name] = value;
      commit();
      return;
    }

    if (name.startsWith('permissions:')) {
      const [, bucket] = name.split(':');
      currentDraft.permissions[bucket] = value.split('\n');
      commit();
      return;
    }

    if (name.startsWith('env:')) {
      const [, index, field] = name.split(':');
      currentDraft.envRows[Number(index)][field] = value;
      commit();
      return;
    }

    if (name.startsWith('hook:')) {
      const [, index, field] = name.split(':');
      currentDraft.hooks[Number(index)][field] = value;
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
    const nextTab = button.getAttribute('data-tab');



    if (action === 'add-env-row') {
      currentDraft.envRows.push({ key: '', value: '' });

      commit({ rerender: true });
      return;
    }

    if (action === 'remove-env-row') {
      const row = currentDraft.envRows[index];
      if (row && (isFilledValue(row.key) || isFilledValue(row.value)) && !window.confirm('确定要删除这条环境变量吗？')) {
        return;
      }

      currentDraft.envRows.splice(index, 1);
      if (currentDraft.envRows.length === 0) {
        currentDraft.envRows.push({ key: '', value: '' });
      }
      commit({ rerender: true });
      return;
    }

    if (action === 'add-hook') {
      currentDraft.hooks.push(createHookDraft());
      commit({ rerender: true });
      return;
    }

    if (action === 'remove-hook') {
      const hook = currentDraft.hooks[index];
      if (hasHookData(hook) && !window.confirm('确定要删除这条 Hook 吗？')) {
        return;
      }

      currentDraft.hooks.splice(index, 1);
      commit({ rerender: true });
      return;
    }

    if (action === 'add-mcp') {
      currentDraft.mcpServers.push(createMcpServerDraft());
      commit({ rerender: true });
      return;
    }

    if (action === 'remove-mcp') {
      const server = currentDraft.mcpServers[index];
      const serverLabel = server?.name?.trim() ? `MCP 服务器「${server.name.trim()}」` : '该 MCP 服务器';
      if (hasMcpServerData(server) && !window.confirm(`确定要删除${serverLabel}吗？`)) {
        return;
      }

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
      const row = currentDraft.mcpServers[index].envRows[rowIndex];
      if (row && (isFilledValue(row.key) || isFilledValue(row.value)) && !window.confirm('确定要删除这条环境变量吗？')) {
        return;
      }

      currentDraft.mcpServers[index].envRows.splice(rowIndex, 1);
      if (currentDraft.mcpServers[index].envRows.length === 0) {
        currentDraft.mcpServers[index].envRows.push({ key: '', value: '' });
      }
      commit({ rerender: true });
    }
  };
}
