import { EXPECTED_ROLES } from "../../api/contract.js";

/**
 * Family Graph (UI)
 * - Person:
 *   { id, label, sex: "male"|"female"|"unknown", alive: boolean,
 *     fatherId: string|null, motherId: string|null, spouseIds: string[] }
 * - family:
 *   { nextSeq:number, order:string[], people: Record<string, Person> }
 *
 * Derivación (MVP PR14):
 * - spouse: husband / wife
 * - children: son / daughter
 * - grandchildren through SON only: sons_son / sons_daughter
 * - parents: father / mother
 * - paternal grandfather, paternal grandmother, maternal grandmother
 * - great grandmothers (paternal/maternal) aproximación estructural
 * - siblings: full / consanguine / uterine (brother/sister)
 * - paternal uncles: paternal_uncle / consanguine_paternal_uncle
 * - cousins: paternal_uncle_son / paternal_uncles_daughter + consanguine_*
 * - cousin's daughters: paternal_uncle_sons_daughter + consanguine_*
 *
 * Nota: PR14 NO intenta “resolver” bloqueos islámicos; eso es trabajo del core.
 * Solo mapea nodos vivos del árbol a roles compatibles con el core.
 */

function emptyCounts(){
  const out = {};
  for (const r of EXPECTED_ROLES) out[r] = 0;
  return out;
}

function normSex(x){
  if (x === "male" || x === "female") return x;
  return "unknown";
}

function asBool(x){ return !!x; }

function safeStr(x){
  const s = String(x ?? "").trim();
  return s || "";
}

