const fs = require('fs/promises');
const path = require('path');
const { parseJson } = require('./json-service');
const { parseToml } = require('./toml-service');

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readTextFile(targetPath) {
  return fs.readFile(targetPath, 'utf8');
}

async function backupFile(targetPath) {
  if (!(await pathExists(targetPath))) {
    return null;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${targetPath}.${timestamp}.bak`;
  await fs.copyFile(targetPath, backupPath);
  return backupPath;
}

function validateContent(format, content) {
  if (format === 'json') {
    parseJson(content);
    return;
  }

  if (format === 'toml') {
    parseToml(content);
  }
}

async function saveConfigDocument(payload) {
  const { filePath, format, content } = payload;

  validateContent(format, content);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const backupPath = await backupFile(filePath);

  const normalizedContent = content.endsWith('\n') ? content : `${content}\n`;
  await fs.writeFile(filePath, normalizedContent, 'utf8');

  return {
    backupPath,
    filePath,
    savedAt: new Date().toISOString()
  };
}

module.exports = {
  backupFile,
  pathExists,
  readTextFile,
  saveConfigDocument
};
