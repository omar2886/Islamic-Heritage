function clone(x){
  if (typeof structuredClone === "function") return structuredClone(x);
  return JSON.parse(JSON.stringify(x));
}

export function makeEmptyFamily(){
  const p1 = {
    id: "P1",
    label: "Causante",
    sex: null,           // "male" | "female"
    alive: false,
    fatherId: null,
    motherId: null,
    spouseIds: [],
  };
  return {
    version: 1,
    nextId: 2,
    decedentId: "P1",
    selectedId: "P1",
    people: { P1: p1 },
  };
}

export function sanitizeFamily(candidate){
  const base = makeEmptyFamily();
  const safe = (candidate && typeof candidate === "object") ? candidate : {};
  const out = {
    ...base,
    ...safe,
    version: 1,
    nextId: Number.isFinite(safe.nextId) && safe.nextId >= 2 ? Math.trunc(safe.nextId) : 2,
    decedentId: typeof safe.decedentId === "string" ? safe.decedentId : "P1",
    selectedId: typeof safe.selectedId === "string" ? safe.selectedId : "P1",
    people: (safe.people && typeof safe.people === "object") ? safe.people : {},
  };

  // Ensure P1 exists
  if (!out.people.P1 || typeof out.people.P1 !== "object"){
    out.people.P1 = base.people.P1;
  }

  // Sanitize persons
  const cleaned = {};
  Object.keys(out.people).forEach((id) => {
    const p = out.people[id];
    if (!p || typeof p !== "object") return;
    const pid = String(p.id || id);
    cleaned[pid] = {
      id: pid,
      label: typeof p.label === "string" ? p.label : pid,
      sex: (p.sex === "male" || p.sex === "female") ? p.sex : null,
      alive: p.alive === true,
      fatherId: typeof p.fatherId === "string" ? p.fatherId : null,
      motherId: typeof p.motherId === "string" ? p.motherId : null,
      spouseIds: Array.isArray(p.spouseIds) ? p.spouseIds.map(String) : [],
    };
  });

  // Guarantee P1 again (in case it was filtered)
  if (!cleaned.P1){
    cleaned.P1 = base.people.P1;
  }

  // Drop links to missing persons
  Object.values(cleaned).forEach((p) => {
    if (p.fatherId && !cleaned[p.fatherId]) p.fatherId = null;
    if (p.motherId && !cleaned[p.motherId]) p.motherId = null;
    p.spouseIds = p.spouseIds.filter((sid) => !!cleaned[sid] && sid !== p.id);
  });

  // Make spouse links symmetric
  Object.values(cleaned).forEach((p) => {
    p.spouseIds.forEach((sid) => {
      const sp = cleaned[sid];
      if (!sp) return;
      if (!sp.spouseIds.includes(p.id)){
        sp.spouseIds.push(p.id);
      }
    });
  });

  // Fix decedent/selected
  if (!cleaned[out.decedentId]) out.decedentId = "P1";
  if (!cleaned[out.selectedId]) out.selectedId = out.decedentId;

  // Fix nextId
  let maxN = 1;
  Object.keys(cleaned).forEach((id) => {
    const m = id.match(/^P(\d+)$/);
    if (m) maxN = Math.max(maxN, Number(m[1]));
  });
  out.nextId = Math.max(out.nextId, maxN + 1);

  out.people = cleaned;
  return out;
}

function allocId(family){
  const n = Math.max(2, Number(family.nextId || 2));
  return `P${n}`;
}

export function getPerson(family, id){
  return family.people[id] || null;
}

export function listPeople(family){
  return Object.values(family.people);
}

export function childrenOf(family, parentId){
  const out = [];
  Object.values(family.people).forEach((p) => {
    if (p.fatherId === parentId || p.motherId === parentId) out.push(p.id);
  });
  return out;
}

