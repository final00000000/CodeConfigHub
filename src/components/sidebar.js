import { escapeHtml } from './form-controls.js';

function renderGithubIcon() {
  return `
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M8 0C3.58 0 0 3.58 0 8a8.01 8.01 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.01.08-2.11 0 0 .67-.21 2.2.82a7.58 7.58 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.91.08 2.11.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" fill="currentColor"></path>
    </svg>
  `;
}

function renderUpdateIcon() {
  return `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
      <polyline points="23 4 23 10 17 10"></polyline>
      <polyline points="1 20 1 14 7 14"></polyline>
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
    </svg>
  `;
}

function renderThemeIcon(currentTheme = 'light') {
  if (currentTheme === 'dark') {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
        <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79Z"/>
      </svg>
    `;
  }

  return `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  `;
}

export function getThemeToggleMeta(currentTheme = 'light') {
  return {
    icon: renderThemeIcon(currentTheme),
    title: currentTheme === 'light' ? '切换到暗黑主题' : '切换到明亮主题',
    currentLabel: currentTheme === 'light' ? '浅色模式' : '深色模式'
  };
}

function pickText(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
}

function normalizeKey(value = '') {
  return String(value).trim().toLowerCase();
}

function matchesKeyword(source, keywords) {
  return keywords.some((keyword) => source.includes(keyword));
}

function inferAssistantLabel(entry) {
  const explicit = pickText(entry.assistantLabel, entry.brandLabel, entry.navAssistantLabel);
  if (explicit) {
    return explicit;
  }

  const assistant = normalizeKey(entry.assistant);
  if (assistant === 'codex') {
    return 'Codex CLI';
  }

  if (assistant === 'claude') {
    return 'Claude Code';
  }

  return pickText(entry.assistant, '配置对象');
}

function inferGroupKey(entry) {
  const explicit = normalizeKey(
    pickText(entry.navGroupKey, entry.groupKey, entry.scopeGroupKey, entry.scopeKey, entry.scope, entry.scopeLabel)
  );

  if (explicit) {
    if (matchesKeyword(explicit, ['project', 'workspace', 'repo', '项目', '本地'])) {
      return 'project';
    }

    if (matchesKeyword(explicit, ['user', 'global', 'home', 'default', '用户', '全局'])) {
      return 'user';
    }
  }

  const summary = normalizeKey(
    [entry.id, entry.label, entry.description, entry.path, entry.scopeLabel]
      .filter(Boolean)
      .join(' ')
  );

  if (matchesKeyword(summary, ['project', 'workspace', 'repo', '项目', '本地'])) {
    return 'project';
  }

  if (matchesKeyword(summary, ['user', 'global', 'home', 'default', '用户', '全局'])) {
    return 'user';
  }

  return 'other';
}

function inferGroupTitle(groupKey) {
  if (groupKey === 'project') {
    return '当前项目';
  }

  if (groupKey === 'user') {
    return '个人默认';
  }

  return '更多对象';
}

function inferObjectKindKey(entry) {
  const explicit = normalizeKey(pickText(entry.objectKind, entry.objectType, entry.kind, entry.navKind));
  if (explicit) {
    if (matchesKeyword(explicit, ['rule', 'rules', 'instruction', 'markdown', '规则'])) {
      return 'rules';
    }

    if (matchesKeyword(explicit, ['mcp'])) {
      return 'mcp';
    }

    if (matchesKeyword(explicit, ['profile'])) {
      return 'profile';
    }

    if (matchesKeyword(explicit, ['setting', 'config', '配置', '设置'])) {
      return 'settings';
    }

    return explicit;
  }

  const summary = normalizeKey(
    [entry.id, entry.label, entry.description, entry.path, entry.format]
      .filter(Boolean)
      .join(' ')
  );

  if (matchesKeyword(summary, ['mcp'])) {
    return 'mcp';
  }

  if (matchesKeyword(summary, ['rule', 'rules', 'agents.md', 'claude.md', 'markdown', '规则'])) {
    return 'rules';
  }

  if (matchesKeyword(summary, ['profile'])) {
    return 'profile';
  }

  if (matchesKeyword(summary, ['setting', 'settings', 'config', 'json', 'toml', '配置', '设置'])) {
    return 'settings';
  }

  return 'file';
}

function inferObjectKindLabel(entry, objectKind) {
  const explicit = pickText(entry.objectKindLabel, entry.kindLabel, entry.navKindLabel);
  if (explicit) {
    return explicit;
  }

  if (objectKind === 'rules') {
    return '规则';
  }

  if (objectKind === 'mcp') {
    return 'MCP';
  }

  if (objectKind === 'profile') {
    return 'Profile';
  }

  if (objectKind === 'settings') {
    return '设置';
  }

  return pickText(entry.format && entry.format.toUpperCase(), '文件');
}

function stripAssistantPrefix(label = '') {
  return String(label)
    .replace(/^\s*(codex(?:\s*cli)?|claude(?:\s*code)?)\s*/i, '')
    .trim();
}

function inferNavTitle(entry, groupKey, objectKind) {
  const explicit = pickText(entry.navTitle, entry.objectLabel, entry.objectTitle, entry.shortLabel);
  if (explicit) {
    return explicit;
  }

  const strippedLabel = stripAssistantPrefix(pickText(entry.label));
  if (strippedLabel) {
    if (strippedLabel.includes('用户级配置')) {
      return '默认设置';
    }

    if (strippedLabel.includes('全局设置')) {
      return '全局设置';
    }

    if (strippedLabel.includes('项目设置')) {
      return '项目设置';
    }

    if (strippedLabel.includes('本地设置')) {
      return '本地设置';
    }

    if (strippedLabel.includes('全局规则')) {
      return '全局规则';
    }

    if (strippedLabel.includes('项目规则')) {
      return '项目规则';
    }

    if (strippedLabel.includes('MCP')) {
      return 'MCP 配置';
    }

    return strippedLabel;
  }

  const summary = normalizeKey([entry.id, entry.path, entry.description].filter(Boolean).join(' '));
  if (matchesKeyword(summary, ['local', '本地'])) {
    return '本地设置';
  }

  if (objectKind === 'rules') {
    return groupKey === 'project' ? '项目规则' : '全局规则';
  }

  if (objectKind === 'mcp') {
    return 'MCP 配置';
  }

  if (objectKind === 'settings') {
    return groupKey === 'project' ? '项目设置' : '默认设置';
  }

  return pickText(entry.id, '未命名对象');
}

function inferScopeDetailLabel(entry, groupKey, navTitle) {
  const explicit = pickText(entry.scopeLabel, entry.scopeDetailLabel, entry.navScopeLabel);
  if (!explicit) {
    return '';
  }

  const normalized = normalizeKey(explicit);
  if (
    (groupKey === 'project' && matchesKeyword(normalized, ['project', 'workspace', '项目'])) ||
    (groupKey === 'user' && matchesKeyword(normalized, ['user', 'global', 'default', '用户', '全局']))
  ) {
    return '';
  }

  if (navTitle.includes(explicit) || explicit.includes(navTitle)) {
    return '';
  }

  return explicit;
}

function inferPathLabel(entry) {
  const explicit = pickText(entry.navPathLabel, entry.pathLabel, entry.shortPath);
  if (explicit) {
    return explicit;
  }

  const targetPath = pickText(entry.path);
  if (!targetPath) {
    return '';
  }

  const segments = targetPath.split(/[\\/]+/).filter(Boolean);
  if (segments.length === 0) {
    return targetPath;
  }

  const fileName = segments[segments.length - 1];
  const parentName = segments[segments.length - 2] || '';

  if (parentName.startsWith('.')) {
    return `${parentName}/${fileName}`;
  }

  return fileName;
}

function inferStatusMeta(entry) {
  if (entry.error) {
    return {
      label: pickText(entry.navStatusLabel, entry.statusLabel, '解析异常'),
      className: 'is-danger'
    };
  }

  if (entry.exists === false) {
    return {
      label: pickText(entry.navStatusLabel, entry.statusLabel, '可创建'),
      className: 'is-muted'
    };
  }

  return {
    label: '',
    className: ''
  };
}

function inferAccessLabel(entry) {
  if (entry.editor === null || entry.editor === false || entry.isEditable === false) {
    return '只读预览';
  }

  return '';
}

function getObjectKindOrder(objectKind) {
  switch (objectKind) {
    case 'settings':
      return 0;
    case 'rules':
      return 1;
    case 'mcp':
      return 2;
    case 'profile':
      return 3;
    default:
      return 4;
  }
}

function normalizeEntry(entry, index) {
  const groupKey = inferGroupKey(entry);
  const objectKind = inferObjectKindKey(entry);
  const navTitle = inferNavTitle(entry, groupKey, objectKind);
  const assistantLabel = inferAssistantLabel(entry);
  const scopeDetailLabel = inferScopeDetailLabel(entry, groupKey, navTitle);
  const status = inferStatusMeta(entry);
  const parsedNavOrder = Number(entry.navOrder);
  const navOrder = Number.isFinite(parsedNavOrder) ? parsedNavOrder : Number.POSITIVE_INFINITY;

  return {
    ...entry,
    index,
    groupKey,
    groupTitle: pickText(entry.navGroupTitle, entry.groupTitle, inferGroupTitle(groupKey)),
    navTitle,
    assistantLabel,
    objectKind,
    objectKindLabel: inferObjectKindLabel(entry, objectKind),
    scopeDetailLabel,
    pathLabel: inferPathLabel(entry),
    accessLabel: inferAccessLabel(entry),
    statusLabel: status.label,
    statusClass: status.className,
    sortRank: navOrder,
    objectKindOrder: getObjectKindOrder(objectKind)
  };
}

function getScopeSummaryLabel(entry) {
  if (entry.groupKey === 'project') {
    return '当前项目';
  }

  if (entry.groupKey === 'user') {
    return '个人默认';
  }

  return pickText(entry.scopeDetailLabel, entry.scopeLabel, '其他范围');
}

function getGroupDescription(groupKey) {
  if (groupKey === 'project') {
    return '当前仓库相关配置';
  }

  if (groupKey === 'user') {
    return '跨项目默认值';
  }

  return '补充对象';
}

function getAssistantChipTone(entry) {
  const assistantKey = normalizeKey(entry.assistant || '');
  if (assistantKey === 'codex' || assistantKey === 'claude') {
    return assistantKey;
  }

  return 'neutral';
}

function getObjectKindChipTone(objectKind = '') {
  switch (normalizeKey(objectKind)) {
    case 'mcp':
      return 'mcp';
    case 'rules':
      return 'rules';
    case 'profile':
      return 'profile';
    case 'settings':
      return 'settings';
    default:
      return 'neutral';
  }
}

function renderNavChip(label, tone = 'neutral') {
  if (!label) {
    return '';
  }

  return `<span class="nav-chip nav-chip--${tone}">${escapeHtml(label)}</span>`;
}

function renderSidebarSignal(label, count, tone = 'neutral') {
  if (!count) {
    return '';
  }

  return `
    <span class="brand-chip brand-chip--${tone}">
      <strong>${escapeHtml(label)}</strong>
      <span>${count}</span>
    </span>
  `;
}

function renderEntry(entry, selectedId) {
  const assistantKey = normalizeKey(entry.assistant || '');
  const assistantAttr = (assistantKey === 'codex' || assistantKey === 'claude') ? assistantKey : '';
  const summaryItems = [
    getScopeSummaryLabel(entry),
    entry.accessLabel
  ].filter(Boolean);
  const chips = [
    renderNavChip(pickText(entry.assistantShortLabel, entry.assistantLabel), getAssistantChipTone(entry)),
    renderNavChip(entry.objectKindLabel, getObjectKindChipTone(entry.objectKind))
  ].filter(Boolean);
  const pathValue = entry.pathLabel || entry.compactPath || entry.path || '';

  return `
    <button
      type="button"
      class="nav-entry ${entry.id === selectedId ? 'is-active' : ''}"
      data-entry-id="${escapeHtml(entry.id)}"
      ${assistantAttr ? `data-assistant="${assistantAttr}"` : ''}
      aria-pressed="${entry.id === selectedId ? 'true' : 'false'}"
    >
      <span class="nav-entry__top">
        <span class="nav-entry__title">${escapeHtml(entry.navTitle)}</span>
        ${entry.statusLabel ? `<span class="status-pill ${entry.statusClass}">${escapeHtml(entry.statusLabel)}</span>` : ''}
      </span>
      ${chips.length > 0 ? `
        <span class="nav-entry__chips">
          ${chips.join('')}
        </span>
      ` : ''}
      ${summaryItems.length > 0 ? `
        <span class="nav-entry__summary">
          ${escapeHtml(summaryItems.join(' · '))}
        </span>
      ` : ''}
      ${
        pathValue
          ? `<span class="nav-entry__path" title="${escapeHtml(entry.path || '')}">${escapeHtml(pathValue)}</span>`
          : ''
      }
    </button>
  `;
}

function renderGroup(group, selectedId) {
  return `
    <section class="nav-group nav-group--${escapeHtml(group.key)}">
      <header class="nav-group__header">
        <div class="nav-group__header-main">
          <h3>${escapeHtml(group.title)}</h3>
          <p>${escapeHtml(getGroupDescription(group.key))}</p>
        </div>
        <span class="nav-group__count">${group.entries.length} 项</span>
      </header>
      <div class="nav-group__body">
        ${group.entries.map((entry) => renderEntry(entry, selectedId)).join('')}
      </div>
    </section>
  `;
}

export function renderSidebar(container, { entries, projectPath, selectedId, onSelect, appVersion = '', currentTheme = 'light' }) {
  const normalizedEntries = Array.isArray(entries) ? entries.map((entry, index) => normalizeEntry(entry, index)) : [];
  const groupedEntries = normalizedEntries.reduce((groups, entry) => {
    if (!groups.has(entry.groupKey)) {
      groups.set(entry.groupKey, {
        key: entry.groupKey,
        title: entry.groupTitle,
        entries: []
      });
    }

    groups.get(entry.groupKey).entries.push(entry);
    return groups;
  }, new Map());

  const groupOrder = ['project', 'user', 'other'];
  const sortedGroups = [...groupedEntries.values()]
    .sort((left, right) => {
      const leftIndex = groupOrder.indexOf(left.key);
      const rightIndex = groupOrder.indexOf(right.key);
      return (leftIndex === -1 ? groupOrder.length : leftIndex) - (rightIndex === -1 ? groupOrder.length : rightIndex);
    })
    .map((group) => ({
      ...group,
      entries: [...group.entries].sort((left, right) => {
        if (left.sortRank !== right.sortRank) {
          return left.sortRank - right.sortRank;
        }

        if (left.objectKindOrder !== right.objectKindOrder) {
          return left.objectKindOrder - right.objectKindOrder;
        }

        const assistantCompare = left.assistantLabel.localeCompare(right.assistantLabel, 'zh-Hans-CN');
        if (assistantCompare !== 0) {
          return assistantCompare;
        }

        const titleCompare = left.navTitle.localeCompare(right.navTitle, 'zh-Hans-CN');
        if (titleCompare !== 0) {
          return titleCompare;
        }

        return left.index - right.index;
      })
    }));

  const themeMeta = getThemeToggleMeta(currentTheme);
  const versionLabel = appVersion ? `v${escapeHtml(appVersion)}` : '版本读取中';
  const projectScopeLabel = projectPath ? escapeHtml(projectPath) : '未选择项目时，只显示个人默认配置。';
  const totalEntryCount = normalizedEntries.length;
  const assistantCounts = normalizedEntries.reduce((counts, entry) => {
    const assistantKey = normalizeKey(entry.assistant || '');
    if (assistantKey === 'codex' || assistantKey === 'claude') {
      counts[assistantKey] += 1;
    } else {
      counts.other += 1;
    }
    return counts;
  }, { codex: 0, claude: 0, other: 0 });
  const navigationHtml = sortedGroups.length > 0
    ? `
      <nav class="sidebar-nav" aria-label="配置对象">
        ${sortedGroups.map((group) => renderGroup(group, selectedId)).join('')}
      </nav>
    `
    : `
      <div class="sidebar-empty" role="note" aria-label="暂无可编辑对象">
        <p class="sidebar-empty__title">还没有发现可编辑对象</p>
        <p class="sidebar-empty__copy">先选择项目目录或重新扫描。发现配置后，它们会按对象出现在这里。</p>
      </div>
    `;

  container.innerHTML = `
    <div class="sidebar-shell">
      <div class="brand-block">
        <p class="brand-block__eyebrow">配置导航</p>
        <div class="brand-block__headline">
          <h1>CodeConfigHub</h1>
          <span class="brand-block__count">${totalEntryCount} 项</span>
        </div>
        <p class="brand-block__copy">按范围和对象切换，右侧只处理当前这一份配置。</p>
        <div class="brand-block__signals">
          ${[
    renderSidebarSignal('Codex', assistantCounts.codex, 'codex'),
    renderSidebarSignal('Claude', assistantCounts.claude, 'claude'),
    renderSidebarSignal('其他', assistantCounts.other, 'neutral')
  ].filter(Boolean).join('')}
        </div>
      </div>

      <div class="project-scope">
        <span class="project-scope__label">当前工作区</span>
        <code class="project-scope__value" title="${projectPath ? escapeHtml(projectPath) : '未选择项目'}">${projectScopeLabel}</code>
      </div>

      ${navigationHtml}

      <div class="sidebar-footer">
        <div class="sidebar-footer__compact">
          <span class="sidebar-version" title="当前应用版本" aria-label="当前应用版本 ${versionLabel}">
            <span class="sidebar-version__value">${versionLabel}</span>
          </span>
          <div class="sidebar-footer__icon-actions">
            <button
              id="check-update-btn"
              class="icon-button sidebar-footer__icon-action"
              type="button"
              title="检查更新"
              aria-label="检查更新"
            >
              <span class="sidebar-footer__icon-glyph" aria-hidden="true">${renderUpdateIcon()}</span>
            </button>
            <button
              class="icon-button sidebar-footer__icon-action"
              type="button"
              data-sidebar-action="toggle-theme"
              title="${escapeHtml(themeMeta.title)}"
              aria-label="${escapeHtml(themeMeta.title)}"
            >
              <span class="sidebar-footer__icon-glyph" data-theme-icon aria-hidden="true">${themeMeta.icon}</span>
            </button>
            <button
              class="icon-button sidebar-footer__icon-action sidebar-footer__icon-action--github"
              type="button"
              data-sidebar-action="open-github"
              title="打开 GitHub 仓库"
              aria-label="打开 GitHub 仓库"
            >
              <span class="sidebar-footer__icon-glyph" aria-hidden="true">${renderGithubIcon()}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  container.onclick = (event) => {
    const button = event.target.closest('[data-entry-id]');
    if (!button) {
      return;
    }

    onSelect(button.getAttribute('data-entry-id'));
  };
}
