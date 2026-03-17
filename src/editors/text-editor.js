import { escapeHtml } from '../components/form-controls.js';

const LINE_SPLIT_REGEX = /\r\n|\n|\r/;
const CURSOR_TOKEN = '{{cursor}}';
const MARKDOWN_VIEW_MODE_STORAGE_KEY = 'markdown-editor-view-mode';
const MARKDOWN_VIEW_MODES = new Set(['raw', 'preview', 'split']);
const MARKDOWN_VIEW_MODE_OPTIONS = [
  {
    value: 'raw',
    label: '原始',
    title: '直接编辑原始 Markdown 内容'
  },
  {
    value: 'preview',
    label: '预览',
    title: '只看渲染后的阅读效果'
  },
  {
    value: 'split',
    label: '共存',
    title: '左侧原始内容，右侧渲染预览'
  }
];

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
  return isMarkdownEntry(entry) ? 'Markdown 规则' : '文本编辑';
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
    return 'Markdown 规则支持原始编辑、渲染预览和双栏共存；结构长的时候不用反复切到右侧源码预览。';
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

function normalizeMarkdownViewMode(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  return MARKDOWN_VIEW_MODES.has(normalized) ? normalized : 'split';
}

function getStoredMarkdownViewMode() {
  try {
    return normalizeMarkdownViewMode(window.localStorage.getItem(MARKDOWN_VIEW_MODE_STORAGE_KEY) || 'split');
  } catch {
    return 'split';
  }
}

function setStoredMarkdownViewMode(value = 'split') {
  const normalized = normalizeMarkdownViewMode(value);

  try {
    window.localStorage.setItem(MARKDOWN_VIEW_MODE_STORAGE_KEY, normalized);
  } catch {
    // ignore storage errors in renderer-only preview state
  }

  return normalized;
}

function getScrollableDistance(element) {
  if (!(element instanceof HTMLElement)) {
    return 0;
  }

  return Math.max(0, element.scrollHeight - element.clientHeight);
}

function getScrollRatio(element) {
  const distance = getScrollableDistance(element);
  if (distance <= 0) {
    return 0;
  }

  return Math.min(1, Math.max(0, element.scrollTop / distance));
}

function setScrollRatio(element, ratio = 0) {
  if (!(element instanceof HTMLElement)) {
    return;
  }

  const distance = getScrollableDistance(element);
  if (distance <= 0) {
    element.scrollTop = 0;
    return;
  }

  element.scrollTop = Math.min(1, Math.max(0, ratio)) * distance;
}

function syncScrollByRatio(source, target) {
  if (!(source instanceof HTMLElement) || !(target instanceof HTMLElement)) {
    return;
  }

  setScrollRatio(target, getScrollRatio(source));
}

function renderMarkdownModeSwitch(viewMode = 'split') {
  return `
    <div class="markdown-mode-switch" role="tablist" aria-label="Markdown 编辑模式">
      ${MARKDOWN_VIEW_MODE_OPTIONS.map((option) => `
        <button
          class="markdown-mode-switch__button ${option.value === viewMode ? 'is-active' : ''}"
          type="button"
          role="tab"
          data-action="switch-markdown-view"
          data-view-mode="${escapeHtml(option.value)}"
          aria-selected="${option.value === viewMode ? 'true' : 'false'}"
          title="${escapeHtml(option.title)}"
        >${escapeHtml(option.label)}</button>
      `).join('')}
    </div>
  `;
}

