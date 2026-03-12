import {
  escapeHtml,
  renderSectionIntro,
  renderSelect,
  renderTextArea,
  renderTextInput
} from '../components/form-controls.js';
import {
  formatSchemaFetchedAt,
  formatSchemaSourceLabel,
  humanizeSchemaGroup
} from '../services/schema-driven-config.js';

function cloneDraft(draft = {}) {
  return {
    ...draft,
    schemaFields: (draft.schemaFields || []).map((field) => ({
      ...field,
      enumValues: Array.isArray(field.enumValues) ? [...field.enumValues] : field.enumValues
    }))
  };
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
    activeGroupKey: state?.activeGroupKey || '',
    searchQuery: state?.searchQuery || ''
  });
}

function normalizeFieldSearchQuery(value = '') {
  return String(value || '').trim().toLocaleLowerCase();
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
  visibleGroups,
  allGroups,
  tone,
  activeGroupKey,
  searchQuery,
  visibleFieldCount,
  totalFieldCount
}) {
  const hasSearch = Boolean(searchQuery);

  return `
    <section class="schema-toolbar schema-toolbar--${tone}" aria-label="Schema 字段导航">
      <div class="schema-toolbar__head">
        <div class="schema-toolbar__copy">
          <span class="preview-chip schema-toolbar__chip">Schema Outline</span>
          <strong>按分组快速跳转，配合折叠减少长页面滚动</strong>
          <p>当前展示 ${visibleFieldCount}/${totalFieldCount} 个字段、${visibleGroups.length}/${allGroups.length} 个分组；适合先定位分组，再逐段编辑。</p>
        </div>
        <div class="schema-toolbar__actions">
          <label class="schema-toolbar__search" aria-label="筛选 schema 字段">
            <span class="schema-toolbar__search-label">筛选字段</span>
            <span class="schema-toolbar__search-shell">
              <input
                class="text-input schema-toolbar__search-input"
                type="search"
                name="schema-toolbar-search"
                value="${escapeHtml(searchQuery)}"
                placeholder="按字段名 / 路径查找"
                spellcheck="false"
                autocomplete="off"
              />
              ${hasSearch ? '<button class="mini-button schema-toolbar__action schema-toolbar__clear" type="button" data-action="clear-schema-search">清空</button>' : ''}
            </span>
          </label>
          <button class="mini-button schema-toolbar__action" type="button" data-action="expand-schema-groups">展开全部</button>
          <button class="mini-button schema-toolbar__action" type="button" data-action="collapse-schema-groups">折叠全部</button>
        </div>
      </div>
      <nav class="schema-outline" aria-label="字段分组列表">
        ${visibleGroups.map((group, position) => {
    const stats = summarizeGroup(group);
    const anchorId = createGroupAnchorId(group.key, position);
    const isActive = group.key === activeGroupKey;

    return `
            <button
              class="schema-outline__button${isActive ? ' is-active' : ''}"
              type="button"
              data-action="jump-to-schema-group"
              data-group-key="${escapeHtml(group.key)}"
              data-group-id="${anchorId}"
              aria-controls="${anchorId}"
              aria-pressed="${isActive ? 'true' : 'false'}"
            >
              <span class="schema-outline__copy">
                <strong>${escapeHtml(group.title)}</strong>
                <small>${stats.officialCount > 0 ? `${stats.officialCount}/${stats.totalCount} 已匹配官方` : `${stats.totalCount} 个本地字段`}</small>
              </span>
              <span class="schema-outline__count">${stats.totalCount}</span>
            </button>
          `;
  }).join('')}
      </nav>
    </section>
  `;
}

