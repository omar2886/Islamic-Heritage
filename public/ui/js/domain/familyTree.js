// public/ui/js/domain/familyTree.js

export function sanitizeTree(raw){
  if (!raw || typeof raw !== "object") return null;

  const version = raw.version === 1 ? 1 : 1;
  const nextId = typeof raw.nextId === "number" ? raw.nextId : 2;

  const people = (raw.people && typeof raw.people === "object") ? raw.people : {};
  const parents = (raw.parents && typeof raw.parents === "object") ? raw.parents : {};
  const spouses = (raw.spouses && typeof raw.spouses === "object") ? raw.spouses : {};

  const deceasedId = typeof raw.deceasedId === "string" ? raw.deceasedId : null;

  return { version, nextId, people, parents, spouses, deceasedId };
}

function ensureSpouseSymmetry(spouses, people){
  const out = {};
  Object.entries(spouses || {}).forEach(([a, arr]) => {
    if (!people[a]) return;
    const list = Array.isArray(arr) ? arr : [];
    out[a] = list.filter((b) => people[b]).map(String);
  });

  Object.entries(out).forEach(([a, arr]) => {
    arr.forEach((b) => {
      if (!out[b]) out[b] = [];
      if (!out[b].includes(a)) out[b].push(a);
    });
  });

  return out;
}

export function ensureTree(tree, _wizardIgnored){
  const out = tree && typeof tree === "object" ? tree : null;

  if (!out || !out.people || typeof out.people !== "object" || Object.keys(out.people).length === 0){
    return makeDefaultTree("male");
  }

  let deceasedId = out.deceasedId;
  if (!deceasedId || !out.people[deceasedId]){
    deceasedId = Object.keys(out.people)[0];
  }

  const people = { ...out.people };
  const d = people[deceasedId];
  const name = (d && typeof d.name === "string" && d.name.trim()) ? d.name.trim() : "Causante";
  const sex = d && d.sex === "female" ? "female" : "male";
  people[deceasedId] = { ...d, name, sex, alive: false };

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
  return {
    version: 1,
    deceasedId: "1",
    nextId: 2,
    people: {
      "1": { id: "1", name: "Causante", sex: deceasedSex === "female" ? "female" : "male", alive: false },
    },
    parents: {},
    spouses: {},
  };
}

export function addPerson(tree, fields){
  const t = ensureTree(sanitizeTree(tree), null);
  const id = String(t.nextId);
  const sex = fields?.sex === "female" ? "female" : "male";
  const alive = fields?.alive === true;
  const name = typeof fields?.name === "string" ? fields.name : "";

  const person = { id, sex, alive, name };
  return {
    tree: {
      ...t,
      nextId: t.nextId + 1,
      people: { ...t.people, [id]: person },
    },
    id,
    personId: id,
  };
}

export function removePerson(tree, id){
  const t = ensureTree(sanitizeTree(tree), null);
  if (!t.people[id]) return t;
  if (id === t.deceasedId) return t;

  const people = { ...t.people };
  delete people[id];

  const parents = { ...(t.parents || {}) };
  delete parents[id];
  Object.entries(parents).forEach(([childId, row]) => {
    const next = { ...row };
    let changed = false;
    if (next.fatherId === id){
      next.fatherId = null;
      changed = true;
    }
    if (next.motherId === id){
      next.motherId = null;
      changed = true;
    }
    if (changed) parents[childId] = next;
  });

  const spouses = ensureSpouseSymmetry(t.spouses || {}, people);
  delete spouses[id];
  Object.entries(spouses).forEach(([pid, arr]) => {
    const filtered = (arr || []).filter((x) => x !== id);
    if (filtered.length) spouses[pid] = filtered;
    else delete spouses[pid];
  });

  let deceasedId = t.deceasedId;
  if (deceasedId && !people[deceasedId]){
    const ids = Object.keys(people);
    deceasedId = ids.length ? ids[0] : null;
  }

  return { ...t, people, parents, spouses, deceasedId };
}

export function updatePerson(tree, id, patch){
  const t = ensureTree(sanitizeTree(tree), null);
  if (!t.people[id]) return t;

  const prev = t.people[id];
  const sex = patch?.sex === "female" ? "female" : (patch?.sex === "male" ? "male" : prev.sex);
  const alive = typeof patch?.alive === "boolean" ? patch.alive : prev.alive;
  const name = typeof patch?.name === "string" ? patch.name : prev.name;

  const next = { ...prev, sex, alive, name };
  if (id === t.deceasedId) next.alive = false;

  return { ...t, people: { ...t.people, [id]: next } };
}

export function getParents(tree, id){
  const t = ensureTree(sanitizeTree(tree), null);
  const row = t.parents[id] || {};
  return {
    fatherId: typeof row.fatherId === "string" ? row.fatherId : null,
    motherId: typeof row.motherId === "string" ? row.motherId : null,
  };
}

export function setParents(tree, childId, { fatherId, motherId }){
  const t = ensureTree(sanitizeTree(tree), null);
  if (!t.people[childId]) return t;

  const nextRow = {
    fatherId: fatherId && t.people[fatherId] ? String(fatherId) : null,
    motherId: motherId && t.people[motherId] ? String(motherId) : null,
  };

  return { ...t, parents: { ...t.parents, [childId]: nextRow } };
}

export function getChildren(tree, parentId){
  const t = ensureTree(sanitizeTree(tree), null);
  return Object.entries(t.parents || {})
    .filter(([, row]) => row?.fatherId === parentId || row?.motherId === parentId)
    .map(([childId]) => String(childId));
}

export function getSpouses(tree, id){
  const t = ensureTree(sanitizeTree(tree), null);
  const arr = t.spouses?.[id];
  return Array.isArray(arr) ? arr.map(String) : [];
}

export function linkSpouses(tree, a, b){
  const t = ensureTree(sanitizeTree(tree), null);
  if (!t.people[a] || !t.people[b] || a === b) return t;

  const spouses = { ...(t.spouses || {}) };
  spouses[a] = Array.isArray(spouses[a]) ? spouses[a].slice() : [];
  spouses[b] = Array.isArray(spouses[b]) ? spouses[b].slice() : [];

  if (!spouses[a].includes(b)) spouses[a].push(b);
  if (!spouses[b].includes(a)) spouses[b].push(a);

  return { ...t, spouses: ensureSpouseSymmetry(spouses, t.people) };
}

export function unlinkSpouses(tree, aId, bId){
  const t = ensureTree(sanitizeTree(tree), null);
  const spouses = ensureSpouseSymmetry(t.spouses || {}, t.people);
  if (!spouses[aId] || !spouses[bId]) return t;

  spouses[aId] = spouses[aId].filter((x) => x !== bId);
  spouses[bId] = spouses[bId].filter((x) => x !== aId);
  return { ...t, spouses };
}

export function deriveHeirsByRoleFromTree(tree) {
  const t = ensureTree(sanitizeTree(tree), null);
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
