import { escapeHtml, renderSectionIntro, renderTextArea } from '../components/form-controls.js';

const MARKDOWN_LINE_SPLIT_REGEX = /\r\n|\n|\r/;

export function createTextDraft(content = '') {
  return String(content ?? '');
}

export function serializeTextDraft(draft = '') {
  return {
    content: String(draft ?? ''),
    parsed: null
  };
}

function getEditorTone(entry) {
  return entry.assistant === 'claude' ? 'claude' : 'codex';
}

function getEditorBadge(entry) {
  return entry.assistant === 'claude' ? 'editor-badge--claude' : 'editor-badge--codex';
}

function getDocumentLabel(entry) {
  return entry.format === 'markdown' ? '规则文档内容' : '规则文件内容';
}

function normalizeMarkdownText(value = '') {
  return String(value ?? '').replace(/\r\n|\r/g, '\n');
}

function getMarkdownMetrics(value = '') {
  const text = normalizeMarkdownText(value);
  const trimmed = text.trim();

  if (!trimmed) {
    return {
      lineCount: 0,
      charCount: 0,
      headingCount: 0
    };
  }

  const lines = text.split('\n');

  return {
    lineCount: lines.length,
    charCount: text.length,
    headingCount: lines.filter((line) => /^\s*#{1,6}\s+/.test(line)).length
  };
}

function renderMarkdownMetrics(value = '') {
  const metrics = getMarkdownMetrics(value);
  const items = [
    ['行数', metrics.lineCount],
    ['字符', metrics.charCount],
    ['标题', metrics.headingCount]
  ];

  return items
    .map(([label, amount]) => `
      <div class="markdown-metric">
        <strong>${amount}</strong>
        <span>${label}</span>
      </div>
    `)
    .join('');
}

function renderInlineMarkdown(value = '') {
  let html = escapeHtml(value);
  const tokens = [];
  const createToken = (markup) => {
    const tokenId = tokens.length;
    tokens.push(markup);
    return `@@MARKDOWN_TOKEN_${tokenId}@@`;
  };

  html = html.replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, (_match, alt, url) => createToken(`<span class="markdown-image">🖼 ${alt}</span><code class="markdown-url">${url}</code>`));
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_match, label, url) => createToken(`<a class="markdown-link" href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`));
  html = html.replace(/(^|[\s(])(https?:\/\/[^\s<]+)(?=$|[\s),])/g, (match, prefix, url) => `${prefix}${createToken(`<a class="markdown-link" href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`)}`);
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  html = html.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
  html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  html = html.replace(/_([^_\n]+)_/g, '<em>$1</em>');
  html = html.replace(/@@MARKDOWN_TOKEN_(\d+)@@/g, (_match, tokenIndex) => tokens[Number(tokenIndex)] || '');

  return html;
}

function flushParagraph(paragraphLines, blocks) {
  if (!paragraphLines.length) {
    return;
  }

  blocks.push(`<p>${paragraphLines.map(renderInlineMarkdown).join('<br />')}</p>`);
  paragraphLines.length = 0;
}

function flushQuote(quoteLines, blocks) {
  if (!quoteLines.length) {
    return;
  }

  blocks.push(`<blockquote>${quoteLines.map((line) => `<p>${renderInlineMarkdown(line)}</p>`).join('')}</blockquote>`);
  quoteLines.length = 0;
}

function normalizeIndent(value = '') {
  return value.replace(/\t/g, '    ').length;
}

function parseTaskItemContent(value = '') {
  const taskMatch = value.match(/^\[( |x|X)]\s+(.+)$/);
  if (!taskMatch) {
    return {
      html: renderInlineMarkdown(value),
      isTask: false
    };
  }

  const checked = taskMatch[1].toLowerCase() === 'x';
  return {
    isTask: true,
    html: `
      <span class="markdown-task">
        <input class="markdown-task__checkbox" type="checkbox" disabled ${checked ? 'checked' : ''} />
        <span>${renderInlineMarkdown(taskMatch[2])}</span>
      </span>
    `
  };
}

