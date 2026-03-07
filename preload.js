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
  }
};

contextBridge.exposeInMainWorld('codeConfigHubAPI', desktopApi);
contextBridge.exposeInMainWorld('configManagerAPI', desktopApi);
