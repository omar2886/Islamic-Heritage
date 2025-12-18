export const GROUPS_ORDER = [
  { id: 'spouse', title: 'Cónyuge', roles: ['wife', 'husband'] },
  { id: 'desc', title: 'Descendientes', roles: ['son', 'daughter', 'sons_son', 'sons_daughter'] },
  { id: 'asc', title: 'Ascendientes', roles: ['father', 'mother', 'paternal_grandfather', 'paternal_grandmother', 'maternal_grandmother'] },
  { id: 'sib', title: 'Hermanos', roles: ['full_brother', 'full_sister', 'consanguine_brother', 'consanguine_sister', 'uterine_brother', 'uterine_sister'] },
  { id: 'coll', title: 'Colaterales (Avanzado)', roles: ['paternal_uncle', 'paternal_uncle_son', 'maternal_uncle', 'maternal_uncle_son'] },
];

export const LABELS_FALLBACK = {
  wife: 'Esposa(s)',
  husband: 'Esposo',
  son: 'Hijo(s)',
  daughter: 'Hija(s)',
  father: 'Padre',
  mother: 'Madre',
};
