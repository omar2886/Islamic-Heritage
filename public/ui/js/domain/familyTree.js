// public/ui/js/domain/familyTree.js

export const EXPECTED_ROLES = [
  "husband",
  "wives",
  "father",
  "mother",
  "son",
  "daughter",
  "paternal_grandfather",
  "paternal_grandmother",
  "maternal_grandfather",
  "maternal_grandmother",
  "full_brother",
  "full_sister",
  "paternal_brother",
  "paternal_sister",
  "maternal_brother",
  "maternal_sister",
  "son_of_son",
  "daughter_of_son",
  "son_of_full_brother",
  "daughter_of_full_brother",
  "son_of_paternal_brother",
  "daughter_of_paternal_brother",
  "paternal_uncle",
  "paternal_aunt",
  "maternal_uncle",
  "maternal_aunt",
  "son_of_paternal_uncle",
  "daughter_of_paternal_uncle",
];

// Tree schema:
// {
//   version: 1,
//   deceasedId: "p1",
//   nextId: 2,
//   people: { [id]: { id, name, sex, alive } },
//   parents: { [childId]: { fatherId, motherId } },
//   spouses: { [id]: [otherId, ...] }
// }

function normalizeSex(sex){
  return sex === "male" || sex === "female" ? sex : "male";
}

function ensureSpouseSymmetry(spouses, people){
  const out = {};
  const ids = Object.keys(people || {});
  const s = spouses && typeof spouses === "object" ? spouses : {};
  for (const id of ids){
    const arr = Array.isArray(s[id]) ? s[id].filter((x) => typeof x === "string") : [];
    out[id] = Array.from(new Set(arr.filter((x) => people[x] && x !== id)));
  }
  // Make it symmetric.
  for (const [a, arr] of Object.entries(out)){
    for (const b of arr){
      out[b] ||= [];
      if (!out[b].includes(a)) out[b].push(a);
    }
  }
  return out;
}

export function ensureTree(tree) {
  // Ensure we always have a valid deceased node and a coherent minimal schema.
  const out = tree && typeof tree === "object" ? tree : null;

  if (!out || !out.people || typeof out.people !== "object" || Object.keys(out.people).length === 0) {
    return makeDefaultTree("male");
  }

  // If deceasedId missing or invalid, pick first person.
  let deceasedId = out.deceasedId;
  if (!deceasedId || !out.people[deceasedId]) {
    deceasedId = Object.keys(out.people)[0];
  }

  // Force deceased alive=false and ensure basic fields.
  const people = { ...out.people };
  const d = people[deceasedId] || { id: deceasedId };
  const sex = (d.sex === "male" || d.sex === "female") ? d.sex : "male";
  people[deceasedId] = { ...d, sex, alive: false, name: d.name || "Causante" };

  // Ensure spouse symmetry.
  const spouses = ensureSpouseSymmetry(out.spouses || {}, people);

  return {
    version: 1,
    deceasedId,
    nextId: (typeof out.nextId === "number" && out.nextId >= 2) ? out.nextId : 2,
    people,
    parents: out.parents || {},
    spouses,
  };
}

export function makeDefaultTree(deceasedSex = "male"){
  const s = normalizeSex(deceasedSex);
  return {
    version: 1,
    deceasedId: "p1",
    nextId: 2,
    people: {
      p1: { id: "p1", name: "Causante", sex: s, alive: false }
    },
    parents: {},
    spouses: {},
  };
}

