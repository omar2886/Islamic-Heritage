import { postCalc } from '../api/client.js';
import { navigate } from '../router.js';
import { store } from '../store/store.js';
import { showToast } from '../ui/toast.js';

let calcSequence = 0;

const formatErrorMessage = (error, fallback = 'No se pudo calcular.') => {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  if (typeof error?.message === 'string') return error.message;
  if (typeof error?.payload?.error === 'string') return error.payload.error;
  return fallback;
};

export async function runCalculation({ navigateOnSuccess = true } = {}) {
  const state = store.getState();
  const payload = state?.derived?.payloadPreview;
  const hasHardBlocks = (state?.derived?.hardBlocks || []).length > 0;
  const heirCount = payload?.heirs?.length || 0;

  if (hasHardBlocks) {
    showToast('Resuelve los bloqueos duros antes de calcular.', { type: 'warning' });
    return null;
  }

  if (heirCount === 0) {
    showToast('Agrega al menos un heredero para calcular.', { type: 'warning' });
    return null;
  }

  const requestId = ++calcSequence;
  const startedAt = Date.now();

  store.setState(
    (current) => ({
      ...current,
      results: {
        ...current.results,
        status: 'pending',
        error: null,
        payload,
        lastComputedAt: startedAt,
      },
    }),
    { markDirty: false, source: 'calc:start' },
  );

  try {
    const response = await postCalc(payload);
    if (requestId !== calcSequence) return null;
    const ok = response?.ok === true;

    store.setState(
      (current) => ({
        ...current,
        results: {
          ...current.results,
          status: ok ? 'success' : 'error',
          lastResponse: response,
          payload,
          error: ok ? null : formatErrorMessage(response, null),
          lastComputedAt: Date.now(),
        },
      }),
      { markDirty: false, source: 'calc:done' },
    );

    if (navigateOnSuccess) navigate('results');
    if (ok) {
      showToast('Cálculo listo.', { type: 'success' });
    } else {
      showToast(formatErrorMessage(response, 'El motor devolvió un error.'), { type: 'error' });
    }

    return response;
  } catch (error) {
    if (requestId !== calcSequence) return null;
    const isAbort = error?.name === 'AbortError';
    const message = formatErrorMessage(error);

    store.setState(
      (current) => ({
        ...current,
        results: {
          ...current.results,
          status: isAbort ? 'aborted' : 'error',
          lastResponse: error?.payload || current.results?.lastResponse || null,
          payload,
          error: isAbort ? null : message,
          lastComputedAt: Date.now(),
        },
      }),
      { markDirty: false, source: 'calc:error' },
    );

    if (!isAbort) {
      showToast(message, { type: 'error' });
    }

    return null;
  }
}
