import { escapeHtml } from './components/form-controls.js';
import { renderSidebar } from './components/sidebar.js';
import { initializeToast, showToast } from './components/toast.js';
import { renderCodePreview } from './editors/code-preview.js';
import { createCodexDraft, renderCodexEditor, serializeCodexDraft } from './editors/codex-editor.js';
import { createClaudeDraft, renderClaudeEditor, serializeClaudeDraft } from './editors/claude-editor.js';

const state = {
  entries: [],
  selectedId: null,
  draft: null,
  dirty: false,
  projectPath: '',
  splitRatio: 56
};

const elements = {};

function getDesktopApi() {
  return window.codeConfigHubAPI || window.configManagerAPI;
}

window.addEventListener('DOMContentLoaded', async () => {
  cacheElements();
  initializeToast(elements.toastRoot);
  restoreTheme();
  bindTopbarActions();
  bindSplitter();
  await discoverConfigs();

  // Initialize update listener ONCE
  initUpdateListener();

  // Auto check on start (silent)
  checkForUpdates(false);
});

function initUpdateListener() {
  const api = getDesktopApi();
  const modalRoot = document.getElementById('update-modal-root');
  if (!api || !modalRoot) return;

  const showModal = (content) => {
    modalRoot.innerHTML = `<div class="update-modal">${content}</div>`;
    modalRoot.classList.add('is-visible');
  };

  api.onUpdateStatus(async (channel, data) => {
    // Global handling for update events
    switch (channel) {
      case 'update:available':
        showModal(`
          <h2>✨ 发现新版本</h2>
          <p>全新版本的 CodeConfigHub (${escapeHtml(data.version)}) 已经发布。是否立即更新？</p>
          <div class="update-modal-actions">
            <button class="ghost-button" onclick="this.closest('.modal-root').classList.remove('is-visible')">以后再说</button>
            <button class="primary-button" onclick="getDesktopApi().downloadUpdate()">立即更新</button>
          </div>
        `);
        break;

      case 'update:not-available':
        // Silently handled by manual flag logic in checkForUpdates if needed
        break;

      case 'update:download-progress':
        const percent = Math.floor(data.percent || 0);
        showModal(`
          <h2>🚀 正在下载更新</h2>
          <p>请稍候，我们正在为你准备最新版本的组件...</p>
          <div class="update-progress-container">
            <div class="update-progress-bar" style="width: ${percent}%"></div>
          </div>
          <p style="text-align: right; font-size: 0.85rem;">${percent}%</p>
        `);
        break;

      case 'update:downloaded':
        showModal(`
          <h2>🎉 更新已就绪</h2>
          <p>最新版本已经下载完成。点击下方按钮将立即重启应用并完成安装。</p>
          <div class="update-modal-actions">
            <button class="primary-button" onclick="getDesktopApi().installUpdate()">立即重启并安装</button>
          </div>
        `);
        break;

      case 'update:error':
        console.warn('Updater Error:', data);
        break;
    }
  });
}


function cacheElements() {
  elements.sidebar = document.getElementById('sidebar');
  elements.workspaceTitle = document.getElementById('workspace-title');
  elements.workspaceSubtitle = document.getElementById('workspace-subtitle');
  elements.editorPanel = document.getElementById('editor-panel');
  elements.previewPanel = document.getElementById('preview-panel');
  elements.saveButton = document.getElementById('save-btn');
  elements.themeButton = document.getElementById('theme-btn');
  elements.revealButton = document.getElementById('reveal-btn');
  elements.rescanButton = document.getElementById('rescan-btn');
  elements.chooseProjectButton = document.getElementById('choose-project-btn');
  elements.toastRoot = document.getElementById('toast-root');
  elements.panelSplitter = document.getElementById('panel-splitter');
  elements.workspacePanels = document.getElementById('workspace-panels');
}

