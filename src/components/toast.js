const TOAST_DEFAULT_DURATION_MS = 3400;
const TOAST_EXIT_DURATION_MS = 240;

let toastRoot = null;
const toastTimers = new WeakMap();

function normalizeToneToken(value = 'default') {
  const normalized = String(value ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return (normalized || 'default').toLowerCase();
}

function clearToastTimers(toastElement) {
  const timers = toastTimers.get(toastElement);
  if (!timers) {
    return;
  }

  if (timers.showFrame) {
    window.cancelAnimationFrame(timers.showFrame);
  }

  if (timers.hideTimer) {
    window.clearTimeout(timers.hideTimer);
  }

  if (timers.removeTimer) {
    window.clearTimeout(timers.removeTimer);
  }

  toastTimers.delete(toastElement);
}

function updateToastTimers(toastElement, nextTimers) {
  const currentTimers = toastTimers.get(toastElement) || {};
  toastTimers.set(toastElement, {
    ...currentTimers,
    ...nextTimers
  });
}

export function initializeToast(rootElement) {
  toastRoot = rootElement instanceof HTMLElement ? rootElement : null;
}

export function dismissToast(toastElement) {
  if (!(toastElement instanceof HTMLElement)) {
    return;
  }

  const currentTimers = toastTimers.get(toastElement) || {};
  if (currentTimers.removeTimer) {
    return;
  }

  if (currentTimers.showFrame) {
    window.cancelAnimationFrame(currentTimers.showFrame);
  }

  if (currentTimers.hideTimer) {
    window.clearTimeout(currentTimers.hideTimer);
  }

  toastElement.classList.remove('is-visible');

  const removeTimer = window.setTimeout(() => {
    toastElement.remove();
    clearToastTimers(toastElement);
  }, TOAST_EXIT_DURATION_MS);

  toastTimers.set(toastElement, {
    removeTimer
  });
}

export function clearToasts() {
  if (!toastRoot) {
    return;
  }

  [...toastRoot.children].forEach((child) => {
    if (child instanceof HTMLElement) {
      dismissToast(child);
    }
  });
}

export function showToast({
  title = '提示',
  message = '',
  tone = 'default',
  duration = TOAST_DEFAULT_DURATION_MS
} = {}) {
  if (!toastRoot) {
    return null;
  }

  const toast = document.createElement('div');
  const toneToken = normalizeToneToken(tone);
  const titleText = String(title ?? '');
  const messageText = String(message ?? '');
  const resolvedDuration = Number.isFinite(Number(duration))
    ? Math.max(0, Number(duration))
    : TOAST_DEFAULT_DURATION_MS;

  toast.className = `toast toast--${toneToken}`;
  toast.setAttribute('role', toneToken === 'danger' ? 'alert' : 'status');
  toast.setAttribute('aria-atomic', 'true');

  if (titleText) {
    const titleElement = document.createElement('strong');
    titleElement.textContent = titleText;
    toast.appendChild(titleElement);
  }

  if (messageText || !titleText) {
    const messageElement = document.createElement('span');
    messageElement.textContent = messageText;
    toast.appendChild(messageElement);
  }

  toastRoot.appendChild(toast);

  const showFrame = window.requestAnimationFrame(() => {
    toast.classList.add('is-visible');
    updateToastTimers(toast, { showFrame: 0 });
  });

  const hideTimer = window.setTimeout(() => {
    dismissToast(toast);
  }, resolvedDuration);

  toastTimers.set(toast, {
    showFrame,
    hideTimer
  });

  return toast;
}
