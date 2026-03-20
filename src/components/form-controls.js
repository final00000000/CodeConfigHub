const SAFE_HTML_ATTRIBUTE_NAME = /^[a-zA-Z_:][-a-zA-Z0-9_:.]*$/;

function normalizeClassToken(value = '', fallback = 'default') {
  const normalized = String(value ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return (normalized || fallback).toLowerCase();
}

function normalizeClassNames(...values) {
  return values
    .flatMap((value) => String(value ?? '').split(/\s+/))
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => token.replace(/[^a-zA-Z0-9_-]+/g, '-'))
    .filter(Boolean)
    .join(' ');
}

function normalizeDomId(value = '', { preserveCase = false } = {}) {
  const normalized = String(value ?? '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!normalized) {
    return '';
  }

  return preserveCase ? normalized : normalized.toLowerCase();
}

function normalizeChoiceOption(option) {
  if (option && typeof option === 'object' && !Array.isArray(option)) {
    return option;
  }

  return {
    value: option,
    label: option
  };
}

function normalizeDatalistOption(option) {
  if (option && typeof option === 'object' && !Array.isArray(option)) {
    return {
      value: option.value,
      label: option.label
    };
  }

  return {
    value: option,
    label: ''
  };
}

function resolveFieldAccessibility({ name = '', id = '', description = '', describedBy = '' }) {
  const { controlId, labelId, descriptionId } = createFieldIds(name, id);

  return {
    controlId,
    labelId,
    descriptionId,
    describedByIds: joinAriaIds(description ? descriptionId : '', describedBy)
  };
}

export function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function createFieldIds(name = '', explicitId = '') {
  const normalizedExplicitId = normalizeDomId(explicitId, { preserveCase: true });
  const controlId = normalizedExplicitId || `field-${normalizeDomId(name) || 'control'}-control`;

  return {
    controlId,
    labelId: `${controlId}-label`,
    descriptionId: `${controlId}-description`
  };
}

export function joinAriaIds(...values) {
  const seen = new Set();
  const result = [];

  values
    .flatMap((value) => {
      if (Array.isArray(value)) {
        return value;
      }

      return String(value ?? '').split(/\s+/);
    })
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .forEach((value) => {
      if (seen.has(value)) {
        return;
      }

      seen.add(value);
      result.push(value);
    });

  return result.join(' ');
}

export function renderAttributes(attributes = {}) {
  if (!attributes || typeof attributes !== 'object') {
    return '';
  }

  return Object.entries(attributes)
    .flatMap(([name, value]) => {
      if (!SAFE_HTML_ATTRIBUTE_NAME.test(name)) {
        return [];
      }

      if (value === undefined || value === null || value === false || value === '') {
        return [];
      }

      if (value === true) {
        return [` ${name}`];
      }

      const normalizedValue = Array.isArray(value)
        ? value.filter(Boolean).join(' ')
        : String(value);

      if (!normalizedValue) {
        return [];
      }

      return [` ${name}="${escapeHtml(normalizedValue)}"`];
    })
    .join('');
}

export function renderSectionIntro({
  eyebrow = '',
  title = '',
  description = '',
  accent = 'emerald'
}) {
  const accentToken = normalizeClassToken(accent, 'emerald');

  return `
    <div class="section-intro section-intro--${accentToken}">
      ${eyebrow ? `<p class="section-eyebrow">${escapeHtml(eyebrow)}</p>` : ''}
      <div>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(description)}</p>
      </div>
    </div>
  `;
}

