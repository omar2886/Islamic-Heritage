// storage.js — autosave simple en localStorage
export const AUTOSAVE_KEY = 'heritage_case_autosave_v1';
export const PAYLOAD_KEY = 'heritage_payload';
export const LAST_PAYLOAD_KEY = 'heritage_last_payload';

export function saveDraft(obj){
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(obj));
    return true;
  } catch {
    return false;
  }
}

export function loadDraft(){
  try {
    const t = localStorage.getItem(AUTOSAVE_KEY);
    return t ? JSON.parse(t) : null;
  } catch {
    return null;
  }
}

export function clearDraft(){
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function hasDraft(){
  try {
    return !!localStorage.getItem(AUTOSAVE_KEY);
  } catch {
    return false;
  }
}

export function persistPayload(payload){
  try {
    sessionStorage.setItem(PAYLOAD_KEY, JSON.stringify(payload));
  } catch {}
  try {
    localStorage.setItem(LAST_PAYLOAD_KEY, JSON.stringify(payload));
  } catch {}
}

export function loadStoredPayloads(){
  let source = null;
  let payload = null;

  try {
    const sessionCopy = sessionStorage.getItem(PAYLOAD_KEY);
    if (sessionCopy) {
      payload = JSON.parse(sessionCopy);
      source = 'session';
    }
  } catch {}

  if (!payload){
    try {
      const localCopy = localStorage.getItem(LAST_PAYLOAD_KEY);
      if (localCopy) {
        payload = JSON.parse(localCopy);
        source = 'local';
      }
    } catch {}
  }

  return { source, payload };
}

export function clearStoredPayloads(){
  let ok = true;
  try { sessionStorage.removeItem(PAYLOAD_KEY); } catch { ok = false; }
  try { localStorage.removeItem(LAST_PAYLOAD_KEY); } catch { ok = false; }
  return ok;
}
