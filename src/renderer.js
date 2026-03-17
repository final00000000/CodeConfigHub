import { escapeHtml } from './components/form-controls.js';
import { getThemeToggleMeta, renderSidebar } from './components/sidebar.js';
import { initializeToast, showToast } from './components/toast.js';
import { renderCodePreview } from './editors/code-preview.js';
import { renderSchemaDrivenEditor } from './editors/schema-driven-editor.js';
import { createTextDraft, renderTextEditor, serializeTextDraft } from './editors/text-editor.js';
import { createSchemaDrivenDraft, serializeSchemaDrivenDraft } from './services/schema-driven-config.js';

const state = {
  entries: [],
  selectedId: null,
  draft: null,
  dirty: false,
  projectPath: '',
  previewMode: 'hidden',
  splitRatio: 64,
  codexOfficialSchema: null,
  claudeOfficialSchema: null,
  schemaRefreshAssistant: null,
  schemaAutoRefreshIntervalMs: 0,
  appVersion: '',
  previewSearchByEntry: {}
};

const elements = {};
const REPOSITORY_URL = 'https://github.com/final00000000/CodeConfigHub';
const SPLIT_RATIO_MIN = 32;
const SPLIT_RATIO_MAX = 78;
const SPLIT_RATIO_STEP = 4;
const SCHEMA_AUTO_REFRESH_STORAGE_KEY = 'schema-auto-refresh-interval-ms';
const SCHEMA_AUTO_REFRESH_OPTIONS = [
  { value: 0, label: '手动' },
  { value: 12 * 60 * 60 * 1000, label: '12 小时' },
  { value: 24 * 60 * 60 * 1000, label: '1 天' },
  { value: 3 * 24 * 60 * 60 * 1000, label: '3 天' },
  { value: 5 * 24 * 60 * 60 * 1000, label: '5 天' }
];

let pendingPreviewTimer = null;
let lastUpdateErrorFingerprint = '';
let lastUpdateErrorAt = 0;
let pendingManualUpdateFeedbackTimer = null;
let isUpdateDownloadPending = false;
let manualUpdateRequestSequence = 0;
let activeManualUpdateRequestId = 0;
let lastTimedOutManualUpdateRequestId = 0;
let updateInteractionPhase = 'idle';
let isComposingInput = false;
let hasBoundGlobalUiHandlers = false;
let lastFocusedElementBeforeUpdateModal = null;
let schemaAutoRefreshTimer = null;
let isSchemaAutoRefreshRunning = false;

function getDesktopApi() {
  return window.codeConfigHubAPI || window.configManagerAPI;
}

function normalizeSchemaAutoRefreshInterval(value) {
  const parsed = Number(value);
  return SCHEMA_AUTO_REFRESH_OPTIONS.some((option) => option.value === parsed) ? parsed : 0;
}

function getSchemaAutoRefreshLabel(intervalMs = 0) {
  return SCHEMA_AUTO_REFRESH_OPTIONS.find((option) => option.value === intervalMs)?.label || '手动';
}

function syncSchemaAutoRefreshControl() {
  if (!(elements.schemaAutoRefreshSelect instanceof HTMLSelectElement)) {
    return;
  }

  elements.schemaAutoRefreshSelect.value = String(state.schemaAutoRefreshIntervalMs || 0);
}

function restoreSchemaAutoRefreshSetting() {
  state.schemaAutoRefreshIntervalMs = normalizeSchemaAutoRefreshInterval(
    window.localStorage.getItem(SCHEMA_AUTO_REFRESH_STORAGE_KEY) || 0
  );
  syncSchemaAutoRefreshControl();
}

function clearSchemaAutoRefreshTimer() {
  if (schemaAutoRefreshTimer) {
    window.clearInterval(schemaAutoRefreshTimer);
    schemaAutoRefreshTimer = null;
  }
}

function shouldDeferSchemaAutoRefresh() {
  const activeElement = document.activeElement;
  return Boolean(
    state.dirty
    || isComposingInput
    || state.schemaRefreshAssistant
    || isUpdateDownloadPending
    || (
      activeElement instanceof HTMLElement
      && (
        elements.editorPanel?.contains(activeElement)
        || elements.updateModalRoot?.contains(activeElement)
      )
    )
  );
}

async function runSchemaAutoRefreshCycle() {
  if (isSchemaAutoRefreshRunning || !state.schemaAutoRefreshIntervalMs || shouldDeferSchemaAutoRefresh()) {
    return;
  }

  isSchemaAutoRefreshRunning = true;
  try {
    await Promise.all([
      loadOfficialSchema('codex', true, { silent: true, showProgress: false }),
      loadOfficialSchema('claude', true, { silent: true, showProgress: false })
    ]);
  } finally {
    isSchemaAutoRefreshRunning = false;
  }
}

function scheduleSchemaAutoRefresh() {
  clearSchemaAutoRefreshTimer();

  if (!state.schemaAutoRefreshIntervalMs) {
    return;
  }

  schemaAutoRefreshTimer = window.setInterval(() => {
    runSchemaAutoRefreshCycle().catch((error) => {
      console.warn('Schema auto refresh failed:', error);
    });
  }, state.schemaAutoRefreshIntervalMs);
}

function updateSchemaAutoRefreshSetting(nextIntervalValue) {
  const nextIntervalMs = normalizeSchemaAutoRefreshInterval(nextIntervalValue);
  state.schemaAutoRefreshIntervalMs = nextIntervalMs;
  window.localStorage.setItem(SCHEMA_AUTO_REFRESH_STORAGE_KEY, String(nextIntervalMs));
  syncSchemaAutoRefreshControl();
  scheduleSchemaAutoRefresh();

  if (nextIntervalMs > 0) {
    runSchemaAutoRefreshCycle().catch((error) => {
      console.warn('Schema auto refresh failed:', error);
    });
  }

  showToast({
    title: 'Schema 自动拉取已更新',
    message: nextIntervalMs > 0
      ? `已开启后台自动拉取：每 ${getSchemaAutoRefreshLabel(nextIntervalMs)} 同步一次。`
      : '已关闭后台自动拉取，后续仅在手动刷新时同步。',
    tone: 'success'
  });
}

function stringifyUpdateError(payload) {
  if (!payload) {
    return '';
  }

  if (typeof payload === 'string') {
    return payload;
  }

  if (payload instanceof Error) {
    return `${payload.name || 'Error'}: ${payload.message || ''} ${payload.stack || ''}`.trim();
  }

  if (typeof payload === 'object') {
    const parts = [];
    for (const key of ['name', 'message', 'code', 'statusCode', 'status', 'url']) {
      if (payload[key]) {
        parts.push(`${key}=${payload[key]}`);
      }
    }

    if (parts.length > 0) {
      return parts.join(' | ');
    }

    try {
      return JSON.stringify(payload);
    } catch {
      return String(payload);
    }
  }

  return String(payload);
}

function getUpdateErrorPresentation(payload) {
  const rawText = stringifyUpdateError(payload);
  const normalizedText = rawText.toLowerCase();

  if (
    /\b404\b/.test(normalizedText) ||
    normalizedText.includes('not found') ||
    normalizedText.includes('status code 404')
  ) {
    return {
      fingerprint: 'update-404',
      title: '更新资源异常',
      message: '更新服务器返回 404。通常是 Release 资源名或 latest.yml 配置不一致，不是单纯网络问题。'
    };
  }

  if (normalizedText.includes('latest.yml')) {
    return {
      fingerprint: 'update-latest-yml',
      title: '更新元数据异常',
      message: '无法读取更新元数据 `latest.yml`。请检查当前 Release 是否已正确上传更新描述文件。'
    };
  }

  if (
    /econnrefused|enotfound|eai_again|etimedout|timed out|internet disconnected|network|socket hang up|net::err_|certificate|proxy/.test(normalizedText)
  ) {
    return {
      fingerprint: 'update-network',
      title: '网络连接失败',
      message: '无法连接 GitHub 更新服务。请检查网络、代理、证书或防火墙配置。'
    };
  }

  return {
    fingerprint: rawText || 'update-unknown',
    title: '检查失败',
    message: payload?.message || rawText || '更新检查失败，请稍后重试。'
  };
}

function showUpdateErrorToast(payload) {
  const presentation = getUpdateErrorPresentation(payload);
  const now = Date.now();

  if (presentation.fingerprint === lastUpdateErrorFingerprint && now - lastUpdateErrorAt < 1800) {
    return;
  }

  lastUpdateErrorFingerprint = presentation.fingerprint;
  lastUpdateErrorAt = now;
  showToast({ title: presentation.title, message: presentation.message, tone: 'danger' });
}