export function renderFieldShell({
  label,
  description = '',
  control,
  span = 'default',
  as = 'label',
  labelId = '',
  descriptionId = '',
  labelMeta = '',
  detailsHtml = '',
  fieldClassName = '',
  controlClassName = '',
  fieldAttributes = {}
}) {
  const tagName = as === 'div' ? 'div' : 'label';
  const normalizedFieldAttributes = fieldAttributes && typeof fieldAttributes === 'object' ? fieldAttributes : {};
  const { class: fieldAttributeClass = '', ...safeFieldAttributes } = normalizedFieldAttributes;
  const fieldClassNames = normalizeClassNames(
    'field-card',
    `field-card--${normalizeClassToken(span, 'default')}`,
    fieldClassName,
    fieldAttributeClass
  );
  const controlClassNames = normalizeClassNames('field-control', controlClassName);

  return `
    <${tagName} class="${fieldClassNames}"${renderAttributes(safeFieldAttributes)}>
      <span class="field-copy"${labelId ? ` id="${escapeHtml(labelId)}"` : ''}>
        <span class="field-label-row">
          <span class="field-label">${escapeHtml(label)}</span>
          ${labelMeta || ''}
        </span>
        ${description ? `<span class="field-description"${descriptionId ? ` id="${escapeHtml(descriptionId)}"` : ''}>${escapeHtml(description)}</span>` : ''}
        ${detailsHtml || ''}
      </span>
      <span class="${controlClassNames}">
        ${control}
      </span>
    </${tagName}>
  `;
}

export function renderTextInput({
  label,
  name,
  value = '',
  placeholder = '',
  description = '',
  labelMeta = '',
  detailsHtml = '',
  span = 'default',
  type = 'text',
  datalist = null,
  id = '',
  describedBy = '',
  controlAttributes = {},
  fieldAttributes = {}
}) {
  const { controlId, labelId, descriptionId, describedByIds } = resolveFieldAccessibility({
    name,
    id,
    description,
    describedBy
  });
  const datalistOptions = Array.isArray(datalist)
    ? datalist.map(normalizeDatalistOption).filter((option) => option.value !== undefined && option.value !== null && option.value !== '')
    : [];
  const listId = datalistOptions.length > 0 ? `${controlId}-list` : '';
  const mergedControlAttributes = {
    ...controlAttributes,
    class: normalizeClassNames('text-input', controlAttributes.class),
    type,
    id: controlId,
    name,
    value,
    placeholder,
    list: listId,
    'aria-labelledby': labelId,
    'aria-describedby': describedByIds
  };

  const datalistHtml = listId ? `
    <datalist id="${escapeHtml(listId)}">
      ${datalistOptions.map((option) => `<option${renderAttributes({ value: option.value, label: option.label })}></option>`).join('')}
    </datalist>
  ` : '';
  const inputControlHtml = `<input${renderAttributes(mergedControlAttributes)} />`;
  const controlHtml = listId
    ? `
      <span class="select-shell select-shell--combobox">
        ${inputControlHtml}
        <span class="select-shell__icon" aria-hidden="true">
          <svg viewBox="0 0 12 12" focusable="false" aria-hidden="true">
            <path d="M2.5 4.25L6 7.75L9.5 4.25" />
          </svg>
        </span>
      </span>
      ${datalistHtml}
    `
    : `
      ${inputControlHtml}
      ${datalistHtml}
    `;

  return renderFieldShell({
    label,
    description,
    labelMeta,
    detailsHtml,
    span,
    labelId,
    descriptionId,
    fieldAttributes,
    control: controlHtml
  });
}

export function renderTextArea({
  label,
  name,
  value = '',
  placeholder = '',
  description = '',
  labelMeta = '',
  detailsHtml = '',
  rows = 4,
  span = 'default',
  id = '',
  describedBy = '',
  controlAttributes = {},
  fieldAttributes = {}
}) {
  const { controlId, labelId, descriptionId, describedByIds } = resolveFieldAccessibility({
    name,
    id,
    description,
    describedBy
  });
  const mergedControlAttributes = {
    ...controlAttributes,
    class: normalizeClassNames('text-area', controlAttributes.class),
    id: controlId,
    name,
    rows,
    placeholder,
    'aria-labelledby': labelId,
    'aria-describedby': describedByIds
  };

  return renderFieldShell({
    label,
    description,
    labelMeta,
    detailsHtml,
    span,
    labelId,
    descriptionId,
    fieldAttributes,
    control: `
      <textarea${renderAttributes(mergedControlAttributes)}>${escapeHtml(value)}</textarea>
    `
  });
}