function restoreTheme() {
  const saved = localStorage.getItem('ai-config-theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  elements.themeButton.textContent = saved === 'light' ? '\u{1F319}' : '\u{1F31E}';
  elements.themeButton.title = saved === 'light' ? '\u5207\u6362\u5230\u6697\u9ED1\u4E3B\u9898' : '\u5207\u6362\u5230\u660E\u4EAE\u4E3B\u9898';
}

function bindTopbarActions() {
  elements.themeButton.onclick = () => {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const newTheme = isLight ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('ai-config-theme', newTheme);
    elements.themeButton.title = newTheme === 'light' ? '\u5207\u6362\u5230\u6697\u9ED1\u4E3B\u9898' : '\u5207\u6362\u5230\u660E\u4EAE\u4E3B\u9898';
    elements.themeButton.textContent = newTheme === 'light' ? '\u{1F319}' : '\u{1F31E}';
  };

  elements.chooseProjectButton.onclick = async () => {
    const projectPath = await getDesktopApi().chooseProjectDirectory();
    if (!projectPath) {
      return;
    }

    await discoverConfigs(projectPath);
    showToast({
      title: '项目目录已切换',
      message: '现在会同时显示当前项目中的 Codex / Claude 配置层级。',
      tone: 'success'
    });
  };

  elements.rescanButton.onclick = async () => {
    await discoverConfigs(state.projectPath);
    showToast({
      title: '扫描完成',
      message: '已重新读取当前目录中的配置文件。',
      tone: 'default'
    });
  };

  elements.saveButton.onclick = async () => {
    await saveCurrentEntry();
  };

  elements.revealButton.onclick = async () => {
    const entry = getSelectedEntry();
    if (!entry) {
      return;
    }

    await getDesktopApi().revealFile(entry.path);
  };

  // Use event delegation for dynamically-created sidebar buttons
  elements.sidebar.addEventListener('click', async (e) => {
    const btn = e.target.closest('#check-update-btn');
    if (!btn) return;

    try {
      btn.classList.add('is-loading');
      await checkForUpdates(true);
    } catch (err) {
      console.error(err);
    } finally {
      btn.classList.remove('is-loading');
    }
  });
}

function bindSplitter() {
  let dragging = false;

  const handlePointerMove = (event) => {
    if (!dragging) {
      return;
    }

    const bounds = elements.workspacePanels.getBoundingClientRect();
    const ratio = ((event.clientX - bounds.left) / bounds.width) * 100;
    state.splitRatio = Math.min(66, Math.max(38, ratio));
    applySplitRatio();
  };

  elements.panelSplitter.addEventListener('pointerdown', (event) => {
    dragging = true;
    elements.panelSplitter.setPointerCapture(event.pointerId);
  });

  elements.panelSplitter.addEventListener('pointerup', (event) => {
    dragging = false;
    elements.panelSplitter.releasePointerCapture(event.pointerId);
  });

  elements.panelSplitter.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerup', () => {
    dragging = false;
  });

  applySplitRatio();
}

function applySplitRatio() {
  elements.workspacePanels.style.gridTemplateColumns = `${state.splitRatio}% 16px ${100 - state.splitRatio}%`;
}

