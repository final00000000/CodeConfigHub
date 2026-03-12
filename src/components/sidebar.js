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

function renderEntry(entry, selectedId) {
  const statusLabel = entry.error ? '解析异常' : entry.exists ? '已发现' : '未创建';
  const statusClass = entry.error ? 'is-danger' : entry.exists ? 'is-success' : 'is-muted';

  return `
    <button class="nav-entry ${entry.id === selectedId ? 'is-active' : ''}" data-entry-id="${escapeHtml(entry.id)}">
      <span class="nav-entry__top">
        <span class="nav-entry__title">${escapeHtml(entry.label)}</span>
        <span class="status-pill ${statusClass}">${escapeHtml(statusLabel)}</span>
      </span>
      <span class="nav-entry__meta">
        <span class="nav-entry__scope">${escapeHtml(entry.scope === 'project' ? '项目级' : '用户级')}</span>
        <span class="nav-entry__format">${escapeHtml(entry.format.toUpperCase())}</span>
        ${entry.editor ? '<span class="nav-entry__editable">可视化编辑</span>' : '<span class="nav-entry__readonly">只读预览</span>'}
      </span>
      <span class="nav-entry__path">${escapeHtml(entry.path)}</span>
    </button>
  `;
}

function renderGroup(title, tone, entries, selectedId) {
  return `
    <section class="nav-group nav-group--${tone}">
      <header class="nav-group__header">
        <h3>${escapeHtml(title)}</h3>
        <span>${entries.length}</span>
      </header>
      <div class="nav-group__body">
        ${entries.map((entry) => renderEntry(entry, selectedId)).join('')}
      </div>
    </section>
  `;
}

export function renderSidebar(container, { entries, projectPath, selectedId, onSelect, appVersion = '', currentTheme = 'light' }) {
  const codexEntries = entries.filter((entry) => entry.assistant === 'codex');
  const claudeEntries = entries.filter((entry) => entry.assistant === 'claude');
  const discoveredCount = entries.filter((entry) => entry.exists).length;
  const themeMeta = getThemeToggleMeta(currentTheme);
  const versionLabel = appVersion ? `v${escapeHtml(appVersion)}` : '版本读取中';

  container.innerHTML = `
    <div class="sidebar-shell">
      <div class="brand-block">
        <h1>CodeConfigHub</h1>
        <p class="brand-copy">为 Codex CLI 与 Claude Code 提供一套桌面级、可视化、带实时预览的配置工作台。</p>
      </div>

      <div class="sidebar-summary">
        <div class="summary-chip">
          <strong>${discoveredCount}</strong>
          <span>已发现配置文件</span>
        </div>
        <div class="summary-chip">
          <strong>${entries.length - discoveredCount}</strong>
          <span>可创建缺失文件</span>
        </div>
      </div>

      <div class="project-scope">
        <span class="project-scope__label">当前项目扫描范围</span>
        <span class="project-scope__value">${projectPath ? escapeHtml(projectPath) : '尚未选择项目目录，仅扫描用户级配置。'}</span>
      </div>

      ${renderGroup('Codex CLI', 'codex', codexEntries, selectedId)}
      ${renderGroup('Claude Code', 'claude', claudeEntries, selectedId)}

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
