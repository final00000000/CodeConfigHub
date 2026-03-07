function parseJson(content) {
  if (!content || !content.trim()) {
    return {};
  }

  return JSON.parse(content);
}

function stringifyJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

module.exports = {
  parseJson,
  stringifyJson
};
