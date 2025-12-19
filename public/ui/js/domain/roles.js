export const ROLE_LABELS_ES = {
  husband: "Esposo",
  wife: "Esposas",
  son: "Hijo",
  daughter: "Hija",
  sons_son: "Nieto por hijo",
  sons_daughter: "Nieta por hijo",
  father: "Padre",
  mother: "Madre",
  paternal_grandfather: "Abuelo paterno",
  paternal_grandmother: "Abuela paterna",
  maternal_grandmother: "Abuela materna",
  paternal_great_grandmother: "Bisabuela paterna",
  maternal_great_grandmother: "Bisabuela materna",
  full_brother: "Hermano germano",
  full_sister: "Hermana germana",
  consanguine_brother: "Hermano consanguineo",
  consanguine_sister: "Hermana consanguinea",
  uterine_brother: "Hermano uterino",
  uterine_sister: "Hermana uterina",
  paternal_uncle: "Tio paterno",
  paternal_uncle_son: "Hijo de tio paterno",
  paternal_uncle_sons_daughter: "Hija del hijo de tio paterno",
  paternal_uncles_daughter: "Hija de tio paterno",
  consanguine_paternal_uncle: "Tio paterno consanguineo",
  consanguine_paternal_uncle_son: "Hijo de tio paterno consanguineo",
  consanguine_paternal_uncle_sons_daughter: "Hija del hijo de tio paterno consanguineo",
  consanguine_paternal_uncles_daughter: "Hija de tio paterno consanguineo",
};

export const ROLE_GROUPS = [
  { id: "spouse", title: "Conyuge", roles: ["husband","wife"] },
  { id: "desc", title: "Descendencia", roles: ["son","daughter","sons_son","sons_daughter"] },
  { id: "asc", title: "Ascendientes", roles: ["father","mother"] },
  { id: "grand", title: "Abuelos y bisabuelas", roles: ["paternal_grandfather","paternal_grandmother","maternal_grandmother","paternal_great_grandmother","maternal_great_grandmother"] },
  { id: "sib", title: "Hermanos", roles: ["full_brother","full_sister","consanguine_brother","consanguine_sister","uterine_brother","uterine_sister"] },
  { id: "unc", title: "Tios y colaterales", roles: ["paternal_uncle","paternal_uncle_son","paternal_uncle_sons_daughter","paternal_uncles_daughter","consanguine_paternal_uncle","consanguine_paternal_uncle_son","consanguine_paternal_uncle_sons_daughter","consanguine_paternal_uncles_daughter"] },
];

export function labelForRole(role){
  return ROLE_LABELS_ES[role] || role;
}