function renderInlineMarkdown(value = '') {
  let html = escapeHtml(value);
  const protectedTokens = [];

  html = html.replace(/`([^`]+)`/g, (_, code) => {
    const token = `{{md-token-${protectedTokens.length}}}`;
    protectedTokens.push(`<code>${code}</code>`);
    return token;
  });

  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(^|[\s(\[>])\*([^*]+)\*(?=[$\s).,!?:;\]])/g, '$1<em>$2</em>');

  protectedTokens.forEach((tokenHtml, index) => {
    html = html.replace(`{{md-token-${index}}}`, tokenHtml);
  });

  return html;
}

function renderParagraphBlock(lines = []) {
  return lines.length > 0
    ? `<p>${lines.map((line) => renderInlineMarkdown(line)).join('<br />')}</p>`
    : '';
}

function renderListBlock(type = 'ul', items = []) {
  if (items.length === 0) {
    return '';
  }

  return `
    <${type}>
      ${items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join('')}
    </${type}>
  `;
}

function renderQuoteBlock(lines = []) {
  if (lines.length === 0) {
    return '';
  }

  return `
    <blockquote>
      ${lines.map((line) => `<p>${renderInlineMarkdown(line)}</p>`).join('')}
    </blockquote>
  `;
}

function renderCodeFenceBlock({ language = '', lines = [] } = {}) {
  const code = lines.join('\n');
  const label = language ? `<span class="markdown-preview__code-language">${escapeHtml(language)}</span>` : '';

  return `
    <div class="markdown-preview__code-block">
      ${label ? `<div class="markdown-preview__code-head">${label}</div>` : ''}
      <pre><code>${escapeHtml(code)}</code></pre>
    </div>
  `;
}

function renderMarkdownDocument(value = '') {
  const lines = normalizeText(value).split('\n');
  const blocks = [];
  let paragraphLines = [];
  let quoteLines = [];
  let listType = '';
  let listItems = [];
  let codeFence = null;

  const flushParagraph = () => {
    const html = renderParagraphBlock(paragraphLines);
    if (html) {
      blocks.push(html);
    }
    paragraphLines = [];
  };

  const flushQuote = () => {
    const html = renderQuoteBlock(quoteLines);
    if (html) {
      blocks.push(html);
    }
    quoteLines = [];
  };

  const flushList = () => {
    const html = renderListBlock(listType || 'ul', listItems);
    if (html) {
      blocks.push(html);
    }
    listType = '';
    listItems = [];
  };

  const flushAll = () => {
    flushParagraph();
    flushQuote();
    flushList();
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    const fenceMatch = line.match(/^\s*```\s*([^`]*)?$/);

    if (codeFence) {
      if (fenceMatch) {
        blocks.push(renderCodeFenceBlock(codeFence));
        codeFence = null;
      } else {
        codeFence.lines.push(line);
      }
      return;
    }

    if (fenceMatch) {
      flushAll();
      codeFence = {
        language: String(fenceMatch[1] || '').trim(),
        lines: []
      };
      return;
    }

    if (!trimmed) {
      flushAll();
      return;
    }

    const headingMatch = line.match(/^\s*(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushAll();
      const level = headingMatch[1].length;
      blocks.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`);
      return;
    }

    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushAll();
      blocks.push('<hr />');
      return;
    }

    const quoteMatch = line.match(/^\s*>\s?(.*)$/);
    if (quoteMatch) {
      flushParagraph();
      flushList();
      quoteLines.push(quoteMatch[1]);
      return;
    }

    const unorderedListMatch = line.match(/^\s*[-*+]\s+(.*)$/);
    if (unorderedListMatch) {
      flushParagraph();
      flushQuote();
      if (listType && listType !== 'ul') {
        flushList();
      }
      listType = 'ul';
      listItems.push(unorderedListMatch[1]);
      return;
    }

    const orderedListMatch = line.match(/^\s*\d+\.\s+(.*)$/);
    if (orderedListMatch) {
      flushParagraph();
      flushQuote();
      if (listType && listType !== 'ol') {
        flushList();
      }
      listType = 'ol';
      listItems.push(orderedListMatch[1]);
      return;
    }

    flushQuote();
    flushList();
    paragraphLines.push(trimmed);
  });

  flushAll();

  if (codeFence) {
    blocks.push(renderCodeFenceBlock(codeFence));
  }

  if (blocks.length === 0) {
    return `
      <div class="markdown-preview__empty">
        <h4>预览区暂时还是空的</h4>
        <p>开始写 Markdown 后，这里会即时显示标题、列表、引用和代码块的排版效果。</p>
      </div>
    `;
  }

  return `<div class="markdown-preview__document">${blocks.join('')}</div>`;
}

function renderTextEditorPathRow(entry) {
  const pathLabel = entry.compactPath || entry.path || '';
  if (!pathLabel) {
    return '';
  }

  return `
    <div class="text-editor-path-row">
      <span class="text-editor-path-row__label">文件</span>
      <code class="text-editor-path-row__value" title="${escapeHtml(entry.path || pathLabel)}">${escapeHtml(pathLabel)}</code>
    </div>
  `;
}

