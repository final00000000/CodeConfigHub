import {
  escapeHtml,
  renderSelect,
  renderTextArea,
  renderTextInput
} from '../components/form-controls.js';
import {
  createSchemaDraftField,
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
      enumValues: Array.isArray(field.enumValues) ? [...field.enumValues] : field.enumValues
    })),
    availableSchemaFields: (draft.availableSchemaFields || []).map((field) => ({
      ...field,
      enumValues: Array.isArray(field.enumValues) ? [...field.enumValues] : field.enumValues
    })),
    starterSuggestions: (draft.starterSuggestions || []).map((field) => ({
      ...field,
      enumValues: Array.isArray(field.enumValues) ? [...field.enumValues] : field.enumValues
    }))
  };
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

const QUICK_SECTION_META = {
  execution: {
    label: '模型与执行',
    eyebrow: 'Core',
    description: '先处理模型、供应商、思考策略这些最常改的项。'
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
    activeGroupKey: state?.activeGroupKey || '',
    activeTab: state?.activeTab || 'quick',
    searchQuery: state?.searchQuery || '',
    manualFieldPath: normalizeDraftFieldPath(state?.manualFieldPath || ''),
    manualFieldType: state?.manualFieldType || 'string',
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
      label: '常用',
      count: quickFieldItems.length
    },
    {
      id: 'all',
      label: '全部',
      count: totalFieldCount
    },
    ...groups.map((group) => ({
      id: createSchemaTabId(group.key),
      label: group.title,
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

function renderSchemaQuickPanel({ quickSections = [], suggestionFields = [], groups = [], tone = 'codex' } = {}) {
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
                ${section.items.map(({ field, index }) => renderField(field, index, { compact: true })).join('')}
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

function getNestedCollectionLabel(groupKey = '') {
  const normalized = String(groupKey || '').toLowerCase();

  if (normalized.includes('mcp') && normalized.includes('server')) {
    return 'MCP 服务';
  }

  if (normalized.includes('server')) {
    return '服务组';
  }

  if (normalized.includes('profile')) {
    return 'Profile';
  }

  if (normalized.includes('provider')) {
    return 'Provider';
  }

  return '子分组';
}

function isNestedCollectionFriendlyGroup(groupKey = '') {
  const normalized = String(groupKey || '').toLowerCase();
  return ['server', 'provider', 'profile', 'mcp', 'agent', 'tool'].some((keyword) => normalized.includes(keyword));
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

function buildPreviewLabels(values = []) {
  return [...new Set(
    values
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  )];
}

function getFieldPreviewLabels(fields = []) {
  return buildPreviewLabels(
    fields.map(({ field }) => field?.title || field?.actualPath || '')
  );
}

function renderPreviewChips(labels = [], maxVisible = 3) {
  if (!Array.isArray(labels) || labels.length === 0) {
    return '';
  }

  const visibleLabels = labels.slice(0, maxVisible);
  const overflowCount = Math.max(0, labels.length - visibleLabels.length);

  return `
    <div class="preview-chip-row">
      ${visibleLabels.map((label) => `<span class="preview-chip">${escapeHtml(label)}</span>`).join('')}
      ${overflowCount > 0 ? `<span class="preview-chip preview-chip--overflow">+${overflowCount}</span>` : ''}
    </div>
  `;
}

function buildNestedCollectionPreview(fields = []) {
  return getFieldPreviewLabels(fields);
}

function buildGroupPreviewLabels(group, layout) {
  if (layout.shouldNest) {
    return buildPreviewLabels([
      ...(layout.directFields.length > 0 ? ['基础项'] : []),
      ...layout.nestedGroups.map((nestedGroup) => nestedGroup.title)
    ]);
  }

  return getFieldPreviewLabels(group.fields);
}

function summarizeCollectionFields(fields = []) {
  const list = Array.isArray(fields) ? fields : [];

  return {
    customCount: list.filter(({ field }) => !field?.isOfficial).length,
    structuredCount: list.filter(({ field }) => isStructuredField(field)).length
  };
}

function renderCollectionSummaryPills(summary = {}) {
  const items = [
    summary.customCount > 0 ? { label: `${summary.customCount} 自定义`, tone: 'custom' } : null,
    summary.structuredCount > 0 ? { label: `${summary.structuredCount} 结构`, tone: 'structured' } : null
  ].filter(Boolean);

  if (items.length === 0) {
    return '';
  }

  return `
    <div class="group-cluster__summary-pills">
      ${items.map((item) => `<span class="group-cluster__summary-pill group-cluster__summary-pill--${item.tone}">${escapeHtml(item.label)}</span>`).join('')}
    </div>
  `;
}

function renderNestedCollection(
  collection,
  tone = 'codex',
  variant = 'nested',
  isOpen = false,
  stateKey = '',
  { collapsible = true } = {}
) {
  const previewLabels = buildNestedCollectionPreview(collection.fields);
  const variantLabel = variant === 'direct' ? '基础块' : '分组块';
  const useCompactLayout = shouldUseCompactCollectionLayout(collection);
  const collectionSummary = summarizeCollectionFields(collection.fields);
  const headerHtml = `
    <div class="group-cluster__header">
      <div class="group-cluster__copy">
        <div class="group-cluster__eyebrow-row">
          <p class="group-cluster__eyebrow">${escapeHtml(collection.eyebrow)}</p>
          <span class="group-cluster__tag">${escapeHtml(variantLabel)}</span>
        </div>
        <h4>${escapeHtml(collection.title)}</h4>
        ${useCompactLayout ? `
          <div class="group-cluster__support">
            ${collection.pathLabel ? `
              <div class="group-cluster__support-row">
                <span class="group-cluster__support-label">前缀</span>
                <code class="group-cluster__path group-cluster__path--inline" title="${escapeHtml(collection.pathLabel)}">${escapeHtml(collection.pathLabel)}</code>
              </div>
            ` : ''}
            ${renderCollectionSummaryPills(collectionSummary)}
          </div>
        ` : `
          <p class="group-cluster__hint">${escapeHtml(collection.hint)}</p>
          ${renderPreviewChips(previewLabels, 3)}
        `}
      </div>
      <div class="group-cluster__meta">
        ${!useCompactLayout && collection.pathLabel ? `
          <div class="group-cluster__meta-panel">
            <span class="group-cluster__meta-label">字段前缀</span>
            <code class="group-cluster__path" title="${escapeHtml(collection.pathLabel)}">${escapeHtml(collection.pathLabel)}</code>
          </div>
        ` : ''}
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
      pathPrefix: collection.pathLabel || ''
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
    pathPrefix: collection.pathLabel || ''
  })}
        </div>
      </div>
    </details>
  `;
}

function renderFocusedSchemaGroup(group, tone = 'codex') {
  const stats = summarizeGroup(group);
  const layout = createGroupFieldLayout(group);
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
  }, tone, 'direct', true, '', { collapsible: false }) : ''}
          <div class="group-card__clusters">
            ${layout.nestedGroups.map((nestedGroup) => renderNestedCollection({
    ...nestedGroup,
    eyebrow: layout.nestedCollectionLabel
  }, tone, 'nested', true, '', { collapsible: false })).join('')}
          </div>
        ` : `
          <div class="group-card__fields">
            ${renderFieldList(group.fields, {
    pathPrefix: group.key === '__root__' ? '' : group.key
  })}
          </div>
        `}
      </div>
    </section>
  `;
}

function renderSchemaGroup(group, tone, position, isOpen, openClusterKeySet = new Set()) {
  const stats = summarizeGroup(group);
  const layout = createGroupFieldLayout(group);
  const anchorId = createGroupAnchorId(group.key, position);
  const previewLabels = buildGroupPreviewLabels(group, layout);
  const useDenseLayout = !layout.shouldNest && shouldUseDenseFieldLayout(group.fields);
  const hint = layout.shouldNest
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
          ${renderPreviewChips(previewLabels, 4)}
        </div>
        <span class="group-card__meta">
          ${layout.shouldNest ? `<span class="group-card__cluster-count">${layout.nestedGroups.length + (layout.directFields.length > 0 ? 1 : 0)} 块</span>` : ''}
          <span class="group-card__count">${stats.totalCount} 项</span>
          <span class="group-card__chevron" aria-hidden="true">⌄</span>
        </span>
      </summary>
      <div class="group-card__body">
        ${renderGroupOverview(stats, layout, tone)}
        ${layout.shouldNest ? `
          ${layout.directFields.length > 0 ? renderNestedCollection({
    eyebrow: '直接字段',
    title: '基础项',
    hint: '挂在当前分组下，单独看更清楚。',
    pathLabel: group.key === '__root__' ? '' : group.key,
    fields: layout.directFields
  }, tone, 'direct', openClusterKeySet.has(createClusterStateKey(group.key, '__direct__')), createClusterStateKey(group.key, '__direct__')) : ''}
          <div class="group-card__clusters">
            ${layout.nestedGroups.map((nestedGroup) => renderNestedCollection({
    ...nestedGroup,
    eyebrow: layout.nestedCollectionLabel
  }, tone, 'nested', openClusterKeySet.has(createClusterStateKey(group.key, nestedGroup.key)), createClusterStateKey(group.key, nestedGroup.key))).join('')}
          </div>
        ` : `
          <div class="group-card__fields">
            ${renderFieldList(group.fields, {
    pathPrefix: group.key === '__root__' ? '' : group.key
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

function getFieldSummaryCopy(field = {}) {
  const path = String(field.actualPath || '');

  if (path === 'model') {
    return '当前入口模型。';
  }

  if (path === 'model_provider') {
    return '模型走哪一个提供方。';
  }

  if (path === 'model_reasoning_effort') {
    return '默认思考深度。';
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

function getFieldMetaPresentation(field = {}, { compact = false, pathPrefix = '' } = {}) {
  const tone = getFieldPrimaryTone(field);
  const badges = [];
  const typeLabel = getFieldTypeLabel(field.type || field.schemaType || 'string');

  badges.push(renderFieldBadge(
    typeLabel,
    field.type === 'array' || field.type === 'object' ? 'structured' : 'official'
  ));

  if (!field.isOfficial) {
    badges.push(renderFieldBadge('自定义', 'custom'));
  }

  const pathLabel = getRelativeFieldPath(field.actualPath, pathPrefix);
  const shouldRenderPath = Boolean(pathLabel) && !shouldHideCompactFieldPath(pathLabel, field.title);
  const pathChip = shouldRenderPath
    ? `<code class="field-path-chip" title="${escapeHtml(field.actualPath)}">${escapeHtml(pathLabel)}</code>`
    : '';
  const noteCopy = getFieldNoteCopy(field);
  const showNote = shouldShowFieldNote(noteCopy, { compact });
  const detailsHtml = compact
    ? renderCompactFieldMeta({
      pathLabel: shouldRenderPath ? pathLabel : '',
      actualPath: field.actualPath,
      showNote,
      noteCopy,
      tone
    })
    : (pathChip || showNote
        ? `
          <span class="field-meta-stack">
            ${pathChip ? `<span class="field-detail-line field-detail-line--path">${pathChip}</span>` : ''}
            ${showNote ? `<span class="field-note-line field-note-line--${tone}">${escapeHtml(noteCopy)}</span>` : ''}
          </span>
        `
        : '');

  return {
    tone,
    labelMeta: badges.length > 0 ? `<span class="field-label-meta">${badges.join('')}</span>` : '',
    description: getFieldSummaryCopy(field),
    detailsHtml
  };
}

function isStructuredField(field = {}) {
  return field.type === 'array' || field.type === 'object';
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

function renderFieldList(fields = [], { compact = false, pathPrefix = '' } = {}) {
  if (!Array.isArray(fields) || fields.length === 0) {
    return '';
  }

  const useDenseLayout = shouldUseDenseFieldLayout(fields, { compact });

  return `
    <div class="schema-field-list ${compact ? 'schema-field-list--compact' : ''} ${useDenseLayout ? 'schema-field-list--dense' : ''}">
      ${fields.map(({ field, index }) => renderField(field, index, { compact, pathPrefix })).join('')}
    </div>
  `;
}

function renderField(field, index, { compact = false, pathPrefix = '' } = {}) {
  const meta = getFieldMetaPresentation(field, { compact, pathPrefix });
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
    return renderTextArea({
      label: field.title,
      name: `schema-field:${index}`,
      value: field.inputValue,
      description: meta.description ? `${meta.description} · 使用 JSON 编辑。` : '使用 JSON 编辑。',
      labelMeta: meta.labelMeta,
      detailsHtml: meta.detailsHtml,
      rows: 5,
      span: 'full',
      placeholder: field.type === 'array' ? '[]' : '{}',
      fieldAttributes
    });
  }

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
    .sort((left, right) => left[0].localeCompare(right[0], 'en'))
    .map(([key, items]) => ({ key, title: humanizeSchemaGroup(key), fields: items }));
}

export function renderSchemaDrivenEditor(container, { entry, draft, onDraftChange, onRefreshOfficialSchema, isRefreshingOfficialSchema = false }) {
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
  const quickFieldItems = getQuickFieldItems(currentDraft.schemaFields || []);
  const quickSections = buildQuickSections(quickFieldItems);
  const tabs = buildSchemaTabs(groups, quickFieldItems);
  const storedActiveTab = storedUiState?.activeTab || getDefaultSchemaTabId(tabs);
  const activeTab = tabs.some((tab) => tab.id === storedActiveTab)
    ? storedActiveTab
    : getDefaultSchemaTabId(tabs);
  const baseGroups = searchQuery ? groups : filterGroupsByTab(groups, activeTab);
  const filteredView = filterGroups(baseGroups, searchQuery);
  const visibleGroups = filteredView.groups;
  const shouldRenderCategoryBanner = !searchQuery
    && activeTab !== 'quick'
    && !(activeTab !== 'all' && visibleGroups.length === 1);
  const isFocusedGroupTab = !searchQuery
    && activeTab.startsWith('group:')
    && visibleGroups.length === 1;
  const quickSuggestionFields = (currentDraft.starterSuggestions || [])
    .filter((field) => !quickFieldItems.some((item) => item.field.actualPath === field.actualPath))
    .slice(0, 6);
  const defaultOpenKeys = normalizeAccordionGroupKeys(visibleGroups, getDefaultOpenGroupKeys(visibleGroups));
  const defaultOpenClusterKeys = normalizeAccordionClusterKeys(visibleGroups, getDefaultOpenClusterKeys(visibleGroups));
  const availableGroupKeys = new Set(visibleGroups.map((group) => group.key));
  const availableClusterKeys = new Set(getAvailableClusterStateKeys(visibleGroups));
  const storedOpenKeys = Array.isArray(storedUiState?.openKeys)
    ? storedUiState.openKeys.filter((key) => availableGroupKeys.has(key))
    : [];
  const storedOpenClusterKeys = Array.isArray(storedUiState?.openClusterKeys)
    ? storedUiState.openClusterKeys.filter((key) => availableClusterKeys.has(key))
    : [];
  const openGroupKeySet = new Set(
    storedOpenKeys.length > 0
      ? normalizeAccordionGroupKeys(visibleGroups, storedOpenKeys)
      : defaultOpenKeys
  );
  const openClusterKeySet = new Set(
    storedOpenClusterKeys.length > 0
      ? normalizeAccordionClusterKeys(visibleGroups, storedOpenClusterKeys)
      : defaultOpenClusterKeys
  );
  const initialActiveGroupKey = visibleGroups.some((group) => group.key === storedUiState?.activeGroupKey)
    ? storedUiState.activeGroupKey
    : (visibleGroups[0]?.key || '');
  const outlineHtml = (searchQuery || activeTab === 'all')
    ? renderGroupOutline({
      visibleGroups,
      activeGroupKey: initialActiveGroupKey,
      tone,
      searchQuery
    })
    : '';

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
        ${searchQuery
    ? renderSearchResultsBanner({
      searchQuery,
      visibleGroups,
      visibleFieldCount: filteredView.visibleFieldCount,
      totalFieldCount: filteredView.totalFieldCount,
      tone
    })
    : (shouldRenderCategoryBanner ? renderCategoryBanner({ activeTab, tabs, visibleGroups, tone }) : '')}

        ${renderSchemaStage({
    outlineHtml,
    contentHtml: !searchQuery && activeTab === 'quick' ? renderSchemaQuickPanel({
      quickSections,
      suggestionFields: quickSuggestionFields,
      groups,
      tone
    }) : isFocusedGroupTab ? renderFocusedSchemaGroup(visibleGroups[0], tone) : visibleGroups.length > 0 ? `
            <div class="field-grid-v2">
              ${visibleGroups.map((group, position) => renderSchemaGroup(
      group,
      tone,
      position,
      openGroupKeySet.has(group.key),
      openClusterKeySet
    )).join('')}
            </div>
          ` : `
            <div class="editor-empty-state">
              ${searchQuery ? `
                <p class="empty-state-title">没有命中当前筛选条件</p>
                <p class="empty-state-description">可以换一个关键字，或清空筛选后继续浏览当前字段。</p>
              ` : `
                <p class="empty-state-title">这一类里还没有字段</p>
                <p class="empty-state-description">可以先新建字段，或者切到别的分类继续查看。</p>
              `}
            </div>
          `
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
            <h3 id="add-field-modal-title">添加字段</h3>
            <button class="modal-close" type="button" data-action="close-add-field-modal" aria-label="关闭对话框">×</button>
          </header>
          <form class="modal-body">
            ${renderTextInput({
    label: '字段路径',
    name: 'schema-add-path',
    value: getManualFieldPath(currentDraft),
    placeholder: summary.available ? '例如 model' : '例如 env.NODE_ENV',
    datalist: (currentDraft.availableSchemaFields || []).slice(0, 80).map((field) => field.actualPath)
  })}
            ${renderSelect({
    label: '类型',
    name: 'schema-add-type',
    value: getManualFieldType(currentDraft),
    options: FIELD_TYPE_OPTIONS
  })}
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
  const toolbar = container.querySelector('.editor-toolbar');
  const scrollRoot = container.querySelector('#schema-view-panel');
  const groupElements = [...container.querySelectorAll('details.group-card')];
  const clusterElements = [...container.querySelectorAll('details.group-cluster')];
  let searchInputTimer = 0;
  let activeGroupFrame = 0;
  let isSearchComposing = false;
  let modalOpenTrigger = null;

  const closeModal = () => {
    if (!modal) return;
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
  };

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
  let currentUiState = {
    openKeys: groupElements.length > 0
      ? normalizeAccordionGroupKeys(visibleGroups, groupElements
        .filter((groupElement) => groupElement.open)
        .map((groupElement) => groupElement.getAttribute('data-group-key'))
        .filter(Boolean))
      : defaultOpenKeys,
    openClusterKeys: clusterElements.length > 0
      ? normalizeAccordionClusterKeys(visibleGroups, clusterElements
        .filter((clusterElement) => clusterElement.open)
        .map((clusterElement) => clusterElement.getAttribute('data-cluster-key'))
        .filter(Boolean))
      : defaultOpenClusterKeys,
    activeGroupKey: initialActiveGroupKey,
    activeTab,
    searchQuery,
    manualFieldPath: getManualFieldPath(currentDraft),
    manualFieldType: getManualFieldType(currentDraft),
    officialFieldPath: normalizeDraftFieldPath(currentDraft.officialFieldPath || '')
  };

  const persistUiState = () => {
    writeSchemaUiState(container, entry.id, currentUiState);
  };

  const syncOutlineActiveState = (groupKey = '') => {
    container.querySelectorAll('.group-outline-chip').forEach((chip) => {
      const isActive = chip.getAttribute('data-group-key') === groupKey;
      chip.classList.toggle('is-active', isActive);
      chip.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  };

  const focusSchemaField = (fieldPath) => {
    const fieldIndex = currentDraft.schemaFields.findIndex((field) => field.actualPath === fieldPath);
    if (fieldIndex === -1) {
      return;
    }

    const targetField = container.querySelector(`[name="schema-field:${fieldIndex}"]`);
    if (targetField instanceof HTMLElement) {
      targetField.focus({ preventScroll: true });
    }
  };

  const rerenderEditor = ({ preserveSearchFocus = false, focusFieldPath = '' } = {}) => {
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

    if (focusFieldPath) {
      window.requestAnimationFrame(() => {
        const fieldIndex = currentDraft.schemaFields.findIndex((field) => field.actualPath === focusFieldPath);
        const targetField = container.querySelector(`[name="schema-field:${fieldIndex}"]`);
        if (targetField instanceof HTMLElement) {
          targetField.focus({ preventScroll: true });
        }
      });
    }
  };

  const syncOpenGroups = () => {
    currentUiState = {
      ...currentUiState,
      openKeys: normalizeAccordionGroupKeys(visibleGroups, groupElements
        .filter((groupElement) => groupElement.open)
        .map((groupElement) => groupElement.getAttribute('data-group-key'))
        .filter(Boolean))
    };
    persistUiState();
  };

  const syncOpenClusters = () => {
    currentUiState = {
      ...currentUiState,
      openClusterKeys: normalizeAccordionClusterKeys(visibleGroups, clusterElements
        .filter((clusterElement) => clusterElement.open)
        .map((clusterElement) => clusterElement.getAttribute('data-cluster-key'))
        .filter(Boolean))
    };
    persistUiState();
  };

  const revealPreferredCluster = (groupElement) => {
    if (!(groupElement instanceof HTMLDetailsElement)) {
      return;
    }

    const clusterNodes = [...groupElement.querySelectorAll('details.group-cluster')];
    if (clusterNodes.length === 0 || clusterNodes.some((clusterNode) => clusterNode.open)) {
      return;
    }

    const groupKey = groupElement.getAttribute('data-group-key') || '';
    const preferredClusterKey = currentUiState.openClusterKeys.find((key) => key.startsWith(`${groupKey}::`));
    const nextCluster = clusterNodes.find((clusterNode) => (
      clusterNode.getAttribute('data-cluster-key') === preferredClusterKey
    )) || clusterNodes[0];

    if (nextCluster instanceof HTMLDetailsElement) {
      nextCluster.open = true;
    }
  };

  const openExclusiveGroup = (groupElement) => {
    if (!(groupElement instanceof HTMLDetailsElement)) {
      return;
    }

    groupElements.forEach((candidate) => {
      if (candidate !== groupElement && candidate.open) {
        candidate.open = false;
      }
    });

    if (!groupElement.open) {
      groupElement.open = true;
    }

    revealPreferredCluster(groupElement);
  };

  const syncActiveGroup = ({ persist = true } = {}) => {
    const nextActiveGroupKey = resolveActiveGroupKey(scrollRoot, toolbar, groupElements) || initialActiveGroupKey;
    if (!nextActiveGroupKey || nextActiveGroupKey === currentUiState.activeGroupKey) {
      syncOutlineActiveState(currentUiState.activeGroupKey);
      return;
    }

    currentUiState = {
      ...currentUiState,
      activeGroupKey: nextActiveGroupKey
    };
    syncOutlineActiveState(nextActiveGroupKey);
    if (persist) {
      persistUiState();
    }
  };

  const addSchemaField = (pathValue = '') => {
    const normalizedPath = normalizeDraftFieldPath(pathValue || currentUiState.manualFieldPath || currentUiState.officialFieldPath);
    if (!normalizedPath) {
      window.alert('请先输入字段路径。');
      return;
    }

    if ((currentDraft.schemaFields || []).some((field) => field.actualPath === normalizedPath)) {
      focusSchemaField(normalizedPath);
      return;
    }

    const matchedOfficialField = (currentDraft.availableSchemaFields || []).find((field) => field.actualPath === normalizedPath);

    try {
      const nextField = createSchemaDraftField({
        path: normalizedPath,
        type: matchedOfficialField?.type || currentUiState.manualFieldType || 'string',
        schemaEntry: matchedOfficialField || null
      });
      currentDraft = createNextDraftWithField(currentDraft, nextField);
      const nextGroups = groupFields(currentDraft.schemaFields || []);
      currentUiState = {
        ...currentUiState,
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
  };

  groupElements.forEach((groupElement) => {
    groupElement.addEventListener('toggle', () => {
      if (groupElement.open) {
        openExclusiveGroup(groupElement);
        currentUiState = {
          ...currentUiState,
          activeGroupKey: groupElement.getAttribute('data-group-key') || currentUiState.activeGroupKey
        };
        syncOutlineActiveState(currentUiState.activeGroupKey);
      }

      syncOpenGroups();
    });
  });

  clusterElements.forEach((clusterElement) => {
    clusterElement.addEventListener('toggle', () => {
      if (clusterElement.open) {
        const parentGroup = clusterElement.closest('details.group-card');
        if (parentGroup instanceof HTMLDetailsElement) {
          parentGroup.querySelectorAll('details.group-cluster').forEach((candidate) => {
            if (candidate !== clusterElement && candidate.open) {
              candidate.open = false;
            }
          });
        }
      }

      syncOpenClusters();
    });
  });

  const initiallyOpenGroup = groupElements.find((groupElement) => groupElement.open);
  if (initiallyOpenGroup) {
    openExclusiveGroup(initiallyOpenGroup);
    syncOpenGroups();
    syncOpenClusters();
  }

  if (scrollRoot) {
    scrollRoot.addEventListener('scroll', () => {
      if (activeGroupFrame) {
        window.cancelAnimationFrame(activeGroupFrame);
      }

      activeGroupFrame = window.requestAnimationFrame(() => {
        activeGroupFrame = 0;
        syncActiveGroup();
      });
    }, { passive: true });
  }

  syncOutlineActiveState(currentUiState.activeGroupKey);
  window.requestAnimationFrame(() => {
    syncActiveGroup({ persist: false });
  });
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
      currentUiState = {
        ...currentUiState,
        manualFieldPath: normalizeDraftFieldPath(target.value),
        officialFieldPath: normalizeDraftFieldPath(target.value)
      };
      persistUiState();
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

  container.onkeydown = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.name !== 'schema-add-path') {
      return;
    }

    if (event.key === 'Enter' && !event.isComposing) {
      event.preventDefault();
      addSchemaField(target.value);
    }
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

    if (action === 'add-schema-field') {
      addSchemaField();
      return;
    }

    if (action === 'add-schema-suggestion') {
      addSchemaField(button.getAttribute('data-field-path') || '');
      return;
    }

    if (action === 'clear-schema-search') {
      currentUiState = {
        ...currentUiState,
        searchQuery: ''
      };
      persistUiState();
      rerenderEditor({ preserveSearchFocus: true });
      return;
    }

    if (action === 'switch-schema-tab') {
      const nextTabId = button.getAttribute('data-tab-id') || 'quick';
      currentUiState = {
        ...currentUiState,
        activeTab: nextTabId,
        activeGroupKey: ''
      };
      persistUiState();
      rerenderEditor();
      return;
    }

    if (action === 'jump-schema-group') {
      const targetGroupKey = button.getAttribute('data-group-key') || '';
      const anchorId = button.getAttribute('data-group-anchor-id') || '';
      const groupElement = anchorId
        ? container.querySelector(`#${anchorId}`)
        : container.querySelector(`details.group-card[data-group-key="${targetGroupKey}"]`);

      if (groupElement instanceof HTMLDetailsElement) {
        openExclusiveGroup(groupElement);
        syncOpenGroups();
      }

      currentUiState = {
        ...currentUiState,
        activeGroupKey: targetGroupKey || currentUiState.activeGroupKey
      };
      syncOutlineActiveState(currentUiState.activeGroupKey);
      persistUiState();

      if (scrollRoot && groupElement instanceof HTMLElement) {
        const targetTop = Math.max(0, groupElement.offsetTop - 12);
        const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
        scrollRoot.scrollTo({ top: targetTop, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
      }
      return;
    }

    if (action === 'open-add-field-modal') {
      modalOpenTrigger = button instanceof HTMLElement ? button : null;
      if (modal && typeof modal.showModal === 'function') {
        modal.showModal();
        const firstInput = modal.querySelector('input[name="schema-add-path"]');
        if (firstInput) {
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
      return;
    }
  };
}