function closeUpdateModal() {
  const modalRoot = elements.updateModalRoot || document.getElementById('update-modal-root');
  if (!modalRoot) {
    return;
  }

  modalRoot.classList.remove('is-visible');
  modalRoot.setAttribute('aria-hidden', 'true');
  modalRoot.innerHTML = '';

  if (
    lastFocusedElementBeforeUpdateModal instanceof HTMLElement &&
    lastFocusedElementBeforeUpdateModal.isConnected &&
    typeof lastFocusedElementBeforeUpdateModal.focus === 'function'
  ) {
    lastFocusedElementBeforeUpdateModal.focus({ preventScroll: true });
  }

  lastFocusedElementBeforeUpdateModal = null;
}

function getUpdateModalFocusableElements(modalRoot = elements.updateModalRoot) {
  if (!modalRoot) {
    return [];
  }

  return [...modalRoot.querySelectorAll(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )].filter((node) => node instanceof HTMLElement && !node.hasAttribute('hidden'));
}

function showUpdateModal(content) {
  const modalRoot = elements.updateModalRoot || document.getElementById('update-modal-root');
  if (!modalRoot) {
    return;
  }

  if (!modalRoot.classList.contains('is-visible')) {
    lastFocusedElementBeforeUpdateModal = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  }

  modalRoot.innerHTML = `<div class="update-modal" role="dialog" aria-modal="true" tabindex="-1">${content}</div>`;
  modalRoot.classList.add('is-visible');
  modalRoot.setAttribute('aria-hidden', 'false');

  const modal = modalRoot.querySelector('.update-modal');
  const heading = modal?.querySelector('h2');
  if (heading) {
    if (!heading.id) {
      heading.id = 'update-modal-title';
    }
    modal?.setAttribute('aria-labelledby', heading.id);
  }

  const description = modal?.querySelector('p');
  if (description) {
    if (!description.id) {
      description.id = 'update-modal-description';
    }
    modal?.setAttribute('aria-describedby', description.id);
  }

  const focusTarget = getUpdateModalFocusableElements(modalRoot)[0] || modal;
  focusTarget?.focus({ preventScroll: true });
}

function clearManualUpdateFeedbackTimer() {
  if (pendingManualUpdateFeedbackTimer) {
    window.clearTimeout(pendingManualUpdateFeedbackTimer);
    pendingManualUpdateFeedbackTimer = null;
  }
}

function armManualUpdateFeedbackTimer(requestId) {
  clearManualUpdateFeedbackTimer();
  pendingManualUpdateFeedbackTimer = window.setTimeout(() => {
    if (!isManualUpdateCheck || requestId !== activeManualUpdateRequestId) {
      return;
    }

    stopUpdateButtonLoading();
    showToast({
      title: '检查更新超时',
      message: '本轮检查耗时较长，后台仍可能继续；在结果返回前不会接受新的手动检查。',
      tone: 'danger'
    });
    lastTimedOutManualUpdateRequestId = requestId;
    syncUpdateButtonState();
  }, 8000);
}

function beginManualUpdateCheck() {
  const requestId = manualUpdateRequestSequence + 1;
  manualUpdateRequestSequence = requestId;
  activeManualUpdateRequestId = 0;
  lastTimedOutManualUpdateRequestId = 0;
  isManualUpdateCheck = true;
  return requestId;
}

function finishManualUpdateCheck(requestId) {
  if (!requestId || requestId !== activeManualUpdateRequestId) {
    return false;
  }

  clearManualUpdateFeedbackTimer();
  activeManualUpdateRequestId = 0;
  lastTimedOutManualUpdateRequestId = 0;
  isManualUpdateCheck = false;
  return true;
}

function resetManualUpdateCheck() {
  clearManualUpdateFeedbackTimer();
  activeManualUpdateRequestId = 0;
  lastTimedOutManualUpdateRequestId = 0;
  isManualUpdateCheck = false;
}

function capturePreviewRenderState() {
  const codeBlock = elements.previewPanel?.querySelector('.code-block');
  const findInput = elements.previewPanel?.querySelector('[data-role="find-input"]');
  const activeElement = document.activeElement;

  return {
    entryId: elements.previewPanel?.dataset.entryId || '',
    scrollTop: codeBlock?.scrollTop || 0,
    findInput: activeElement === findInput
      ? {
        selectionStart: typeof activeElement.selectionStart === 'number' ? activeElement.selectionStart : null,
        selectionEnd: typeof activeElement.selectionEnd === 'number' ? activeElement.selectionEnd : null
      }
      : null
  };
}

function restorePreviewRenderState(snapshot) {
  if (!snapshot) {
    return;
  }

  const currentEntryId = elements.previewPanel?.dataset.entryId || '';
  if (snapshot.entryId && currentEntryId && snapshot.entryId !== currentEntryId) {
    return;
  }

  const codeBlock = elements.previewPanel?.querySelector('.code-block');
  if (codeBlock) {
    codeBlock.scrollTop = snapshot.scrollTop || 0;
  }

  const findInput = elements.previewPanel?.querySelector('[data-role="find-input"]');
  if (findInput && snapshot.findInput) {
    findInput.focus({ preventScroll: true });

    if (
      typeof snapshot.findInput.selectionStart === 'number' &&
      typeof snapshot.findInput.selectionEnd === 'number' &&
      typeof findInput.setSelectionRange === 'function'
    ) {
      findInput.setSelectionRange(snapshot.findInput.selectionStart, snapshot.findInput.selectionEnd);
    }
  }
}

function getIncomingUpdateCheckId(payload) {
  return Number.isInteger(payload?.checkId) ? payload.checkId : 0;
}

function schedulePreviewRender({ immediate = false } = {}) {
  if (pendingPreviewTimer) {
    window.clearTimeout(pendingPreviewTimer);
    pendingPreviewTimer = null;
  }

  if (!shouldShowPreview()) {
    return;
  }

  if (immediate) {
    const previewSnapshot = capturePreviewRenderState();
    renderPreview();
    restorePreviewRenderState(previewSnapshot);
    return;
  }

  pendingPreviewTimer = window.setTimeout(() => {
    pendingPreviewTimer = null;
    if (!shouldShowPreview()) {
      return;
    }

    const previewSnapshot = capturePreviewRenderState();
    renderPreview();
    restorePreviewRenderState(previewSnapshot);
  }, 120);
}

function confirmDiscardUnsavedChanges(message = '当前文件有未保存修改，继续后将丢失这些更改。是否继续？') {
  return !state.dirty || window.confirm(message);
}

window.addEventListener('DOMContentLoaded', async () => {
  cacheElements();
  bindGlobalUiHandlers();
  initializeToast(elements.toastRoot);
  restoreTheme();
  restoreSchemaAutoRefreshSetting();
  bindTopbarActions();
  bindSplitter();
  await loadAppVersion();
  await discoverConfigs();
  await Promise.all([
    loadCodexOfficialSchema(true, { silent: true }),
    loadClaudeOfficialSchema(true, { silent: true })
  ]);
  scheduleSchemaAutoRefresh();

  // Initialize update listener ONCE
  initUpdateListener();

  // Auto check on start (silent)
  checkForUpdates(false);
});

