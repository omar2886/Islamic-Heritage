export const ROLE_SECTIONS = [
  { id: 'couple', label: 'Cónyuge' },
  { id: 'ascendants', label: 'Ascendientes directos' },
  { id: 'descendants', label: 'Descendencia' },
  { id: 'siblings', label: 'Hermanos y hermanas' },
  { id: 'paternal_line', label: 'Línea paterna extendida' },
  { id: 'grandmothers', label: 'Abuelas' },
];

export const ROLE_CATALOG = [
  { id: 'husband', label: 'Esposo', section: 'couple' },
  { id: 'wife', label: 'Esposa', section: 'couple' },
  { id: 'father', label: 'Padre', section: 'ascendants' },
  { id: 'mother', label: 'Madre', section: 'ascendants' },
  { id: 'paternal_grandfather', label: 'Abuelo paterno', section: 'ascendants' },
  { id: 'maternal_grandmother', label: 'Abuela materna', section: 'grandmothers' },
  { id: 'son', label: 'Hijo', section: 'descendants' },
  { id: 'daughter', label: 'Hija', section: 'descendants' },
  { id: 'sons_son', label: 'Nieto por hijo', section: 'descendants' },
  { id: 'sons_daughter', label: 'Nieta por hijo', section: 'descendants' },
  { id: 'full_brother', label: 'Hermano germano', section: 'siblings' },
  { id: 'full_sister', label: 'Hermana germana', section: 'siblings' },
  { id: 'consanguine_brother', label: 'Hermano consanguíneo', section: 'siblings' },
  { id: 'consanguine_sister', label: 'Hermana consanguínea', section: 'siblings' },
  { id: 'uterine_brother', label: 'Hermano uterino', section: 'siblings' },
  { id: 'uterine_sister', label: 'Hermana uterina', section: 'siblings' },
  { id: 'paternal_uncle', label: 'Tío paterno', section: 'paternal_line' },
  { id: 'paternal_uncle_son', label: 'Primo paterno', section: 'paternal_line' },
  { id: 'paternal_uncle_sons_daughter', label: 'Prima paterna (hija de primo)', section: 'paternal_line' },
  { id: 'paternal_uncles_daughter', label: 'Prima paterna (hija de tío)', section: 'paternal_line' },
  { id: 'consanguine_paternal_uncle', label: 'Tío paterno consanguíneo', section: 'paternal_line' },
  { id: 'consanguine_paternal_uncle_son', label: 'Primo paterno consanguíneo', section: 'paternal_line' },
  {
    id: 'consanguine_paternal_uncle_sons_daughter',
    label: 'Prima paterna consanguínea (hija de primo)',
    section: 'paternal_line',
  },
  {
    id: 'consanguine_paternal_uncles_daughter',
    label: 'Prima paterna consanguínea (hija de tío)',
    section: 'paternal_line',
  },
  { id: 'paternal_grandmother', label: 'Abuela paterna', section: 'grandmothers' },
  { id: 'paternal_great_grandmother', label: 'Bisabuela paterna', section: 'grandmothers' },
  { id: 'maternal_great_grandmother', label: 'Bisabuela materna', section: 'grandmothers' },
];

export const ROLE_IDS = ROLE_CATALOG.map((item) => item.id);
export const ROLE_SET = new Set(ROLE_IDS);

export const roleLabel = (roleId) => ROLE_CATALOG.find((item) => item.id === roleId)?.label || roleId;

export function diffRoleSets(receivedRoles, expected = ROLE_IDS) {
  const received = new Set(Array.isArray(receivedRoles) ? receivedRoles : []);
  const expectedSet = new Set(expected);
  const missing = Array.from(expectedSet).filter((role) => !received.has(role));
  const extra = Array.from(received).filter((role) => !expectedSet.has(role));

  return {
    ok: missing.length === 0 && extra.length === 0,
    missing,
    extra,
  };
}
