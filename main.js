const path = require('path');
const { pathToFileURL } = require('url');
const fs = require('fs/promises');
const { app, BrowserWindow, clipboard, dialog, ipcMain, screen, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const { discoverConfigFiles } = require('./src/services/config-discovery');
const { getCodexOfficialSchema } = require('./src/services/codex-schema-service');
const { getClaudeOfficialSchema } = require('./src/services/claude-schema-service');
const { saveConfigDocument } = require('./src/services/file-service');

let mainWindow;
let appEntryUrl = '';
let allowedConfigPaths = new Map();
let hasDownloadedUpdate = false;
let updateCheckSequence = 0;
let activeUpdateCheckId = 0;
let currentUpdateFlowCheckId = 0;
let isCheckingForUpdates = false;

const ALLOWED_EXTERNAL_URLS = new Set([
  'https://github.com/final00000000/CodeConfigHub'
]);



const WINDOW_MIN_WIDTH = 1180;
const WINDOW_MIN_HEIGHT = 760;

function getInitialWindowSize() {
  const fallback = { width: 1520, height: 960 };

  try {
    const cursorPoint = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursorPoint);
    const workAreaSize = display?.workAreaSize || display?.size;
    if (!workAreaSize) {
      return fallback;
    }

    const maxWidth = Math.max(960, workAreaSize.width);
    const maxHeight = Math.max(640, workAreaSize.height);
    const preferredWidth = Math.floor(workAreaSize.width * 0.8);
    const preferredHeight = Math.floor(workAreaSize.height * 0.8);

    return {
      width: Math.min(maxWidth, Math.max(Math.min(WINDOW_MIN_WIDTH, maxWidth), preferredWidth)),
      height: Math.min(maxHeight, Math.max(Math.min(WINDOW_MIN_HEIGHT, maxHeight), preferredHeight))
    };
  } catch {
    return fallback;
  }
}

function serializeUpdaterError(error) {
  const payload = {
    message: error instanceof Error ? error.message : String(error),
    name: error instanceof Error ? error.name : undefined,
    stack: error instanceof Error ? error.stack : undefined
  };

  if (error && typeof error === 'object') {
    for (const key of ['code', 'statusCode', 'status', 'url']) {
      if (error[key] !== undefined && error[key] !== null) {
        payload[key] = error[key];
      }
    }
  }

  return payload;
}

function createWindow() {
  appEntryUrl = pathToFileURL(path.join(__dirname, 'src', 'index.html')).toString();
  const { width, height } = getInitialWindowSize();
  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: Math.min(WINDOW_MIN_WIDTH, width),
    minHeight: Math.min(WINDOW_MIN_HEIGHT, height),
    title: 'CodeConfigHub',
    backgroundColor: '#ffffff', // Set white background for avoid flash during light mode start
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.removeMenu(); // More aggressive than setMenuBarVisibility
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== appEntryUrl) {
      event.preventDefault();
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  mainWindow.loadURL(appEntryUrl);
}

function safeSendToRenderer(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send(channel, payload);
}

function resolveUpdateEventCheckId() {
  return currentUpdateFlowCheckId || activeUpdateCheckId || 0;
}

function sendUpdateEvent(channel, payload = {}, checkId = resolveUpdateEventCheckId()) {
  safeSendToRenderer(channel, {
    ...payload,
    checkId
  });
}

function isTrustedIpcEvent(event) {
  const senderUrl = event?.senderFrame?.url || event?.sender?.getURL?.() || '';
  return Boolean(mainWindow) && event?.sender === mainWindow.webContents && senderUrl === appEntryUrl;
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function resolveCanonicalParentPath(targetPath) {
  let currentPath = path.dirname(targetPath);

  while (true) {
    try {
      const stats = await fs.lstat(currentPath);
      if (stats.isSymbolicLink()) {
        throw new Error('Blocked path operation via symbolic-link parent directory.');
      }

      return await fs.realpath(currentPath);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        const parentPath = path.dirname(currentPath);
        if (parentPath === currentPath) {
          return path.resolve(currentPath);
        }
        currentPath = parentPath;
        continue;
      }

      throw error;
    }
  }
}

async function buildAllowedConfigPathMetadata(entry) {
  const resolvedPath = path.resolve(entry.path);
  const metadata = {
    resolvedPath,
    existsAtDiscovery: Boolean(entry.exists),
    canonicalPath: '',
    canonicalParentPath: '',
    blockedReason: ''
  };

  try {
    metadata.canonicalParentPath = await resolveCanonicalParentPath(resolvedPath);

    if (entry.exists) {
      const stats = await fs.lstat(resolvedPath);
      if (stats.isSymbolicLink()) {
        metadata.blockedReason = 'Blocked config target because it is a symbolic link.';
      } else {
        metadata.canonicalPath = await fs.realpath(resolvedPath);
      }
    }
  } catch (error) {
    metadata.blockedReason = error instanceof Error ? error.message : String(error);
  }

  return metadata;
}