function initUpdateListener() {
  const api = getDesktopApi();
  const modalRoot = elements.updateModalRoot || document.getElementById('update-modal-root');
  if (!api || !modalRoot) return;

  modalRoot.setAttribute('aria-hidden', 'true');

  modalRoot.addEventListener('keydown', (event) => {
    if (!modalRoot.classList.contains('is-visible')) {
      return;
    }

    if ((event.key === 'Escape' || event.key === 'Esc') && !event.isComposing && !isComposingInput) {
      if (modalRoot.querySelector('[data-update-action="dismiss"]')) {
        event.preventDefault();
        closeUpdateModal();
      }
      return;
    }

    if (event.key !== 'Tab') {
      return;
    }

    const focusableElements = getUpdateModalFocusableElements(modalRoot);
    const modal = modalRoot.querySelector('.update-modal');
    if (!focusableElements.length) {
      event.preventDefault();
      modal?.focus({ preventScroll: true });
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement;

    if (event.shiftKey) {
      if (activeElement === firstElement || activeElement === modalRoot) {
        event.preventDefault();
        lastElement.focus({ preventScroll: true });
      }
      return;
    }

    if (activeElement === lastElement || activeElement === modal) {
      event.preventDefault();
      firstElement.focus({ preventScroll: true });
    }
  });

  modalRoot.addEventListener('click', async (event) => {
    if (event.target === modalRoot && modalRoot.querySelector('[data-update-action="dismiss"]')) {
      closeUpdateModal();
      return;
    }

    const actionButton = event.target.closest('[data-update-action]');
    if (!actionButton) {
      return;
    }

    const action = actionButton.getAttribute('data-update-action');
    if (action === 'dismiss') {
      closeUpdateModal();
      return;
    }

    if (action === 'download') {
      if (isUpdateDownloadPending) {
        return;
      }

      isUpdateDownloadPending = true;
      updateInteractionPhase = 'downloading';
      actionButton.disabled = true;
      actionButton.classList.add('is-loading');
      try {
        await api.downloadUpdate();
      } catch (error) {
        isUpdateDownloadPending = false;
        updateInteractionPhase = 'available';
        actionButton.disabled = false;
        actionButton.classList.remove('is-loading');
        showToast({
          title: '下载更新失败',
          message: error instanceof Error ? error.message : String(error),
          tone: 'danger'
        });
      }
      return;
    }

    if (action === 'install') {
      if (!confirmDiscardUnsavedChanges('安装更新会重启应用，未保存的改动将丢失。是否继续？')) {
        return;
      }

      updateInteractionPhase = 'installing';
      try {
        const result = await api.installUpdate();
        if (result?.ok === false) {
          updateInteractionPhase = 'ready';
          showToast({
            title: '暂时无法安装更新',
            message: result.reason === 'update-not-downloaded' ? '更新包尚未下载完成，请稍后重试。' : '安装条件未满足。',
            tone: 'danger'
          });
        }
      } catch (error) {
        updateInteractionPhase = 'ready';
        showToast({
          title: '安装更新失败',
          message: error instanceof Error ? error.message : String(error),
          tone: 'danger'
        });
      }
    }
  });

  api.onUpdateStatus(async (channel, data) => {
    const incomingCheckId = getIncomingUpdateCheckId(data);
    if (activeManualUpdateRequestId && incomingCheckId && incomingCheckId !== activeManualUpdateRequestId) {
      return;
    }

    switch (channel) {
      case 'update:available':
        isUpdateDownloadPending = false;
        updateInteractionPhase = 'available';
        clearManualUpdateFeedbackTimer();
        stopUpdateButtonLoading();
        if (isManualUpdateCheck && activeManualUpdateRequestId) {
          finishManualUpdateCheck(activeManualUpdateRequestId);
        }
        showUpdateModal(`
          <h2>✨ 发现新版本</h2>
          <p>全新版本的 CodeConfigHub (${escapeHtml(data.version)}) 已经发布。是否立即更新？</p>
          <div class="update-modal-actions">
            <button class="ghost-button" type="button" data-update-action="dismiss">以后再说</button>
            <button class="primary-button" type="button" data-update-action="download">立即更新</button>
          </div>
        `);
        syncUpdateButtonState();
        break;

      case 'update:not-available':
        isUpdateDownloadPending = false;
        updateInteractionPhase = 'idle';
        clearManualUpdateFeedbackTimer();
        stopUpdateButtonLoading();
        if (isManualUpdateCheck && activeManualUpdateRequestId) {
          finishManualUpdateCheck(activeManualUpdateRequestId);
          showToast({ title: '✅ 已是最新', message: '当前应用已是最新发布状态。', tone: 'success' });
        }
        syncUpdateButtonState();
        break;

      case 'update:download-progress': {
        clearManualUpdateFeedbackTimer();
        isUpdateDownloadPending = true;
        updateInteractionPhase = 'downloading';
        const percent = Math.floor(data.percent || 0);
        showUpdateModal(`
          <h2>🚀 正在下载更新</h2>
          <p>请稍候，我们正在为你准备最新版本的组件...</p>
          <div class="update-progress-container">
            <div class="update-progress-bar" style="width: ${percent}%"></div>
          </div>
          <p style="text-align: right; font-size: 0.85rem;">${percent}%</p>
        `);
        syncUpdateButtonState();
        break;
      }

      case 'update:downloaded':
        isUpdateDownloadPending = false;
        updateInteractionPhase = 'ready';
        showUpdateModal(`
          <h2>🎉 更新已就绪</h2>
          <p>最新版本已经下载完成。点击下方按钮将立即重启应用并完成安装。</p>
          <div class="update-modal-actions">
            <button class="primary-button" type="button" data-update-action="install">立即重启并安装</button>
          </div>
        `);
        syncUpdateButtonState();
        break;

      case 'update:error':
        isUpdateDownloadPending = false;
        clearManualUpdateFeedbackTimer();
        stopUpdateButtonLoading();
        console.warn('Updater Error:', data);
        closeUpdateModal();
        if (updateInteractionPhase === 'downloading') {
          showToast({
            title: '下载更新失败',
            message: data?.message || '更新包下载失败，请稍后重试。',
            tone: 'danger'
          });
          updateInteractionPhase = 'available';
          syncUpdateButtonState();
          break;
        }

        if (updateInteractionPhase === 'installing') {
          showToast({
            title: '安装更新失败',
            message: data?.message || '更新安装失败，请稍后重试。',
            tone: 'danger'
          });
          updateInteractionPhase = 'ready';
          syncUpdateButtonState();
          break;
        }

        updateInteractionPhase = 'idle';
        if (isManualUpdateCheck && activeManualUpdateRequestId) {
          finishManualUpdateCheck(activeManualUpdateRequestId);
          showUpdateErrorToast(data);
        }
        syncUpdateButtonState();
        break;
    }
  });
}


function cacheElements() {
  elements.sidebar = document.getElementById('sidebar');
  elements.workspaceTitle = document.getElementById('workspace-title');
  elements.workspaceSubtitle = document.getElementById('workspace-subtitle');
  elements.workspaceEntryMeta = document.getElementById('workspace-entry-meta');
  elements.editorPanel = document.getElementById('editor-panel');
  elements.previewPanel = document.getElementById('preview-panel');
  elements.saveButton = document.getElementById('save-btn');
  elements.revealButton = document.getElementById('reveal-btn');
  elements.previewToggleButton = document.getElementById('preview-toggle-btn');
  elements.rescanButton = document.getElementById('rescan-btn');
  elements.chooseProjectButton = document.getElementById('choose-project-btn');
  elements.schemaAutoRefreshSelect = document.getElementById('schema-auto-refresh-select');
  elements.workspaceGlobalActions = document.getElementById('workspace-global-actions');
  elements.workspaceEntryActions = document.getElementById('workspace-entry-actions');
  elements.workspaceEntryActionCluster = document.getElementById('workspace-entry-action-cluster');
  elements.workspaceToolbarDivider = document.getElementById('workspace-toolbar-divider');
  elements.toastRoot = document.getElementById('toast-root');
  elements.panelSplitter = document.getElementById('panel-splitter');
  elements.workspacePanels = document.getElementById('workspace-panels');
  elements.updateModalRoot = document.getElementById('update-modal-root');
}

function restoreTheme() {
  const saved = localStorage.getItem('ai-config-theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
}

function bindGlobalUiHandlers() {
  if (hasBoundGlobalUiHandlers) {
    return;
  }

  document.addEventListener('compositionstart', () => {
    isComposingInput = true;
  }, true);

  document.addEventListener('compositionend', () => {
    isComposingInput = false;
  }, true);

  hasBoundGlobalUiHandlers = true;
}

function bindUpdateButton() {
  const btn = document.getElementById('check-update-btn');
  if (!btn) return;
  syncUpdateButtonState();
  btn.onclick = async () => {
    if (isManualUpdateCheck || isUpdateDownloadPending || ['downloading', 'ready', 'installing'].includes(updateInteractionPhase)) {
      return;
    }

    if (btn.classList.contains('is-loading')) return;
    btn.classList.add('is-loading');
    btn.disabled = true;
    try {
      await checkForUpdates(true);
    } catch (err) {
      console.error(err);
      stopUpdateButtonLoading();
    }
  };
}

function stopUpdateButtonLoading() {
  const btn = document.getElementById('check-update-btn');
  if (!btn) return;
  btn.classList.remove('is-loading');
  syncUpdateButtonState();
}

function syncUpdateButtonState() {
  const btn = document.getElementById('check-update-btn');
  if (!btn) {
    return;
  }

  btn.disabled = btn.classList.contains('is-loading')
    || isManualUpdateCheck
    || isUpdateDownloadPending
    || ['downloading', 'ready', 'installing'].includes(updateInteractionPhase);
}

function bindTopbarActions() {
  elements.chooseProjectButton.textContent = state.projectPath ? '切换项目' : '选择项目';
  elements.chooseProjectButton.title = '切换当前项目范围（全局操作）';
  elements.chooseProjectButton.setAttribute('aria-label', '选择项目目录');
  elements.rescanButton.textContent = '重新扫描';
  elements.rescanButton.title = '重新扫描个人默认与当前项目配置（全局操作）';
  elements.rescanButton.setAttribute('aria-label', '重新扫描全部配置');
  syncSchemaAutoRefreshControl();

  if (elements.schemaAutoRefreshSelect) {
    elements.schemaAutoRefreshSelect.onchange = () => {
      updateSchemaAutoRefreshSetting(elements.schemaAutoRefreshSelect.value);
    };
  }

  elements.chooseProjectButton.onclick = async () => {
    const projectPath = await getDesktopApi().chooseProjectDirectory();
    if (!projectPath) {
      return;
    }

    const switched = await discoverConfigs(projectPath, { confirmIfDirty: true });
    if (!switched) {
      return;
    }

    showToast({
      title: '项目目录已切换',
      message: '现在会同时显示当前项目中的 Codex / Claude 配置层级。',
      tone: 'success'
    });
  };

  elements.rescanButton.onclick = async () => {
    elements.rescanButton.classList.add('is-loading');
    elements.rescanButton.disabled = true;
    try {
      const rescanned = await discoverConfigs(state.projectPath, { confirmIfDirty: true });
      if (!rescanned) {
        return;
      }

      showToast({
        title: '扫描完成',
        message: '已重新读取当前目录中的配置文件。',
        tone: 'default'
      });
    } finally {
      elements.rescanButton.classList.remove('is-loading');
      elements.rescanButton.disabled = false;
    }
  };

  elements.previewToggleButton.onclick = () => {
    if (!getSelectedEntry()) {
      return;
    }

    setPreviewMode(shouldShowPreview() ? 'hidden' : 'split');
  };

  elements.saveButton.onclick = async () => {
    await saveCurrentEntry();
  };

  elements.revealButton.onclick = async () => {
    await revealEntryTarget();
  };

  elements.sidebar.addEventListener('click', async (e) => {
    const actionButton = e.target.closest('[data-sidebar-action]');
    if (!actionButton) {
      return;
    }

    const action = actionButton.getAttribute('data-sidebar-action');
    if (action === 'toggle-theme') {
      toggleTheme();
      return;
    }

    if (action === 'open-github') {
      await getDesktopApi().openExternal(REPOSITORY_URL);
    }
  });
}

async function loadAppVersion() {
  const api = getDesktopApi();
  if (!api?.getVersion) {
    return;
  }

  try {
    state.appVersion = await api.getVersion();
  } catch (error) {
    console.warn('Failed to load app version:', error);
    state.appVersion = '';
  }
}

function toggleTheme() {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const nextTheme = isLight ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', nextTheme);
  localStorage.setItem('ai-config-theme', nextTheme);
  syncSidebarFooterMeta();
}

function syncSidebarFooterMeta() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
  const themeMeta = getThemeToggleMeta(currentTheme);
  const themeButton = elements.sidebar.querySelector('[data-sidebar-action="toggle-theme"]');

  if (themeButton) {
    themeButton.title = themeMeta.title;
    themeButton.setAttribute('aria-label', themeMeta.title);

    const themeIcon = themeButton.querySelector('[data-theme-icon]');
    if (themeIcon) {
      themeIcon.innerHTML = themeMeta.icon;
    }

    const themeState = themeButton.querySelector('[data-theme-state]');
    if (themeState) {
      themeState.textContent = themeMeta.currentLabel;
    }
  }

  const versionValue = elements.sidebar.querySelector('.sidebar-version__value');
  if (versionValue) {
    const nextLabel = state.appVersion ? `v${state.appVersion}` : '版本读取中';
    versionValue.textContent = nextLabel;

    const versionCard = versionValue.closest('.sidebar-version');
    if (versionCard) {
      versionCard.setAttribute('aria-label', `当前应用版本 ${nextLabel}`);
    }
  }
}

function shouldShowPreview(entry = getSelectedEntry()) {
  return Boolean(entry) && state.previewMode === 'split';
}

function getRevealTargetPath(entry = getSelectedEntry(), fallbackPath = '') {
  return entry?.revealTargetPath || entry?.path || fallbackPath || '';
}

async function revealEntryTarget(entry = getSelectedEntry(), fallbackPath = '') {
  const targetPath = getRevealTargetPath(entry, fallbackPath);
  if (!targetPath) {
    return;
  }

  await getDesktopApi().revealFile(targetPath);
}

function getPreviewIdentityMeta(sourceLabel = '') {
  const normalizedLabel = String(sourceLabel || '').trim();

  if (!normalizedLabel) {
    return {
      modeLabel: '预览内容',
      note: '预览会始终跟随当前选中的条目。'
    };
  }

  if (normalizedLabel.includes('原文件')) {
    return {
      modeLabel: '原文件内容',
      note: '当前对应磁盘中的原始文件内容。'
    };
  }

  if (normalizedLabel.includes('新文件预览')) {
    return {
      modeLabel: '待创建文件',
      note: '当前对应首次保存时将要写入的新文件内容。'
    };
  }

  if (normalizedLabel.includes('预览')) {
    return {
      modeLabel: '待写入结果',
      note: '当前对应尚未保存的待写入结果。'
    };
  }

  if (normalizedLabel.includes('默认内容')) {
    return {
      modeLabel: '默认参考内容',
      note: '当前显示的是应用提供的默认参考内容。'
    };
  }

  return {
    modeLabel: normalizedLabel,
    note: '预览会始终跟随当前选中的条目。'
  };
}

function renderWorkspaceEntryMeta() {
  if (!elements.workspaceEntryMeta) {
    return;
  }

  const entry = getSelectedEntry();
  if (!entry) {
    elements.workspaceEntryMeta.innerHTML = '';
    return;
  }

  const scopeValue = entry.scopeVariantLabel || entry.scopeLabel || (entry.scope === 'project' ? '项目级' : '用户级');
  const pathValue = entry.compactPath || entry.path;
  const stateMeta = entry.error
    ? { label: '解析异常', className: 'is-danger' }
    : state.dirty
      ? { label: '未保存', className: 'is-highlight' }
      : entry.exists
        ? { label: '已载入', className: 'is-muted' }
        : { label: '待创建', className: 'is-success' };
  const metaItems = [
    entry.assistantLabel ? `<span class="workspace-meta-pill">${escapeHtml(entry.assistantLabel)}</span>` : '',
    scopeValue ? `<span class="workspace-meta-pill">${escapeHtml(scopeValue)}</span>` : '',
    `<span class="workspace-meta-pill workspace-meta-pill--state ${escapeHtml(stateMeta.className)}">${escapeHtml(stateMeta.label)}</span>`,
    pathValue ? `
      <span class="workspace-meta-path">
        <span class="workspace-meta-path__label">文件</span>
        <code title="${escapeHtml(entry.path || '')}">${escapeHtml(pathValue)}</code>
      </span>
    ` : ''
  ].filter(Boolean);

  elements.workspaceEntryMeta.innerHTML = metaItems.join('');
}

function syncPreviewPanelLayout() {
  const previewVisible = shouldShowPreview();

  if (elements.workspacePanels) {
    elements.workspacePanels.dataset.previewMode = previewVisible ? 'split' : 'hidden';
  }

  if (elements.previewPanel) {
    elements.previewPanel.setAttribute('aria-hidden', String(!previewVisible));
  }

  if (elements.panelSplitter) {
    elements.panelSplitter.disabled = !previewVisible;
    elements.panelSplitter.tabIndex = previewVisible ? 0 : -1;
    elements.panelSplitter.setAttribute('aria-hidden', String(!previewVisible));
    elements.panelSplitter.setAttribute('aria-disabled', String(!previewVisible));
    elements.panelSplitter.setAttribute('role', 'slider');
    elements.panelSplitter.setAttribute('aria-orientation', 'horizontal');
  }

  applySplitRatio();
}

function setPreviewMode(mode) {
  state.previewMode = mode === 'split' ? 'split' : 'hidden';
  syncPreviewPanelLayout();
  renderWorkspaceHeader();
  renderWorkspaceEntryMeta();
  syncActionButtons();

  if (shouldShowPreview()) {
    schedulePreviewRender({ immediate: true });
  } else {
    renderPreview();
  }
}

function bindSplitter() {
  let dragging = false;

  const clampSplitRatio = (value) => Math.min(SPLIT_RATIO_MAX, Math.max(SPLIT_RATIO_MIN, value));
  const canAdjustSplitter = () => shouldShowPreview() && !elements.panelSplitter?.disabled;

  const stopDragging = (event) => {
    if (!dragging) {
      return;
    }

    dragging = false;
    if (event?.pointerId !== undefined && elements.panelSplitter?.hasPointerCapture?.(event.pointerId)) {
      elements.panelSplitter.releasePointerCapture(event.pointerId);
    }
  };

  const setSplitRatioFromClientX = (clientX) => {
    const bounds = elements.workspacePanels?.getBoundingClientRect();
    if (!bounds || !bounds.width) {
      return;
    }

    const ratio = ((clientX - bounds.left) / bounds.width) * 100;
    state.splitRatio = clampSplitRatio(ratio);
    applySplitRatio();
  };

  const handlePointerMove = (event) => {
    if (!dragging || !canAdjustSplitter()) {
      return;
    }

    setSplitRatioFromClientX(event.clientX);
  };

  elements.panelSplitter.addEventListener('pointerdown', (event) => {
    if (!canAdjustSplitter()) {
      return;
    }

    dragging = true;
    event.preventDefault();
    elements.panelSplitter.setPointerCapture(event.pointerId);
  });

  elements.panelSplitter.addEventListener('pointerup', stopDragging);
  elements.panelSplitter.addEventListener('pointercancel', stopDragging);
  elements.panelSplitter.addEventListener('lostpointercapture', stopDragging);
  elements.panelSplitter.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerup', stopDragging);
  window.addEventListener('pointercancel', stopDragging);

  elements.panelSplitter.addEventListener('keydown', (event) => {
    if (!canAdjustSplitter() || event.isComposing || isComposingInput) {
      return;
    }

    let nextRatio = state.splitRatio;
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        nextRatio = state.splitRatio - SPLIT_RATIO_STEP;
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        nextRatio = state.splitRatio + SPLIT_RATIO_STEP;
        break;
      case 'Home':
        nextRatio = SPLIT_RATIO_MIN;
        break;
      case 'End':
        nextRatio = SPLIT_RATIO_MAX;
        break;
      default:
        return;
    }

    event.preventDefault();
    state.splitRatio = clampSplitRatio(nextRatio);
    applySplitRatio();
  });

  syncPreviewPanelLayout();
}