function tokenizeListLine(line = '') {
  const match = line.match(/^(\s*)([-*+]|\d+\.)\s+(.+)$/);
  if (!match) {
    return null;
  }

  return {
    indent: normalizeIndent(match[1]),
    ordered: /\d+\./.test(match[2]),
    raw: match[3]
  };
}

function renderListTokens(tokens, startIndex = 0, currentIndent = 0, forcedOrdered = null) {
  const ordered = forcedOrdered ?? tokens[startIndex]?.ordered ?? false;
  const tagName = ordered ? 'ol' : 'ul';
  let index = startIndex;
  let html = `<${tagName}>`;

  while (index < tokens.length) {
    const token = tokens[index];
    if (!token || token.indent < currentIndent || token.indent > currentIndent || token.ordered !== ordered) {
      break;
    }

    const taskState = parseTaskItemContent(token.raw);
    let itemHtml = taskState.html;
    index += 1;

    while (index < tokens.length && tokens[index].indent > currentIndent) {
      const nested = renderListTokens(tokens, index, tokens[index].indent, tokens[index].ordered);
      itemHtml += nested.html;
      index = nested.nextIndex;
    }

    html += `<li${taskState.isTask ? ' class="markdown-task-item"' : ''}>${itemHtml}</li>`;
  }

  html += `</${tagName}>`;
  return {
    html,
    nextIndex: index
  };
}

function renderListBlock(lines = []) {
  const tokens = lines.map((line) => tokenizeListLine(line)).filter(Boolean);
  if (!tokens.length) {
    return '';
  }

  let index = 0;
  let html = '';

  while (index < tokens.length) {
    const rendered = renderListTokens(tokens, index, tokens[index].indent, tokens[index].ordered);
    html += rendered.html;
    index = rendered.nextIndex;
  }

  return html;
}

function splitTableCells(line = '') {
  const normalized = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return normalized.split('|').map((cell) => cell.trim());
}