async function refreshAllowedConfigPaths(entries = []) {
  const metadataList = await Promise.all(entries.map((entry) => buildAllowedConfigPathMetadata(entry)));
  allowedConfigPaths = new Map(metadataList.map((metadata) => [metadata.resolvedPath, metadata]));
}

async function refreshAllowedConfigPathMetadata(targetPath, { exists } = {}) {
  const resolvedPath = path.resolve(String(targetPath || ''));
  if (!allowedConfigPaths.has(resolvedPath)) {
    return null;
  }

  const metadata = await buildAllowedConfigPathMetadata({
    path: resolvedPath,
    exists: typeof exists === 'boolean' ? exists : await pathExists(resolvedPath)
  });
  allowedConfigPaths.set(resolvedPath, metadata);
  return metadata;
}

async function getAllowedConfigPathInfo(targetPath, { requireExists = false } = {}) {
  const resolvedPath = path.resolve(String(targetPath || ''));
  const metadata = allowedConfigPaths.get(resolvedPath);

  if (!metadata) {
    throw new Error('Blocked path operation outside discovered config targets.');
  }

  if (metadata.blockedReason) {
    throw new Error(metadata.blockedReason);
  }

  const currentCanonicalParentPath = await resolveCanonicalParentPath(resolvedPath);
  if (metadata.canonicalParentPath && currentCanonicalParentPath !== metadata.canonicalParentPath) {
    throw new Error('Blocked path operation because parent directory changed unexpectedly.');
  }

  const existsNow = await pathExists(resolvedPath);
  if (requireExists && !existsNow) {
    throw new Error('Target file does not exist.');
  }

  let currentCanonicalPath = '';
  if (existsNow) {
    const stats = await fs.lstat(resolvedPath);
    if (stats.isSymbolicLink()) {
      throw new Error('Blocked path operation via symbolic link.');
    }

    currentCanonicalPath = await fs.realpath(resolvedPath);
    if (metadata.canonicalPath && currentCanonicalPath !== metadata.canonicalPath) {
      throw new Error('Blocked path operation because target canonical path changed unexpectedly.');
    }
  }

  return {
    resolvedPath,
    metadata,
    existsNow,
    currentCanonicalPath,
    currentCanonicalParentPath
  };
}

function normalizeRevealRequest(request) {
  if (typeof request === 'string') {
    return {
      targetPath: request,
      allowMissingParentReveal: true
    };
  }

  if (request && typeof request === 'object') {
    return {
      targetPath: request.filePath || request.path || '',
      allowMissingParentReveal: request.allowMissingParentReveal !== false
    };
  }

  return {
    targetPath: '',
    allowMissingParentReveal: true
  };
}

async function revealAllowedConfigTarget(request) {
  const { targetPath, allowMissingParentReveal } = normalizeRevealRequest(request);
  if (!targetPath) {
    return { ok: false, reason: 'empty-path' };
  }

  const pathInfo = await getAllowedConfigPathInfo(targetPath);

  if (pathInfo.existsNow) {
    shell.showItemInFolder(pathInfo.resolvedPath);
    return {
      ok: true,
      strategy: 'file',
      requestedPath: pathInfo.resolvedPath,
      revealedPath: pathInfo.resolvedPath,
      targetExists: true
    };
  }

  if (!allowMissingParentReveal) {
    return {
      ok: false,
      reason: 'target-missing',
      requestedPath: pathInfo.resolvedPath,
      targetExists: false
    };
  }

  const openError = await shell.openPath(pathInfo.currentCanonicalParentPath);
  if (openError) {
    throw new Error(openError);
  }

  return {
    ok: true,
    strategy: 'parent-directory',
    requestedPath: pathInfo.resolvedPath,
    revealedPath: pathInfo.currentCanonicalParentPath,
    targetExists: false
  };
}

function registerIpcHandlers(channels, listener) {
  for (const channel of channels) {
    ipcMain.handle(channel, async (event, ...args) => {
      if (!isTrustedIpcEvent(event)) {
        throw new Error('Blocked unauthorized IPC sender.');
      }

      return listener(event, ...args);
    });
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

registerIpcHandlers(['code-config-hub:discover', 'config-manager:discover'], async (_event, projectPath) => {
  const result = await discoverConfigFiles(projectPath);
  await refreshAllowedConfigPaths(result.entries || []);
  return result;
});

registerIpcHandlers(['code-config-hub:get-codex-schema', 'config-manager:get-codex-schema'], async (_event, forceRefresh) => {
  return getCodexOfficialSchema({ forceRefresh: Boolean(forceRefresh) });
});

registerIpcHandlers(['code-config-hub:get-claude-schema', 'config-manager:get-claude-schema'], async (_event, forceRefresh) => {
  return getClaudeOfficialSchema({ forceRefresh: Boolean(forceRefresh) });
});

registerIpcHandlers(['code-config-hub:choose-project', 'config-manager:choose-project'], async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    title: '选择需要扫描的项目目录'
  });

  if (canceled || filePaths.length === 0) {
    return null;
  }

  return filePaths[0];
});