function applySplitRatio() {
  const normalizedRatio = Math.round(Math.min(SPLIT_RATIO_MAX, Math.max(SPLIT_RATIO_MIN, state.splitRatio)));
  state.splitRatio = normalizedRatio;

  if (elements.panelSplitter) {
    elements.panelSplitter.setAttribute('aria-valuemin', String(SPLIT_RATIO_MIN));
    elements.panelSplitter.setAttribute('aria-valuemax', String(SPLIT_RATIO_MAX));
    elements.panelSplitter.setAttribute('aria-valuenow', String(normalizedRatio));
    elements.panelSplitter.setAttribute('aria-valuetext', `编辑面板宽度 ${normalizedRatio}%`);
  }

  if (!elements.workspacePanels) {
    return;
  }

  if (!shouldShowPreview()) {
    elements.workspacePanels.style.removeProperty('grid-template-columns');
    return;
  }

  elements.workspacePanels.style.gridTemplateColumns = `${normalizedRatio}% var(--splitter-size, 16px) ${100 - normalizedRatio}%`;
}

async function loadCodexOfficialSchema(forceRefresh = false, { silent = false } = {}) {
  return loadOfficialSchema('codex', forceRefresh, { silent });
}

async function loadClaudeOfficialSchema(forceRefresh = false, { silent = false } = {}) {
  return loadOfficialSchema('claude', forceRefresh, { silent });
}

