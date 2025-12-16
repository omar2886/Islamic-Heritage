// aliases.js — normalización de roles hacia la taxonomía canónica del backend.
export const CANONICAL_ROLES = new Set([
  'husband','wife','son','daughter','father','mother',
  'paternal_grandfather','paternal_grandmother','maternal_grandmother',
  'full_brother','full_sister','consanguine_brother','consanguine_sister','uterine_brother','uterine_sister'
]);

// alias comunes (lowercase, sin espacios). Evita meter 'maternal_grandfather' porque no es canónico.
const ROLE_ALIASES = new Map(Object.entries({
  // cónyuges
  'wives':'wife','wifes':'wife','esposas':'wife',
  'husbands':'husband','esposos':'husband',
  'spouse':'__SPOUSE__', 'conyuge':'__SPOUSE__',

  // hijos
  'sons':'son','boys':'son','hijos':'son',
  'daughters':'daughter','girls':'daughter','hijas':'daughter',

  // padres
  'padre':'father','madre':'mother','fathers':'father','mothers':'mother',

  // abuelos
  'pgf':'paternal_grandfather','abuelo_paterno':'paternal_grandfather',
  'pgm':'paternal_grandmother','abuela_paterna':'paternal_grandmother',
  'mgm':'maternal_grandmother','abuela_materna':'maternal_grandmother',

  // hermanos genéricos
  'brother':'full_brother','sister':'full_sister','hermano':'full_brother','hermana':'full_sister',
  // hermanos específicos
  'agnatic_brother':'consanguine_brother','agnatic_sister':'consanguine_sister',
  'consanguineous_brother':'consanguine_brother','consanguineous_sister':'consanguine_sister',
  'uterine_bro':'uterine_brother','uterine_sis':'uterine_sister',
}));

function toKey(s){ return String(s||'').trim().toLowerCase().replace(/\s+/g,'_'); }

/**
 * Devuelve {role, warn?} con el rol canónico o null si no es mapeable.
 * - Para 'spouse' usa sexOfDecedent: male→wife, female→husband, unknown→null(+warn).
 */
export function canonicalizeRole(role, { sexOfDecedent='unknown' }={}){
  if (!role) return { role: null, warn: 'role vacío' };
  const k = toKey(role);
  if (CANONICAL_ROLES.has(k)) return { role: k };
  const ali = ROLE_ALIASES.get(k);
  if (!ali){
    return { role: null, warn: `role desconocido: ${role}` };
  }
  if (ali === '__SPOUSE__'){
    if (sexOfDecedent === 'male')  return { role: 'wife' };
    if (sexOfDecedent === 'female')return { role: 'husband' };
    return { role: null, warn: `spouse ambiguo con sex=unknown` };
  }
  return { role: ali };
}

/** Normaliza un objeto counts{alias->n} → {canonical->n} (agregando). */
export function normalizeCountsObject(counts, { sexOfDecedent='unknown' }={}){
  const out = {};
  const warns = [];
  for (const [k,v] of Object.entries(counts||{})){
    const n = (v|0);
    const { role, warn } = canonicalizeRole(k, { sexOfDecedent });
    if (role) out[role] = (out[role]||0) + n;
    else if (warn) warns.push(warn);
  }
  return { counts: out, warnings: warns };
}

/** Normaliza persons[].role in-place; devuelve lista de avisos. */
export function normalizePersonsArray(persons, { sexOfDecedent='unknown' }={}){
  const warns = [];
  (persons||[]).forEach(p=>{
    if (!p || !('role' in p)) return;
    const r = String(p.role||'').trim();
    if (!r) return;
    const { role, warn } = canonicalizeRole(r, { sexOfDecedent });
    if (role) p.role = role; else { p.role=''; if (warn) warns.push(warn); }
  });
  return { warnings: warns };
}
