import { escapeHtml } from './form-controls.js';

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

export function renderSidebar(container, { entries, projectPath, selectedId, onSelect }) {
  const codexEntries = entries.filter((entry) => entry.assistant === 'codex');
  const claudeEntries = entries.filter((entry) => entry.assistant === 'claude');
  const discoveredCount = entries.filter((entry) => entry.exists).length;

  container.innerHTML = `
    <div class="sidebar-shell">
      <div class="brand-block">
        <p class="brand-kicker">第一阶段版本</p>
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

      <div id="update-strip" class="update-strip">
        <div class="update-status">
          <span class="dot"></span>
          <span>正在检查更新...</span>
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

