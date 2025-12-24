export const STORAGE_KEY = "heritage_ui_state_v1";
export const CURRENT_SCHEMA_VERSION = 1;

export function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.schemaVersion !== CURRENT_SCHEMA_VERSION) return null;
    const { schemaVersion, ...rest } = parsed;
    return rest;
  }catch(_e){
    return null;
  }
}

export function saveState(state){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }catch(_e){
    // ignore
  }
}

export function persistState(state){
  if (!state || typeof state !== "object") return;
  saveState({ ...state, schemaVersion: CURRENT_SCHEMA_VERSION });
}

export function clearPersistedState(){
  try{
    localStorage.removeItem(STORAGE_KEY);
  }catch(_e){
    // ignore
  }
}