registerIpcHandlers(['code-config-hub:save', 'config-manager:save'], async (_event, payload) => {
  const pathInfo = await getAllowedConfigPathInfo(payload?.filePath);
  const result = await saveConfigDocument({
    ...payload,
    filePath: pathInfo.resolvedPath
  });
  await refreshAllowedConfigPathMetadata(pathInfo.resolvedPath, { exists: true });
  return result;
});

registerIpcHandlers(['code-config-hub:copy-text', 'config-manager:copy-text'], async (_event, text) => {
  clipboard.writeText(text || '');
  return { ok: true };
});

registerIpcHandlers(['code-config-hub:reveal-file', 'config-manager:reveal-file'], async (_event, filePath) => {
  return revealAllowedConfigTarget(filePath);
});

registerIpcHandlers(['code-config-hub:get-version', 'config-manager:get-version'], async () => {
  return app.getVersion();
});

registerIpcHandlers(['code-config-hub:open-external', 'config-manager:open-external'], async (_event, url) => {
  if (!url) {
    return { ok: false, reason: 'empty-url' };
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return { ok: false, reason: 'invalid-url' };
  }

  const normalizedUrl = parsedUrl.toString().replace(/\/$/, '');

  if (parsedUrl.protocol !== 'https:' || !ALLOWED_EXTERNAL_URLS.has(normalizedUrl)) {
    return { ok: false, reason: 'unsupported-protocol' };
  }

  await shell.openExternal(normalizedUrl);
  return { ok: true };
});

// --- Auto Updater Logic ---

autoUpdater.autoDownload = false; // We want manual trigger from UI

autoUpdater.on('update-available', (info) => {
  hasDownloadedUpdate = false;
  currentUpdateFlowCheckId = activeUpdateCheckId || currentUpdateFlowCheckId;
  isCheckingForUpdates = false;
  sendUpdateEvent('update:available', info, currentUpdateFlowCheckId);
  activeUpdateCheckId = 0;
});

autoUpdater.on('update-not-available', (info) => {
  hasDownloadedUpdate = false;
  const checkId = activeUpdateCheckId || currentUpdateFlowCheckId;
  isCheckingForUpdates = false;
  activeUpdateCheckId = 0;
  currentUpdateFlowCheckId = 0;
  sendUpdateEvent('update:not-available', info, checkId);
});

autoUpdater.on('download-progress', (progress) => {
  sendUpdateEvent('update:download-progress', progress, currentUpdateFlowCheckId);
});

autoUpdater.on('update-downloaded', (info) => {
  hasDownloadedUpdate = true;
  sendUpdateEvent('update:downloaded', info, currentUpdateFlowCheckId);
});

autoUpdater.on('error', (err) => {
  hasDownloadedUpdate = false;
  isCheckingForUpdates = false;
  const payload = serializeUpdaterError(err);
  console.error('Updater error:', payload);
  const checkId = activeUpdateCheckId || currentUpdateFlowCheckId;
  activeUpdateCheckId = 0;
  currentUpdateFlowCheckId = 0;
  sendUpdateEvent('update:error', payload, checkId);
});

registerIpcHandlers(['update:check'], async () => {
  if (!app.isPackaged) {
    return {
      ok: true,
      skipped: true,
      reason: 'unpackaged',
      message: '当前是未打包开发环境，已跳过真实更新检查。'
    };
  }

  if (isCheckingForUpdates) {
    return {
      ok: false,
      skipped: true,
      reason: 'check-in-progress',
      checkId: activeUpdateCheckId,
      message: '上一轮更新检查仍在进行中，请稍候。'
    };
  }

  hasDownloadedUpdate = false;
  currentUpdateFlowCheckId = 0;
  activeUpdateCheckId = updateCheckSequence + 1;
  updateCheckSequence = activeUpdateCheckId;
  isCheckingForUpdates = true;

  autoUpdater.checkForUpdates().catch((error) => {
    hasDownloadedUpdate = false;
    isCheckingForUpdates = false;
    const payload = serializeUpdaterError(error);
    console.error('Updater check failed:', payload);
    const checkId = activeUpdateCheckId || currentUpdateFlowCheckId;
    activeUpdateCheckId = 0;
    currentUpdateFlowCheckId = 0;
    sendUpdateEvent('update:error', payload, checkId);
  });

  return {
    ok: true,
    started: true,
    checkId: activeUpdateCheckId
  };
});

registerIpcHandlers(['update:download'], async () => {
  return autoUpdater.downloadUpdate();
});

registerIpcHandlers(['update:install-and-restart'], async () => {
  if (!hasDownloadedUpdate) {
    return { ok: false, reason: 'update-not-downloaded' };
  }

  autoUpdater.quitAndInstall();
  return { ok: true };
});