export function sanitizeTree(tree){
  const t = tree && typeof tree === "object" ? tree : null;
  if (!t || !t.people || typeof t.people !== "object"){
    return makeDefaultTree("male");
  }

  const people = {};
  for (const [id, p] of Object.entries(t.people)){
    if (!id || typeof id !== "string") continue;
    if (!p || typeof p !== "object") continue;
    people[id] = {
      id,
      name: typeof p.name === "string" ? p.name : "",
      sex: normalizeSex(p.sex),
      alive: Boolean(p.alive),
    };
  }

  if (!Object.keys(people).length){
    return makeDefaultTree("male");
  }

  const parents = {};
  if (t.parents && typeof t.parents === "object"){
    for (const [childId, rel] of Object.entries(t.parents)){
      if (!people[childId]) continue;
      const fatherId = rel && typeof rel === "object" ? rel.fatherId : null;
      const motherId = rel && typeof rel === "object" ? rel.motherId : null;
      parents[childId] = {
        fatherId: (typeof fatherId === "string" && people[fatherId] && fatherId !== childId) ? fatherId : null,
        motherId: (typeof motherId === "string" && people[motherId] && motherId !== childId) ? motherId : null,
      };
    }
  }

  const spouses = ensureSpouseSymmetry(t.spouses || {}, people);

  const deceasedId = (typeof t.deceasedId === "string" && people[t.deceasedId]) ? t.deceasedId : Object.keys(people)[0];
  const nextId = (typeof t.nextId === "number" && t.nextId >= 2) ? t.nextId : 2;

  // Force deceased alive=false always.
  people[deceasedId] = { ...people[deceasedId], alive: false, name: people[deceasedId].name || "Causante" };

  return {
    version: 1,
    deceasedId,
    nextId,
    people,
    parents,
    spouses,
  };
}

export function addPerson(tree, person){
  const t = ensureTree(tree);
  const id = `p${t.nextId}`;
  const p = person && typeof person === "object" ? person : {};
  const sex = normalizeSex(p.sex);
  const alive = Boolean(p.alive);

  const people = { ...t.people, [id]: { id, name: typeof p.name === "string" ? p.name : "Persona", sex, alive } };
  return { ...t, people, nextId: t.nextId + 1 };
}

export function updatePerson(tree, id, patch){
  const t = ensureTree(tree);
  if (!t.people[id]) return t;

  const p = t.people[id];
  const up = patch && typeof patch === "object" ? patch : {};

  const next = {
    ...p,
    name: (typeof up.name === "string") ? up.name : p.name,
    sex: (up.sex === "male" || up.sex === "female") ? up.sex : p.sex,
    alive: (typeof up.alive === "boolean") ? up.alive : p.alive,
  };

  // If updating deceased, force alive=false.
  if (id === t.deceasedId) next.alive = false;

  return { ...t, people: { ...t.people, [id]: next } };
}

export function getParents(tree, childId){
  const t = ensureTree(tree);
  const rel = t.parents && typeof t.parents === "object" ? t.parents[childId] : null;
  return {
    fatherId: rel && typeof rel.fatherId === "string" ? rel.fatherId : null,
    motherId: rel && typeof rel.motherId === "string" ? rel.motherId : null,
  };
}

export function setParents(tree, childId, parents){
  const t = ensureTree(tree);
  if (!t.people[childId]) return t;

  const fatherId = parents && typeof parents.fatherId === "string" ? parents.fatherId : null;
  const motherId = parents && typeof parents.motherId === "string" ? parents.motherId : null;

  const fatherOk = fatherId && t.people[fatherId] && fatherId !== childId ? fatherId : null;
  const motherOk = motherId && t.people[motherId] && motherId !== childId ? motherId : null;

  return {
    ...t,
    parents: {
      ...(t.parents || {}),
      [childId]: { fatherId: fatherOk, motherId: motherOk },
    },
  };
}

export function getChildren(tree, parentId){
  const t = ensureTree(tree);
  const out = [];
  for (const [childId, rel] of Object.entries(t.parents || {})){
    if (!rel || typeof rel !== "object") continue;
    if (rel.fatherId === parentId || rel.motherId === parentId){
      out.push(childId);
    }
  }
  return out;
}

export function getSpouses(tree, id){
  const t = ensureTree(tree);
  const arr = t.spouses && typeof t.spouses === "object" ? t.spouses[id] : null;
  return Array.isArray(arr) ? arr.slice() : [];
}