function isTableSeparator(line = '') {
  const cells = splitTableCells(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function renderMarkdownTable(lines = []) {
  if (lines.length < 2 || !isTableSeparator(lines[1])) {
    return '';
  }

  const headers = splitTableCells(lines[0]);
  const rows = lines.slice(2).map((line) => splitTableCells(line));
  const normalizedRows = rows.map((row) => headers.map((_, index) => row[index] || ''));

  return `
    <div class="markdown-table-shell">
      <table class="markdown-table">
        <thead>
          <tr>${headers.map((cell) => `<th>${renderInlineMarkdown(cell)}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${normalizedRows.map((row) => `<tr>${row.map((cell) => `<td>${renderInlineMarkdown(cell)}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderMarkdownPreview(value = '') {
  const text = normalizeMarkdownText(value);
  if (!text.trim()) {
    return '<p class="markdown-preview__empty">暂无内容，左侧输入后这里会实时渲染。</p>';
  }

  const lines = text.split(MARKDOWN_LINE_SPLIT_REGEX);
  const blocks = [];
  const paragraphLines = [];
  const quoteLines = [];
  let inCodeBlock = false;
  let codeLines = [];
  let codeBlockLanguage = '';

  const flushTextualBlocks = () => {
    flushParagraph(paragraphLines, blocks);
    flushQuote(quoteLines, blocks);
  };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const fenceMatch = line.match(/^```([\w-]+)?\s*$/);
    if (fenceMatch) {
      flushTextualBlocks();

      if (inCodeBlock) {
        const languageAttr = codeBlockLanguage ? ` data-language="${escapeHtml(codeBlockLanguage)}"` : '';
        blocks.push(`<pre class="markdown-code-block"${languageAttr}><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
        codeLines = [];
        inCodeBlock = false;
        codeBlockLanguage = '';
      } else {
        inCodeBlock = true;
        codeLines = [];
        codeBlockLanguage = fenceMatch[1] || '';
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    if (!line.trim()) {
      flushTextualBlocks();
      continue;
    }

    if (line.includes('|') && lineIndex + 1 < lines.length && isTableSeparator(lines[lineIndex + 1])) {
      flushTextualBlocks();
      const tableLines = [line, lines[lineIndex + 1]];
      let cursor = lineIndex + 2;

      while (cursor < lines.length && lines[cursor].trim() && lines[cursor].includes('|')) {
        tableLines.push(lines[cursor]);
        cursor += 1;
      }

      blocks.push(renderMarkdownTable(tableLines));
      lineIndex = cursor - 1;
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushTextualBlocks();
      const level = headingMatch[1].length;
      blocks.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`);
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      flushTextualBlocks();
      blocks.push('<hr />');
      continue;
    }

    if (tokenizeListLine(line)) {
      flushTextualBlocks();
      const listLines = [line];
      let cursor = lineIndex + 1;

      while (cursor < lines.length && tokenizeListLine(lines[cursor])) {
        listLines.push(lines[cursor]);
        cursor += 1;
      }

      blocks.push(renderListBlock(listLines));
      lineIndex = cursor - 1;
      continue;
    }

    const quoteMatch = line.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      flushParagraph(paragraphLines, blocks);
      quoteLines.push(quoteMatch[1]);
      continue;
    }

    paragraphLines.push(line);
  }

  if (inCodeBlock) {
    const languageAttr = codeBlockLanguage ? ` data-language="${escapeHtml(codeBlockLanguage)}"` : '';
    blocks.push(`<pre class="markdown-code-block"${languageAttr}><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
  }

  flushTextualBlocks();
  return blocks.join('');
}

function syncScrollablePosition(source, target) {
  if (!source || !target) {
    return;
  }

  const sourceScrollable = source.scrollHeight - source.clientHeight;
  const targetScrollable = target.scrollHeight - target.clientHeight;

  if (sourceScrollable <= 0 || targetScrollable <= 0) {
    target.scrollTop = 0;
    return;
  }

  const ratio = source.scrollTop / sourceScrollable;
  target.scrollTop = ratio * targetScrollable;
}

export function renderTextEditor(container, { entry, draft, onDraftChange }) {
  const tone = getEditorTone(entry);
  const badgeClass = getEditorBadge(entry);
  const isMarkdown = entry.format === 'markdown';
  const placeholder = entry.format === 'markdown'
    ? '# 在这里编写全局规则\n\n- 每一条规则都会应用到对应助手会话'
    : '# 在这里编写全局规则';

  container.innerHTML = `
    <div class="panel-shell panel-shell--editor ${isMarkdown ? 'panel-shell--editor-markdown' : ''}">
      <div class="panel-heading">
        <div>
          <p class="panel-kicker">规则编辑</p>
          <h2>${escapeHtml(entry.label)}</h2>
          <p>${escapeHtml(entry.description)}</p>
        </div>
        <span class="editor-badge ${badgeClass}">文本编辑</span>
      </div>

      <section class="section-card section-card--${tone}">
        ${renderSectionIntro({
    eyebrow: isMarkdown ? 'Markdown' : 'Plain Text',
    title: isMarkdown ? '左右对照维护规则正文' : '直接维护规则正文',
    description: isMarkdown
      ? '左侧编辑 Markdown，右侧实时渲染预览，并保持滚动位置同步；最右侧原生源码预览面板继续保留。'
      : '保持原有 UI 结构不变，仅为规则类文件补充可编辑文本区域。',
    accent: tone
  })}

        ${isMarkdown ? `
          <div class="markdown-workbench">
            <section class="markdown-workbench__header">
              <div class="markdown-workbench__copy">
                <span class="preview-chip markdown-workbench__chip">双栏同步编辑</span>
                <strong>编辑、渲染与右侧源码预览协同查看</strong>
                <p>减少上下翻动，专注在左写右看；文档变长时，渲染区会跟随编辑区滚动位置。</p>
              </div>
              <div class="markdown-metrics" data-markdown-metrics>
                ${renderMarkdownMetrics(draft)}
              </div>
            </section>

            <div class="markdown-compare">
              <label class="field-card markdown-pane markdown-pane--editor">
                <div class="markdown-pane__header">
                  <span class="field-copy">
                    <span class="field-label">${escapeHtml(getDocumentLabel(entry))}</span>
                    <span class="field-description">支持标题、表格、任务列表、嵌套列表、引用和代码块；保存时会按原文件换行风格写回。</span>
                  </span>
                  <span class="markdown-pane__meta">
                    <span class="preview-chip">可编辑</span>
                    <span class="preview-chip">同步滚动</span>
                  </span>
                </div>
                <div class="markdown-pane__body">
                  <span class="field-control markdown-editor-shell">
                    <textarea
                      class="text-area text-area--markdown"
                      name="rule-document"
                      rows="20"
                      placeholder="${escapeHtml(placeholder)}"
                      data-markdown-input
                    >${escapeHtml(draft)}</textarea>
                  </span>
                </div>
              </label>

              <section class="field-card markdown-pane markdown-pane--preview">
                <div class="markdown-pane__header">
                  <div class="field-copy">
                    <span class="field-label">Markdown 渲染预览</span>
                    <span class="field-description">用于校对标题、表格、列表、引用、代码块等结构是否符合预期。</span>
                  </div>
                  <span class="markdown-pane__meta">
                    <span class="preview-chip">只读</span>
                    <span class="preview-chip">结构校对</span>
                  </span>
                </div>
                <div class="markdown-pane__body">
                  <div class="markdown-preview" data-markdown-preview tabindex="0">
                    ${renderMarkdownPreview(draft)}
                  </div>
                </div>
              </section>
            </div>
          </div>
        ` : `
          <div class="field-grid">
            ${renderTextArea({
    label: getDocumentLabel(entry),
    name: 'rule-document',
    value: draft,
    placeholder,
    description: '保存时会按原文件换行风格写回；右侧继续实时展示生成后的原生内容。',
    rows: 20,
    span: 'full'
  })}
          </div>
        `}
      </section>
    </div>
  `;

  const textarea = container.querySelector('[data-markdown-input]') || container.querySelector('textarea[name="rule-document"]');
  const preview = container.querySelector('[data-markdown-preview]');
  const metrics = container.querySelector('[data-markdown-metrics]');
  let syncingScroller = null;

  const syncFrom = (source, target) => {
    if (!source || !target) {
      return;
    }

    if (syncingScroller && syncingScroller !== source) {
      return;
    }

    syncingScroller = source;
    syncScrollablePosition(source, target);

    window.requestAnimationFrame(() => {
      if (syncingScroller === source) {
        syncingScroller = null;
      }
    });
  };

  textarea?.addEventListener('input', (event) => {
    const nextValue = event.target.value;
    if (preview) {
      preview.innerHTML = renderMarkdownPreview(nextValue);
    }
    if (metrics) {
      metrics.innerHTML = renderMarkdownMetrics(nextValue);
    }
    if (preview && entry.format === 'markdown') {
      window.requestAnimationFrame(() => {
        syncFrom(textarea, preview);
      });
    }
    onDraftChange(nextValue);
  });

  if (textarea && preview && entry.format === 'markdown') {
    textarea.addEventListener('scroll', () => {
      syncFrom(textarea, preview);
    }, { passive: true });

    preview.addEventListener('scroll', () => {
      syncFrom(preview, textarea);
    }, { passive: true });

    window.requestAnimationFrame(() => {
      syncFrom(textarea, preview);
    });
  }
}
