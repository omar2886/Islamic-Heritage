const isJsonResponse = (response) => {
  const contentType = response.headers?.get?.('Content-Type') || '';
  return contentType.includes('application/json');
};

export async function apiFetch(path, options = {}) {
  const { method = 'GET', headers = {}, body, ...rest } = options;
  const init = {
    method,
    headers: { ...headers },
    ...rest,
  };

  if (body !== undefined) {
    if (body instanceof FormData) {
      init.body = body;
    } else if (typeof body === 'string') {
      init.body = body;
      init.headers['Content-Type'] = init.headers['Content-Type'] || 'text/plain;charset=utf-8';
    } else {
      init.body = JSON.stringify(body);
      init.headers['Content-Type'] = init.headers['Content-Type'] || 'application/json';
    }
  }

  const response = await fetch(path, init);
  const payload = isJsonResponse(response) ? await response.json().catch(() => null) : await response.text();

  if (!response.ok) {
    const error = new Error('Request failed');
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}
