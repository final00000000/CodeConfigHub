import { escapeHtml } from '../components/form-controls.js';

const LINE_SPLIT_REGEX = /\r\n|\n|\r/;

function highlightTomlLine(line) {
  let output = escapeHtml(line);
  output = output.replace(/^(\s*\[[^\]]+])$/g, '<span class="token token-table">$1</span>');
  output = output.replace(/^(\s*[A-Za-z0-9_.-]+)(\s*=)/g, '<span class="token token-key">$1</span>$2');
  output = output.replace(/&quot;.*?&quot;/g, '<span class="token token-string">$&</span>');
  output = output.replace(/\b(true|false)\b/g, '<span class="token token-boolean">$1</span>');
  output = output.replace(/\b-?\d+(?:\.\d+)?\b/g, '<span class="token token-number">$&</span>');
  return output;
}

function highlightJsonLine(line) {
  let output = escapeHtml(line);
  output = output.replace(/&quot;(.*?)&quot;(?=\s*:)/g, '<span class="token token-key">&quot;$1&quot;</span>');
  output = output.replace(/:\s*&quot;(.*?)&quot;/g, ': <span class="token token-string">&quot;$1&quot;</span>');
  output = output.replace(/\b(true|false|null)\b/g, '<span class="token token-boolean">$1</span>');
  output = output.replace(/\b-?\d+(?:\.\d+)?\b/g, '<span class="token token-number">$&</span>');
  return output;
}

function getLineHighlightFn(language) {
  return language === 'toml' ? highlightTomlLine
    : language === 'json' ? highlightJsonLine
      : (line) => escapeHtml(line);
}

function wrapLines(content, language) {
  const lines = String(content || '').split(LINE_SPLIT_REGEX);
  const highlightFn = getLineHighlightFn(language);

  return lines.map((line, i) => {
    const trimmed = line.trim();
    const isSection = language === 'toml' && /^\[.+]$/.test(trimmed);
    const isJsonSection = language === 'json' && /^"[^"]+":\s*\{/.test(trimmed);
    const isBlank = trimmed === '';

    let cls = 'code-line';
    if (isBlank) cls += ' code-line--blank';
    if ((isSection || isJsonSection) && i > 0) cls += ' code-line--section';

    return `<span class="${cls}">${highlightFn(line)}</span>`;
  }).join('\n');
}

function collectSearchMatches(content, query) {
  const normalizedQuery = String(query || '');
  const lines = String(content || '').split(LINE_SPLIT_REGEX);

  if (!normalizedQuery) {
    return { matchesByLine: [], totalMatches: 0 };
  }

  const lowerQuery = normalizedQuery.toLocaleLowerCase();
  const matchesByLine = [];
  let totalMatches = 0;

  lines.forEach((line, lineIndex) => {
    const lowerLine = line.toLocaleLowerCase();
    let cursor = 0;
    const lineMatches = [];

    while (cursor <= lowerLine.length - lowerQuery.length) {
      const start = lowerLine.indexOf(lowerQuery, cursor);
      if (start === -1) {
        break;
      }

      lineMatches.push({
        start,
        end: start + normalizedQuery.length,
        index: totalMatches
      });
      totalMatches += 1;
      cursor = start + normalizedQuery.length;
    }

    matchesByLine[lineIndex] = lineMatches;
  });

  return { matchesByLine, totalMatches };
}

