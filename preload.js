const { contextBridge, ipcRenderer } = require('electron');

function isMissingHandlerError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /No handler registered/i.test(message);
}

async function invokeWithFallback(primaryChannel, legacyChannel, ...args) {
  try {
    return await ipcRenderer.invoke(primaryChannel, ...args);
  } catch (error) {
    if (!legacyChannel || !isMissingHandlerError(error)) {
      throw error;
    }

    return ipcRenderer.invoke(legacyChannel, ...args);
  }
}

const desktopApi = {
  discoverConfigs(projectPath) {
    return invokeWithFallback('code-config-hub:discover', 'config-manager:discover', projectPath);
  },
  getCodexOfficialSchema(forceRefresh) {
    return invokeWithFallback('code-config-hub:get-codex-schema', 'config-manager:get-codex-schema', forceRefresh);
  },
  chooseProjectDirectory() {
    return invokeWithFallback('code-config-hub:choose-project', 'config-manager:choose-project');
  },
  saveConfig(payload) {
    return invokeWithFallback('code-config-hub:save', 'config-manager:save', payload);
  },
  copyText(text) {
    return invokeWithFallback('code-config-hub:copy-text', 'config-manager:copy-text', text);
  },
  revealFile(filePath) {
    return invokeWithFallback('code-config-hub:reveal-file', 'config-manager:reveal-file', filePath);
  },
  getVersion() {
    return invokeWithFallback('code-config-hub:get-version', 'config-manager:get-version');
  },
  openExternal(url) {
    return invokeWithFallback('code-config-hub:open-external', 'config-manager:open-external', url);
  },
  // Update methods
  checkUpdate() {
    return ipcRenderer.invoke('update:check');
  },
  downloadUpdate() {
    return ipcRenderer.invoke('update:download');
  },
  installUpdate() {
    return ipcRenderer.invoke('update:install-and-restart');
  },
  onUpdateStatus(callback) {
    const channels = ['update:available', 'update:not-available', 'update:download-progress', 'update:downloaded', 'update:error'];
    channels.forEach(channel => {
      ipcRenderer.on(channel, (event, data) => callback(channel, data));
    });
  }
};

contextBridge.exposeInMainWorld('codeConfigHubAPI', desktopApi);
contextBridge.exposeInMainWorld('configManagerAPI', desktopApi);
