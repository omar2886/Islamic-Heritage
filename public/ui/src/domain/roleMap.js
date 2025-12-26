// Declarative UI metadata for the 27 roleIds supported by the core.
// This file intentionally contains NO inference logic.
// UI fields map 1:1 to roleIds.

export const UI_SECTIONS = [
  {
    id: "ascendants",
    title: "Padres",
    defaultOpen: true,
    roles: ["father", "mother"]
  },
  {
    id: "spouse",
    title: "Cónyuge",
    defaultOpen: true,
    roles: ["wife", "husband"]
  },
  {
    id: "descendants",
    title: "Descendencia",
    defaultOpen: true,
    roles: ["son", "daughter"]
  },
  {
    id: "grandchildren",
    title: "Nietos via hijo",
    defaultOpen: true,
    roles: ["sons_son", "sons_daughter"],
    uiOnly: ["hasDeceasedSon"]
  },
  {
    id: "siblings_full",
    title: "Hermanos completos",
    defaultOpen: false,
    roles: ["full_brother", "full_sister"]
  },
  {
    id: "siblings_consanguine",
    title: "Hermanos consanguíneos (por padre)",
    defaultOpen: false,
    roles: ["consanguine_brother", "consanguine_sister"]
  },
  {
    id: "siblings_uterine",
    title: "Hermanos uterinos (por madre)",
    defaultOpen: false,
    roles: ["uterine_brother", "uterine_sister"]
  },
  {
    id: "grandparents",
    title: "Abuelos y bisabuelas",
    defaultOpen: false,
    roles: [
      "paternal_grandfather",
      "paternal_grandmother",
      "maternal_grandmother",
      "paternal_great_grandmother",
      "maternal_great_grandmother"
    ]
  },
  {
    id: "agnatic_uncles",
    title: "Tíos paternos y rama agnática",
    defaultOpen: false,
    roles: [
      "paternal_uncle",
      "consanguine_paternal_uncle",
      "paternal_uncle_son",
      "consanguine_paternal_uncle_son",
      "paternal_uncles_daughter",
      "consanguine_paternal_uncles_daughter",
      "paternal_uncle_sons_daughter",
      "consanguine_paternal_uncle_sons_daughter"
    ]
  }
];

export const ROLE_META = {
  father: { id: "father", label: "Padre vivo", input: "bool" },
  mother: { id: "mother", label: "Madre viva", input: "bool" },

  wife: { id: "wife", label: "Esposas (0..4) para causante masculino", input: "count", min: 0, max: 4 },
  husband: { id: "husband", label: "Esposo (0..1) para causante femenino", input: "bool" },

  son: { id: "son", label: "Hijos", input: "count", min: 0, max: 99 },
  daughter: { id: "daughter", label: "Hijas", input: "count", min: 0, max: 99 },

  sons_son: { id: "sons_son", label: "Nietos varones via hijo", input: "count", min: 0, max: 99 },
  sons_daughter: { id: "sons_daughter", label: "Nietas via hijo", input: "count", min: 0, max: 99 },

  full_brother: { id: "full_brother", label: "Hermanos", input: "count", min: 0, max: 99 },
  full_sister: { id: "full_sister", label: "Hermanas", input: "count", min: 0, max: 99 },

  consanguine_brother: { id: "consanguine_brother", label: "Hermanos por padre (consanguíneos)", input: "count", min: 0, max: 99 },
  consanguine_sister: { id: "consanguine_sister", label: "Hermanas por padre (consanguíneas)", input: "count", min: 0, max: 99 },

  uterine_brother: { id: "uterine_brother", label: "Hermanos por madre (uterinos)", input: "count", min: 0, max: 99 },
  uterine_sister: { id: "uterine_sister", label: "Hermanas por madre (uterinas)", input: "count", min: 0, max: 99 },

  paternal_grandfather: { id: "paternal_grandfather", label: "Abuelo paterno", input: "bool" },
  paternal_grandmother: { id: "paternal_grandmother", label: "Abuela paterna", input: "bool" },
  maternal_grandmother: { id: "maternal_grandmother", label: "Abuela materna", input: "bool" },

  paternal_great_grandmother: { id: "paternal_great_grandmother", label: "Bisabuela paterna", input: "bool" },
  maternal_great_grandmother: { id: "maternal_great_grandmother", label: "Bisabuela materna", input: "bool" },

  paternal_uncle: { id: "paternal_uncle", label: "Tíos paternos", input: "count", min: 0, max: 99 },
  consanguine_paternal_uncle: { id: "consanguine_paternal_uncle", label: "Tíos paternos consanguíneos (por padre)", input: "count", min: 0, max: 99 },

  paternal_uncle_son: { id: "paternal_uncle_son", label: "Hijos de tío paterno", input: "count", min: 0, max: 99 },
  consanguine_paternal_uncle_son: { id: "consanguine_paternal_uncle_son", label: "Hijos de tío paterno consanguíneo", input: "count", min: 0, max: 99 },

  paternal_uncles_daughter: { id: "paternal_uncles_daughter", label: "Hijas de tío paterno", input: "count", min: 0, max: 99 },
  consanguine_paternal_uncles_daughter: { id: "consanguine_paternal_uncles_daughter", label: "Hijas de tío paterno consanguíneo", input: "count", min: 0, max: 99 },

  paternal_uncle_sons_daughter: { id: "paternal_uncle_sons_daughter", label: "Hijas del hijo de tío paterno", input: "count", min: 0, max: 99 },
  consanguine_paternal_uncle_sons_daughter: { id: "consanguine_paternal_uncle_sons_daughter", label: "Hijas del hijo de tío paterno consanguíneo", input: "count", min: 0, max: 99 }
};

export function getRoleMeta(roleId) {
  const k = String(roleId);
  return ROLE_META[k] || null;
}