function cloneNodeWithMatches(node, ranges, context, activeMatchIndex, ownerDocument) {
  if (node.nodeType === 3) {
    const text = node.textContent || '';
    const nodeStart = context.position;
    const nodeEnd = nodeStart + text.length;
    const fragment = ownerDocument.createDocumentFragment();

    let cursor = 0;
    while (context.rangeIndex < ranges.length) {
      const range = ranges[context.rangeIndex];
      if (range.end <= nodeStart + cursor) {
        context.rangeIndex += 1;
        continue;
      }

      if (range.start >= nodeEnd) {
        break;
      }

      const startInNode = Math.max(range.start - nodeStart, cursor);
      const endInNode = Math.min(range.end - nodeStart, text.length);

      if (startInNode > cursor) {
        fragment.append(text.slice(cursor, startInNode));
      }

      if (endInNode > startInNode) {
        const mark = ownerDocument.createElement('mark');
        mark.className = 'preview-find__match';
        mark.dataset.matchIndex = String(range.index);
        if (range.index === activeMatchIndex) {
          mark.classList.add('is-active');
        }
        mark.textContent = text.slice(startInNode, endInNode);
        fragment.append(mark);
      }

      cursor = endInNode;

      if (range.end <= nodeEnd) {
        context.rangeIndex += 1;
      } else {
        break;
      }
    }

    if (cursor < text.length) {
      fragment.append(text.slice(cursor));
    }

    context.position = nodeEnd;
    return fragment;
  }

  if (node.nodeType === 1) {
    const clone = node.cloneNode(false);
    Array.from(node.childNodes).forEach((child) => {
      clone.append(cloneNodeWithMatches(child, ranges, context, activeMatchIndex, ownerDocument));
    });
    return clone;
  }

  return node.cloneNode(true);
}

function highlightLineMatches(lineElement, ranges, activeMatchIndex) {
  if (!ranges?.length) {
    return;
  }

  const ownerDocument = lineElement.ownerDocument;
  const fragment = ownerDocument.createDocumentFragment();
  const context = { position: 0, rangeIndex: 0 };

  Array.from(lineElement.childNodes).forEach((child) => {
    fragment.append(cloneNodeWithMatches(child, ranges, context, activeMatchIndex, ownerDocument));
  });

  lineElement.replaceChildren(fragment);
}

function applySearchHighlights(codeBlockInner, content, query, activeMatchIndex) {
  const { matchesByLine, totalMatches } = collectSearchMatches(content, query);
  const normalizedActiveIndex = totalMatches > 0 ? Math.min(Math.max(activeMatchIndex, 0), totalMatches - 1) : 0;

  if (!query || !totalMatches) {
    return {
      totalMatches,
      activeMatchIndex: 0,
      activeMatchElement: null
    };
  }

  const lineElements = codeBlockInner.querySelectorAll('.code-line');
  lineElements.forEach((lineElement, lineIndex) => {
    const lineMatches = matchesByLine[lineIndex];
    if (lineMatches?.length) {
      highlightLineMatches(lineElement, lineMatches, normalizedActiveIndex);
    }
  });

  return {
    totalMatches,
    activeMatchIndex: normalizedActiveIndex,
    activeMatchElement: codeBlockInner.querySelector(`.preview-find__match[data-match-index="${normalizedActiveIndex}"]`)
  };
}

function formatMatchCount(query, activeMatchIndex, totalMatches) {
  if (!query || !totalMatches) {
    return '0 / 0';
  }

  return `${activeMatchIndex + 1} / ${totalMatches}`;
}