function uniq(arr){
  const seen = new Set();
  const out = [];
  for (const v of arr || []){
    const s = String(v || "").trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function issue(code, message, personId = null, details = null){
  return { code, message, personId, details };
}

function mapChildren(peopleById){
  const childrenByParent = new Map(); // parentId -> Set(childId)
  const add = (pid, cid) => {
    if (!pid) return;
    const key = String(pid);
    const set = childrenByParent.get(key) || new Set();
    set.add(String(cid));
    childrenByParent.set(key, set);
  };

  for (const p of Object.values(peopleById)){
    if (!p || !p.id) continue;
    if (p.fatherId) add(p.fatherId, p.id);
    if (p.motherId) add(p.motherId, p.id);
  }
  return childrenByParent;
}

function bfsConnected(peopleById, startId){
  const childrenByParent = mapChildren(peopleById);

  const neighbors = (id) => {
    const p = peopleById[id];
    const out = new Set();
    if (!p) return out;

    // parents
    if (p.fatherId && peopleById[p.fatherId]) out.add(p.fatherId);
    if (p.motherId && peopleById[p.motherId]) out.add(p.motherId);

    // spouses
    for (const sid of (p.spouseIds || [])){
      if (peopleById[sid]) out.add(sid);
    }

    // children
    const kids = childrenByParent.get(id);
    if (kids){
      for (const kid of kids){
        if (peopleById[kid]) out.add(kid);
      }
    }

    return out;
  };

  const start = String(startId || "");
  const seen = new Set();
  const q = [];
  if (start && peopleById[start]){
    seen.add(start);
    q.push(start);
  }

  // Limit traversal size (guardrail)
  let steps = 0;
  const STEP_LIMIT = 5000;

  while (q.length && steps < STEP_LIMIT){
    steps++;
    const cur = q.shift();
    const ns = neighbors(cur);
    for (const n of ns){
      if (!seen.has(n)){
        seen.add(n);
        q.push(n);
      }
    }
  }
  return seen;
}

function addToBucket(buckets, role, personId){
  if (!role || !personId) return;
  if (!buckets[role]) buckets[role] = new Set();
  buckets[role].add(String(personId));
}

function siblingKind(a, dec){
  const sameFather = !!(a.fatherId && dec.fatherId && a.fatherId === dec.fatherId);
  const sameMother = !!(a.motherId && dec.motherId && a.motherId === dec.motherId);
  if (sameFather && sameMother) return "full";
  if (sameFather && !sameMother) return "consanguine";
  if (!sameFather && sameMother) return "uterine";
  return null;
}

export function deriveHeirsFromFamily(family, decedentId){
  const peopleById = (family && family.people && typeof family.people === "object") ? family.people : {};
  const counts = emptyCounts();
  const issues = [];
  const buckets = {}; // role -> Set(personId)

  const did = String(decedentId || "");
  const dec = peopleById[did];

  if (!did || !dec){
    issues.push(issue("missing_decedent", "No existe el causante (decedentId) en el árbol.", did || null));
    return { heirsByRole: counts, heirs: [], issues, unsupported: [] };
  }

  const decSex = normSex(dec.sex);

  // Connectivity set (para unsupported debug)
  const connected = bfsConnected(peopleById, did);

  const isAlive = (p) => !!p && asBool(p.alive) === true;

  // Helper: resolve
  const get = (id) => (id && peopleById[id]) ? peopleById[id] : null;

  // 1) SPOUSE(S)
  const spouseIds = uniq(dec.spouseIds || []);
  for (const sid of spouseIds){
    const sp = get(sid);
    if (!sp) continue;
    if (!isAlive(sp)) continue;

    if (decSex === "male"){
      addToBucket(buckets, "wife", sp.id);
    }else if (decSex === "female"){
      addToBucket(buckets, "husband", sp.id);
    }else{
      // sexo del causante desconocido => no podemos mapear cónyuge
      issues.push(issue("unknown_decedent_sex_spouse", "Sexo del causante desconocido: no se puede clasificar el/los cónyuge(s).", dec.id));
    }
  }

  // 2) PARENTS
  const father = get(dec.fatherId);
  const mother = get(dec.motherId);
  if (father && isAlive(father)) addToBucket(buckets, "father", father.id);
  if (mother && isAlive(mother)) addToBucket(buckets, "mother", mother.id);

  // 3) GRANDPARENTS (según roles soportados por core/UI)
  const pgf = father ? get(father.fatherId) : null;
  const pgm = father ? get(father.motherId) : null;
  const mgm = mother ? get(mother.motherId) : null;

  if (pgf && isAlive(pgf)) addToBucket(buckets, "paternal_grandfather", pgf.id);
  if (pgm && isAlive(pgm)) addToBucket(buckets, "paternal_grandmother", pgm.id);
  if (mgm && isAlive(mgm)) addToBucket(buckets, "maternal_grandmother", mgm.id);

  // 4) GREAT GRANDMOTHERS (aprox. estructural, agrupadas por lado)
  // paternal great grandmothers:
  const pggm_candidates = [];
  if (pgf) pggm_candidates.push(get(pgf.motherId)); // father’s father’s mother
  if (pgm) pggm_candidates.push(get(pgm.motherId)); // father’s mother’s mother
  // maternal great grandmothers:
  const maternalGrandfather = mother ? get(mother.fatherId) : null;
  const mggm_candidates = [];
  if (mgm) mggm_candidates.push(get(mgm.motherId)); // mother’s mother’s mother
  if (maternalGrandfather) mggm_candidates.push(get(maternalGrandfather.motherId)); // mother’s father’s mother

  for (const g of pggm_candidates){
    if (g && isAlive(g)) addToBucket(buckets, "paternal_great_grandmother", g.id);
  }
  for (const g of mggm_candidates){
    if (g && isAlive(g)) addToBucket(buckets, "maternal_great_grandmother", g.id);
  }

  // 5) CHILDREN of decedent
  const childrenByParent = mapChildren(peopleById);
  const childIds = childrenByParent.get(did) ? Array.from(childrenByParent.get(did)) : [];
  const childrenAlive = childIds.map(get).filter((p) => p && isAlive(p));

  const sons = [];
  for (const ch of childrenAlive){
    const sx = normSex(ch.sex);
    if (sx === "male"){
      addToBucket(buckets, "son", ch.id);
      sons.push(ch.id);
    }else if (sx === "female"){
      addToBucket(buckets, "daughter", ch.id);
    }else{
      issues.push(issue("unknown_child_sex", "Hijo/a con sexo desconocido: no se puede mapear a son/daughter.", ch.id));
    }
  }

  // 6) GRANDCHILDREN THROUGH SON ONLY
  const sonsSet = new Set(sons);
  // Para cada hijo del causante que sea varón (“son”), tomamos sus hijos (cualquier vínculo padre/madre en el modelo)
  for (const sid of sonsSet){
    const kids = childrenByParent.get(String(sid));
    if (!kids) continue;
    for (const gid of kids){
      const g = get(gid);
      if (!g || !isAlive(g)) continue;
      const sx = normSex(g.sex);
      if (sx === "male") addToBucket(buckets, "sons_son", g.id);
      else if (sx === "female") addToBucket(buckets, "sons_daughter", g.id);
      else issues.push(issue("unknown_grandchild_sex", "Nieto/a (por hijo) con sexo desconocido.", g.id));
    }
  }

  // 7) SIBLINGS (full / consanguine / uterine)
  for (const p of Object.values(peopleById)){
    if (!p || !p.id || p.id === did) continue;
    if (!isAlive(p)) continue;

    // must share at least one parent to be sibling
    const sharesParent = !!(
      (p.fatherId && dec.fatherId && p.fatherId === dec.fatherId) ||
      (p.motherId && dec.motherId && p.motherId === dec.motherId)
    );
    if (!sharesParent) continue;

    const kind = siblingKind(p, dec);
    if (!kind) continue;

    const sx = normSex(p.sex);
    if (sx === "unknown"){
      issues.push(issue("unknown_sibling_sex", "Hermano/a con sexo desconocido: no se puede mapear a brother/sister.", p.id));
      continue;
    }

    if (kind === "full"){
      addToBucket(buckets, sx === "male" ? "full_brother" : "full_sister", p.id);
    }else if (kind === "consanguine"){
      addToBucket(buckets, sx === "male" ? "consanguine_brother" : "consanguine_sister", p.id);
    }else if (kind === "uterine"){
      addToBucket(buckets, sx === "male" ? "uterine_brother" : "uterine_sister", p.id);
    }
  }

  // 8) PATERNAL UNCLES (brothers of father)
  // Definición estructural:
  // - comparten abuelo paterno del padre (father.fatherId)
  // - tipo “full” si además comparten la madre del padre; si no => consanguine_paternal_uncle
  const uncles = []; // { id, type:"full"|"consanguine" }
  if (father){
    const fathersFatherId = father.fatherId ? String(father.fatherId) : null;
    const fathersMotherId = father.motherId ? String(father.motherId) : null;

    if (fathersFatherId){
      for (const p of Object.values(peopleById)){
        if (!p || !p.id) continue;
        if (!isAlive(p)) continue;
        if (p.id === father.id) continue;
        if (normSex(p.sex) !== "male") continue;

        // share same father as the father (paternal grandfather of decedent)
        if (!p.fatherId || String(p.fatherId) !== fathersFatherId) continue;

        const sameMother = !!(fathersMotherId && p.motherId && String(p.motherId) === fathersMotherId);
        const uType = sameMother ? "full" : "consanguine";
        uncles.push({ id: p.id, type: uType });

        if (!fathersMotherId){
          issues.push(issue("unknown_father_mother_for_uncle_type", "No se conoce la madre del padre: tíos clasificados como consanguíneos por defecto.", father.id));
        }
      }
    }
  }

  for (const u of uncles){
    addToBucket(buckets, u.type === "full" ? "paternal_uncle" : "consanguine_paternal_uncle", u.id);
  }

  // 9) COUSINS (children of paternal uncles)
  const cousinSons = []; // { id, from:"full"|"consanguine" }
  for (const u of uncles){
    const kids = childrenByParent.get(String(u.id));
    if (!kids) continue;
    for (const cid of kids){
      const c = get(cid);
      if (!c || !isAlive(c)) continue;
      const sx = normSex(c.sex);
      if (sx === "unknown"){
        issues.push(issue("unknown_cousin_sex", "Primo/a con sexo desconocido: no se puede mapear.", c.id));
        continue;
      }
      if (u.type === "full"){
        if (sx === "male"){
          addToBucket(buckets, "paternal_uncle_son", c.id);
          cousinSons.push({ id: c.id, from: "full" });
        }else{
          addToBucket(buckets, "paternal_uncles_daughter", c.id);
        }
      }else{
        if (sx === "male"){
          addToBucket(buckets, "consanguine_paternal_uncle_son", c.id);
          cousinSons.push({ id: c.id, from: "consanguine" });
        }else{
          addToBucket(buckets, "consanguine_paternal_uncles_daughter", c.id);
        }
      }
    }
  }

  // 10) COUSIN'S DAUGHTERS (daughters of paternal uncle sons)
  for (const cs of cousinSons){
    const kids = childrenByParent.get(String(cs.id));
    if (!kids) continue;
    for (const kid of kids){
      const p = get(kid);
      if (!p || !isAlive(p)) continue;
      const sx = normSex(p.sex);
      if (sx === "unknown"){
        issues.push(issue("unknown_cousin_child_sex", "Hijo/a de primo con sexo desconocido: no se puede mapear.", p.id));
        continue;
      }
      if (sx !== "female") continue;

      if (cs.from === "full") addToBucket(buckets, "paternal_uncle_sons_daughter", p.id);
      else addToBucket(buckets, "consanguine_paternal_uncle_sons_daughter", p.id);
    }
  }

  // Build counts
  for (const role of Object.keys(buckets)){
    if (!Object.prototype.hasOwnProperty.call(counts, role)) continue;
    counts[role] = buckets[role].size;
  }

  // Unsupported: alive + connected + not decedent + not in any bucket
  const used = new Set();
  for (const set of Object.values(buckets)){
    for (const id of set) used.add(id);
  }
  const unsupported = [];
  for (const id of connected){
    if (id === did) continue;
    const p = get(id);
    if (!p || !isAlive(p)) continue;
    if (used.has(id)) continue;
    unsupported.push({ id, label: safeStr(p.label) || id });
  }

  // Heirs list for convenience (role,count) excluding 0
  const heirs = Object.entries(counts)
    .filter(([,c]) => (Number(c) || 0) > 0)
    .map(([role, count]) => ({ role, count: Number(count) || 0 }));

  return { heirsByRole: counts, heirs, issues, unsupported };
}
