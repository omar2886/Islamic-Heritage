(function(){
  const params = new URLSearchParams(window.location.search);
  const DIAG = params.get('diag') === '1';

  if (!DIAG){
    function renderFallback(root, titleText, diagHref){
      if (!root) return;
      root.innerHTML = '';

      const container = document.createElement('div');
      container.style.padding = '1rem';
      container.style.border = '1px solid #ccc';
      container.style.background = '#fff';
      container.style.color = '#000';
      container.style.fontFamily = 'system-ui, sans-serif';
      container.style.maxWidth = '460px';
      container.style.margin = '1rem auto';

      const title = document.createElement('h2');
      title.textContent = titleText;
      title.style.fontSize = '18px';
      title.style.margin = '0 0 0.5rem 0';
      container.appendChild(title);

      const message = document.createElement('p');
      message.textContent = 'Error cargando la interfaz. Recarga / abre con ?diag=1';
      message.style.margin = '0 0 0.75rem 0';
      container.appendChild(message);

      const actions = document.createElement('div');
      actions.style.display = 'flex';
      actions.style.gap = '0.5rem';
      actions.style.flexWrap = 'wrap';

      const reloadBtn = document.createElement('button');
      reloadBtn.type = 'button';
      reloadBtn.textContent = 'Recargar';
      reloadBtn.addEventListener('click', () => window.location.reload());
      actions.appendChild(reloadBtn);

      const diagLink = document.createElement('a');
      diagLink.href = diagHref;
      diagLink.textContent = 'Activar diagnóstico (?diag=1)';
      diagLink.rel = 'noreferrer';
      actions.appendChild(diagLink);

      container.appendChild(actions);
      root.appendChild(container);
    }

    function needsFallback(root, mountedFlag){
      if (!root) return false;
      const text = (root.textContent || '').trim().toLowerCase();
      const hasLoading = text.includes('cargando');
      const hasChildren = root.children && root.children.length > 0;
      if (mountedFlag === true && hasChildren && !hasLoading){
        return false;
      }
      return hasLoading || !hasChildren || mountedFlag !== true;
    }

    function scheduleFallbackCheck(){
      const diagUrl = new URL(window.location.href);
      diagUrl.searchParams.set('diag', '1');
      const diagHref = diagUrl.toString();

      const check = () => {
        const bodyPage = document.body?.dataset?.page;
        if (bodyPage === 'builder'){
          const builderRoot = document.getElementById('builder-root');
          if (needsFallback(builderRoot, window.__BUILDER_MOUNTED__)){
            renderFallback(builderRoot, 'No se pudo cargar el constructor', diagHref);
          }
        }

        const resultsRoot = document.getElementById('results-root');
        if (resultsRoot && needsFallback(resultsRoot, window.__RESULTS_MOUNTED__)){
          renderFallback(resultsRoot, 'No se pudieron cargar los resultados', diagHref);
        }
      };

      window.setTimeout(check, 1700);
    }

    if (document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', scheduleFallbackCheck, { once: true });
    } else {
      scheduleFallbackCheck();
    }

    return;
  }

  const pb = window.__PUBLIC_BASE__ || '';
  const ab = window.__APP_BASE__ || '';
  const join = function(base, path){
    const cleanBase = (base || '').replace(/\/$/, '');
    const cleanPath = (path || '').replace(/^\//, '');
    return cleanBase ? cleanBase + '/' + cleanPath : '/' + cleanPath;
  };

  console.log('[bootstrap]', { __PUBLIC_BASE__: pb, __APP_BASE__: ab, href: window.location?.href });

  const bannerState = {
    root: null,
    list: null,
  };

  function ensureBanner(){
    if (bannerState.root) return bannerState;
    const root = document.createElement('div');
    root.id = 'diagnostic-banner';
    root.setAttribute('role', 'status');
    root.style.position = 'fixed';
    root.style.bottom = '1rem';
    root.style.right = '1rem';
    root.style.background = '#fee';
    root.style.border = '1px solid #c00';
    root.style.padding = '0.75rem';
    root.style.maxWidth = '360px';
    root.style.zIndex = '9999';
    root.style.fontFamily = 'system-ui, sans-serif';
    root.style.fontSize = '14px';
    root.style.boxShadow = '0 4px 14px rgba(0,0,0,0.18)';

    const title = document.createElement('div');
    title.textContent = 'Diagnóstico de arranque';
    title.style.fontWeight = 'bold';
    title.style.marginBottom = '0.5rem';
    root.appendChild(title);

    const list = document.createElement('ul');
    list.style.margin = '0';
    list.style.paddingLeft = '1rem';
    list.style.listStyle = 'disc';
    root.appendChild(list);

    bannerState.root = root;
    bannerState.list = list;

    const attach = () => {
      if (!document.body){
        window.requestAnimationFrame(attach);
        return;
      }
      if (!document.body.contains(root)){
        document.body.appendChild(root);
      }
    };
    attach();
    return bannerState;
  }

  function addMessage(text, tone){
    const { list } = ensureBanner();
    const item = document.createElement('li');
    item.textContent = text;
    if (tone === 'error'){
      item.style.color = '#900';
      item.style.fontWeight = 'bold';
    }
    list.appendChild(item);
  }

  window.addEventListener('error', (event) => {
    const where = [event.filename, event.lineno, event.colno].filter(Boolean).join(':');
    const suffix = where ? ` (${where})` : '';
    addMessage(`Error global: ${event.message}${suffix}`, 'error');
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event?.reason;
    const detail = reason && (reason.stack || reason.message || reason) ? (reason.stack || reason.message || reason) : 'unknown';
    addMessage(`Promesa no manejada: ${detail}`, 'error');
  });

  function checkUiMounted(){
    const root = document.getElementById('builder-root');
    if (!root) return;
    const text = (root.textContent || '').toLowerCase();
    const hasLoading = text.includes('cargando');
    const hasChildren = root.children && root.children.length > 0;
    if (hasLoading || !hasChildren){
      addMessage('UI no montada todavía (siguen los textos de carga).', 'error');
    }
  }

  function summarizeBody(body, contentType){
    if (!contentType) return body.split(/\r?\n/)[0]?.trim().slice(0, 200) || '';
    const lower = contentType.toLowerCase();
    if (lower.includes('javascript') || lower.includes('json')){
      return '';
    }
    return body.split(/\r?\n/)[0]?.trim().slice(0, 200) || '';
  }

  async function probe(url, label){
    try {
      const res = await fetch(url, { cache: 'no-store' });
      const contentType = res.headers.get('content-type') || '';
      const text = await res.text();
      const summary = summarizeBody(text, contentType);
      const statusMsg = `${label}: ${res.status}${res.statusText ? ' ' + res.statusText : ''} (${contentType || 'sin Content-Type'})`;
      if (summary){
        addMessage(`${statusMsg} – ${summary}`, res.ok ? undefined : 'error');
      } else {
        addMessage(statusMsg, res.ok ? undefined : 'error');
      }
    } catch (err){
      addMessage(`${label}: error al cargar (${err && err.message ? err.message : err})`, 'error');
    }
  }

  async function probeImports(bootUrl){
    try {
      const absBootUrl = new URL(bootUrl, window.location.href).toString();
      const res = await fetch(absBootUrl, { cache: 'no-store' });
      const text = await res.text();
      const contentType = res.headers.get('content-type') || '';
      const summary = summarizeBody(text, contentType);
      const statusMsg = `boot-builder.js (lectura para imports): ${res.status}${res.statusText ? ' ' + res.statusText : ''} (${contentType || 'sin Content-Type'})`;
      if (summary){
        addMessage(`${statusMsg} – ${summary}`, res.ok ? undefined : 'error');
      } else {
        addMessage(statusMsg, res.ok ? undefined : 'error');
      }

      const regex = /import\s+(?:[^'";]+\s+from\s+)?['"]([^'"`]+)['"]/g;
      const imports = new Set();
      let m;
      while ((m = regex.exec(text)) !== null){
        if (m[1]) imports.add(m[1]);
      }
      imports.forEach((spec) => {
        try {
          const resolved = new URL(spec, absBootUrl).toString();
          const label = `import ${spec} → ${resolved}`;
          void probe(resolved, label);
        } catch (e){
          addMessage(`No se pudo resolver import ${spec}: ${e && e.message ? e.message : e}`, 'error');
        }
      });
    } catch (err){
      addMessage(`No se pudieron analizar imports de boot-builder.js: ${err && err.message ? err.message : err}`, 'error');
    }
  }

  function checkBootLifecycle(){
    const started = Object.prototype.hasOwnProperty.call(window, '__BOOT_BUILDER_STARTED__');
    const mounted = window.__BUILDER_MOUNTED__ === true;
    const err = window.__BOOT_BUILDER_ERROR__;

    if (!started){
      addMessage('boot-builder.js no se evaluó (__BOOT_BUILDER_STARTED__ ausente).', 'error');
      return;
    }
    if (!mounted){
      if (err){
        addMessage(`mountBuilder() falló: ${err}`, 'error');
      } else {
        addMessage('boot-builder.js se evaluó pero __BUILDER_MOUNTED__ sigue false (excepción o retorno anticipado).', 'error');
      }
    }
  }

  function startDiagnostics(){
    const targets = [
      { label: 'boot-builder.js', path: 'js/boot-builder.js' },
      { label: 'styles.css', path: 'css/styles.css' },
      { label: 'roles.php', path: 'api/roles.php' },
    ];
    targets.forEach((t) => {
      const url = join(pb, t.path);
      void probe(url, t.label);
    });
    const bootUrl = join(pb, 'js/boot-builder.js');
    void probeImports(bootUrl);
    window.setTimeout(checkUiMounted, 1500);
    window.setTimeout(checkBootLifecycle, 2000);
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', startDiagnostics, { once: true });
  } else {
    startDiagnostics();
  }
})();
