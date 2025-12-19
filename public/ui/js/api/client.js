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

let inflightCalcController = null;

const composeSignal = (controller, externalSignal) => {
  if (!externalSignal) return controller.signal;
  if (externalSignal.aborted) {
    controller.abort(externalSignal.reason);
    return controller.signal;
  }
  const onAbort = () => controller.abort(externalSignal.reason);
  externalSignal.addEventListener('abort', onAbort, { once: true });
  controller.signal.addEventListener('abort', () =>
    externalSignal.removeEventListener('abort', onAbort),
  );
  return controller.signal;
};

export const abortCalcRequest = () => {
  if (!inflightCalcController) return;
  inflightCalcController.abort();
  inflightCalcController = null;
};

export async function postCalc(body, options = {}) {
  abortCalcRequest();
  const controller = new AbortController();
  inflightCalcController = controller;
  const { signal, ...rest } = options;

  try {
    return await apiFetch('/api/calc.php', {
      method: 'POST',
      cache: 'no-store',
      body,
      signal: composeSignal(controller, signal),
      ...rest,
    });
  } finally {
    if (inflightCalcController === controller) {
      inflightCalcController = null;
    }
  }
}