export function addSpouse(family, personId, attrs = {}){
  const f = sanitizeFamily(family);
  const pid = personId || f.decedentId;
  if (!f.people[pid]) return f;

  const id = allocId(f);
  const sp = {
    id,
    label: typeof attrs.label === "string" ? attrs.label : "Cónyuge",
    sex: (attrs.sex === "male" || attrs.sex === "female") ? attrs.sex : null,
    alive: attrs.alive === true,
    fatherId: null,
    motherId: null,
    spouseIds: [pid],
  };

  const next = clone(f);
  next.people[id] = sp;
  next.people[pid].spouseIds = Array.from(new Set([...(next.people[pid].spouseIds || []), id]));
  next.nextId = Number(id.slice(1)) + 1;
  next.selectedId = id;
  return sanitizeFamily(next);
}

export function addParent(family, childId, which /* "father"|"mother" */, attrs = {}){
  const f = sanitizeFamily(family);
  const cid = childId || f.selectedId;
  const child = f.people[cid];
  if (!child) return f;

  const id = allocId(f);
  const sex = which === "father" ? "male" : which === "mother" ? "female" : null;

  const parent = {
    id,
    label: typeof attrs.label === "string" ? attrs.label : (which === "father" ? "Padre" : "Madre"),
    sex,
    alive: attrs.alive === true,
    fatherId: null,
    motherId: null,
    spouseIds: [],
  };

  const next = clone(f);
  next.people[id] = parent;
  if (which === "father") next.people[cid].fatherId = id;
  if (which === "mother") next.people[cid].motherId = id;
  next.nextId = Number(id.slice(1)) + 1;
  next.selectedId = id;
  return sanitizeFamily(next);
}

export function addChild(family, parentId, otherParentIdOrNull, attrs = {}){
  const f = sanitizeFamily(family);
  const pid = parentId || f.selectedId;
  const parent = f.people[pid];
  if (!parent) return f;

  const id = allocId(f);
  const sex = (attrs.sex === "male" || attrs.sex === "female") ? attrs.sex : null;

  const child = {
    id,
    label: typeof attrs.label === "string" ? attrs.label : "Hijo/a",
    sex,
    alive: attrs.alive === true,
    fatherId: null,
    motherId: null,
    spouseIds: [],
  };

  // assign parents based on parent sex + optional other parent
  const other = otherParentIdOrNull && f.people[otherParentIdOrNull] ? otherParentIdOrNull : null;

  if (parent.sex === "male"){
    child.fatherId = pid;
    if (other) child.motherId = other;
  } else if (parent.sex === "female"){
    child.motherId = pid;
    if (other) child.fatherId = other;
  } else {
    // sex unknown -> just attach to father slot by default, user can adjust later
    child.fatherId = pid;
    if (other) child.motherId = other;
  }

  const next = clone(f);
  next.people[id] = child;
  next.nextId = Number(id.slice(1)) + 1;
  next.selectedId = id;
  return sanitizeFamily(next);
}

export function updatePerson(family, id, patch){
  const f = sanitizeFamily(family);
  if (!f.people[id]) return f;
  const next = clone(f);
  const p = next.people[id];

  if (typeof patch.label === "string") p.label = patch.label;
  if (patch.sex === "male" || patch.sex === "female" || patch.sex === null) p.sex = patch.sex;
  if (typeof patch.alive === "boolean") p.alive = patch.alive;

  // allow direct parent reassignment if provided (string or null)
  if (Object.prototype.hasOwnProperty.call(patch, "fatherId")){
    p.fatherId = typeof patch.fatherId === "string" ? patch.fatherId : null;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "motherId")){
    p.motherId = typeof patch.motherId === "string" ? patch.motherId : null;
  }

  return sanitizeFamily(next);
}

export function selectPerson(family, id){
  const f = sanitizeFamily(family);
  if (!f.people[id]) return f;
  const next = clone(f);
  next.selectedId = id;
  return sanitizeFamily(next);
}

