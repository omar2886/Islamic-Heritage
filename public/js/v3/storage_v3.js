const KEY = 'heritage_case_v3';

export function saveCase({ personsSnapshot, decedentId }) {
  if (typeof localStorage === 'undefined') return;
  const payload = { personsSnapshot: personsSnapshot || [], decedentId: decedentId || null };
  try {
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch (e) {
    /* ignore quota errors */
  }
}

export function loadCase() {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(KEY);
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
    localStorage.removeItem(KEY);
  } catch (e) {
    /* noop */
  }
}
