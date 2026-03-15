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
  const helperCopy = searchQuery
    ? `正在全局搜索字段，当前命中 ${visibleFieldCount} 项。`
    : activeTab === 'quick'
      ? '优先显示高频配置项，适合快速修改。'
      : `当前聚焦 ${activeTabMeta?.label || '当前分类'}，减少无关干扰。`;

  return `
    <header class="editor-toolbar editor-toolbar--${tone}" role="banner">
      <div class="editor-toolbar__brand">
        <div class="editor-toolbar__brand-main">
          <p class="editor-toolbar__kicker">${assistantTitle}</p>
          <div class="editor-toolbar__title-row">
            <h2>${escapeHtml(entry.navTitle || entry.label)}</h2>
          </div>
          <p class="editor-toolbar__summary">${escapeHtml(helperCopy)}</p>
          <div class="editor-toolbar__meta">
            <span class="editor-badge editor-badge--${tone}">${entry.exists ? '当前对象' : '待创建'}</span>
            <span class="status-pill ${statusTone}">${escapeHtml(formatSchemaSourceLabel(summary))}</span>
            ${activeTabMeta ? `<span class="status-pill is-muted">${escapeHtml(activeTabMeta.label)}</span>` : ''}
            ${summary.fetchedAt ? `<span class="editor-toolbar__meta-note">同步 ${escapeHtml(formatSchemaFetchedAt(summary.fetchedAt))}</span>` : ''}
          </div>
        </div>
      </div>

      <div class="editor-toolbar__search-panel">
        <label class="editor-toolbar__search-label" for="schema-toolbar-search-input">搜索字段</label>
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
        ${onRefreshOfficialSchema ? `<button class="secondary-button${isRefreshingOfficialSchema ? ' is-loading' : ''}" type="button" data-action="refresh-official-schema" ${isRefreshingOfficialSchema ? 'disabled' : ''} aria-label="刷新官方 Schema">${isRefreshingOfficialSchema ? '刷新中…' : '刷新 Schema'}</button>` : ''}
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
          <p class="quick-panel__eyebrow">常用参数</p>
          <h3>先改最常用的几项</h3>
          <p>把高频项留在第一屏。需要深入时，再切到下面的分类页签。</p>
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
                ${section.items.map(({ field, index }) => renderField(field, index)).join('')}
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
  const leafTitles = [...new Set(
    fields
      .map(({ field }) => String(field?.title || field?.actualPath || '').trim())
      .filter(Boolean)
  )];

  if (leafTitles.length === 0) {
    return '同一对象的字段已经收在一起，改起来不容易串组。';
  }

  return `包含 ${leafTitles.slice(0, 3).join(' / ')}${leafTitles.length > 3 ? ' 等字段' : ''}`;
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

function renderGroupOverview(stats, layout, tone = 'codex') {
  const overviewItems = [
    { label: '字段', value: `${stats.totalCount} 项` },
    layout.shouldNest ? { label: '子组', value: `${layout.nestedGroups.length} 组` } : null,
    stats.officialCount > 0 ? { label: '官方', value: `${stats.officialCount} 项` } : null,
    stats.localCount > 0 ? { label: '本地', value: `${stats.localCount} 项` } : null,
    stats.structuredCount > 0 ? { label: '结构', value: `${stats.structuredCount} 项` } : null
  ].filter(Boolean);

  return `
    <div class="group-card__overview group-card__overview--${tone}">
      ${overviewItems.map((item) => `
        <div class="group-card__overview-item">
          <strong class="group-card__overview-value">${escapeHtml(item.value)}</strong>
          <span class="group-card__overview-label">${escapeHtml(item.label)}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function renderNestedCollection(collection, tone = 'codex', variant = 'nested') {
  return `
    <section class="group-cluster group-cluster--${tone} group-cluster--${variant}">
      <div class="group-cluster__header">
        <div class="group-cluster__copy">
          <p class="group-cluster__eyebrow">${escapeHtml(collection.eyebrow)}</p>
          <h4>${escapeHtml(collection.title)}</h4>
          <p>${escapeHtml(collection.hint)}</p>
        </div>
        <div class="group-cluster__meta">
          ${collection.pathLabel ? `<code class="group-cluster__path">${escapeHtml(collection.pathLabel)}</code>` : ''}
          <span class="group-cluster__count">${collection.fields.length} 项</span>
        </div>
      </div>
      <div class="group-cluster__fields">
        ${collection.fields.map(({ field, index }) => renderField(field, index)).join('')}
      </div>
    </section>
  `;
}

function renderSchemaGroup(group, tone, position, isOpen) {
  const stats = summarizeGroup(group);
  const layout = createGroupFieldLayout(group);
  const anchorId = createGroupAnchorId(group.key, position);
  const hint = layout.shouldNest
    ? `已按${layout.nestedCollectionLabel}拆开，展开后更容易确认每一组字段。`
    : stats.officialCount > 0
      ? `${stats.officialCount} 项带官方说明`
      : stats.structuredCount > 0
        ? `含 ${stats.structuredCount} 项结构字段`
        : '这一组可以直接改值';

  return `
    <details
      class="group-card group-card--${tone} ${layout.shouldNest ? 'group-card--clustered' : ''}"
      id="${anchorId}"
      data-group-key="${escapeHtml(group.key)}"
      ${isOpen ? 'open' : ''}
    >
      <summary class="group-card__header">
        <div class="group-card__header-copy">
          <h3>${escapeHtml(group.title)}</h3>
          <p>${escapeHtml(hint)}</p>
        </div>
        <span class="group-card__meta">
          ${layout.shouldNest ? `<span class="group-card__cluster-count">${layout.nestedGroups.length} 组</span>` : ''}
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
    hint: '这些字段直接挂在当前分组下，不属于某个具体子对象。',
    pathLabel: group.key === '__root__' ? '' : group.key,
    fields: layout.directFields
  }, tone, 'direct') : ''}
          <div class="group-card__clusters">
            ${layout.nestedGroups.map((nestedGroup) => renderNestedCollection({
    ...nestedGroup,
    eyebrow: layout.nestedCollectionLabel
  }, tone, 'nested')).join('')}
          </div>
        ` : `
          <div class="group-card__fields">
            ${group.fields.map(({ field, index }) => renderField(field, index)).join('')}
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

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trimEnd()}…`;
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

function getFieldMetaPresentation(field = {}) {
  const tone = getFieldPrimaryTone(field);
  const badges = [];

  if (tone === 'danger') {
    badges.push(renderFieldBadge('高风险', 'danger'));
  } else if (tone === 'safety') {
    badges.push(renderFieldBadge('安全', 'safety'));
  } else if (tone === 'network') {
    badges.push(renderFieldBadge('联网', 'network'));
  } else if (tone === 'automation') {
    badges.push(renderFieldBadge('自动化', 'automation'));
  } else if (tone === 'runtime') {
    badges.push(renderFieldBadge('环境', 'runtime'));
  } else if (tone === 'core') {
    badges.push(renderFieldBadge('核心', 'core'));
  }

  if (!field.isOfficial) {
    badges.push(renderFieldBadge('自定义', 'custom'));
  } else {
    badges.push(renderFieldBadge('官方', 'official'));
  }

  if (field.type === 'array' || field.type === 'object') {
    badges.push(renderFieldBadge('结构', 'structured'));
  }

  const pathChip = field.actualPath
    ? `<span class="field-path-chip">${escapeHtml(field.actualPath)}</span>`
    : '';
  const noteCopy = getFieldNoteCopy(field);
  const detailsHtml = `
    <span class="field-detail-line">
      ${pathChip}
    </span>
    ${noteCopy ? `<span class="field-note-line field-note-line--${tone}">${escapeHtml(noteCopy)}</span>` : ''}
  `;

  return {
    tone,
    labelMeta: `<span class="field-label-meta">${badges.join('')}</span>`,
    description: getFieldSummaryCopy(field),
    detailsHtml
  };
}

function renderField(field, index) {
  const meta = getFieldMetaPresentation(field);
  const fieldAttributes = { class: `schema-field-card schema-field-card--${meta.tone}` };

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
  const quickSuggestionFields = (currentDraft.starterSuggestions || [])
    .filter((field) => !quickFieldItems.some((item) => item.field.actualPath === field.actualPath))
    .slice(0, 6);
  const defaultOpenKeys = getDefaultOpenGroupKeys(baseGroups);
  const openGroupKeySet = new Set(
    Array.isArray(storedUiState?.openKeys) && storedUiState.openKeys.length > 0
      ? storedUiState.openKeys
      : defaultOpenKeys
  );
  const initialActiveGroupKey = visibleGroups[0]?.key || '';

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
        ${searchQuery ? `
          <div class="search-results-banner" role="status" aria-live="polite">
            <strong>搜索结果</strong>
            <span>已在全部分类中匹配 “${escapeHtml(searchQuery)}”。</span>
          </div>
        ` : renderCategoryBanner({ activeTab, tabs, visibleGroups, tone })}

        ${!searchQuery && activeTab === 'quick' ? renderSchemaQuickPanel({
    quickSections,
    suggestionFields: quickSuggestionFields,
    groups,
    tone
  }) : visibleGroups.length > 0 ? `
          <div class="field-grid-v2">
            ${visibleGroups.map((group, position) => renderSchemaGroup(
    group,
    tone,
    position,
    openGroupKeySet.has(group.key)
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
        `}
      </main>

      <details class="editor-footer">
        <summary>高级信息</summary>
        <div class="editor-footer__content">
          <div class="editor-footer__meta">
            <span class="status-pill ${statusTone}">${escapeHtml(formatSchemaSourceLabel(summary))}</span>
            ${summary.fetchedAt ? `<span class="status-pill is-muted">${escapeHtml(formatSchemaFetchedAt(summary.fetchedAt))}</span>` : ''}
          </div>
          ${renderSchemaSyncNote(summary)}
          <code class="schema-workbench__path">${escapeHtml(entry.compactPath || entry.path)}</code>
          ${entry.creationHint || entry.statusHint || entry.description ? `<p class="editor-footer__hint">${escapeHtml(entry.creationHint || entry.statusHint || entry.description || '')}</p>` : ''}
          <p class="editor-footer__hint">当前已有 ${currentDraft.schemaFields?.length || 0} 个字段，其中 ${summary.matchedOfficialCount || 0} 个能匹配官方说明。</p>
        </div>
      </details>

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
  const groupElements = [...container.querySelectorAll('details.group-card')];
  let searchInputTimer = 0;
  let isSearchComposing = false;
  let currentUiState = {
    openKeys: groupElements.length > 0
      ? groupElements
        .filter((groupElement) => groupElement.open)
        .map((groupElement) => groupElement.getAttribute('data-group-key'))
        .filter(Boolean)
      : defaultOpenKeys,
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
      openKeys: groupElements
        .filter((groupElement) => groupElement.open)
        .map((groupElement) => groupElement.getAttribute('data-group-key'))
        .filter(Boolean)
    };
    persistUiState();
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
      rerenderEditor({ focusFieldPath: normalizedPath });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  };

  groupElements.forEach((groupElement) => {
    groupElement.addEventListener('toggle', () => {
      syncOpenGroups();
    });
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
        activeTab: nextTabId
      };
      persistUiState();
      rerenderEditor();
      return;
    }

    if (action === 'open-add-field-modal') {
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
      if (modal && typeof modal.close === 'function') {
        modal.close();
      } else if (modal) {
        modal.removeAttribute('open');
        modal.style.display = 'none';
      }
      return;
    }
  };
}
