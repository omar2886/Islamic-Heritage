// persons.js — Registro de personas (MVP). No persistimos; es in-memory en el front.
let seq = 1;
export const Persons = {
  list: [], // [{id,name,sex:'male'|'female'|'unknown',alive:true|false,role:'wife'|...,fatherId?,motherId?,spouseIds:[]}]
  byId: new Map(),
};

function notifyChange(){
  if (typeof window !== 'undefined' && typeof window.__onModelChanged === 'function') {
    try { window.__onModelChanged(); } catch (e) { /* noop */ }
  }
}

export function addPerson(data = {}){
  const p = {
    id: `P${seq++}`,
    name: String(data.name || '').trim(),
    sex: (['male','female'].includes(data.sex) ? data.sex : 'unknown'),
    alive: data.alive !== false, // default true
    role: String(data.role || '').trim(),
    fatherId: data.fatherId || null,
    motherId: data.motherId || null,
    spouseIds: Array.isArray(data.spouseIds) ? Array.from(new Set(data.spouseIds)) : [],
  };
  Persons.list.push(p);
  Persons.byId.set(p.id, p);
  notifyChange();
  return p;
}
export function updatePerson(id, patch = {}){
  const p = Persons.byId.get(id); if (!p) return;
  if ('name' in patch)  p.name  = String(patch.name || '').trim();
  if ('sex' in patch)   p.sex   = (['male','female'].includes(patch.sex) ? patch.sex : 'unknown');
  if ('alive' in patch) p.alive = !!patch.alive;
  if ('role' in patch)  p.role  = String(patch.role || '').trim();
  if ('fatherId' in patch) p.fatherId = patch.fatherId || null;
  if ('motherId' in patch) p.motherId = patch.motherId || null;
  if ('spouseIds' in patch) p.spouseIds = Array.isArray(patch.spouseIds) ? Array.from(new Set(patch.spouseIds)) : p.spouseIds;
  notifyChange();
  return p;
}
export function removePerson(id){
  Persons.list = Persons.list.filter(x => x.id !== id);
  Persons.byId.delete(id);
  for (const q of Persons.list){
    if (q.fatherId === id) q.fatherId = null;
    if (q.motherId === id) q.motherId = null;
    if (Array.isArray(q.spouseIds)) q.spouseIds = q.spouseIds.filter(sid => sid !== id);
  }
  notifyChange();
}
export function resetPersons(){
  Persons.list = []; Persons.byId.clear(); seq = 1;
  notifyChange();
}

export function hydratePersons(list = []){
  resetPersons();
  Persons.list = [];
  Persons.byId.clear();

  let nextSeq = 1;
  list.forEach((data = {}) => {
    const p = {
      id: String(data.id || '').trim() || `P${nextSeq}`,
      name: String(data.name || '').trim(),
      sex: (['male', 'female'].includes(data.sex) ? data.sex : 'unknown'),
      alive: data.alive !== false,
      role: String(data.role || '').trim(),
      fatherId: data.fatherId || null,
      motherId: data.motherId || null,
      spouseIds: Array.isArray(data.spouseIds) ? Array.from(new Set(data.spouseIds)) : [],
    };
    Persons.list.push(p);
    Persons.byId.set(p.id, p);

    const num = parseInt(String(p.id).replace(/\D/g, ''), 10);
    if (Number.isFinite(num)) {
      nextSeq = Math.max(nextSeq, num + 1);
    }
  });

  seq = Math.max(nextSeq, Persons.list.length + 1);
  notifyChange();
}
export function snapshotPersons(){
  return Persons.list.map(({id,name,sex,alive,role,fatherId,motherId,spouseIds}) =>
    ({id,name,sex,alive,role,fatherId:fatherId||null,motherId:motherId||null,spouseIds:Array.from(new Set(spouseIds||[]))}));
}
export function linkSpouses(aId, bId){
  const a = Persons.byId.get(aId), b = Persons.byId.get(bId); if (!a||!b) return;
  a.spouseIds = Array.from(new Set([...(a.spouseIds||[]), bId]));
  b.spouseIds = Array.from(new Set([...(b.spouseIds||[]), aId]));
  notifyChange();
}
export function unlinkSpouses(aId, bId){
  const a = Persons.byId.get(aId), b = Persons.byId.get(bId); if (!a||!b) return;
  a.spouseIds = (a.spouseIds||[]).filter(x=>x!==bId);
  b.spouseIds = (b.spouseIds||[]).filter(x=>x!==aId);
  notifyChange();
}