function renderSchemaGroup(group, tone, position, isOpen) {
  const stats = summarizeGroup(group);
  const eyebrow = group.key === '__root__' ? 'Root' : group.key;
  const anchorId = createGroupAnchorId(group.key, position);
  const descriptionParts = [
    `当前分组包含 ${stats.totalCount} 个字段`,
    stats.officialCount > 0 ? `${stats.officialCount} 个已匹配官方 schema` : '当前按本地字段结构渲染',
    stats.structuredCount > 0 ? `${stats.structuredCount} 个 JSON 结构字段` : ''
  ].filter(Boolean);

  return `
    <details
      class="section-card section-card--${tone} schema-group"
      id="${anchorId}"
      data-group-key="${escapeHtml(group.key)}"
      ${isOpen ? 'open' : ''}
    >
      <summary class="schema-group__summary">
        <div class="schema-group__summary-main">
          <p class="schema-group__eyebrow">${escapeHtml(eyebrow)}</p>
          <div class="schema-group__summary-copy">
            <h3>${escapeHtml(group.title)}</h3>
            <p>${escapeHtml(descriptionParts.join(' · '))}</p>
          </div>
        </div>
        <div class="schema-group__summary-meta">
          <span class="schema-group__stat">${stats.totalCount} 个字段</span>
          <span class="schema-group__stat">${stats.officialCount} 个官方</span>
          <span class="schema-group__caret" aria-hidden="true">⌃</span>
        </div>
      </summary>
      <div class="schema-group__body">
        <div class="field-grid">
          ${group.fields.map(({ field, index }) => renderField(field, index)).join('')}
        </div>
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

function renderField(field, index) {
  const sourceLabel = field.isOfficial ? '官方 schema 字段' : '本地字段';
  const typeLabel = `字段类型：${field.type || 'string'}`;
  const pathLabel = field.actualPath ? `配置路径：${field.actualPath}` : '';
  const conflictLabel = field.isTypeConflict && field.schemaType
    ? `官方 schema 当前声明为 ${field.schemaType}，已保留本地 ${field.localType || field.type} 值以避免误写`
    : '';
  const description = [field.description, typeLabel, pathLabel, sourceLabel, conflictLabel].filter(Boolean).join(' · ');

  if (field.type === 'boolean') {
    return renderSelect({
      label: field.title,
      name: `schema-field:${index}`,
      value: field.inputValue,
      description,
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
      description: `${description} · 当前值为 null。`,
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
      description,
      options: [{ value: '', label: '未设置 / 删除该字段' }, ...field.enumValues.map((option) => ({ value: String(option), label: String(option) }))]
    });
  }

  if (field.type === 'array' || field.type === 'object') {
    return renderTextArea({
      label: field.title,
      name: `schema-field:${index}`,
      value: field.inputValue,
      description: `${description} · 使用 JSON 编辑。`,
      rows: 5,
      span: 'full',
      placeholder: field.type === 'array' ? '[]' : '{}'
    });
  }

  return renderTextInput({
    label: field.title,
    name: `schema-field:${index}`,
    value: field.inputValue,
    description,
    type: field.type === 'integer' || field.type === 'number' ? 'number' : 'text',
    placeholder: field.type === 'string'
      ? (field.defaultValue === undefined ? '留空将保留为空字符串' : `默认：${field.defaultValue}`)
      : (field.defaultValue === undefined ? '留空表示删除该字段' : `默认：${field.defaultValue}`)
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
    .sort((left, right) => left[0].localeCompare(right[0], 'en'))
    .map(([key, items]) => ({ key, title: humanizeSchemaGroup(key), fields: items }));
}

export function renderSchemaDrivenEditor(container, { entry, draft, onDraftChange, onRefreshOfficialSchema, isRefreshingOfficialSchema = false }) {
  let currentDraft = cloneDraft(draft);
  const groups = groupFields(currentDraft.schemaFields || []);
  const summary = currentDraft.officialSync || {};
  const tone = entry.assistant === 'claude' ? 'claude' : 'codex';
  const statusTone = summary.available && summary.source !== 'stale-cache' ? 'is-success' : 'is-muted';
  const officialCoverage = summary.totalLocalCount
    ? `${Math.round(((summary.matchedOfficialCount || 0) / summary.totalLocalCount) * 100)}%`
    : '0%';
  const storedUiState = readSchemaUiState(container, entry.id);
  const searchQuery = storedUiState?.searchQuery || '';
  const filteredView = filterGroups(groups, searchQuery);
  const visibleGroups = filteredView.groups;
  const openGroupKeySet = new Set(
    Array.isArray(storedUiState?.openKeys)
      ? storedUiState.openKeys
      : getDefaultOpenGroupKeys(groups)
  );
  const initialActiveGroupKey = visibleGroups.some((group) => group.key === storedUiState?.activeGroupKey)
    ? storedUiState.activeGroupKey
    : (visibleGroups[0]?.key || '');

  container.innerHTML = `
    <div class="panel-shell panel-shell--editor">
      <div class="panel-heading">
        <div>
          <p class="panel-kicker">Schema 驱动编辑</p>
          <h2>${escapeHtml(entry.label)}</h2>
          <p>${escapeHtml(entry.exists ? entry.description : '当前文件不存在。只有当本地配置里写入字段后，才会按 schema 自动生成可视化项。')}</p>
        </div>
        <span class="editor-badge editor-badge--${tone}">${entry.exists ? '本地字段映射' : '等待本地字段'}</span>
      </div>

      <section class="schema-workbench schema-workbench--${tone}">
        <div class="schema-workbench__header">
          <div class="schema-workbench__copy">
            <span class="preview-chip schema-workbench__chip">Schema Driven</span>
            <strong>只渲染本地已写字段，官方 schema 命中后自动增强</strong>
            <p>本地新增字段后重新扫描即可出现；可视化修改后会直接回写到当前配置文件。</p>
            <code class="schema-workbench__path">${escapeHtml(entry.path)}</code>
          </div>
          <div class="schema-metrics">
            <div class="schema-metric">
              <strong>${summary.totalLocalCount || 0}</strong>
              <span>本地字段</span>
            </div>
            <div class="schema-metric">
              <strong>${groups.length}</strong>
              <span>字段分组</span>
            </div>
            <div class="schema-metric">
              <strong>${officialCoverage}</strong>
              <span>官方覆盖</span>
            </div>
          </div>
        </div>
      </section>

      <section class="section-card section-card--${tone}">
        ${renderSectionIntro({
    eyebrow: 'Schema Sync',
    title: '本地配置字段映射',
    description: summary.available
      ? '只展示你本地配置里已经写入的字段；若官方 schema 更新并能识别这些路径，界面会自动使用最新元数据。'
      : '当前未拿到官方 schema，将按本地字段结构进行推断映射。后续刷新后会自动补齐官方元数据。',
    accent: tone
  })}
        <div class="stack-actions">
          <span class="status-pill ${statusTone}">${escapeHtml(formatSchemaSourceLabel(summary))}</span>
          ${summary.fetchedAt ? `<span class="status-pill is-muted">同步时间 ${escapeHtml(formatSchemaFetchedAt(summary.fetchedAt))}</span>` : ''}
          ${onRefreshOfficialSchema ? `<button class="secondary-button${isRefreshingOfficialSchema ? ' is-loading' : ''}" type="button" data-action="refresh-official-schema" ${isRefreshingOfficialSchema ? 'disabled' : ''}>${isRefreshingOfficialSchema ? '刷新中' : '刷新官方参数'}</button>` : ''}
        </div>
        ${renderSchemaSyncNote(summary)}
        <div class="schema-summary">
          <div class="schema-stat">
            <strong>${summary.totalLocalCount || 0}</strong>
            <span>本地字段总数</span>
          </div>
          <div class="schema-stat">
            <strong>${summary.matchedOfficialCount || 0}</strong>
            <span>官方已识别</span>
          </div>
          <div class="schema-stat">
            <strong>${summary.localOnlyCount || 0}</strong>
            <span>仅本地字段</span>
          </div>
        </div>
      </section>

      ${groups.length > 0 ? renderSchemaToolbar({
    visibleGroups,
    allGroups: groups,
    tone,
    activeGroupKey: initialActiveGroupKey,
    searchQuery,
    visibleFieldCount: filteredView.visibleFieldCount,
    totalFieldCount: filteredView.totalFieldCount
  }) : ''}

      ${visibleGroups.length > 0 ? visibleGroups.map((group, position) => renderSchemaGroup(
    group,
    tone,
    position,
    openGroupKeySet.has(group.key)
  )).join('') : `
        <section class="section-card section-card--${tone}">
          ${searchQuery ? renderSectionIntro({
    eyebrow: 'No Match',
    title: '没有命中当前筛选条件',
    description: '可以换一个关键字，或点击清空筛选后继续浏览全部本地字段。',
    accent: tone
  }) : renderSectionIntro({
    eyebrow: 'Empty',
    title: '当前没有可映射字段',
    description: '本地配置文件里还没有已写入字段；你手动在本地 config 增加字段后，重新扫描即可自动生成可视化编辑项。',
    accent: tone
  })}
        </section>
      `}
    </div>
  `;

  const panelShell = container.querySelector('.panel-shell--editor');
  const toolbar = container.querySelector('.schema-toolbar');
  const groupElements = [...container.querySelectorAll('.schema-group')];
  const outlineButtons = [...container.querySelectorAll('.schema-outline__button')];
  let scrollSyncFrame = 0;
  let currentUiState = {
    openKeys: groupElements
      .filter((groupElement) => groupElement.open)
      .map((groupElement) => groupElement.getAttribute('data-group-key'))
      .filter(Boolean),
    activeGroupKey: initialActiveGroupKey,
    searchQuery
  };

  const persistUiState = () => {
    writeSchemaUiState(container, entry.id, currentUiState);
  };

  const syncOutlineState = () => {
    const activeGroupKey = resolveActiveGroupKey(panelShell, toolbar, groupElements) || currentUiState.activeGroupKey;

    if (activeGroupKey) {
      currentUiState = {
        ...currentUiState,
        activeGroupKey
      };
    }

    outlineButtons.forEach((button) => {
      const isActive = button.getAttribute('data-group-key') === currentUiState.activeGroupKey;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    persistUiState();
  };

  const syncOpenGroups = () => {
    currentUiState = {
      ...currentUiState,
      openKeys: groupElements
        .filter((groupElement) => groupElement.open)
        .map((groupElement) => groupElement.getAttribute('data-group-key'))
        .filter(Boolean)
    };
    persistUiState();
  };

  groupElements.forEach((groupElement) => {
    groupElement.addEventListener('toggle', () => {
      syncOpenGroups();
      syncOutlineState();
    });
  });

  if (panelShell && groupElements.length > 0) {
    panelShell.addEventListener('scroll', () => {
      if (scrollSyncFrame) {
        window.cancelAnimationFrame(scrollSyncFrame);
      }

      scrollSyncFrame = window.requestAnimationFrame(() => {
        syncOutlineState();
      });
    }, { passive: true });
  }

  syncOutlineState();

  container.oninput = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) {
      return;
    }

    if (target.name === 'schema-toolbar-search') {
      const selectionStart = typeof target.selectionStart === 'number' ? target.selectionStart : null;
      const selectionEnd = typeof target.selectionEnd === 'number' ? target.selectionEnd : null;
      currentUiState = {
        ...currentUiState,
        searchQuery: target.value
      };
      persistUiState();
      renderSchemaDrivenEditor(container, {
        entry,
        draft: currentDraft,
        onDraftChange,
        onRefreshOfficialSchema,
        isRefreshingOfficialSchema
      });
      const nextSearchInput = container.querySelector('[name="schema-toolbar-search"]');
      if (nextSearchInput instanceof HTMLInputElement) {
        nextSearchInput.focus({ preventScroll: true });
        if (selectionStart !== null && selectionEnd !== null) {
          nextSearchInput.setSelectionRange(selectionStart, selectionEnd);
        }
      }
      return;
    }

    if (!target.name.startsWith('schema-field:')) {
      return;
    }

    const index = Number(target.name.split(':')[1]);
    currentDraft = {
      ...currentDraft,
      schemaFields: currentDraft.schemaFields.map((field, fieldIndex) => (
        fieldIndex === index
          ? { ...field, inputValue: target.value }
          : field
      ))
    };
    onDraftChange(currentDraft);
  };

  container.onclick = (event) => {
    if (!(event.target instanceof Element)) {
      return;
    }

    const button = event.target.closest('[data-action]');
    if (!button) {
      return;
    }

    const action = button.getAttribute('data-action');

    if (action === 'refresh-official-schema') {
      onRefreshOfficialSchema?.();
      return;
    }

    if (action === 'clear-schema-search') {
      currentUiState = {
        ...currentUiState,
        searchQuery: ''
      };
      persistUiState();
      renderSchemaDrivenEditor(container, {
        entry,
        draft: currentDraft,
        onDraftChange,
        onRefreshOfficialSchema,
        isRefreshingOfficialSchema
      });
      const nextSearchInput = container.querySelector('[name="schema-toolbar-search"]');
      if (nextSearchInput instanceof HTMLInputElement) {
        nextSearchInput.focus({ preventScroll: true });
      }
      return;
    }

    if (action === 'expand-schema-groups') {
      groupElements.forEach((groupElement) => {
        groupElement.open = true;
      });
      syncOpenGroups();
      syncOutlineState();
      return;
    }

    if (action === 'collapse-schema-groups') {
      groupElements.forEach((groupElement) => {
        groupElement.open = false;
      });
      syncOpenGroups();
      syncOutlineState();
      return;
    }

    if (action === 'jump-to-schema-group') {
      const groupId = button.getAttribute('data-group-id');
      const groupKey = button.getAttribute('data-group-key') || '';
      const targetGroup = groupId ? container.querySelector(`#${groupId}`) : null;

      if (!(targetGroup instanceof HTMLDetailsElement)) {
        return;
      }

      targetGroup.open = true;
      currentUiState = {
        ...currentUiState,
        activeGroupKey: groupKey
      };
      syncOpenGroups();
      syncOutlineState();
      targetGroup.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };
}
