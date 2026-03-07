const path = require('path');
const { app, BrowserWindow, clipboard, dialog, ipcMain, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const { discoverConfigFiles } = require('./src/services/config-discovery');
const { saveConfigDocument } = require('./src/services/file-service');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1520,
    height: 960,
    minWidth: 1180,
    minHeight: 760,
    title: 'CodeConfigHub',
    backgroundColor: '#ffffff', // Set white background for avoid flash during light mode start
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.removeMenu(); // More aggressive than setMenuBarVisibility
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
}

function registerIpcHandlers(channels, listener) {
  for (const channel of channels) {
    ipcMain.handle(channel, listener);
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
  return discoverConfigFiles(projectPath);
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
  return saveConfigDocument(payload);
});

registerIpcHandlers(['code-config-hub:copy-text', 'config-manager:copy-text'], async (_event, text) => {
  clipboard.writeText(text || '');
  return { ok: true };
});

registerIpcHandlers(['code-config-hub:reveal-file', 'config-manager:reveal-file'], async (_event, filePath) => {
  if (!filePath) {
    return { ok: false };
  }

  shell.showItemInFolder(filePath);
  return { ok: true };
});

registerIpcHandlers(['code-config-hub:get-version', 'config-manager:get-version'], async () => {
  return app.getVersion();
});

registerIpcHandlers(['code-config-hub:open-external', 'config-manager:open-external'], async (_event, url) => {
  if (url) {
    shell.openExternal(url);
  }
});

// --- Auto Updater Logic ---

autoUpdater.autoDownload = false; // We want manual trigger from UI

autoUpdater.on('update-available', (info) => {
  mainWindow.webContents.send('update:available', info);
});

autoUpdater.on('update-not-available', (info) => {
  mainWindow.webContents.send('update:not-available', info);
});

autoUpdater.on('download-progress', (progress) => {
  mainWindow.webContents.send('update:download-progress', progress);
});

autoUpdater.on('update-downloaded', (info) => {
  mainWindow.webContents.send('update:downloaded', info);
});

autoUpdater.on('error', (err) => {
  mainWindow.webContents.send('update:error', err.message);
});

registerIpcHandlers(['update:check'], async () => {
  return autoUpdater.checkForUpdates();
});

registerIpcHandlers(['update:download'], async () => {
  return autoUpdater.downloadUpdate();
});

registerIpcHandlers(['update:install-and-restart'], async () => {
  autoUpdater.quitAndInstall();
});

