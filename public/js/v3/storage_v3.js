const KEY_CASE = 'heritage_case_v3';
const KEY_LAST_PAYLOAD = 'heritage_last_payload_v3';
const KEY_LAST_OUTPUT = 'heritage_last_output_v3';

export function saveCase({ personsSnapshot, decedentId }) {
  if (typeof localStorage === 'undefined') return;
  const payload = { personsSnapshot: personsSnapshot || [], decedentId: decedentId || null };
  try {
    localStorage.setItem(KEY_CASE, JSON.stringify(payload));
  } catch (e) {
    /* ignore quota errors */
  }
}

export function loadCase() {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(KEY_CASE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      personsSnapshot: Array.isArray(parsed.personsSnapshot) ? parsed.personsSnapshot : [],
      decedentId: parsed.decedentId || null,
    };
  } catch (e) {
    return null;
  }
}

export function clearCase() {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(KEY_CASE);
  } catch (e) {
    /* noop */
  }
}

export function saveLastPayload(payload) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(KEY_LAST_PAYLOAD, JSON.stringify(payload || {}));
  } catch (e) {
    /* noop */
  }
}

export function loadLastPayload() {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(KEY_LAST_PAYLOAD);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

export function saveLastOutput(output) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(KEY_LAST_OUTPUT, JSON.stringify(output));
  } catch (e) {
    /* noop */
  }
}

export function loadLastOutput() {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(KEY_LAST_OUTPUT);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}