function renderMarkdownSurface(entry, draft, textareaId, viewMode) {
  return `
    <section class="text-editor-surface text-editor-surface--markdown" aria-label="${escapeHtml(getDocumentLabel(entry))}">
      <div class="text-editor-surface__header text-editor-surface__header--markdown">
        <div>
          <label class="field-label" for="${escapeHtml(textareaId)}">${escapeHtml(getDocumentLabel(entry))}</label>
          <p class="text-editor-surface__hint">支持原始 / 预览 / 共存三种模式，规则长时也不需要一直切右侧源码预览。</p>
          ${renderTextEditorPathRow(entry)}
        </div>
        <div class="markdown-mode-switch__cluster">
          <p class="markdown-mode-switch__label">显示方式</p>
          ${renderMarkdownModeSwitch(viewMode)}
        </div>
      </div>

      <div class="text-editor-panels text-editor-panels--${escapeHtml(viewMode)}" data-view-mode="${escapeHtml(viewMode)}">
        ${viewMode !== 'preview' ? `
          <section class="text-editor-pane text-editor-pane--input" aria-label="Markdown 原始内容">
            <div class="text-editor-pane__header">
              <div>
                <p class="text-editor-pane__eyebrow">原始文档</p>
                <h3>直接编辑</h3>
              </div>
              <span class="text-editor-pane__meta">保存时按原文件写回</span>
            </div>
            <div class="text-editor-pane__body text-editor-pane__body--input">
              <textarea
                class="text-area text-area--markdown text-editor-surface__input text-editor-pane__input"
                id="${escapeHtml(textareaId)}"
                name="rule-document"
                rows="28"
                placeholder="${escapeHtml(getPlaceholder(entry))}"
                data-text-input
                data-markdown-input
                spellcheck="false"
              >${escapeHtml(draft)}</textarea>
            </div>
          </section>
        ` : ''}

        ${viewMode !== 'raw' ? `
          <section class="text-editor-pane text-editor-pane--preview" aria-label="Markdown 渲染预览">
            <div class="text-editor-pane__header">
              <div>
                <p class="text-editor-pane__eyebrow">渲染结果</p>
                <h3>阅读效果</h3>
              </div>
              <span class="text-editor-pane__meta">即时更新</span>
            </div>
            <div class="text-editor-pane__body text-editor-pane__body--preview">
              <div class="markdown-preview" data-markdown-preview tabindex="0">
                ${renderMarkdownDocument(draft)}
              </div>
            </div>
          </section>
        ` : ''}
      </div>
    </section>
  `;
}

function renderPlainTextSurface(entry, draft, textareaId) {
  return `
    <section class="text-editor-surface" aria-label="${escapeHtml(getDocumentLabel(entry))}">
      <div class="text-editor-surface__header">
        <div>
          <label class="field-label" for="${escapeHtml(textareaId)}">${escapeHtml(getDocumentLabel(entry))}</label>
          <p class="text-editor-surface__hint">内容会保留原有换行风格；如果想确认最终写回结果，再打开预览。</p>
          ${renderTextEditorPathRow(entry)}
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
  `;
}

