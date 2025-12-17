(function(){
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
      const statusMsg = `${label}: ${res.status}${res.statusText ? ' ' + res.statusText : ''}`;
      if (summary){
        addMessage(`${statusMsg} – ${summary}`, res.ok ? undefined : 'error');
      } else {
        addMessage(statusMsg, res.ok ? undefined : 'error');
      }
    } catch (err){
      addMessage(`${label}: error al cargar (${err && err.message ? err.message : err})`, 'error');
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
    window.setTimeout(checkUiMounted, 1500);
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', startDiagnostics, { once: true });
  } else {
    startDiagnostics();
  }
})();
