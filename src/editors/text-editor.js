import { escapeHtml, renderSectionIntro, renderTextArea } from '../components/form-controls.js';

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

function renderInlineMarkdown(value = '') {
  let html = escapeHtml(value);

  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<span class="markdown-link">$1</span><code class="markdown-url">$2</code>');

  return html;
}

function flushParagraph(paragraphLines, blocks) {
  if (!paragraphLines.length) {
    return;
  }

  blocks.push(`<p>${paragraphLines.map(renderInlineMarkdown).join('<br />')}</p>`);
  paragraphLines.length = 0;
}

function flushList(listItems, blocks, ordered = false) {
  if (!listItems.length) {
    return;
  }

  const tagName = ordered ? 'ol' : 'ul';
  blocks.push(`<${tagName}>${listItems.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join('')}</${tagName}>`);
  listItems.length = 0;
}

function flushQuote(quoteLines, blocks) {
  if (!quoteLines.length) {
    return;
  }

  blocks.push(`<blockquote>${quoteLines.map((line) => `<p>${renderInlineMarkdown(line)}</p>`).join('')}</blockquote>`);
  quoteLines.length = 0;
}

function renderMarkdownPreview(value = '') {
  const text = String(value ?? '').replace(/\r\n/g, '\n');
  if (!text.trim()) {
    return '<p class="markdown-preview__empty">暂无内容，左侧输入后这里会实时渲染。</p>';
  }

  const lines = text.split('\n');
  const blocks = [];
  const paragraphLines = [];
  const unorderedItems = [];
  const orderedItems = [];
  const quoteLines = [];
  let inCodeBlock = false;
  let codeLines = [];

  const flushTextualBlocks = () => {
    flushParagraph(paragraphLines, blocks);
    flushList(unorderedItems, blocks, false);
    flushList(orderedItems, blocks, true);
    flushQuote(quoteLines, blocks);
  };

  for (const line of lines) {
    const fenceMatch = line.match(/^```([\w-]+)?\s*$/);
    if (fenceMatch) {
      flushTextualBlocks();

      if (inCodeBlock) {
        blocks.push(`
          <pre class="markdown-code-block"><code>${escapeHtml(codeLines.join('\n'))}</code></pre>
        `);
        codeLines = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
        codeLines = [];
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

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushTextualBlocks();
      const level = headingMatch[1].length;
      blocks.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`);
      continue;
    }

    const hrMatch = line.match(/^(-{3,}|\*{3,}|_{3,})$/);
    if (hrMatch) {
      flushTextualBlocks();
      blocks.push('<hr />');
      continue;
    }

    const unorderedMatch = line.match(/^[-*+]\s+(.+)$/);
    if (unorderedMatch) {
      flushParagraph(paragraphLines, blocks);
      flushList(orderedItems, blocks, true);
      flushQuote(quoteLines, blocks);
      unorderedItems.push(unorderedMatch[1]);
      continue;
    }

    const orderedMatch = line.match(/^\d+\.\s+(.+)$/);
    if (orderedMatch) {
      flushParagraph(paragraphLines, blocks);
      flushList(unorderedItems, blocks, false);
      flushQuote(quoteLines, blocks);
      orderedItems.push(orderedMatch[1]);
      continue;
    }

    const quoteMatch = line.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      flushParagraph(paragraphLines, blocks);
      flushList(unorderedItems, blocks, false);
      flushList(orderedItems, blocks, true);
      quoteLines.push(quoteMatch[1]);
      continue;
    }

    paragraphLines.push(line);
  }

  if (inCodeBlock) {
    blocks.push(`<pre class="markdown-code-block"><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
  }

  flushTextualBlocks();
  return blocks.join('');
}

export function renderTextEditor(container, { entry, draft, onDraftChange }) {
  const tone = getEditorTone(entry);
  const badgeClass = getEditorBadge(entry);
  const isMarkdown = entry.format === 'markdown';
  const placeholder = entry.format === 'markdown'
    ? '# 在这里编写全局规则\n\n- 每一条规则都会应用到对应助手会话'
    : '# 在这里编写全局规则';

  container.innerHTML = `
    <div class="panel-shell panel-shell--editor">
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
      ? '左侧编辑 Markdown，右侧实时渲染预览；最右侧原生源码预览面板继续保留。'
      : '保持原有 UI 结构不变，仅为规则类文件补充可编辑文本区域。',
    accent: tone
  })}

        ${isMarkdown ? `
          <div class="markdown-compare">
            <label class="field-card markdown-pane markdown-pane--editor">
              <span class="field-copy">
                <span class="field-label">${escapeHtml(getDocumentLabel(entry))}</span>
                <span class="field-description">支持常用 Markdown 语法；保存时会按原文件换行风格写回。</span>
              </span>
              <span class="field-control">
                <textarea
                  class="text-area text-area--markdown"
                  name="rule-document"
                  rows="20"
                  placeholder="${escapeHtml(placeholder)}"
                >${escapeHtml(draft)}</textarea>
              </span>
            </label>

            <section class="field-card markdown-pane markdown-pane--preview">
              <div class="field-copy">
                <span class="field-label">Markdown 渲染预览</span>
                <span class="field-description">用于校对标题、列表、引用、代码块等结构是否符合预期。</span>
              </div>
              <div class="markdown-preview" data-markdown-preview>
                ${renderMarkdownPreview(draft)}
              </div>
            </section>
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

  const textarea = container.querySelector('textarea[name="rule-document"]');
  const preview = container.querySelector('[data-markdown-preview]');
  textarea?.addEventListener('input', (event) => {
    const nextValue = event.target.value;
    if (preview) {
      preview.innerHTML = renderMarkdownPreview(nextValue);
    }
    onDraftChange(nextValue);
  });
}