export function removePerson(family, id){
  const f = sanitizeFamily(family);
  if (id === "P1") return f; // never delete decedent anchor
  if (!f.people[id]) return f;

  const next = clone(f);
  delete next.people[id];

  // remove references
  Object.values(next.people).forEach((p) => {
    if (p.fatherId === id) p.fatherId = null;
    if (p.motherId === id) p.motherId = null;
    p.spouseIds = (p.spouseIds || []).filter((sid) => sid !== id);
  });

  if (next.selectedId === id) next.selectedId = next.decedentId;
  return sanitizeFamily(next);
}

/**
 * Deriva roles para el core (PR16 scope limitado) + lista de no mapeados
 */
export function deriveHeirsFromFamily(family){
  const f = sanitizeFamily(family);
  const dec = f.people[f.decedentId] || f.people.P1;

  const result = {
    heirsByRole: {},       // filled by caller with all expected roles
    mappedById: {},        // id -> role (solo si mapeado)
    unmappedLiving: [],    // ids vivos sin rol en PR16
  };

  function isAlive(id){
    const p = f.people[id];
    return !!p && p.alive === true;
  }

  function spousesOf(id){
    const p = f.people[id];
    if (!p) return [];
    return (p.spouseIds || []).filter((sid) => !!f.people[sid]);
  }

  function isChildOf(childId, parentId){
    const c = f.people[childId];
    if (!c) return false;
    return c.fatherId === parentId || c.motherId === parentId;
  }

  const decSex = dec.sex; // "male"|"female"|null

  // 1) spouses
  const spouseIds = spousesOf(dec.id).filter(isAlive);
  if (decSex === "male"){
    // wives
    spouseIds.forEach((sid) => {
      const sp = f.people[sid];
      if (sp && sp.sex === "female"){
        result.mappedById[sid] = "wife";
      } else if (sp){
        // spouse exists but sex not female -> not mapped for now
      }
    });
  } else if (decSex === "female"){
    spouseIds.forEach((sid) => {
      const sp = f.people[sid];
      if (sp && sp.sex === "male"){
        result.mappedById[sid] = "husband";
      }
    });
  }

  // 2) parents
  if (dec.fatherId && isAlive(dec.fatherId)){
    result.mappedById[dec.fatherId] = "father";
  }
  if (dec.motherId && isAlive(dec.motherId)){
    result.mappedById[dec.motherId] = "mother";
  }

  // 3) children
  const childIds = childrenOf(f, dec.id).filter(isAlive);
  childIds.forEach((cid) => {
    const c = f.people[cid];
    if (!c) return;
    if (c.sex === "male") result.mappedById[cid] = "son";
    else if (c.sex === "female") result.mappedById[cid] = "daughter";
  });

  // 4) grandchildren via SON (sons_son / sons_daughter)
  // PR16: solo cuenta nietos cuyo padre es un HIJO VARÓN del causante y ese hijo varón está MUERTO.
  const sonsOfDec = childrenOf(f, dec.id).filter((cid) => {
    const c = f.people[cid];
    return c && c.sex === "male";
  });

  sonsOfDec.forEach((sonId) => {
    const son = f.people[sonId];
    if (!son) return;
    if (son.alive === true) return; // solo vía hijo varón fallecido
    const gkids = childrenOf(f, sonId).filter(isAlive);
    gkids.forEach((gid) => {
      const g = f.people[gid];
      if (!g) return;
      if (g.sex === "male") result.mappedById[gid] = "sons_son";
      else if (g.sex === "female") result.mappedById[gid] = "sons_daughter";
    });
  });

  // Any other living persons are “unmapped”
  Object.values(f.people).forEach((p) => {
    if (!p || p.id === dec.id) return;
    if (p.alive !== true) return;
    if (!result.mappedById[p.id]){
      result.unmappedLiving.push(p.id);
    }
  });

  return result;
}
