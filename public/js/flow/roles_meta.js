export const ROLE_GROUPS = [
  { id: 'spouse', title: 'Cónyuge', roles: ['wife', 'husband'] },
  { id: 'desc', title: 'Descendientes', roles: ['son', 'daughter', 'sons_son', 'sons_daughter'] },
  { id: 'asc', title: 'Ascendientes', roles: ['father', 'mother', 'paternal_grandfather', 'paternal_grandmother', 'maternal_grandmother'] },
  { id: 'sib', title: 'Hermanos', roles: ['full_brother', 'full_sister', 'consanguine_brother', 'consanguine_sister', 'uterine_brother', 'uterine_sister'] },
  { id: 'coll', title: 'Colaterales (Avanzado)', roles: ['paternal_uncle', 'paternal_uncle_son', 'maternal_uncle', 'maternal_uncle_son'] }
];

export const ROLE_LABELS = {
  wife: 'Esposa(s)',
  husband: 'Esposo',
  son: 'Hijo',
  daughter: 'Hija',
  sons_son: 'Nieto (hijo de hijo)',
  sons_daughter: 'Nieta (hija de hijo)',
  father: 'Padre',
  mother: 'Madre',
  paternal_grandfather: 'Abuelo paterno',
  paternal_grandmother: 'Abuela paterna',
  maternal_grandmother: 'Abuela materna',
  full_brother: 'Hermano germano',
  full_sister: 'Hermana germana',
  consanguine_brother: 'Hermano consanguíneo',
  consanguine_sister: 'Hermana consanguínea',
  uterine_brother: 'Hermano uterino',
  uterine_sister: 'Hermana uterina',
  paternal_uncle: 'Tío paterno',
  paternal_uncle_son: 'Hijo de tío paterno',
  maternal_uncle: 'Tío materno',
  maternal_uncle_son: 'Hijo de tío materno'
};
