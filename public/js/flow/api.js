export async function postJson(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    credentials: 'same-origin',
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`Non-JSON response: ${text.slice(0, 400)}`);
  }
}

export async function postCalc(apiUrlFn, payload) {
  return postJson(apiUrlFn('api/calc.php'), payload);
}

export async function loadRoles(apiUrlFn) {
  const res = await fetch(apiUrlFn('api/roles.php'), { credentials: 'same-origin' });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(`Non-JSON roles: ${text.slice(0, 400)}`); }
  // roles.php puede devolver {roles:[...]} o [...]
  const roles = Array.isArray(data) ? data : (data.roles || []);
  return roles;
}
