let smolToml = null;

try {
  smolToml = require('smol-toml');
} catch {
  smolToml = null;
}

function parseToml(content) {
  if (!content || !content.trim()) {
    return {};
  }

  if (smolToml) {
    return smolToml.parse(content);
  }

  return parseFallbackToml(content);
}

function stringifyToml(value) {
  if (smolToml) {
    const serialized = smolToml.stringify(value);
    return serialized.endsWith('\n') ? serialized : `${serialized}\n`;
  }

  return stringifyFallbackToml(value);
}

function parseFallbackToml(content) {
  const document = {};
  let cursor = document;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = stripTomlComment(rawLine).trim();
    if (!line) {
      continue;
    }

    const tableMatch = line.match(/^\[(.+)]$/);
    if (tableMatch) {
      cursor = ensureObjectPath(document, tableMatch[1].split('.').map((part) => part.trim()));
      continue;
    }

    const pairMatch = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/);
    if (!pairMatch) {
      continue;
    }

    cursor[pairMatch[1]] = parseFallbackValue(pairMatch[2]);
  }

  return document;
}

function stripTomlComment(line) {
  let quoted = false;
  let quoteChar = null;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const previous = line[index - 1];

    if ((char === '"' || char === "'") && previous !== '\\') {
      if (!quoted) {
        quoted = true;
        quoteChar = char;
      } else if (quoteChar === char) {
        quoted = false;
        quoteChar = null;
      }
    }

    if (char === '#' && !quoted) {
      return line.slice(0, index);
    }
  }

  return line;
}

function ensureObjectPath(root, pathParts) {
  let cursor = root;
  for (const part of pathParts) {
    if (!cursor[part] || typeof cursor[part] !== 'object' || Array.isArray(cursor[part])) {
      cursor[part] = {};
    }
    cursor = cursor[part];
  }
  return cursor;
}

function parseFallbackValue(rawValue) {
  const value = rawValue.trim();

  if (value === 'true' || value === 'false') {
    return value === 'true';
  }

  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }

  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1).replace(/\\"/g, '"');
  }

  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim();
    if (!inner) {
      return [];
    }

    return splitTomlArray(inner).map(parseFallbackValue);
  }

  return value;
}

function splitTomlArray(value) {
  const items = [];
  let buffer = '';
  let quoted = false;
  let quoteChar = null;
  let depth = 0;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const previous = value[index - 1];

    if ((char === '"' || char === "'") && previous !== '\\') {
      if (!quoted) {
        quoted = true;
        quoteChar = char;
      } else if (quoteChar === char) {
        quoted = false;
        quoteChar = null;
      }
    }

    if (!quoted) {
      if (char === '[') {
        depth += 1;
      }

      if (char === ']') {
        depth -= 1;
      }
    }

    if (char === ',' && !quoted && depth === 0) {
      items.push(buffer.trim());
      buffer = '';
      continue;
    }

    buffer += char;
  }

  if (buffer.trim()) {
    items.push(buffer.trim());
  }

  return items;
}

function stringifyFallbackToml(value) {
  const rootLines = [];
  const sectionLines = [];

  function visit(node, pathParts = []) {
    const scalarLines = [];
    const nestedEntries = [];

    for (const [key, childValue] of Object.entries(node || {})) {
      if (childValue === undefined || childValue === null) {
        continue;
      }

      if (isPlainObject(childValue)) {
        nestedEntries.push([key, childValue]);
        continue;
      }

      scalarLines.push(`${key} = ${formatTomlValue(childValue)}`);
    }

    if (pathParts.length === 0) {
      rootLines.push(...scalarLines);
    } else if (scalarLines.length > 0) {
      sectionLines.push(`[${pathParts.join('.')}]`, ...scalarLines, '');
    }

    for (const [key, nestedValue] of nestedEntries) {
      visit(nestedValue, [...pathParts, key]);
    }
  }

  visit(value);

  const lines = [];
  if (rootLines.length > 0) {
    lines.push(...rootLines);
  }

  if (sectionLines.length > 0) {
    if (lines.length > 0) {
      lines.push('');
    }
    lines.push(...sectionLines);
  }

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function formatTomlValue(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => formatTomlValue(entry)).join(', ')}]`;
  }

  if (typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return JSON.stringify(value);
}

module.exports = {
  parseToml,
  stringifyToml
};
