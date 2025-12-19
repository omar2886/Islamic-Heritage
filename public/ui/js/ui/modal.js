const ensureOverlay = () => {
  let overlay = document.querySelector('[data-modal-overlay]');
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.setAttribute('data-modal-overlay', 'true');
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.background = 'rgba(0,0,0,0.55)';
  overlay.style.display = 'none';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.zIndex = '9998';

  const dialog = document.createElement('div');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.style.background = '#fff';
  dialog.style.color = '#222';
  dialog.style.minWidth = '320px';
  dialog.style.maxWidth = '640px';
  dialog.style.padding = '1rem 1.25rem';
  dialog.style.borderRadius = '12px';
  dialog.style.boxShadow = '0 16px 40px rgba(0,0,0,0.22)';
  dialog.setAttribute('data-modal-dialog', 'true');

  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Cerrar';
  closeBtn.type = 'button';
  closeBtn.style.marginTop = '1rem';
  closeBtn.style.padding = '0.5rem 0.85rem';
  closeBtn.style.borderRadius = '8px';
  closeBtn.style.background = '#222';
  closeBtn.style.color = '#fff';
  closeBtn.style.border = 'none';
  closeBtn.setAttribute('data-modal-close', 'true');

  dialog.appendChild(closeBtn);
  overlay.appendChild(dialog);
  const target = document.body || document.documentElement;
  if (target) {
    target.appendChild(overlay);
  } else {
    document.addEventListener('DOMContentLoaded', () => document.body.appendChild(overlay), {
      once: true,
    });
  }
  return overlay;
};

export function createModal() {
  const overlay = ensureOverlay();
  const dialog = overlay.querySelector('[data-modal-dialog]');
  const closeBtn = overlay.querySelector('[data-modal-close]');

  const close = () => {
    overlay.style.display = 'none';
    dialog.innerHTML = '';
    dialog.appendChild(closeBtn);
    closeBtn.removeEventListener('click', close);
    document.removeEventListener('keyup', onEsc);
  };

  const onEsc = (event) => {
    if (event.key === 'Escape') close();
  };

  const open = (content) => {
    overlay.style.display = 'flex';
    dialog.innerHTML = '';
    if (typeof content === 'string') {
      const p = document.createElement('p');
      p.textContent = content;
      dialog.appendChild(p);
    } else if (content instanceof HTMLElement) {
      dialog.appendChild(content);
    }
    dialog.appendChild(closeBtn);
    closeBtn.addEventListener('click', close);
    document.addEventListener('keyup', onEsc);
    closeBtn.focus({ preventScroll: true });
  };

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });

  return { open, close };
}