function isSchemaDrivenEntry(entry) {
  return entry?.editor === 'codex' || entry?.editor === 'claude';
}

function getOfficialSchemaState(entry) {
  if (entry?.assistant === 'claude') {
    return state.claudeOfficialSchema;
  }

  if (entry?.assistant === 'codex') {
    return state.codexOfficialSchema;
  }

  return null;
}

function rebuildSchemaDrivenDraft(entry, officialSchemaState) {
  if (!isSchemaDrivenEntry(entry)) {
    return;
  }

  const nextDraft = createSchemaDrivenDraft(entry.parsed || {}, officialSchemaState);

  if (state.dirty && state.draft) {
    const currentFieldsByPath = new Map(
      (state.draft.schemaFields || []).map((field) => [field.actualPath, field])
    );
    const nextFieldPaths = new Set((nextDraft.schemaFields || []).map((field) => field.actualPath));
    const preservedExtraFields = (state.draft.schemaFields || [])
      .filter((field) => field?.actualPath && !nextFieldPaths.has(field.actualPath))
      .map((field) => ({
        ...field,
        enumValues: Array.isArray(field.enumValues) ? [...field.enumValues] : field.enumValues
      }));

    nextDraft.schemaFields = nextDraft.schemaFields.map((field) => {
      const currentField = currentFieldsByPath.get(field.actualPath);
      return currentField ? { ...field, inputValue: currentField.inputValue } : field;
    });
    if (preservedExtraFields.length > 0) {
      nextDraft.schemaFields = [...nextDraft.schemaFields, ...preservedExtraFields]
        .sort((left, right) => String(left.actualPath || '').localeCompare(String(right.actualPath || ''), 'en'));
    }

    state.draft = {
      ...nextDraft,
      ...(typeof state.draft.manualFieldPath === 'string' ? { manualFieldPath: state.draft.manualFieldPath } : {}),
      ...(typeof state.draft.manualFieldType === 'string' ? { manualFieldType: state.draft.manualFieldType } : {}),
      ...(typeof state.draft.officialFieldPath === 'string' ? { officialFieldPath: state.draft.officialFieldPath } : {})
    };
    return;
  }

  state.draft = nextDraft;
}

async function loadOfficialSchema(assistant, forceRefresh = false, { silent = false, showProgress = true } = {}) {
  const api = getDesktopApi();
  const schemaStateKey = assistant === 'claude' ? 'claudeOfficialSchema' : 'codexOfficialSchema';
  const apiMethod = assistant === 'claude' ? 'getClaudeOfficialSchema' : 'getCodexOfficialSchema';
  const titlePrefix = assistant === 'claude' ? 'Claude' : 'Codex';
  const selectedEntry = getSelectedEntry();
  const shouldRenderProgress = showProgress && selectedEntry?.assistant === assistant && isSchemaDrivenEntry(selectedEntry);

  if (!api?.[apiMethod]) {
    return;
  }

  if (shouldRenderProgress) {
    state.schemaRefreshAssistant = assistant;
    render();
  }

  try {
    const result = await api[apiMethod](forceRefresh);
    state[schemaStateKey] = result;

    const entry = getSelectedEntry();
    if (entry?.assistant === assistant && isSchemaDrivenEntry(entry)) {
      rebuildSchemaDrivenDraft(entry, result);
      if (!shouldRenderProgress) {
        render();
      }
    }

    if (!silent) {
      const tone = result?.ok ? 'success' : 'danger';
      const message = result?.ok
        ? `已同步官方参数定义（来源：${result.source || 'unknown'}）。`
        : `同步失败：${result?.error || '未知错误'}`;

      showToast({
        title: result?.ok ? `${titlePrefix} 官方参数已刷新` : `${titlePrefix} 官方参数刷新失败`,
        message,
        tone
      });
    }

    return result;
  } catch (error) {
    const fallbackState = {
      ok: false,
      source: 'unavailable',
      schema: null,
      fetchedAt: '',
      error: error instanceof Error ? error.message : String(error),
      sourceUrl: state[schemaStateKey]?.sourceUrl || '',
      docs: Array.isArray(state[schemaStateKey]?.docs) ? state[schemaStateKey].docs : []
    };

    state[schemaStateKey] = fallbackState;

    const entry = getSelectedEntry();
    if (entry?.assistant === assistant && isSchemaDrivenEntry(entry)) {
      rebuildSchemaDrivenDraft(entry, fallbackState);
      if (!shouldRenderProgress) {
        render();
      }
    }

    if (!silent) {
      showToast({
        title: `${titlePrefix} 官方参数刷新失败`,
        message: fallbackState.error,
        tone: 'danger'
      });
    }

    return fallbackState;
  } finally {
    if (shouldRenderProgress) {
      state.schemaRefreshAssistant = null;
      render();
    }
  }
}

async function discoverConfigs(projectPath = state.projectPath, { confirmIfDirty = false } = {}) {
  if (confirmIfDirty && !confirmDiscardUnsavedChanges()) {
    return false;
  }

  try {
    const result = await getDesktopApi().discoverConfigs(projectPath || '');
    const previousSelection = state.selectedId;
    state.entries = result.entries || [];
    state.previewSearchByEntry = Object.fromEntries(
      Object.entries(state.previewSearchByEntry).filter(([entryId]) => state.entries.some((entry) => entry.id === entryId))
    );
    state.projectPath = result.projectPath || '';
    state.selectedId = pickSelection(previousSelection);
    hydrateDraftFromSelection();
    render();
    return true;
  } catch (error) {
    showToast({
      title: '扫描失败',
      message: error instanceof Error ? error.message : String(error),
      tone: 'danger'
    });
    return false;
  }
}

