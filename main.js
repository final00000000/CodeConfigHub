const path = require('path');
const { app, BrowserWindow, clipboard, dialog, ipcMain, shell } = require('electron');
const { discoverConfigFiles } = require('./src/services/config-discovery');
const { saveConfigDocument } = require('./src/services/file-service');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1520,
    height: 960,
    minWidth: 1180,
    minHeight: 760,
    title: 'CodeConfigHub',
    backgroundColor: '#09111a',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

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