export function renderCodePreview(container, model, actions) {
  const content = model.content || '';
  const lineCount = content ? content.split(LINE_SPLIT_REGEX).length : 0;
  const fileName = (model.description || '').split(/[\\/]/).pop() || model.title || 'preview';
  const langLabel = (model.language || 'text').toUpperCase();
  const initialSearchQuery = typeof model.searchQuery === 'string' ? model.searchQuery : '';
  const initialActiveMatchIndex = Number.isInteger(model.activeMatchIndex) ? model.activeMatchIndex : 0;
  const initialScrollTop = Number.isFinite(model.scrollTop) ? model.scrollTop : 0;

  container.innerHTML = `
    <div class="panel-shell panel-shell--preview preview-ide">
      <div class="preview-toolbar">
        <div class="preview-toolbar__info">
          <span class="preview-toolbar__file">${escapeHtml(fileName)}</span>
          <span class="preview-chip">${escapeHtml(langLabel)}</span>
          <span class="preview-chip">${lineCount} 行</span>
          ${model.sourceLabel ? `<span class="preview-chip">${escapeHtml(model.sourceLabel)}</span>` : ''}
        </div>
        <div class="preview-toolbar__controls">
          <div class="preview-find" role="search">
            <input
              class="preview-find__input"
              type="search"
              placeholder="查找内容"
              value="${escapeHtml(initialSearchQuery)}"
              spellcheck="false"
              autocomplete="off"
              data-role="find-input"
              aria-label="在配置预览中查找"
            />
            <span class="preview-find__count" data-role="find-count" aria-live="polite">0 / 0</span>
            <button class="mini-button preview-find__nav" type="button" data-action="find-prev" aria-label="上一处匹配">↑</button>
            <button class="mini-button preview-find__nav" type="button" data-action="find-next" aria-label="下一处匹配">↓</button>
          </div>
          <div class="preview-toolbar__actions">
            <button class="mini-button" type="button" data-action="copy">复制</button>
            <button class="mini-button" type="button" data-action="reveal" ${model.path ? '' : 'disabled'}>定位</button>
          </div>
        </div>
      </div>
      <pre class="code-block"><span class="code-block-inner"></span></pre>
    </div>
  `;

  const codeBlockInner = container.querySelector('.code-block-inner');
  const codeBlock = container.querySelector('.code-block');
  const findInput = container.querySelector('[data-role="find-input"]');
  const findCount = container.querySelector('[data-role="find-count"]');
  const prevMatchButton = container.querySelector('[data-action="find-prev"]');
  const nextMatchButton = container.querySelector('[data-action="find-next"]');
  const searchState = {
    query: initialSearchQuery,
    activeMatchIndex: initialActiveMatchIndex,
    totalMatches: 0
  };
  let searchInputTimer = null;

  const renderPreviewContent = ({ resetActive = false, scrollActive = false } = {}) => {
    if (resetActive) {
      searchState.activeMatchIndex = 0;
    }

    searchState.query = findInput.value;
    codeBlockInner.innerHTML = wrapLines(content, model.language);

    const result = applySearchHighlights(codeBlockInner, content, searchState.query, searchState.activeMatchIndex);
    searchState.totalMatches = result.totalMatches;
    searchState.activeMatchIndex = result.activeMatchIndex;

    findCount.textContent = formatMatchCount(searchState.query, searchState.activeMatchIndex, searchState.totalMatches);
    prevMatchButton.disabled = !searchState.totalMatches;
    nextMatchButton.disabled = !searchState.totalMatches;

    actions.onSearchStateChange?.({
      query: searchState.query,
      activeMatchIndex: searchState.activeMatchIndex,
      matchCount: searchState.totalMatches
    });

    if (scrollActive && result.activeMatchElement) {
      result.activeMatchElement.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  };

  const moveMatch = (direction) => {
    if (!searchState.totalMatches) {
      return;
    }

    searchState.activeMatchIndex = (searchState.activeMatchIndex + direction + searchState.totalMatches) % searchState.totalMatches;
    renderPreviewContent({ scrollActive: true });
  };

  findInput.addEventListener('input', () => {
    if (searchInputTimer) {
      window.clearTimeout(searchInputTimer);
    }

    searchInputTimer = window.setTimeout(() => {
      searchInputTimer = null;
      renderPreviewContent({ resetActive: true, scrollActive: false });
    }, 70);
  });

  findInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      moveMatch(event.shiftKey ? -1 : 1);
    }
  });

  prevMatchButton.onclick = () => moveMatch(-1);
  nextMatchButton.onclick = () => moveMatch(1);
  codeBlock?.addEventListener('scroll', () => {
    actions.onScrollStateChange?.({
      scrollTop: codeBlock.scrollTop
    });
  }, { passive: true });

  container.querySelector('[data-action="copy"]').onclick = () => {
    actions.onCopy(content);
  };

  const revealButton = container.querySelector('[data-action="reveal"]');
  if (revealButton && model.path) {
    revealButton.onclick = () => {
      actions.onReveal(model.path);
    };
  }

  renderPreviewContent({ scrollActive: false });
  if (codeBlock) {
    codeBlock.scrollTop = initialScrollTop;
  }
}

