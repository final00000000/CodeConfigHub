import { escapeHtml } from '../components/form-controls.js';

const LINE_SPLIT_REGEX = /\r\n|\n|\r/;
const CURSOR_TOKEN = '{{cursor}}';

export function createTextDraft(content = '') {
  return String(content ?? '');
}

export function serializeTextDraft(draft = '') {
  return {
    content: String(draft ?? ''),
    parsed: null
  };
}

function isMarkdownEntry(entry) {
  return entry.format === 'markdown';
}

function getEditorBadge(entry) {
  return entry.assistant === 'claude' ? 'editor-badge--claude' : 'editor-badge--codex';
}

function getEditorBadgeLabel(entry) {
  return isMarkdownEntry(entry) ? '单页编辑' : '文本编辑';
}

function getDocumentLabel(entry) {
  return isMarkdownEntry(entry) ? '规则文档内容' : '规则文件内容';
}

function createEditorFieldId(entry) {
  const normalized = String(entry.id || entry.label || 'rule-document')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `text-editor-${normalized || 'document'}`;
}

function normalizeText(value = '') {
  return String(value ?? '').replace(/\r\n|\r/g, '\n');
}

function getTextMetrics(value = '', { markdown = false } = {}) {
  const text = normalizeText(value);
  const trimmed = text.trim();

  if (!trimmed) {
    return {
      lineCount: 0,
      charCount: 0,
      headingCount: 0
    };
  }

  const lines = text.split(LINE_SPLIT_REGEX);

  return {
    lineCount: lines.length,
    charCount: text.length,
    headingCount: markdown ? lines.filter((line) => /^\s*#{1,6}\s+/.test(line)).length : 0
  };
}

function renderEditorStatus(entry, value = '') {
  const markdown = isMarkdownEntry(entry);
  const metrics = getTextMetrics(value, { markdown });
  const items = [
    { label: markdown ? 'Markdown 文档' : '纯文本规则', tone: 'is-muted' },
    {
      label: markdown && metrics.headingCount > 0
        ? `${metrics.headingCount} 个标题`
        : (metrics.lineCount > 0 ? `${metrics.lineCount} 行` : '尚未开始'),
      tone: 'is-muted'
    },
    { label: entry.exists ? '当前文件已载入' : '首次保存时创建', tone: entry.exists ? 'is-muted' : 'is-success' }
  ];

  return items
    .map(({ label, tone }) => `<span class="status-pill ${tone}">${escapeHtml(label)}</span>`)
    .join('');
}


function getEditorFieldDescription(entry) {
  if (isMarkdownEntry(entry)) {
    return '直接编辑当前规则文档，支持标题、列表、引用和代码块；如需确认最终写回内容，再打开当前文件预览。';
  }

  return '直接编辑当前规则内容；保存时会按原文件换行风格写回。';
}

function getPlaceholder(entry) {
  if (isMarkdownEntry(entry)) {
    return '# 任务目标\n\n写清楚这份规则要解决什么问题';
  }

  return '任务目标：\n- 写清楚这份规则希望助手优先完成什么';
}

function getStarterTemplate(entry) {
  if (isMarkdownEntry(entry)) {
    return `# 任务目标
${CURSOR_TOKEN}

## 必须遵守
- 

## 输出方式
- 先给结论，再给关键步骤。

## 禁止事项
- 不要编造不存在的信息。
`;
  }

  return `任务目标：
${CURSOR_TOKEN}

必须遵守：
- 

输出方式：
- 先给结论，再给关键步骤。

禁止事项：
- 不要编造不存在的信息。
`;
}

function getQuickOutline(entry) {
  if (isMarkdownEntry(entry)) {
    return `## 背景
${CURSOR_TOKEN}

## 必做
- 

## 可选
- 

## 禁止
- 
`;
  }

  return `背景：
${CURSOR_TOKEN}

必做：
- 

可选：
- 

禁止：
- 
`;
}

function renderFirstUseGuidance(entry, draft = '') {
  const isEmpty = !normalizeText(draft).trim();
  const title = !entry.exists
    ? '当前文件还不存在，可以先从一个模板开始'
    : '先用一个简单结构开始';
  const description = isMarkdownEntry(entry)
    ? '推荐顺序：先写任务目标，再补必须遵守、输出方式和禁止事项。'
    : '推荐顺序：先写任务目标，再用分段或一行一个要点补充规则。';
  const followUp = isMarkdownEntry(entry)
    ? '不确定怎么组织内容时，可先插入模板，再改成项目自己的规则文档。'
    : '不确定从哪开始时，可先插入模板，再改成更贴近项目的规则内容。';

  return `
    <div class="readonly-note" data-first-use-guidance ${isEmpty ? '' : 'hidden'}>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(description)}</p>
      <p>${escapeHtml(followUp)}</p>
      <div class="preview-tools">
        <button class="secondary-button" type="button" data-action="insert-starter-template">插入起步模板</button>
        <button class="mini-button" type="button" data-action="insert-quick-outline">插入章节骨架</button>
      </div>
    </div>
  `;
}

function resolveSnippet(rawSnippet = '') {
  const snippet = String(rawSnippet ?? '');
  const cursorOffset = snippet.indexOf(CURSOR_TOKEN);

  return {
    text: snippet.replace(CURSOR_TOKEN, ''),
    cursorOffset: cursorOffset >= 0 ? cursorOffset : snippet.length
  };
}

function insertSnippet(textarea, rawSnippet) {
  const currentValue = textarea.value;
  const selectionStart = typeof textarea.selectionStart === 'number' ? textarea.selectionStart : currentValue.length;
  const selectionEnd = typeof textarea.selectionEnd === 'number' ? textarea.selectionEnd : selectionStart;
  const prefix = currentValue.slice(0, selectionStart);
  const suffix = currentValue.slice(selectionEnd);
  const { text, cursorOffset } = resolveSnippet(rawSnippet);
  const leadingGap = prefix && !/\n\s*$/.test(prefix) ? '\n\n' : '';
  const trailingGap = suffix && !/^\s*\n/.test(suffix) ? '\n\n' : '';
  const insertion = `${leadingGap}${text}${trailingGap}`;
  const nextValue = `${prefix}${insertion}${suffix}`;
  const caretIndex = prefix.length + leadingGap.length + cursorOffset;

  return {
    nextValue,
    caretIndex
  };
}

export function renderTextEditor(container, { entry, draft, onDraftChange }) {
  const badgeClass = getEditorBadge(entry);
  const isMarkdown = isMarkdownEntry(entry);
  const textareaId = createEditorFieldId(entry);

  container.innerHTML = `
    <div class="panel-shell panel-shell--editor panel-shell--text ${isMarkdown ? 'panel-shell--editor-markdown' : ''}">
      <div class="editor-compact-header editor-compact-header--stacked">
        <div class="editor-compact-header__main">
          <div class="editor-compact-header__title-row">
            <h2>${escapeHtml(entry.navTitle || entry.label)}</h2>
            <span class="editor-badge ${badgeClass}">${escapeHtml(getEditorBadgeLabel(entry))}</span>
          </div>
          <p class="editor-compact-header__copy">${escapeHtml(getEditorFieldDescription(entry))}</p>
        </div>
        <div class="stack-actions" data-editor-status>
          ${renderEditorStatus(entry, draft)}
        </div>
      </div>

      ${renderFirstUseGuidance(entry, draft)}

      <section class="text-editor-surface" aria-label="${escapeHtml(getDocumentLabel(entry))}">
        <div class="text-editor-surface__header">
          <div>
            <label class="field-label" for="${escapeHtml(textareaId)}">${escapeHtml(getDocumentLabel(entry))}</label>
            <p class="text-editor-surface__hint">内容会保留原有换行风格；如果想确认最终写回结果，再打开预览。</p>
          </div>
        </div>
        <div class="text-editor-surface__body">
          <textarea
            class="text-area text-area--markdown text-editor-surface__input"
            id="${escapeHtml(textareaId)}"
            name="rule-document"
            rows="28"
            placeholder="${escapeHtml(getPlaceholder(entry))}"
            data-text-input
            spellcheck="false"
          >${escapeHtml(draft)}</textarea>
        </div>
      </section>
    </div>
  `;

  const textarea = container.querySelector('[data-text-input]');
  const statusContainer = container.querySelector('[data-editor-status]');
  const firstUseGuidance = container.querySelector('[data-first-use-guidance]');

  const syncEditorChrome = (value) => {
    if (statusContainer) {
      statusContainer.innerHTML = renderEditorStatus(entry, value);
    }

    if (firstUseGuidance) {
      firstUseGuidance.hidden = Boolean(normalizeText(value).trim());
    }
  };

  container.oninput = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLTextAreaElement) || target.name !== 'rule-document') {
      return;
    }

    syncEditorChrome(target.value);
    onDraftChange(target.value);
  };

  container.onclick = (event) => {
    if (!(event.target instanceof Element) || !(textarea instanceof HTMLTextAreaElement)) {
      return;
    }

    const button = event.target.closest('[data-action]');
    if (!button) {
      return;
    }

    const action = button.getAttribute('data-action');
    const snippet = action === 'insert-starter-template'
      ? getStarterTemplate(entry)
      : action === 'insert-quick-outline'
        ? getQuickOutline(entry)
        : '';

    if (!snippet) {
      return;
    }

    const { nextValue, caretIndex } = insertSnippet(textarea, snippet);
    textarea.value = nextValue;
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(caretIndex, caretIndex);
    syncEditorChrome(nextValue);
    onDraftChange(nextValue);
  };
}