export function linkSpouses(tree, aId, bId){
  const t = ensureTree(tree);
  if (!t.people[aId] || !t.people[bId] || aId === bId) return t;

  const spouses = ensureSpouseSymmetry(t.spouses || {}, t.people);
  spouses[aId] ||= [];
  spouses[bId] ||= [];
  if (!spouses[aId].includes(bId)) spouses[aId].push(bId);
  if (!spouses[bId].includes(aId)) spouses[bId].push(aId);

  return { ...t, spouses };
}

export function unlinkSpouses(tree, aId, bId){
  const t = ensureTree(tree);
  const spouses = ensureSpouseSymmetry(t.spouses || {}, t.people);
  if (!spouses[aId] || !spouses[bId]) return t;

  spouses[aId] = spouses[aId].filter((x) => x !== bId);
  spouses[bId] = spouses[bId].filter((x) => x !== aId);
  return { ...t, spouses };
}

export function deriveHeirsByRoleFromTree(tree) {
  const t = ensureTree(tree);
  const dId = t.deceasedId;
  const d = t.people[dId];
  const heirsByRole = {};
  const warnings = [];
  const unmapped = [];

  const addCount = (role, n) => {
    if (!n || n <= 0) return;
    heirsByRole[role] = (heirsByRole[role] || 0) + n;
  };

  const isAlive = (id) => t.people[id] && t.people[id].alive === true;

  // Spouses
  const spouseIds = getSpouses(t, dId).filter(isAlive);
  if (d.sex === "male") {
    const wives = spouseIds.filter((id) => t.people[id].sex === "female");
    addCount("wife", wives.length);
    const weird = spouseIds.filter((id) => t.people[id].sex !== "female");
    if (weird.length) warnings.push("Hay cónyuges no femeninos enlazados a un causante varón (se ignoran para wife).");
  } else {
    const husbands = spouseIds.filter((id) => t.people[id].sex === "male");
    addCount("husband", husbands.length ? 1 : 0); // core expects 0/1
    if (husbands.length > 1) warnings.push("Hay más de un marido enlazado; el core normalmente asume 0/1. Se limitará a 1.");
  }

  // Parents
  const dParents = getParents(t, dId);
  if (dParents.fatherId && isAlive(dParents.fatherId)) addCount("father", 1);
  if (dParents.motherId && isAlive(dParents.motherId)) addCount("mother", 1);

  // Children
  const childIds = getChildren(t, dId).filter(isAlive);
  const sons = childIds.filter((id) => t.people[id].sex === "male");
  const daughters = childIds.filter((id) => t.people[id].sex === "female");
  addCount("son", sons.length);
  addCount("daughter", daughters.length);

  // Grandchildren via sons (only)
  const grandchildIds = [];
  for (const sonId of sons) {
    const gkids = getChildren(t, sonId).filter(isAlive);
    for (const gId of gkids) grandchildIds.push(gId);
  }
  addCount("sons_son", grandchildIds.filter((id) => t.people[id].sex === "male").length);
  addCount("sons_daughter", grandchildIds.filter((id) => t.people[id].sex === "female").length);

  // Siblings
  const sibCounts = deriveSiblings(t, dId);
  addCount("full_brother", sibCounts.full_brother);
  addCount("full_sister", sibCounts.full_sister);
  addCount("consanguine_brother", sibCounts.consanguine_brother);
  addCount("consanguine_sister", sibCounts.consanguine_sister);
  addCount("uterine_brother", sibCounts.uterine_brother);
  addCount("uterine_sister", sibCounts.uterine_sister);

  // Grandparents / great-grandmothers
  const gp = deriveGrandmothers(t, dId);
  addCount("paternal_grandfather", gp.paternal_grandfather);
  addCount("paternal_grandmother", gp.paternal_grandmother);
  addCount("maternal_grandmother", gp.maternal_grandmother);
  addCount("paternal_great_grandmother", gp.paternal_great_grandmother);
  addCount("maternal_great_grandmother", gp.maternal_great_grandmother);

  // Unmapped: any alive person not recognized by the current auto-mapper.
  const recognizedIds = new Set([
    ...spouseIds,
    ...(dParents.fatherId ? [dParents.fatherId] : []),
    ...(dParents.motherId ? [dParents.motherId] : []),
    ...childIds,
    ...grandchildIds,
    ...sibCounts.recognizedIds,
    ...gp.recognizedIds,
  ]);
  for (const p of Object.values(t.people)) {
    if (p.id === dId) continue;
    if (!p.alive) continue;
    if (recognizedIds.has(p.id)) continue;
    unmapped.push({ id: p.id, name: p.name, sex: p.sex });
  }

  return { heirsByRole, warnings, unmapped };
}

