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
  if (!query) {
    return '0 / 0';
  }

  if (!totalMatches) {
    return '未找到';
  }

  return `${activeMatchIndex + 1} / ${totalMatches}`;
}

function getPreviewIdentity(sourceLabel) {
  const normalizedLabel = String(sourceLabel || '').trim();

  if (!normalizedLabel) {
    return {
      kind: 'generic',
      modeLabel: '预览内容',
      note: '当前看到的是当前条目的预览内容。'
    };
  }

  if (normalizedLabel.includes('原文件')) {
    return {
      kind: 'original',
      modeLabel: '原文件内容',
      note: '当前看到的是磁盘中的原始文件内容。'
    };
  }

  if (normalizedLabel.includes('预览')) {
    return {
      kind: 'staged',
      modeLabel: '待写入结果',
      note: '当前看到的是尚未保存的待写入结果。'
    };
  }

  if (normalizedLabel.includes('默认内容')) {
    return {
      kind: 'default',
      modeLabel: '默认参考内容',
      note: '当前看到的是应用提供的默认参考内容。'
    };
  }

  return {
    kind: 'generic',
    modeLabel: normalizedLabel,
    note: '当前看到的是当前条目的预览内容。'
  };
}

export function renderCodePreview(container, model, actions) {
  if (container.__previewSearchTimerId) {
    window.clearTimeout(container.__previewSearchTimerId);
    container.__previewSearchTimerId = null;
  }

  const content = model.content || '';
  const lineCount = content ? content.split(LINE_SPLIT_REGEX).length : 0;
  const fileName = (model.description || '').split(/[\\/]/).pop() || model.title || 'preview';
  const previewTitle = model.title || fileName;
  const previewPath = model.path || (/[\\/]/.test(String(model.description || '')) ? model.description : '');
  const langLabel = (model.language || 'text').toUpperCase();
  const sourceLabel = model.sourceLabel || '预览内容';
  const previewIdentity = getPreviewIdentity(sourceLabel);
  const previewAriaLabel = previewPath
    ? `${previewTitle}，${previewIdentity.modeLabel}，${previewPath}`
    : `${previewTitle}，${previewIdentity.modeLabel}`;
  const initialSearchQuery = typeof model.searchQuery === 'string' ? model.searchQuery : '';
  const initialActiveMatchIndex = Number.isInteger(model.activeMatchIndex) ? model.activeMatchIndex : 0;
  const initialScrollTop = Number.isFinite(model.scrollTop) ? model.scrollTop : 0;

  container.innerHTML = `
    <div class="panel-shell panel-shell--preview" data-preview-source-kind="${escapeHtml(previewIdentity.kind)}">
      <div class="preview-header">
        <div class="preview-header__identity">
          <p class="preview-header__filename">${escapeHtml(previewTitle)}</p>
          ${previewPath ? `<p class="preview-header__path" title="${escapeHtml(previewPath)}">${escapeHtml(previewPath)}</p>` : ''}
          <span class="preview-header__kind" data-kind="${escapeHtml(previewIdentity.kind)}">${escapeHtml(previewIdentity.modeLabel)}</span>
        </div>
        <div class="preview-header__meta">
          <span class="preview-header__chip">${escapeHtml(langLabel)}</span>
          <span class="preview-header__chip">${lineCount} 行</span>
        </div>
        <div class="preview-header__actions">
          <button class="preview-header__action" type="button" data-action="copy" aria-label="复制内容">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
          <button class="preview-header__action" type="button" data-action="reveal" aria-label="定位文件" ${previewPath ? '' : 'disabled'}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
          </button>
        </div>
        <div class="preview-header__find" role="search" aria-label="预览内容查找">
          <input
            class="preview-header__find-input"
            type="search"
            placeholder="查找..."
            value="${escapeHtml(initialSearchQuery)}"
            spellcheck="false"
            autocomplete="off"
            data-role="find-input"
            aria-label="在配置预览中查找"
          />
          <span class="preview-header__find-count" data-role="find-count" aria-live="polite">0 / 0</span>
          <button class="preview-header__find-nav" type="button" data-action="find-prev" aria-label="上一处匹配">↑</button>
          <button class="preview-header__find-nav" type="button" data-action="find-next" aria-label="下一处匹配">↓</button>
        </div>
      </div>
      <pre class="code-block" data-role="code-block" tabindex="0" aria-label="${escapeHtml(previewAriaLabel)}"><span class="code-block-inner"></span></pre>
    </div>
  `;

  const codeBlockInner = container.querySelector('.code-block-inner');
  const codeBlock = container.querySelector('[data-role="code-block"]');
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
  let isComposingSearch = false;

  const syncSearchTimer = (timerId) => {
    searchInputTimer = timerId;
    container.__previewSearchTimerId = timerId;
  };

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

  const clearSearchTimer = () => {
    if (searchInputTimer) {
      window.clearTimeout(searchInputTimer);
      syncSearchTimer(null);
    }
  };

  const requestSearchRender = ({ resetActive = false, scrollActive = false, immediate = false } = {}) => {
    if (isComposingSearch) {
      return;
    }

    const nextQuery = findInput.value;
    const shouldResetActive = resetActive && nextQuery !== searchState.query;

    if (!shouldResetActive && nextQuery === searchState.query && !scrollActive) {
      return;
    }

    clearSearchTimer();

    const run = () => {
      renderPreviewContent({ resetActive: shouldResetActive, scrollActive });
    };

    if (immediate) {
      run();
      return;
    }

    syncSearchTimer(window.setTimeout(() => {
      syncSearchTimer(null);
      run();
    }, 70));
  };

  const moveMatch = (direction) => {
    if (!searchState.totalMatches) {
      return;
    }

    searchState.activeMatchIndex = (searchState.activeMatchIndex + direction + searchState.totalMatches) % searchState.totalMatches;
    renderPreviewContent({ scrollActive: true });
  };

  findInput.addEventListener('compositionstart', () => {
    isComposingSearch = true;
    clearSearchTimer();
  });

  findInput.addEventListener('compositionend', () => {
    isComposingSearch = false;
    requestSearchRender({ resetActive: true, immediate: true });
  });

  findInput.addEventListener('input', (event) => {
    if (event.isComposing || isComposingSearch) {
      return;
    }

    requestSearchRender({ resetActive: true });
  });

  findInput.addEventListener('search', () => {
    requestSearchRender({ resetActive: true, immediate: true });
  });

  findInput.addEventListener('keydown', (event) => {
    if (event.isComposing || isComposingSearch) {
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      moveMatch(event.shiftKey ? -1 : 1);
      return;
    }

    if (event.key === 'Escape' && findInput.value) {
      event.preventDefault();
      findInput.value = '';
      requestSearchRender({ resetActive: true, immediate: true });
    }
  });

  container.onkeydown = (event) => {
    if (event.isComposing || isComposingSearch) {
      return;
    }

    const normalizedKey = typeof event.key === 'string' ? event.key.toLowerCase() : '';
    const hasShortcutModifier = event.ctrlKey || event.metaKey;

    if (hasShortcutModifier && normalizedKey === 'f') {
      event.preventDefault();
      findInput.focus();
      findInput.select();
      return;
    }

    if (event.key === 'F3' || (hasShortcutModifier && normalizedKey === 'g')) {
      event.preventDefault();
      moveMatch(event.shiftKey ? -1 : 1);
    }
  };

  prevMatchButton.onclick = () => moveMatch(-1);
  nextMatchButton.onclick = () => moveMatch(1);
  codeBlock?.addEventListener('scroll', () => {
    actions.onScrollStateChange?.({
      scrollTop: codeBlock.scrollTop
    });
  }, { passive: true });

  container.querySelector('[data-action="copy"]').onclick = () => {
    actions.onCopy?.(content);
  };

  const revealButton = container.querySelector('[data-action="reveal"]');
  if (revealButton && previewPath) {
    revealButton.onclick = () => {
      actions.onReveal?.(previewPath);
    };
  }

  renderPreviewContent({ scrollActive: false });
  if (codeBlock) {
    codeBlock.scrollTop = initialScrollTop;
  }
}
