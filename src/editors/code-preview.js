import { escapeHtml } from '../components/form-controls.js';

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

function wrapLines(content, language) {
  const lines = content.split(/\r?\n/);
  const highlightFn = language === 'toml' ? highlightTomlLine
    : language === 'json' ? highlightJsonLine
      : (line) => escapeHtml(line);

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

export function renderCodePreview(container, model, actions) {
  const lineCount = model.content ? model.content.split(/\r?\n/).length : 0;
  const fileName = (model.description || '').split(/[\\/]/).pop() || model.title || 'preview';
  const langLabel = (model.language || 'text').toUpperCase();

  container.innerHTML = `
    <div class="panel-shell panel-shell--preview preview-ide">
      <div class="preview-toolbar">
        <div class="preview-toolbar__info">
          <span class="preview-toolbar__file">${escapeHtml(fileName)}</span>
          <span class="preview-chip">${escapeHtml(langLabel)}</span>
          <span class="preview-chip">${lineCount} 行</span>
          ${model.sourceLabel ? `<span class="preview-chip">${escapeHtml(model.sourceLabel)}</span>` : ''}
        </div>
        <div class="preview-toolbar__actions">
          <button class="mini-button" type="button" data-action="copy">复制</button>
          <button class="mini-button" type="button" data-action="reveal" ${model.path ? '' : 'disabled'}>定位</button>
        </div>
      </div>
      <pre class="code-block"><span class="code-block-inner">${wrapLines(model.content || '', model.language)}</span></pre>
    </div>
  `;

  container.querySelector('[data-action="copy"]').onclick = () => {
    actions.onCopy(model.content || '');
  };

  const revealButton = container.querySelector('[data-action="reveal"]');
  if (revealButton && model.path) {
    revealButton.onclick = () => {
      actions.onReveal(model.path);
    };
  }
}