function pickSelection(previousSelection) {
  if (previousSelection && state.entries.some((entry) => entry.id === previousSelection)) {
    return previousSelection;
  }

  return state.entries.find((entry) => entry.exists)?.id || state.entries[0]?.id || null;
}

function getSelectedEntry() {
  return state.entries.find((entry) => entry.id === state.selectedId) || null;
}

function getPreviewSearchState(entryId = state.selectedId) {
  const current = state.previewSearchByEntry[entryId];
  return {
    query: current?.query || '',
    activeMatchIndex: Number.isInteger(current?.activeMatchIndex) ? current.activeMatchIndex : 0,
    scrollTop: Number.isFinite(current?.scrollTop) ? current.scrollTop : 0
  };
}

function setPreviewSearchState(entryId, nextState) {
  if (!entryId) {
    return;
  }

  const currentState = state.previewSearchByEntry[entryId] || {};
  state.previewSearchByEntry = {
    ...state.previewSearchByEntry,
    [entryId]: {
      query: typeof nextState?.query === 'string' ? nextState.query : (currentState.query || ''),
      activeMatchIndex: Number.isInteger(nextState?.activeMatchIndex)
        ? nextState.activeMatchIndex
        : (Number.isInteger(currentState.activeMatchIndex) ? currentState.activeMatchIndex : 0),
      scrollTop: Number.isFinite(nextState?.scrollTop)
        ? nextState.scrollTop
        : (Number.isFinite(currentState.scrollTop) ? currentState.scrollTop : 0)
    }
  };
}

function detectLineEnding(content = '') {
  const match = String(content).match(/\r\n|\n|\r/);
  return match ? match[0] : '\n';
}

function detectTrailingNewline(content = '') {
  return /(?:\r\n|\n|\r)$/.test(String(content));
}

function applyTrailingNewlinePreference(content, preserveTrailingNewline = true) {
  const text = String(content ?? '');
  if (preserveTrailingNewline) {
    return text;
  }

  return text.replace(/(?:\r\n|\n|\r)$/, '');
}

function normalizePreviewContent(content, lineEnding = '\n', preserveTrailingNewline = true) {
  const text = String(content ?? '');
  const normalized = lineEnding === '\n' ? text : text.replace(/\r\n|\n|\r/g, lineEnding);
  return applyTrailingNewlinePreference(normalized, preserveTrailingNewline);
}

