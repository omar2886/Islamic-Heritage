(function () {
  const OVERLAY_ID = 'fatal-error-overlay';

  function createOverlay() {
    let overlay = document.getElementById(OVERLAY_ID);
    if (overlay) {
      return overlay;
    }
    overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.right = '0';
    overlay.style.zIndex = '9999';
    overlay.style.backgroundColor = 'rgba(128, 0, 0, 0.9)';
    overlay.style.color = '#fff';
    overlay.style.fontFamily = 'system-ui, -apple-system, Segoe UI, sans-serif';
    overlay.style.padding = '12px 16px';
    overlay.style.whiteSpace = 'pre-wrap';
    overlay.style.wordBreak = 'break-word';
    overlay.style.boxShadow = '0 2px 8px rgba(0,0,0,0.4)';

    const title = document.createElement('div');
    title.style.fontWeight = 'bold';
    title.style.marginBottom = '6px';
    title.textContent = 'Se ha producido un error en la aplicación';
    overlay.appendChild(title);

    const message = document.createElement('div');
    message.id = OVERLAY_ID + '-message';
    message.style.marginBottom = '6px';
    overlay.appendChild(message);

    const location = document.createElement('div');
    location.id = OVERLAY_ID + '-location';
    location.style.marginBottom = '6px';
    overlay.appendChild(location);

    const stack = document.createElement('pre');
    stack.id = OVERLAY_ID + '-stack';
    stack.style.margin = '0';
    stack.style.maxHeight = '40vh';
    stack.style.overflow = 'auto';
    overlay.appendChild(stack);

    const target = document.body || document.documentElement || document.head || document;
    target.appendChild(overlay);
    return overlay;
  }

  function renderError(details) {
    window.__LAST_FATAL__ = details;
    const overlay = createOverlay();
    const messageEl = overlay.querySelector('#' + OVERLAY_ID + '-message');
    const locationEl = overlay.querySelector('#' + OVERLAY_ID + '-location');
    const stackEl = overlay.querySelector('#' + OVERLAY_ID + '-stack');

    if (messageEl) {
      messageEl.textContent = details.msg || 'Error desconocido';
    }
    if (locationEl) {
      const locParts = [];
      if (details.url) {
        locParts.push(details.url);
      }
      if (details.line != null) {
        locParts.push('L' + details.line);
      }
      if (details.col != null) {
        locParts.push('C' + details.col);
      }
      locationEl.textContent = locParts.length ? locParts.join(':') : '';
    }
    if (stackEl) {
      stackEl.textContent = details.stack || '';
      stackEl.style.display = details.stack ? 'block' : 'none';
    }
  }

  function normalizeError(event) {
    const isErrorEvent = event && typeof event === 'object' && 'message' in event;
    if (isErrorEvent) {
      return {
        msg: String(event.message || 'Error desconocido'),
        stack: event.error && event.error.stack ? String(event.error.stack) : '',
        url: event.filename || (event.error && event.error.fileName) || '',
        line: event.lineno != null ? Number(event.lineno) : null,
        col: event.colno != null ? Number(event.colno) : null,
      };
    }

    const reason = event && event.reason != null ? event.reason : event;
    const isErrorLike = reason && typeof reason === 'object' && 'message' in reason;
    return {
      msg: isErrorLike ? String(reason.message) : String(reason || 'Unhandled rejection'),
      stack: isErrorLike && reason.stack ? String(reason.stack) : '',
      url: '',
      line: null,
      col: null,
    };
  }

  window.addEventListener('error', function (event) {
    try {
      renderError(normalizeError(event));
    } catch (err) {
      console.error('Error while rendering overlay', err);
    }
  });

  window.addEventListener('unhandledrejection', function (event) {
    try {
      renderError(normalizeError(event));
    } catch (err) {
      console.error('Error while rendering overlay', err);
    }
  });
})();
