export const EXPECTED_ROLES = [
  "consanguine_brother",
  "consanguine_paternal_uncle",
  "consanguine_paternal_uncle_son",
  "consanguine_paternal_uncle_sons_daughter",
  "consanguine_paternal_uncles_daughter",
  "consanguine_sister",
  "daughter",
  "father",
  "full_brother",
  "full_sister",
  "husband",
  "maternal_grandmother",
  "maternal_great_grandmother",
  "mother",
  "paternal_grandfather",
  "paternal_grandmother",
  "paternal_great_grandmother",
  "paternal_uncle",
  "paternal_uncle_son",
  "paternal_uncle_sons_daughter",
  "paternal_uncles_daughter",
  "son",
  "sons_daughter",
  "sons_son",
  "uterine_brother",
  "uterine_sister",
  "wife"
];

export function toSet(arr){
  return new Set(Array.isArray(arr) ? arr.map(String) : []);
}

export function diffRoles(expectedArr, serverArr){
  const expected = toSet(expectedArr);
  const server = toSet(serverArr);

  const missing = [];
  const extra = [];

  for (const r of expected){
    if (!server.has(r)) missing.push(r);
  }
  for (const r of server){
    if (!expected.has(r)) extra.push(r);
  }

  missing.sort();
  extra.sort();

  return { ok: missing.length === 0 && extra.length === 0, missing, extra };
}
