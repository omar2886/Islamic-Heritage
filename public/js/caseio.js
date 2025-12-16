// caseio.js — construcción y aplicación de "case files" (export/import)
import { snapshotPersons, resetPersons, addPerson } from './persons.js';
import { State, setSex, setEstateValue, setCount, setDecedent } from './state.js';
import { normalizeCountsObject, normalizePersonsArray } from './aliases.js';

// Genera objeto de caso (para export/autosave)
export function makeCase(){
  // counts → objeto plano
  const counts = {};
  for (const [k, v] of State.counts.entries()) counts[k] = v | 0;
  return {
    version: 1,
    meta: { sex: State.sex, decedentId: State.decedentId || null },
    estate_value: String(State.estateValue || ''),
    counts,
    persons: snapshotPersons(),
  };
}

// Aplica un caso al estado/UI (devuelve avisos)
export function applyCase(caseObj){
  if (!caseObj || typeof caseObj !== 'object') throw new Error('Case inválido');
  const { meta = {}, estate_value = '', counts = {}, persons = [] } = caseObj;

  const sex = (meta.sex === 'male' || meta.sex === 'female') ? meta.sex : 'unknown';
  const sexOfDecedent = sex;

  // Persons (normalizar roles por alias)
  resetPersons();
  const people = Array.isArray(persons) ? persons.map(x => ({ ...x })) : [];
  const pWarns = normalizePersonsArray(people, { sexOfDecedent }).warnings;
  people.forEach(p => addPerson(p));

  // Meta y patrimonio
  setSex(sex);
  setDecedent(meta.decedentId || null);
  setEstateValue(estate_value);

  // Counts (normalizar alias y agregar)
  const { counts: normCounts, warnings: cWarns } = normalizeCountsObject(counts, { sexOfDecedent });
  State.counts.clear();
  Object.entries(normCounts).forEach(([r, n]) => setCount(r, n | 0));

  return { warnings: [...pWarns, ...cWarns] };
}

// Validación minimalista del case file
export function validateCaseShape(obj){
  const errors = [];
  if (!obj || typeof obj !== 'object') errors.push('No es un objeto JSON');
  if (!('persons' in obj)) errors.push('Falta persons[]');
  if (!('counts' in obj)) errors.push('Falta counts{}');
  if (!('meta' in obj)) errors.push('Falta meta{}');
  if (!('estate_value' in obj)) errors.push('Falta estate_value');
  if (obj && obj.persons && !Array.isArray(obj.persons)) errors.push('persons no es array');
  if (obj && obj.counts && typeof obj.counts !== 'object') errors.push('counts no es objeto');
  return errors;
}