function escapeSelectorValue(value = '') {
  if (window.CSS?.escape) {
    return window.CSS.escape(value);
  }

  return String(value).replace(/["\\]/g, '\\$&');
}

function captureRenderState() {
  const sidebarShell = elements.sidebar?.querySelector('.sidebar-shell');
  const editorShell = elements.editorPanel?.querySelector('.panel-shell--editor');
  const markdownInput = elements.editorPanel?.querySelector('[data-markdown-input]');
  const markdownPreview = elements.editorPanel?.querySelector('[data-markdown-preview]');
  const previewCodeBlock = elements.previewPanel?.querySelector('.code-block');
  const previewFindInput = elements.previewPanel?.querySelector('[data-role="find-input"]');
  const activeElement = document.activeElement;

  let activeField = null;
  let activePreviewField = null;
  if (
    activeElement &&
    elements.editorPanel?.contains(activeElement) &&
    typeof activeElement.getAttribute === 'function'
  ) {
    const name = activeElement.getAttribute('name');
    if (name) {
      activeField = {
        name,
        selectionStart: typeof activeElement.selectionStart === 'number' ? activeElement.selectionStart : null,
        selectionEnd: typeof activeElement.selectionEnd === 'number' ? activeElement.selectionEnd : null
      };
    }
  }

  if (
    activeElement &&
    elements.previewPanel?.contains(activeElement) &&
    activeElement === previewFindInput
  ) {
    activePreviewField = {
      selectionStart: typeof activeElement.selectionStart === 'number' ? activeElement.selectionStart : null,
      selectionEnd: typeof activeElement.selectionEnd === 'number' ? activeElement.selectionEnd : null
    };
  }

  return {
    entryId: editorShell?.dataset.entryId || '',
    sidebarScrollTop: sidebarShell?.scrollTop || 0,
    editorScrollTop: editorShell?.scrollTop || 0,
    markdownInputScrollTop: markdownInput?.scrollTop || 0,
    markdownPreviewScrollTop: markdownPreview?.scrollTop || 0,
    previewScrollTop: previewCodeBlock?.scrollTop || 0,
    activeField,
    activePreviewField
  };
}

function restoreRenderState(snapshot) {
  if (!snapshot) {
    return;
  }

  const sidebarShell = elements.sidebar?.querySelector('.sidebar-shell');
  if (sidebarShell) {
    sidebarShell.scrollTop = snapshot.sidebarScrollTop || 0;
  }

  const editorShell = elements.editorPanel?.querySelector('.panel-shell--editor');
  const currentEntryId = editorShell?.dataset.entryId || '';
  const canRestoreEditorContext = Boolean(snapshot.entryId && currentEntryId && snapshot.entryId === currentEntryId);

  if (editorShell && canRestoreEditorContext) {
    editorShell.scrollTop = snapshot.editorScrollTop || 0;
  }

  const markdownInput = elements.editorPanel?.querySelector('[data-markdown-input]');
  if (markdownInput && canRestoreEditorContext) {
    markdownInput.scrollTop = snapshot.markdownInputScrollTop || 0;
  }

  const markdownPreview = elements.editorPanel?.querySelector('[data-markdown-preview]');
  if (markdownPreview && canRestoreEditorContext) {
    markdownPreview.scrollTop = snapshot.markdownPreviewScrollTop || 0;
  }

  const previewCodeBlock = elements.previewPanel?.querySelector('.code-block');
  if (previewCodeBlock && canRestoreEditorContext) {
    previewCodeBlock.scrollTop = snapshot.previewScrollTop || 0;
  }

  const previewFindInput = elements.previewPanel?.querySelector('[data-role="find-input"]');
  if (
    previewFindInput &&
    canRestoreEditorContext &&
    snapshot.activePreviewField
  ) {
    previewFindInput.focus({ preventScroll: true });

    if (
      typeof snapshot.activePreviewField.selectionStart === 'number' &&
      typeof snapshot.activePreviewField.selectionEnd === 'number' &&
      typeof previewFindInput.setSelectionRange === 'function'
    ) {
      previewFindInput.setSelectionRange(
        snapshot.activePreviewField.selectionStart,
        snapshot.activePreviewField.selectionEnd
      );
    }
  }

  if (!canRestoreEditorContext || !snapshot.activeField?.name) {
    return;
  }

  const nextField = elements.editorPanel?.querySelector(`[name="${escapeSelectorValue(snapshot.activeField.name)}"]`);
  if (!(nextField instanceof HTMLElement)) {
    return;
  }

  nextField.focus({ preventScroll: true });

  if (
    typeof snapshot.activeField.selectionStart === 'number' &&
    typeof snapshot.activeField.selectionEnd === 'number' &&
    typeof nextField.setSelectionRange === 'function'
  ) {
    nextField.setSelectionRange(snapshot.activeField.selectionStart, snapshot.activeField.selectionEnd);
  }
}

function hydrateDraftFromSelection() {
  const entry = getSelectedEntry();

  if (!entry) {
    state.draft = null;
    state.dirty = false;
    return;
  }

  if (entry.error) {
    state.draft = null;
    state.dirty = false;
    return;
  }

  if (isSchemaDrivenEntry(entry)) {
    state.draft = createSchemaDrivenDraft(entry.parsed || {}, getOfficialSchemaState(entry));
  } else if (entry.editor === 'text') {
    state.draft = createTextDraft(entry.content || '');
  } else {
    state.draft = null;
  }

  state.dirty = false;
}

function buildPreviewModel() {
  const entry = getSelectedEntry();
  if (!entry) {
    return {
      title: '暂无内容',
      description: '扫描结果为空。',
      language: 'text',
      content: ''
    };
  }

  const useOriginalContent = entry.exists && !state.dirty;
  const previewTitle = entry.navTitle || entry.label;
  const previewDescription = entry.compactPath || entry.path;

  if (isSchemaDrivenEntry(entry)) {
    const language = entry.format === 'json' ? 'json' : 'toml';

    if (useOriginalContent) {
      return {
        title: previewTitle,
        description: previewDescription,
        language,
        content: entry.content || '',
        path: entry.path,
        parsed: entry.parsed,
        readOnly: false,
        sourceLabel: entry.error ? '原文件（解析异常）' : '原文件'
      };
    }

    const serialized = serializeSchemaDrivenDraft(entry.parsed || {}, state.draft, entry.format);
    return {
      title: previewTitle,
      description: previewDescription,
      language,
      content: normalizePreviewContent(serialized.content, entry.lineEnding, entry.hasTrailingNewline),
      path: entry.path,
      parsed: serialized.parsed,
      readOnly: false,
      sourceLabel: entry.exists ? '表单预览' : '新文件预览'
    };
  }

  if (entry.editor === 'text') {
    if (useOriginalContent) {
      return {
        title: previewTitle,
        description: previewDescription,
        language: entry.format === 'markdown' ? 'markdown' : 'text',
        content: entry.content || '',
        path: entry.path,
        parsed: null,
        readOnly: false,
        sourceLabel: entry.error ? '原文件（解析异常）' : '原文件'
      };
    }

    const serialized = serializeTextDraft(state.draft);
    return {
      title: previewTitle,
      description: previewDescription,
      language: entry.format === 'markdown' ? 'markdown' : 'text',
      content: normalizePreviewContent(serialized.content, entry.lineEnding, entry.hasTrailingNewline),
      path: entry.path,
      parsed: serialized.parsed,
      readOnly: false,
      sourceLabel: entry.exists ? '表单预览' : '新文件预览'
    };
  }

  return {
    title: previewTitle,
    description: previewDescription,
    language: entry.format === 'json' ? 'json' : entry.format === 'toml' ? 'toml' : 'text',
    content: entry.content || '',
    path: entry.path,
    readOnly: true,
    sourceLabel: entry.exists ? '原文件' : '默认内容'
  };
}

function render() {
  const renderState = captureRenderState();
  renderSidebar(elements.sidebar, {
    entries: state.entries,
    projectPath: state.projectPath,
    selectedId: state.selectedId,
    onSelect: handleSelectEntry,
    appVersion: state.appVersion,
    currentTheme: document.documentElement.getAttribute('data-theme') || 'light'
  });
  bindUpdateButton();

  renderWorkspaceHeader();
  renderEditor();
  syncPreviewPanelLayout();
  if (shouldShowPreview()) {
    schedulePreviewRender({ immediate: true });
  } else if (elements.previewPanel) {
    elements.previewPanel.dataset.entryId = state.selectedId || '';
    elements.previewPanel.innerHTML = '';
  }
  restoreRenderState(renderState);
  syncSidebarFooterMeta();
  syncActionButtons();
}

function renderWorkspaceHeader() {
  const entry = getSelectedEntry();
  if (!entry) {
    const hasEntries = state.entries.length > 0;
    elements.workspaceTitle.textContent = state.projectPath
      ? (hasEntries ? '选择一个对象开始编辑' : '当前项目还没有可编辑对象')
      : '先选择项目目录';
    elements.workspaceSubtitle.textContent = state.projectPath
      ? (hasEntries
        ? '界面只保留一个主编辑面。保存和定位都只作用于当前选中的文件。'
        : '可以重新扫描当前目录，或切换到另一个项目目录继续。')
      : '载入项目后，应用会自动发现 Codex CLI 与 Claude Code 的可编辑配置。';
    renderWorkspaceEntryMeta();
    return;
  }

  elements.workspaceTitle.textContent = entry.navTitle || entry.label;
  const statusText = entry.error
    ? '当前文件解析失败，已切换为安全只读。建议先定位原文件修复。'
    : state.dirty
      ? '你正在编辑当前对象；点击右上角保存即可写回当前文件。'
      : entry.exists
        ? '直接在中央编辑；右侧预览仅在需要确认最终写回结果时再打开。'
        : '这个对象还不存在；做出第一次修改后保存即可创建文件。';
  elements.workspaceSubtitle.textContent = statusText;
  renderWorkspaceEntryMeta();
}

function renderEditor() {
  const entry = getSelectedEntry();

  const tagEditorShell = (entryId = '') => {
    const editorShell = elements.editorPanel?.querySelector('.panel-shell--editor');
    if (editorShell) {
      editorShell.dataset.entryId = entryId;
    }
  };

  if (!entry) {
    const hasProject = Boolean(state.projectPath);
    const hasEntries = state.entries.length > 0;

    elements.editorPanel.innerHTML = `
      <div class="panel-shell panel-shell--editor panel-shell--empty">
        <div class="editor-empty-state">
          <div class="empty-state-icon" aria-hidden="true">
            ${hasProject ? `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>` : `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>`}
          </div>
          <p class="empty-state-kicker">${hasProject ? '准备开始编辑' : '欢迎使用 CodeConfigHub'}</p>
          <h2 class="empty-state-title">${hasProject ? (hasEntries ? '从左侧选择一个对象' : '当前项目没有可编辑对象') : '先选择项目目录'}</h2>
          <p class="empty-state-description">${hasProject
      ? (hasEntries
        ? '侧边栏只保留可操作对象。选中后就在中央直接编辑，需要时再展开预览。'
        : '这个项目下还没发现可编辑配置。你可以重新扫描，或者切换到另一个项目目录。')
      : '载入项目后，应用会自动发现 Codex CLI 与 Claude Code 的配置文件，并按对象组织到左侧。'}</p>
          <div class="empty-state-actions">
            ${hasProject ? '' : `<button class="primary-button" type="button" data-action="choose-project">选择项目目录</button>`}
            ${hasProject && !hasEntries ? `<button class="ghost-button" type="button" data-action="rescan">重新扫描</button>` : ''}
          </div>
          ${hasEntries ? `
            <div class="empty-state-notes" aria-label="使用提示">
              <span class="empty-state-note">左侧选对象</span>
              <span class="empty-state-note">中央直接编辑</span>
              <span class="empty-state-note">保存只作用于当前文件</span>
            </div>
          ` : ''}
        </div>
      </div>
    `;

    elements.editorPanel.onclick = async (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      const action = button.getAttribute('data-action');
      if (action === 'choose-project') {
        elements.chooseProjectButton?.click();
      } else if (action === 'rescan') {
        elements.rescanButton?.click();
      }
    };
    tagEditorShell();
    return;
  }

  if (entry.error) {
    elements.editorPanel.innerHTML = `
      <div class="panel-shell panel-shell--editor panel-shell--readonly">
        <div class="panel-heading">
          <div>
            <p class="panel-kicker">安全只读</p>
            <h2>${escapeHtml(entry.label)}</h2>
            <p>${escapeHtml(entry.description)}</p>
          </div>
          <span class="editor-badge editor-badge--danger">解析异常</span>
        </div>

        <div class="readonly-note readonly-note--danger">
          <h3>原文件解析失败，已阻止可视化改写</h3>
          <p>${escapeHtml(entry.error)}</p>
          <p>为避免覆盖无法正确解析的原始内容，当前已禁用表单编辑和保存。请先修复原文件，再回来继续可视化编辑。</p>
          <div class="preview-tools">
            <button class="ghost-button" type="button" data-action="reveal-entry-file">定位原文件</button>
          </div>
        </div>
      </div>
    `;

    elements.editorPanel.onclick = async (event) => {
      const button = event.target.closest('[data-action="reveal-entry-file"]');
      if (!button) {
        return;
      }

      await revealEntryTarget(entry);
    };
    tagEditorShell(entry.id);
    return;
  }

  if (isSchemaDrivenEntry(entry)) {
    renderSchemaDrivenEditor(elements.editorPanel, {
      entry,
      draft: state.draft,
      onDraftChange: handleDraftChange,
      onRefreshOfficialSchema: () => loadOfficialSchema(entry.assistant, true),
      isRefreshingOfficialSchema: state.schemaRefreshAssistant === entry.assistant
    });
    tagEditorShell(entry.id);
    return;
  }

  if (entry.editor === 'text') {
    renderTextEditor(elements.editorPanel, {
      entry,
      draft: state.draft,
      onDraftChange: handleDraftChange
    });
    tagEditorShell(entry.id);
    return;
  }

  elements.editorPanel.innerHTML = `
    <div class="panel-shell panel-shell--editor panel-shell--readonly">
      <div class="panel-heading">
        <div>
          <p class="panel-kicker">只读预览</p>
          <h2>${escapeHtml(entry.label)}</h2>
          <p>${escapeHtml(entry.description)}</p>
        </div>
        <span class="editor-badge">只读</span>
      </div>

      <div class="readonly-note">
        <h3>当前还没有这个文件的可视化编辑器</h3>
        <p>右侧会继续展示原文件源码；如果你只是想定位或手动修改源文件，可以直接使用下面的入口。</p>
        <div class="preview-tools">
          <button class="ghost-button" type="button" data-action="reveal-entry-file">定位原文件</button>
        </div>
      </div>
    </div>
  `;

  elements.editorPanel.onclick = async (event) => {
    const button = event.target.closest('[data-action="reveal-entry-file"]');
    if (!button) {
      return;
      }

    await revealEntryTarget(entry);
  };
  tagEditorShell(entry.id);
}

function renderPreview() {
  if (!shouldShowPreview()) {
    elements.previewPanel.dataset.entryId = state.selectedId || '';
    elements.previewPanel.innerHTML = '';
    return;
  }

  const previewEntryId = state.selectedId;
  const previewSearch = getPreviewSearchState();
  const currentPreviewScrollTop = elements.previewPanel?.querySelector('.code-block')?.scrollTop;
  elements.previewPanel.dataset.entryId = previewEntryId || '';
  let previewModel;

  try {
    previewModel = buildPreviewModel();
  } catch (error) {
    elements.previewPanel.innerHTML = `
      <div class="panel-shell panel-shell--preview panel-shell--readonly">
        <div class="panel-heading">
          <div>
            <p class="panel-kicker">预览暂不可用</p>
            <h2>请先修正当前输入</h2>
            <p>当前草稿里有无法序列化的值，保存前需要先修正。</p>
          </div>
          <span class="editor-badge editor-badge--danger">无效输入</span>
        </div>
        <div class="readonly-note readonly-note--danger">
          <p>${escapeHtml(error instanceof Error ? error.message : String(error))}</p>
        </div>
      </div>
    `;
    return;
  }

  renderCodePreview(elements.previewPanel, {
    ...previewModel,
    searchQuery: previewSearch.query,
    activeMatchIndex: previewSearch.activeMatchIndex,
    scrollTop: Number.isFinite(currentPreviewScrollTop) ? currentPreviewScrollTop : previewSearch.scrollTop
  }, {
    onCopy: async (content) => {
      await getDesktopApi().copyText(content);
      showToast({
        title: '已复制',
        message: '当前生成代码已经复制到剪贴板。',
        tone: 'success'
      });
    },
    onReveal: async (filePath) => {
      await getDesktopApi().revealFile(filePath);
    },
    onSearchStateChange: ({ query, activeMatchIndex }) => {
      setPreviewSearchState(previewEntryId, { query, activeMatchIndex });
    },
    onScrollStateChange: ({ scrollTop }) => {
      setPreviewSearchState(previewEntryId, { scrollTop });
    }
  });
}

function syncActionButtons() {
  const entry = getSelectedEntry();
  const hasBlockingParseError = Boolean(entry?.error && entry?.editor);
  const canSave = Boolean(entry && entry.editor && !hasBlockingParseError && (state.dirty || !entry.exists));
  const showEntryActions = Boolean(entry);
  let previewIdentity = null;
  if (entry) {
    try {
      previewIdentity = getPreviewIdentityMeta(buildPreviewModel().sourceLabel);
    } catch {
      previewIdentity = {
        modeLabel: '待保存结果',
        note: '当前草稿仍有无效输入，请先修正后再查看待写入结果。'
      };
    }
  }

  elements.chooseProjectButton.textContent = state.projectPath ? '切换项目' : '选择项目';
  elements.saveButton.disabled = !canSave;
  elements.revealButton.disabled = !entry;
  elements.previewToggleButton.disabled = !entry;

  if (elements.workspaceEntryActionCluster) {
    elements.workspaceEntryActionCluster.hidden = !showEntryActions;
  }

  if (elements.workspaceToolbarDivider) {
    elements.workspaceToolbarDivider.hidden = !showEntryActions;
  }

  elements.previewToggleButton.setAttribute('aria-expanded', shouldShowPreview() ? 'true' : 'false');
  elements.previewToggleButton.setAttribute('aria-pressed', shouldShowPreview() ? 'true' : 'false');
  elements.previewToggleButton.title = !entry
    ? '先从左侧选择一个配置对象'
    : shouldShowPreview()
      ? '收起右侧预览'
      : previewIdentity?.note || '展开右侧预览';
  elements.previewToggleButton.textContent = !entry
    ? '预览'
    : shouldShowPreview()
      ? '收起预览'
      : '打开预览';
  elements.revealButton.textContent = !entry
    ? '定位文件'
    : entry.exists
      ? '定位文件'
      : '查看创建位置';
  elements.revealButton.title = entry?.revealHint || '定位当前条目';

  if (!entry || !entry.editor) {
    elements.saveButton.textContent = '保存';
    return;
  }

  if (hasBlockingParseError) {
    elements.saveButton.textContent = '修复后保存';
    return;
  }

  if (!entry.exists) {
    elements.saveButton.textContent = state.dirty ? '创建并保存' : '创建文件';
    return;
  }

  elements.saveButton.textContent = state.dirty ? '保存更改' : '已保存';
}

function handleDraftChange(nextDraft) {
  state.draft = nextDraft;
  state.dirty = true;
  renderWorkspaceHeader();
  schedulePreviewRender();
  syncActionButtons();
}

function handleSelectEntry(entryId) {
  if (entryId === state.selectedId) {
    return;
  }

  if (!confirmDiscardUnsavedChanges()) {
    return;
  }

  state.selectedId = entryId;
  hydrateDraftFromSelection();
  render();
}

async function saveCurrentEntry() {
  const entry = getSelectedEntry();
  if (!entry || !entry.editor) {
    return;
  }

  if (entry.error) {
    showToast({
      title: '已阻止保存',
      message: '当前文件存在解析错误。请先修复原文件，再进行可视化保存。',
      tone: 'danger'
    });
    return;
  }

  if (!state.dirty && entry.exists) {
    showToast({
      title: '无需保存',
      message: '当前文件没有变更，已保留原始换行和注释。',
      tone: 'default'
    });
    return;
  }

  try {
    schedulePreviewRender({ immediate: true });
    const preview = buildPreviewModel();
    const result = await getDesktopApi().saveConfig({
      filePath: entry.path,
      format: entry.format,
      content: preview.content
    });

    entry.exists = true;
    entry.error = null;
    entry.content = preview.content;
    entry.parsed = preview.parsed;
    entry.lineEnding = detectLineEnding(preview.content);
    entry.hasTrailingNewline = detectTrailingNewline(preview.content);
    hydrateDraftFromSelection();
    state.dirty = false;

    render();
    showToast({
      title: '保存成功',
      message: result.backupPath ? `已写入文件，并生成备份：${result.backupPath}` : '已写入文件。',
      tone: 'success'
    });
  } catch (error) {
    showToast({
      title: '保存失败',
      message: error instanceof Error ? error.message : String(error),
      tone: 'danger'
    });
  }
}

let isManualUpdateCheck = false;

async function checkForUpdates(isManual = false) {
  const api = getDesktopApi();
  if (!api || !api.checkUpdate) return;

  const requestId = isManual ? beginManualUpdateCheck() : 0;
  if (isManual) {
    updateInteractionPhase = 'checking';
    syncUpdateButtonState();
  }

  try {
    const result = await api.checkUpdate();

    if (isManual && result?.started && Number.isInteger(result.checkId)) {
      activeManualUpdateRequestId = result.checkId;
      armManualUpdateFeedbackTimer(result.checkId);
      return;
    }

    if (isManual && result?.reason === 'check-in-progress') {
      resetManualUpdateCheck();
      stopUpdateButtonLoading();
      updateInteractionPhase = 'checking';
      syncUpdateButtonState();
      showToast({
        title: '检查仍在进行中',
        message: result.message || '上一轮检查尚未结束，请稍候。',
        tone: 'default'
      });
      return;
    }

    if (isManual && result?.skipped) {
      resetManualUpdateCheck();
      stopUpdateButtonLoading();
      updateInteractionPhase = 'idle';
      syncUpdateButtonState();
      showToast({
        title: '当前环境跳过检查',
        message: result.message || '未打包开发环境不会执行真实更新检查。',
        tone: 'default'
      });
      return;
    }

    if (isManual && !result) {
      resetManualUpdateCheck();
      stopUpdateButtonLoading();
      updateInteractionPhase = 'idle';
      syncUpdateButtonState();
      showToast({
        title: '未收到更新结果',
        message: '当前环境没有返回更新信息；如果你正在使用开发模式，这是正常现象。',
        tone: 'default'
      });
    }
  } catch (err) {
    if (!finishManualUpdateCheck(requestId)) {
      resetManualUpdateCheck();
    }
    console.warn('Update check failed:', err);
    updateInteractionPhase = 'idle';
    syncUpdateButtonState();
    if (requestId && requestId !== lastTimedOutManualUpdateRequestId) {
      showUpdateErrorToast(err);
    }
  }
}




