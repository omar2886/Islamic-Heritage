const PUB = window.__PUBLIC_BASE__ || '';
const URLS = window.__URLS__ || {};

let cachedRoles = null;
let inflight = null;

function join(base, path) {
  const cleanBase = base ? String(base).replace(/\/+$/, '') : '';
  const cleanPath = String(path || '').replace(/^\/+/, '');
  return cleanBase ? `${cleanBase}/${cleanPath}` : cleanPath;
}

function humanize(code) {
  if (!code) return '';
  return String(code)
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function normalizeRole(entry) {
  if (!entry) return null;
  if (typeof entry === 'string') {
    return { code: entry, label: humanize(entry) };
  }
  if (typeof entry !== 'object') return null;
  const code = entry.code || entry.id || entry.role || entry.value || entry.name;
  if (!code) return null;
  const label = entry.label || entry.title || humanize(code);
  const sex = entry.sex || entry.gender || undefined;
  const group = entry.group || undefined;
  return { code: String(code), label: String(label), ...(sex ? { sex: String(sex) } : {}), ...(group ? { group: String(group) } : {}) };
}

async function fetchRoles() {
  const url = URLS.roles || join(PUB, 'api/roles.php');
  const response = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`No se pudieron cargar roles (${response.status})`);
  }
  const json = await response.json();
  const list = Array.isArray(json) ? json : Array.isArray(json?.roles) ? json.roles : [];
  const normalized = list.map(normalizeRole).filter(Boolean);
  if (!normalized.length) {
    throw new Error('Catálogo de roles vacío');
  }
  return normalized;
}

async function loadRoles() {
  if (cachedRoles) return cachedRoles;
  if (inflight) return inflight;
  inflight = fetchRoles()
    .then((roles) => {
      cachedRoles = roles;
      return roles;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export { loadRoles, humanize };