async function discoverConfigs(projectPath = state.projectPath) {
  try {
    const result = await getDesktopApi().discoverConfigs(projectPath || '');
    const previousSelection = state.selectedId;
    state.entries = result.entries || [];
    state.projectPath = result.projectPath || '';
    state.selectedId = pickSelection(previousSelection);
    hydrateDraftFromSelection();
    render();
  } catch (error) {
    showToast({
      title: '扫描失败',
      message: error instanceof Error ? error.message : String(error),
      tone: 'danger'
    });
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

function detectLineEnding(content = '') {
  const match = String(content).match(/\r\n|\n|\r/);
  return match ? match[0] : '\n';
}

function normalizePreviewContent(content, lineEnding = '\n') {
  const text = String(content ?? '');
  return lineEnding === '\n' ? text : text.replace(/\r?\n/g, lineEnding);
}

function hydrateDraftFromSelection() {
  const entry = getSelectedEntry();

  if (!entry) {
    state.draft = null;
    state.dirty = false;
    return;
  }

  if (entry.editor === 'codex') {
    state.draft = createCodexDraft(entry.parsed || {});
  } else if (entry.editor === 'claude') {
    state.draft = createClaudeDraft(entry.parsed || {});
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

  if (entry.editor === 'codex') {
    if (useOriginalContent) {
      return {
        title: entry.label,
        description: entry.path,
        language: 'toml',
        content: entry.content || '',
        path: entry.path,
        parsed: entry.parsed,
        readOnly: false,
        sourceLabel: entry.error ? '原文件（解析异常）' : '原文件'
      };
    }

    const serialized = serializeCodexDraft(entry.parsed || {}, state.draft);
    return {
      title: entry.label,
      description: entry.path,
      language: 'toml',
      content: normalizePreviewContent(serialized.content, entry.lineEnding),
      path: entry.path,
      parsed: serialized.parsed,
      readOnly: false,
      sourceLabel: entry.exists ? '表单预览' : '新文件预览'
    };
  }

  if (entry.editor === 'claude') {
    if (useOriginalContent) {
      return {
        title: entry.label,
        description: entry.path,
        language: 'json',
        content: entry.content || '',
        path: entry.path,
        parsed: entry.parsed,
        readOnly: false,
        sourceLabel: entry.error ? '原文件（解析异常）' : '原文件'
      };
    }

    const serialized = serializeClaudeDraft(entry.parsed || {}, state.draft);
    return {
      title: entry.label,
      description: entry.path,
      language: 'json',
      content: normalizePreviewContent(serialized.content, entry.lineEnding),
      path: entry.path,
      parsed: serialized.parsed,
      readOnly: false,
      sourceLabel: entry.exists ? '表单预览' : '新文件预览'
    };
  }

  return {
    title: entry.label,
    description: entry.path,
    language: entry.format === 'json' ? 'json' : entry.format === 'toml' ? 'toml' : 'text',
    content: entry.content || '',
    path: entry.path,
    readOnly: true,
    sourceLabel: entry.exists ? '原文件' : '默认内容'
  };
}

function render() {
  renderSidebar(elements.sidebar, {
    entries: state.entries,
    projectPath: state.projectPath,
    selectedId: state.selectedId,
    onSelect: handleSelectEntry
  });

  renderWorkspaceHeader();
  renderEditor();
  renderPreview();
  syncActionButtons();
}

function renderWorkspaceHeader() {
  const entry = getSelectedEntry();
  if (!entry) {
    elements.workspaceTitle.textContent = '尚未找到任何配置';
    elements.workspaceSubtitle.textContent = '请先选择一个项目目录，或检查当前用户目录下是否存在相关配置文件。';
    return;
  }

  elements.workspaceTitle.textContent = entry.label;
  const statusText = entry.exists ? '已发现并载入当前文件。' : '目标文件不存在，保存时会自动创建。';
  const modeText = entry.editor ? '支持可视化编辑。' : '当前为只读预览模式。';
  elements.workspaceSubtitle.textContent = `${statusText} ${modeText} ${entry.path}`;
}

function renderEditor() {
  const entry = getSelectedEntry();

  if (!entry) {
    elements.editorPanel.innerHTML = `
      <div class="panel-shell panel-shell--editor panel-shell--empty">
        <h2>没有可编辑内容</h2>
        <p>点击左侧目录中的任意配置文件后，这里会展示对应的表单编辑器。</p>
      </div>
    `;
    return;
  }

  if (entry.editor === 'codex') {
    renderCodexEditor(elements.editorPanel, {
      entry,
      draft: state.draft,
      onDraftChange: handleDraftChange
    });
    return;
  }

  if (entry.editor === 'claude') {
    renderClaudeEditor(elements.editorPanel, {
      entry,
      draft: state.draft,
      onDraftChange: handleDraftChange
    });
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
        <h3>当前 MVP 暂未提供这个文件的可视化编辑器</h3>
        <p>右侧仍然会展示文件源码，方便查看结构。后续 Phase 2 可以扩展到 CLAUDE.md、MCP 配置和模板系统。</p>
      </div>
    </div>
  `;
}

function renderPreview() {
  renderCodePreview(elements.previewPanel, buildPreviewModel(), {
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
    }
  });
}

function syncActionButtons() {
  const entry = getSelectedEntry();
  const canSave = Boolean(entry && entry.editor && (state.dirty || !entry.exists));

  elements.saveButton.disabled = !canSave;
  elements.revealButton.disabled = !entry;

  if (!entry || !entry.editor) {
    elements.saveButton.textContent = '保存当前文件';
    return;
  }

  if (!entry.exists) {
    elements.saveButton.textContent = '创建当前文件';
    return;
  }

  elements.saveButton.textContent = state.dirty ? '保存当前文件 *' : '当前无变更';
}

function handleDraftChange(nextDraft) {
  state.draft = nextDraft;
  state.dirty = true;
  renderPreview();
  syncActionButtons();
}

function handleSelectEntry(entryId) {
  if (entryId === state.selectedId) {
    return;
  }

  if (state.dirty) {
    const shouldContinue = window.confirm('当前文件有未保存修改，切换后将丢失这些更改。是否继续？');
    if (!shouldContinue) {
      return;
    }
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

  if (!state.dirty && entry.exists) {
    showToast({
      title: '无需保存',
      message: '当前文件没有变更，已保留原始换行和注释。',
      tone: 'default'
    });
    return;
  }

  try {
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

async function checkForUpdates(isManual = false) {
  const api = getDesktopApi();
  const currentVersion = await api.getVersion();
  const modalRoot = document.getElementById('update-modal-root');

  const showUpdateModal = (content) => {
    if (!modalRoot) return;
    modalRoot.innerHTML = `<div class="update-modal">${content}</div>`;
    modalRoot.classList.add('is-visible');
  };

  try {
    const response = await fetch('https://api.github.com/repos/final00000000/CodeConfigHub/releases/latest');

    if (!response.ok) {
      throw new Error(`GitHub API ${response.status}`);
    }

    const release = await response.json();
    const latestTag = release.tag_name || 'v0.0.0';
    const latestVersion = latestTag.replace(/^v/, '');

    const compare = (a, b) => {
      const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
      const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
      for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        if ((pa[i] || 0) > (pb[i] || 0)) return 1;
        if ((pa[i] || 0) < (pb[i] || 0)) return -1;
      }
      return 0;
    };

    if (compare(latestVersion, currentVersion) > 0) {
      // New version found - show modal
      showUpdateModal(`
        <h2>✨ 发现新版本</h2>
        <p>CodeConfigHub ${escapeHtml(latestTag)} 已经发布，包含了最新的优化与修复。<br>当前版本：${escapeHtml(currentVersion)}</p>
        <div class="update-modal-actions">
          <button class="ghost-button" onclick="this.closest('.modal-root').classList.remove('is-visible')">以后再说</button>
          <button class="primary-button" onclick="window.codeConfigHubAPI.openExternal('${escapeHtml(release.html_url)}')">前往下载</button>
        </div>
      `);
    } else {
      if (isManual) {
        showToast({ title: '✅ 已是最新', message: `当前版本 (${currentVersion}) 已是最新发布状态。`, tone: 'success' });
      }
    }
  } catch (err) {
    console.warn('Update check failed:', err);
    if (isManual) {
      showToast({ title: '检查失败', message: '无法连接到更新服务器，请检查网络。', tone: 'danger' });
    }
  }
}




