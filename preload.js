const { contextBridge, ipcRenderer } = require('electron');

const UPDATE_STATUS_CHANNELS = [
  'update:available',
  'update:not-available',
  'update:download-progress',
  'update:downloaded',
  'update:error'
];

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
  getClaudeOfficialSchema(forceRefresh) {
    return invokeWithFallback('code-config-hub:get-claude-schema', 'config-manager:get-claude-schema', forceRefresh);
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
  onUpdateStatus(callback, options = {}) {
    if (typeof callback !== 'function') {
      return () => {};
    }

    let disposed = false;
    const listeners = UPDATE_STATUS_CHANNELS.map((channel) => {
      const listener = (_event, data) => callback(channel, data);
      ipcRenderer.on(channel, listener);
      return { channel, listener };
    });

    const dispose = () => {
      if (disposed) {
        return;
      }

      disposed = true;
      listeners.forEach(({ channel, listener }) => {
        ipcRenderer.removeListener(channel, listener);
      });

      if (options.signal && typeof options.signal.removeEventListener === 'function') {
        options.signal.removeEventListener('abort', dispose);
      }
    };

    if (options.signal && typeof options.signal.addEventListener === 'function') {
      if (options.signal.aborted) {
        dispose();
      } else {
        options.signal.addEventListener('abort', dispose, { once: true });
      }
    }

    return dispose;
  }
};

contextBridge.exposeInMainWorld('codeConfigHubAPI', desktopApi);
contextBridge.exposeInMainWorld('configManagerAPI', desktopApi);