function deriveSiblings(tree, deceasedId) {
  const dParents = getParents(tree, deceasedId);
  const dFather = dParents.fatherId;
  const dMother = dParents.motherId;

  const counts = {
    full_brother: 0, full_sister: 0,
    consanguine_brother: 0, consanguine_sister: 0,
    uterine_brother: 0, uterine_sister: 0,
    recognizedIds: [],
  };

  for (const p of Object.values(tree.people)) {
    if (p.id === deceasedId) continue;
    if (!p.alive) continue;

    const rel = getParents(tree, p.id);
    const sameFather = (dFather && rel.fatherId === dFather);
    const sameMother = (dMother && rel.motherId === dMother);

    if (sameFather && sameMother) {
      counts.recognizedIds.push(p.id);
      if (p.sex === "male") counts.full_brother += 1;
      else counts.full_sister += 1;
      continue;
    }
    if (sameFather && !sameMother) {
      counts.recognizedIds.push(p.id);
      if (p.sex === "male") counts.consanguine_brother += 1;
      else counts.consanguine_sister += 1;
      continue;
    }
    if (sameMother && !sameFather) {
      counts.recognizedIds.push(p.id);
      if (p.sex === "male") counts.uterine_brother += 1;
      else counts.uterine_sister += 1;
      continue;
    }
  }

  return counts;
}

function deriveGrandmothers(tree, deceasedId) {
  const out = {
    paternal_grandfather: 0,
    paternal_grandmother: 0,
    maternal_grandmother: 0,
    paternal_great_grandmother: 0,
    maternal_great_grandmother: 0,
    recognizedIds: [],
  };

  const dParents = getParents(tree, deceasedId);
  const fId = dParents.fatherId;
  const mId = dParents.motherId;

  // Paternal grandparents
  if (fId) {
    const fp = getParents(tree, fId);
    if (fp.fatherId && tree.people[fp.fatherId]?.alive) {
      out.recognizedIds.push(fp.fatherId);
      out.paternal_grandfather = 1;
    }
    if (fp.motherId && tree.people[fp.motherId]?.alive) {
      out.recognizedIds.push(fp.motherId);
      out.paternal_grandmother = 1;
      // paternal great grandmother: mother of paternal grandmother (most common)
      const pgmParents = getParents(tree, fp.motherId);
      if (pgmParents.motherId && tree.people[pgmParents.motherId]?.alive) {
        out.recognizedIds.push(pgmParents.motherId);
        out.paternal_great_grandmother = 1;
      }
    }
  }

  // Maternal grandmother
  if (mId) {
    const mp = getParents(tree, mId);
    if (mp.motherId && tree.people[mp.motherId]?.alive) {
      out.recognizedIds.push(mp.motherId);
      out.maternal_grandmother = 1;

      const mgmParents = getParents(tree, mp.motherId);
      if (mgmParents.motherId && tree.people[mgmParents.motherId]?.alive) {
        out.recognizedIds.push(mgmParents.motherId);
        out.maternal_great_grandmother = 1;
      }
    }
  }

  return out;
}
