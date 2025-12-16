// storage.js — autosave simple en localStorage
const KEY = 'heritage_case_autosave_v1';

export function saveDraft(obj){
  try {
    localStorage.setItem(KEY, JSON.stringify(obj));
    return true;
  } catch {
    return false;
  }
}

export function loadDraft(){
  try {
    const t = localStorage.getItem(KEY);
    return t ? JSON.parse(t) : null;
  } catch {
    return null;
  }
}

export function clearDraft(){
  try {
    localStorage.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}

export function hasDraft(){
  try {
    return !!localStorage.getItem(KEY);
  } catch {
    return false;
  }
}
