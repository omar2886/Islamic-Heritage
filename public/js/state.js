// State: contadores por rol + sexo del causante + monto.
// MVP por "counts" (agrupado). Personas individuales y enlaces: Sprint 4.
export const State = {
  sex: 'unknown',           // 'male' | 'female' | 'unknown'
  estateValue: '',          // string decimal
  counts: new Map(),        // role -> integer >= 0
  decedentId: null,
};

export function setSex(v){
  State.sex = (v==='male'||v==='female'||v==='unknown') ? v : 'unknown';
}
export function setEstateValue(v){
  State.estateValue = String(v ?? '').trim();
}
export function setCount(role, n){
  const v = Number.isFinite(+n) ? Math.max(0, Math.floor(+n)) : 0;
  State.counts.set(role, v);
}
export function getCount(role){
  return State.counts.get(role) || 0;
}
export function resetCounts(roles){
  roles.forEach(r => State.counts.set(r, 0));
}
export function setDecedent(id){
  State.decedentId = id || null;
}
export function snapshot(){
  // copia inmutable para validación/serialización
  return {
    sex: State.sex,
    estateValue: State.estateValue,
    counts: new Map(State.counts),
    decedentId: State.decedentId,
  };
}
