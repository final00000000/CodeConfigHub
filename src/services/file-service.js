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

async function assertNotSymbolicLink(targetPath) {
  if (!(await pathExists(targetPath))) {
    return;
  }

  const stats = await fs.lstat(targetPath);
  if (stats.isSymbolicLink()) {
    throw new Error('禁止写入符号链接目标文件。');
  }
}

async function backupFile(targetPath) {
  if (!(await pathExists(targetPath))) {
    return null;
  }

  await assertNotSymbolicLink(targetPath);
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
  await assertNotSymbolicLink(filePath);
  const backupPath = await backupFile(filePath);
  const nextContent = String(content ?? '');
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const tempHandle = await fs.open(tempPath, 'w');

  try {
    await tempHandle.writeFile(nextContent, 'utf8');
    await tempHandle.sync();
  } finally {
    await tempHandle.close();
  }

  await assertNotSymbolicLink(filePath);

  try {
    await fs.rename(tempPath, filePath);
  } catch (error) {
    if ((error?.code === 'EEXIST' || error?.code === 'EPERM') && await pathExists(filePath)) {
      await fs.rm(filePath, { force: true });
      await fs.rename(tempPath, filePath);
    } else {
      await fs.rm(tempPath, { force: true }).catch(() => {});
      throw error;
    }
  }

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