export function renderTextEditor(container, { entry, draft, onDraftChange }) {
  const badgeClass = getEditorBadge(entry);
  const markdown = isMarkdownEntry(entry);
  const viewMode = markdown ? getStoredMarkdownViewMode() : 'raw';
  const textareaId = createEditorFieldId(entry);

  container.innerHTML = `
    <div class="panel-shell panel-shell--editor panel-shell--text ${markdown ? 'panel-shell--editor-markdown' : ''}">
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

      ${markdown
        ? renderMarkdownSurface(entry, draft, textareaId, viewMode)
        : renderPlainTextSurface(entry, draft, textareaId)}
    </div>
  `;

  const textarea = container.querySelector('[data-text-input]');
  const statusContainer = container.querySelector('[data-editor-status]');
  const firstUseGuidance = container.querySelector('[data-first-use-guidance]');

  const updateMarkdownPreview = (value, { syncFromInput = false } = {}) => {
    if (!markdown) {
      return;
    }

    const preview = container.querySelector('[data-markdown-preview]');
    if (!(preview instanceof HTMLElement)) {
      return;
    }

    const previousRatio = getScrollRatio(preview);
    preview.innerHTML = renderMarkdownDocument(value);

    if (syncFromInput) {
      const input = container.querySelector('[data-markdown-input]');
      if (input instanceof HTMLTextAreaElement) {
        syncScrollByRatio(input, preview);
        return;
      }
    }

    setScrollRatio(preview, previousRatio);
  };

  const bindMarkdownScrollSync = () => {
    if (!markdown) {
      return;
    }

    const input = container.querySelector('[data-markdown-input]');
    const preview = container.querySelector('[data-markdown-preview]');
    if (!(input instanceof HTMLTextAreaElement) || !(preview instanceof HTMLElement)) {
      return;
    }

    let syncSource = '';
    let releaseFrameId = 0;

    const releaseSyncLock = () => {
      if (releaseFrameId) {
        window.cancelAnimationFrame(releaseFrameId);
      }

      releaseFrameId = window.requestAnimationFrame(() => {
        syncSource = '';
        releaseFrameId = 0;
      });
    };

    const handleLinkedScroll = (sourceKey, source, target) => {
      if (syncSource && syncSource !== sourceKey) {
        return;
      }

      syncSource = sourceKey;
      syncScrollByRatio(source, target);
      releaseSyncLock();
    };

    input.addEventListener('scroll', () => {
      handleLinkedScroll('input', input, preview);
    }, { passive: true });

    preview.addEventListener('scroll', () => {
      handleLinkedScroll('preview', preview, input);
    }, { passive: true });
  };

  bindMarkdownScrollSync();

  const syncEditorChrome = (value) => {
    if (statusContainer) {
      statusContainer.innerHTML = renderEditorStatus(entry, value);
    }

    if (firstUseGuidance) {
      firstUseGuidance.hidden = Boolean(normalizeText(value).trim());
    }
  };

  const rerenderMarkdownMode = (nextMode) => {
    if (!markdown) {
      return;
    }

    const activeInput = container.querySelector('[data-markdown-input]');
    const activePreview = container.querySelector('[data-markdown-preview]');
    const selectionStart = activeInput instanceof HTMLTextAreaElement ? activeInput.selectionStart : null;
    const selectionEnd = activeInput instanceof HTMLTextAreaElement ? activeInput.selectionEnd : null;
    const inputScrollTop = activeInput instanceof HTMLTextAreaElement ? activeInput.scrollTop : 0;
    const previewScrollTop = activePreview instanceof HTMLElement ? activePreview.scrollTop : 0;
    const nextDraft = activeInput instanceof HTMLTextAreaElement ? activeInput.value : draft;
    const normalizedMode = setStoredMarkdownViewMode(nextMode);

    renderTextEditor(container, {
      entry,
      draft: nextDraft,
      onDraftChange
    });

    window.requestAnimationFrame(() => {
      const nextInput = container.querySelector('[data-markdown-input]');
      const nextPreview = container.querySelector('[data-markdown-preview]');

      if (nextInput instanceof HTMLTextAreaElement) {
        nextInput.scrollTop = inputScrollTop;

        if (typeof selectionStart === 'number' && typeof selectionEnd === 'number') {
          nextInput.setSelectionRange(selectionStart, selectionEnd);
        }
      }

      if (nextPreview instanceof HTMLElement) {
        nextPreview.scrollTop = previewScrollTop;
      }

      const focusTarget = normalizedMode === 'preview' ? nextPreview : nextInput;
      if (focusTarget instanceof HTMLElement) {
        focusTarget.focus({ preventScroll: true });
      }
    });
  };

  container.oninput = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLTextAreaElement) || target.name !== 'rule-document') {
      return;
    }

    syncEditorChrome(target.value);
    updateMarkdownPreview(target.value, {
      syncFromInput: target.hasAttribute('data-markdown-input')
    });
    onDraftChange(target.value);
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

    if (action === 'switch-markdown-view') {
      rerenderMarkdownMode(button.getAttribute('data-view-mode') || 'split');
      return;
    }

    if (!(textarea instanceof HTMLTextAreaElement)) {
      return;
    }

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
    updateMarkdownPreview(nextValue, {
      syncFromInput: textarea.hasAttribute('data-markdown-input')
    });
    onDraftChange(nextValue);
  };
}
