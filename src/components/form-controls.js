export function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderSectionIntro({
  eyebrow = '',
  title = '',
  description = '',
  accent = 'emerald'
}) {
  return `
    <div class="section-intro section-intro--${accent}">
      ${eyebrow ? `<p class="section-eyebrow">${escapeHtml(eyebrow)}</p>` : ''}
      <div>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(description)}</p>
      </div>
    </div>
  `;
}

export function renderFieldShell({ label, description = '', control, span = 'default' }) {
  return `
    <label class="field-card field-card--${span}">
      <span class="field-copy">
        <span class="field-label">${escapeHtml(label)}</span>
        ${description ? `<span class="field-description">${escapeHtml(description)}</span>` : ''}
      </span>
      <span class="field-control">
        ${control}
      </span>
    </label>
  `;
}

export function renderTextInput({
  label,
  name,
  value = '',
  placeholder = '',
  description = '',
  span = 'default',
  type = 'text',
  datalist = null
}) {
  const listId = datalist ? `list-${name}` : '';
  const listAttr = datalist ? `list="${listId}"` : '';

  const datalistHtml = datalist ? `
    <datalist id="${listId}">
      ${datalist.map(val => `<option value="${escapeHtml(val)}"></option>`).join('')}
    </datalist>
  ` : '';

  return renderFieldShell({
    label,
    description,
    span,
    control: `
      <input
        class="text-input"
        type="${type}"
        name="${escapeHtml(name)}"
        value="${escapeHtml(value)}"
        placeholder="${escapeHtml(placeholder)}"
        ${listAttr}
      />
      ${datalistHtml}
    `
  });
}

export function renderTextArea({
  label,
  name,
  value = '',
  placeholder = '',
  description = '',
  rows = 4,
  span = 'default'
}) {
  return renderFieldShell({
    label,
    description,
    span,
    control: `
      <textarea
        class="text-area"
        name="${escapeHtml(name)}"
        rows="${rows}"
        placeholder="${escapeHtml(placeholder)}"
      >${escapeHtml(value)}</textarea>
    `
  });
}

export function renderSelect({
  label,
  name,
  value = '',
  description = '',
  options = [],
  span = 'default'
}) {
  return renderFieldShell({
    label,
    description,
    span,
    control: `
      <select class="select-input" name="${escapeHtml(name)}">
        ${options
        .map(
          (option) => `
              <option value="${escapeHtml(option.value)}" ${option.value === value ? 'selected' : ''}>
                ${escapeHtml(option.label)}
              </option>
            `
        )
        .join('')}
      </select>
    `
  });
}

export function renderToggle({
  label,
  name,
  checked = false,
  description = '',
  span = 'default'
}) {
  return renderFieldShell({
    label,
    description,
    span,
    control: `
      <span class="toggle-shell">
        <input class="toggle-input" type="checkbox" name="${escapeHtml(name)}" ${checked ? 'checked' : ''} />
        <span class="toggle-track" aria-hidden="true">
          <span class="toggle-thumb"></span>
        </span>
      </span>
    `
  });
}

export function renderSegmented({
  label,
  name,
  value = '',
  description = '',
  options = [],
  span = 'full'
}) {
  return renderFieldShell({
    label,
    description,
    span,
    control: `
      <span class="segmented-control">
        ${options
        .map(
          (option) => `
              <label class="segment-option ${option.value === value ? 'is-selected' : ''}">
                <input
                  type="radio"
                  name="${escapeHtml(name)}"
                  value="${escapeHtml(option.value)}"
                  ${option.value === value ? 'checked' : ''}
                />
                <span class="segment-copy">
                  <strong>${escapeHtml(option.label)}</strong>
                  ${option.hint ? `<small>${escapeHtml(option.hint)}</small>` : ''}
                </span>
              </label>
            `
        )
        .join('')}
      </span>
    `
  });
}
