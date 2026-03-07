let toastRoot = null;

export function initializeToast(rootElement) {
  toastRoot = rootElement;
}

export function showToast({
  title = '提示',
  message = '',
  tone = 'default'
}) {
  if (!toastRoot) {
    return;
  }

  const toast = document.createElement('div');
  toast.className = `toast toast--${tone}`;
  toast.innerHTML = `
    <strong>${title}</strong>
    <span>${message}</span>
  `;

  toastRoot.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('is-visible');
  });

  window.setTimeout(() => {
    toast.classList.remove('is-visible');
    window.setTimeout(() => {
      toast.remove();
    }, 240);
  }, 3400);
}
