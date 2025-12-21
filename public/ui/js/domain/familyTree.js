// public/ui/js/domain/familyTree.js
// Lightweight family-tree domain model for the UI.
// Goal: let the user build a multi-generation graph, then derive a core-compatible heirsByRole map.
//
// IMPORTANT: This module MUST NOT import from store or pages (avoid circular deps).

/**
 * Tree schema (v1)
 * {
 *   version: 1,
 *   deceasedId: "p1",
 *   nextId: 2,
 *   people: {
 *     "p1": { id:"p1", name:"Causante", sex:"male"|"female", alive:false },
 *     ...
 *   },
 *   parents: {
 *     "childId": { fatherId: "pX"|null, motherId: "pY"|null },
 *     ...
 *   },
 *   spouses: {
 *     "pA": ["pB","pC"...], // symmetric
 *     ...
 *   }
 * }
 */

export function sanitizeTree(raw) {
  if (!raw || typeof raw !== "object") return null;

  const version = raw.version === 1 ? 1 : 1;

  const people = (raw.people && typeof raw.people === "object") ? raw.people : {};
  const parents = (raw.parents && typeof raw.parents === "object") ? raw.parents : {};
  const spouses = (raw.spouses && typeof raw.spouses === "object") ? raw.spouses : {};

  // Keep only valid person records.
  const cleanPeople = {};
  for (const [id, p] of Object.entries(people)) {
    if (!id || typeof id !== "string") continue;
    if (!p || typeof p !== "object") continue;

    const sex = (p.sex === "male" || p.sex === "female") ? p.sex : "male";
    const name = (typeof p.name === "string" && p.name.trim()) ? p.name.trim() : id;
    const alive = (p.alive === true);

    cleanPeople[id] = { id, name, sex, alive };
  }

  // Clean parents links.
  const cleanParents = {};
  for (const [childId, rel] of Object.entries(parents)) {
    if (!cleanPeople[childId]) continue;
    const fatherId = rel && typeof rel === "object" ? rel.fatherId : null;
    const motherId = rel && typeof rel === "object" ? rel.motherId : null;
    cleanParents[childId] = {
      fatherId: (fatherId && cleanPeople[fatherId]) ? fatherId : null,
      motherId: (motherId && cleanPeople[motherId]) ? motherId : null,
    };
  }

  // Clean spouse links (ensure symmetry later).
  const cleanSpouses = {};
  for (const [aId, list] of Object.entries(spouses)) {
    if (!cleanPeople[aId]) continue;
    const arr = Array.isArray(list) ? list : [];
    const unique = [];
    for (const bId of arr) {
      if (!cleanPeople[bId]) continue;
      if (bId === aId) continue;
      if (!unique.includes(bId)) unique.push(bId);
    }
    cleanSpouses[aId] = unique;
  }

  const deceasedId = (typeof raw.deceasedId === "string" && cleanPeople[raw.deceasedId]) ? raw.deceasedId : null;
  const nextId = (typeof raw.nextId === "number" && raw.nextId >= 2) ? Math.floor(raw.nextId) : 2;

  const out = {
    version,
    deceasedId: deceasedId || null,
    nextId,
    people: cleanPeople,
    parents: cleanParents,
    spouses: cleanSpouses,
  };

  return ensureTree(out, null);
}