export function renderSelect({
  label,
  name,
  value = '',
  description = '',
  labelMeta = '',
  detailsHtml = '',
  options = [],
  span = 'default',
  id = '',
  describedBy = '',
  controlAttributes = {},
  fieldAttributes = {}
}) {
  const { controlId, labelId, descriptionId, describedByIds } = resolveFieldAccessibility({
    name,
    id,
    description,
    describedBy
  });
  const normalizedOptions = Array.isArray(options)
    ? options.map(normalizeChoiceOption)
    : [];
  const mergedControlAttributes = {
    ...controlAttributes,
    class: normalizeClassNames('select-input', controlAttributes.class),
    id: controlId,
    name,
    'aria-labelledby': labelId,
    'aria-describedby': describedByIds
  };

  return renderFieldShell({
    label,
    description,
    labelMeta,
    detailsHtml,
    span,
    labelId,
    descriptionId,
    fieldAttributes,
    control: `
      <span class="select-shell">
        <select${renderAttributes(mergedControlAttributes)}>
          ${normalizedOptions
            .map((option) => {
              const optionValue = option.value ?? '';
              return `
                <option${renderAttributes({
                  value: optionValue,
                  selected: String(optionValue) === String(value),
                  disabled: option.disabled
                })}>
                  ${escapeHtml(option.label ?? optionValue)}
                </option>
              `;
            })
            .join('')}
        </select>
        <span class="select-shell__icon" aria-hidden="true">
          <svg viewBox="0 0 12 12" focusable="false" aria-hidden="true">
            <path d="M2.5 4.25L6 7.75L9.5 4.25" />
          </svg>
        </span>
      </span>
    `
  });
}

export function renderToggle({
  label,
  name,
  checked = false,
  description = '',
  span = 'default',
  id = '',
  describedBy = '',
  controlAttributes = {},
  fieldAttributes = {}
}) {
  const { controlId, labelId, descriptionId, describedByIds } = resolveFieldAccessibility({
    name,
    id,
    description,
    describedBy
  });
  const mergedControlAttributes = {
    ...controlAttributes,
    class: normalizeClassNames('toggle-input', controlAttributes.class),
    type: 'checkbox',
    id: controlId,
    name,
    checked,
    'aria-labelledby': labelId,
    'aria-describedby': describedByIds
  };

  return renderFieldShell({
    label,
    description,
    span,
    labelId,
    descriptionId,
    fieldAttributes,
    control: `
      <span class="toggle-shell">
        <input${renderAttributes(mergedControlAttributes)} />
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
  span = 'full',
  id = '',
  describedBy = '',
  controlAttributes = {},
  fieldAttributes = {}
}) {
  const { controlId, labelId, descriptionId, describedByIds } = resolveFieldAccessibility({
    name,
    id,
    description,
    describedBy
  });
  const normalizedOptions = Array.isArray(options)
    ? options.map(normalizeChoiceOption)
    : [];
  const groupAttributes = {
    ...controlAttributes,
    class: normalizeClassNames('segmented-control', controlAttributes.class),
    role: 'radiogroup',
    'aria-labelledby': labelId,
    'aria-describedby': describedByIds
  };

  return renderFieldShell({
    label,
    description,
    span,
    as: 'div',
    labelId,
    descriptionId,
    fieldAttributes,
    control: `
      <span${renderAttributes(groupAttributes)}>
        ${normalizedOptions
          .map((option, optionIndex) => {
            const optionValue = option.value ?? '';
            const optionId = `${controlId}-${optionIndex}`;

            return `
              <label class="segment-option ${String(optionValue) === String(value) ? 'is-selected' : ''}">
                <input${renderAttributes({
                  id: optionId,
                  type: 'radio',
                  name,
                  value: optionValue,
                  checked: String(optionValue) === String(value),
                  disabled: option.disabled
                })} />
                <span class="segment-copy">
                  <strong>${escapeHtml(option.label ?? optionValue)}</strong>
                  ${option.hint ? `<small>${escapeHtml(option.hint)}</small>` : ''}
                </span>
              </label>
            `;
          })
          .join('')}
      </span>
    `
  });
}
