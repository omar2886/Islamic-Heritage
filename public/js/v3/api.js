export async function postCalc(payload) {
  const endpoint = window.__URLS__?.calc;
  if (!endpoint) {
    throw new Error('No se configuró el endpoint de cálculo.');
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const data = isJson ? await response.json().catch(() => null) : null;
  const text = isJson ? '' : await response.text().catch(() => '');

  if (!response.ok) {
    const message = data?.error || data?.message || text || `Error HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.body = data || text;
    throw error;
  }

  return data ?? {};
}