export function ensureTree(tree, wizard) {
  // Ensure we always have a valid deceased node.
  const out = tree && typeof tree === "object" ? tree : null;

  const deceasedSex = wizard && wizard.deceased_sex ? wizard.deceased_sex : null;

  if (!out || !out.people || typeof out.people !== "object" || Object.keys(out.people).length === 0) {
    const sex = (deceasedSex === "male" || deceasedSex === "female") ? deceasedSex : "male";
    return makeDefaultTree(sex);
  }

  // If deceasedId missing or invalid, pick first person and mark as deceased.
  let deceasedId = out.deceasedId;
  if (!deceasedId || !out.people[deceasedId]) {
    deceasedId = Object.keys(out.people)[0];
  }

  // Force deceased alive=false, and align sex with wizard (if set).
  const people = { ...out.people };
  const d = people[deceasedId];
  const sex = (deceasedSex === "male" || deceasedSex === "female") ? deceasedSex : d.sex;
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

export function makeDefaultTree(deceasedSex = "male") {
  const sex = (deceasedSex === "male" || deceasedSex === "female") ? deceasedSex : "male";
  return {
    version: 1,
    deceasedId: "p1",
    nextId: 2,
    people: {
      p1: { id: "p1", name: "Causante", sex, alive: false },
    },
    parents: {},
    spouses: {},
  };
}

export function addPerson(tree, { name = "Persona", sex = "male", alive = true } = {}) {
  const t = ensureTree(tree, null);
  const id = `p${t.nextId}`;
  const cleanSex = (sex === "male" || sex === "female") ? sex : "male";
  const cleanName = (typeof name === "string" && name.trim()) ? name.trim() : "Persona";

  return {
    ...t,
    nextId: t.nextId + 1,
    people: {
      ...t.people,
      [id]: { id, name: cleanName, sex: cleanSex, alive: Boolean(alive) },
    },
  };
}

export function updatePerson(tree, personId, patch) {
  const t = ensureTree(tree, null);
  if (!t.people[personId]) return t;

  const cur = t.people[personId];
  const sex = (patch && (patch.sex === "male" || patch.sex === "female")) ? patch.sex : cur.sex;
  const name = (patch && typeof patch.name === "string") ? patch.name.trim() : cur.name;
  const alive = (patch && typeof patch.alive === "boolean") ? patch.alive : cur.alive;

  // Keep deceased alive=false always.
  const finalAlive = (personId === t.deceasedId) ? false : alive;

  return {
    ...t,
    people: {
      ...t.people,
      [personId]: { ...cur, sex, name: name || cur.name, alive: finalAlive },
    },
  };
}

export function linkSpouses(tree, aId, bId) {
  const t = ensureTree(tree, null);
  if (!t.people[aId] || !t.people[bId] || aId === bId) return t;

  const spouses = { ...(t.spouses || {}) };
  spouses[aId] = Array.isArray(spouses[aId]) ? [...spouses[aId]] : [];
  spouses[bId] = Array.isArray(spouses[bId]) ? [...spouses[bId]] : [];

  if (!spouses[aId].includes(bId)) spouses[aId].push(bId);
  if (!spouses[bId].includes(aId)) spouses[bId].push(aId);

  return { ...t, spouses };
}

export function unlinkSpouses(tree, aId, bId) {
  const t = ensureTree(tree, null);
  if (!t.people[aId] || !t.people[bId] || aId === bId) return t;

  const spouses = { ...(t.spouses || {}) };
  const aList = Array.isArray(spouses[aId]) ? spouses[aId].filter((x) => x !== bId) : [];
  const bList = Array.isArray(spouses[bId]) ? spouses[bId].filter((x) => x !== aId) : [];

  if (aList.length) spouses[aId] = aList; else delete spouses[aId];
  if (bList.length) spouses[bId] = bList; else delete spouses[bId];

  return { ...t, spouses };
}

export function setParents(tree, childId, { fatherId = null, motherId = null } = {}) {
  const t = ensureTree(tree, null);
  if (!t.people[childId]) return t;

  const cleanFather = (fatherId && t.people[fatherId] && fatherId !== childId) ? fatherId : null;
  const cleanMother = (motherId && t.people[motherId] && motherId !== childId) ? motherId : null;

  const parents = { ...(t.parents || {}) };
  parents[childId] = { fatherId: cleanFather, motherId: cleanMother };

  return { ...t, parents };
}

export function getParents(tree, childId) {
  const t = ensureTree(tree, null);
  const rel = t.parents && t.parents[childId] ? t.parents[childId] : { fatherId: null, motherId: null };
  return { fatherId: rel.fatherId || null, motherId: rel.motherId || null };
}

export function getChildren(tree, parentId) {
  const t = ensureTree(tree, null);
  const out = [];
  for (const [childId, rel] of Object.entries(t.parents || {})) {
    if (!t.people[childId]) continue;
    if (rel && (rel.fatherId === parentId || rel.motherId === parentId)) out.push(childId);
  }
  return out;
}

export function getSpouses(tree, personId) {
  const t = ensureTree(tree, null);
  const arr = (t.spouses && Array.isArray(t.spouses[personId])) ? t.spouses[personId] : [];
  return arr.filter((id) => t.people[id]);
}

export function deriveHeirsByRoleFromTree(tree) {
  const t = ensureTree(tree, null);
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

function ensureSpouseSymmetry(spouses, people) {
  const out = {};
  for (const [aId, list] of Object.entries(spouses || {})) {
    if (!people[aId]) continue;
    out[aId] = Array.isArray(list) ? [...list] : [];
  }
  for (const [aId, list] of Object.entries(out)) {
    for (const bId of list) {
      if (!people[bId] || bId === aId) continue;
      out[bId] = Array.isArray(out[bId]) ? out[bId] : [];
      if (!out[bId].includes(aId)) out[bId].push(aId);
    }
  }
  return out;
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
