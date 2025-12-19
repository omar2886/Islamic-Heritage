const ensureContainer = () => {
  let container = document.querySelector('[data-toast-container]');
  if (container) return container;
  container = document.createElement('div');
  container.setAttribute('data-toast-container', 'true');
  container.style.position = 'fixed';
  container.style.right = '1rem';
  container.style.bottom = '1rem';
  container.style.zIndex = '9999';
  container.style.display = 'grid';
  container.style.gap = '0.5rem';
  container.style.maxWidth = '320px';
  const target = document.body || document.documentElement;
  if (target) {
    target.appendChild(container);
  } else {
    document.addEventListener('DOMContentLoaded', () => document.body.appendChild(container), {
      once: true,
    });
  }
  return container;
};

let counter = 0;

export function showToast(message, options = {}) {
  const { type = 'info', timeout = 3800 } = options;
  const container = ensureContainer();
  const toast = document.createElement('div');
  const toastId = `toast-${Date.now()}-${counter++}`;
  toast.setAttribute('data-toast-id', toastId);
  toast.setAttribute('role', 'status');
  toast.style.padding = '0.75rem 1rem';
  toast.style.borderRadius = '10px';
  toast.style.background = 'var(--toast-bg, rgba(0,0,0,0.85))';
  toast.style.color = 'var(--toast-fg, #fff)';
  toast.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.25)';
  toast.style.opacity = '0';
  toast.style.transform = 'translateY(6px)';
  toast.style.transition = 'opacity 150ms ease, transform 150ms ease';
  toast.dataset.toastType = type;
  toast.textContent = message;

  container.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });

  const remove = () => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(6px)';
    setTimeout(() => toast.remove(), 200);
  };

  const duration = Number(timeout) || 0;
  if (duration > 0) {
    setTimeout(remove, duration);
  }

  toast.addEventListener('click', remove);
  return toastId;
}

export function hideToast(id) {
  if (!id) return;
  const toast = document.querySelector(`[data-toast-id="${id}"]`);
  if (toast) {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(6px)';
    setTimeout(() => toast.remove(), 200);
  }
}
