function apiUrl(rel) {
  const base = (window.__APP_BASE__ || '').replace(/\/+$/, '');
  return new URL(base + '/' + rel.replace(/^\/+/, ''), window.location.origin);
}

export async function getRoles() {
  const response = await fetch(apiUrl('api/roles.php'));
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const data = await response.json();
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.roles)) return data.roles;
  return [];
}

export async function postCalc(payload) {
  const response = await fetch(apiUrl('api/calc.php'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error('Non-JSON response from API');
  }
}

export { apiUrl };
