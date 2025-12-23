// public/ui/js/domain/treeRoles.js
import { EXPECTED_ROLES } from "../api/contract.js";
import { ensureTree, sanitizeTree, getParents, getChildren, getSpouses } from "./familyTree.js";

const ROLE_SET = new Set(EXPECTED_ROLES);

function uniq(arr){
  const out = [];
  const seen = new Set();
  for (const x of arr || []){
    const k = String(x);
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

function personLabel(p){
  const name = (p && typeof p.name === "string") ? p.name.trim() : "";
  return name || "(sin nombre)";
}

function isAlive(t, id){
  return Boolean(t?.people?.[id]?.alive === true);
}

function sexOf(t, id){
  const s = t?.people?.[id]?.sex;
  if (s === "male" || s === "female") return s;
  return "unknown";
}

function addRole(roleMap, role, ids){
  if (!ROLE_SET.has(role)) return;
  if (!roleMap[role]) roleMap[role] = new Set();
  for (const id of ids || []){
    const k = String(id);
    if (!k) continue;
    roleMap[role].add(k);
  }
}

function buildAdjacency(t){
  const adj = new Map();
  const addEdge = (a, b, kind) => {
    if (!a || !b) return;
    const A = String(a);
    const B = String(b);
    if (!adj.has(A)) adj.set(A, []);
    if (!adj.has(B)) adj.set(B, []);
    adj.get(A).push({ to: B, kind });
    adj.get(B).push({ to: A, kind });
  };

  // spouse edges
  for (const [id, list] of Object.entries(t.spouses || {})){
    if (!Array.isArray(list)) continue;
    for (const other of list){
      addEdge(id, other, "spouse");
    }
  }

  // parent-child edges
  for (const [childId, row] of Object.entries(t.parents || {})){
    if (!row || typeof row !== "object") continue;
    if (row.fatherId) addEdge(childId, row.fatherId, "parent");
    if (row.motherId) addEdge(childId, row.motherId, "parent");
  }

  return adj;
}

function shortestPath(adj, from, to){
  const start = String(from);
  const goal = String(to);
  if (start === goal) return [{ id: start, via: null }];

  const q = [start];
  const prev = new Map();
  prev.set(start, { p: null, via: null });

  while (q.length){
    const cur = q.shift();
    const edges = adj.get(cur) || [];
    for (const e of edges){
      if (prev.has(e.to)) continue;
      prev.set(e.to, { p: cur, via: e.kind });
      if (e.to === goal){
        q.length = 0;
        break;
      }
      q.push(e.to);
    }
  }

  if (!prev.has(goal)) return null;

  const out = [];
  let cur = goal;
  while (cur){
    const meta = prev.get(cur);
    out.push({ id: cur, via: meta?.via ?? null });
    cur = meta?.p ?? null;
  }
  out.reverse();
  return out;
}

function formatPath(path){
  if (!path || path.length === 0) return "";
  const parts = [];
  for (let i = 0; i < path.length; i++){
    const node = path[i];
    if (i === 0){
      parts.push(node.id);
      continue;
    }
    const via = node.via || "link";
    parts.push(`-(${via})->`);
    parts.push(node.id);
  }
  return parts.join(" ");
}

function buildEvidence(t, roleSets){
  const used = new Set();
  const roleOut = {};

  for (const [role, set] of Object.entries(roleSets || {})){
    if (!set || typeof set.values !== "function") continue;
    const ids = Array.from(set.values());
    ids.forEach((x) => used.add(String(x)));
    roleOut[role] = {
      count: ids.length,
      ids,
      people: ids.map((id) => {
        const p = t.people?.[id] || {};
        return {
          id,
          name: personLabel(p),
          sex: sexOf(t, id),
          alive: Boolean(p.alive),
        };
      }),
    };
  }

  return { roleOut, used };
}

export function deriveHeirsFromTree(tree){
  const t = ensureTree(sanitizeTree(tree), null);
  const did = t.deceasedId;

  const warnings = [];
  if (!did || !t.people?.[did]){
    return {
      ok: false,
      tree: t,
      heirs: [],
      roles: {},
      warnings: ["No hay causante (deceasedId) valido en el arbol."],
      unmapped: [],
    };
  }

  const roleSets = {};

  // Spouses
  const spouseIds = uniq(getSpouses(t, did));
  const livingSpouses = spouseIds.filter((id) => isAlive(t, id));
  const husbands = livingSpouses.filter((id) => sexOf(t, id) === "male");
  const wives = livingSpouses.filter((id) => sexOf(t, id) === "female");
  const spouseUnknown = livingSpouses.filter((id) => sexOf(t, id) === "unknown");

  addRole(roleSets, "husband", husbands);
  addRole(roleSets, "wife", wives);

  if (husbands.length > 1) warnings.push("Hay mas de un esposo vivo en el arbol. Revisa enlaces de conyuge.");
  if (wives.length > 4) warnings.push("Hay mas de 4 esposas vivas en el arbol. Revisa enlaces de conyuge.");
  if (spouseUnknown.length) warnings.push("Hay conyuges vivos con sexo desconocido; no se pueden mapear a wife/husband.");

  // Children
  const childIds = uniq(getChildren(t, did));
  const livingChildren = childIds.filter((id) => isAlive(t, id));
  const sons = livingChildren.filter((id) => sexOf(t, id) === "male");
  const daughters = livingChildren.filter((id) => sexOf(t, id) === "female");
  const childrenUnknown = livingChildren.filter((id) => sexOf(t, id) === "unknown");

  addRole(roleSets, "son", sons);
  addRole(roleSets, "daughter", daughters);
  if (childrenUnknown.length) warnings.push("Hay hijos vivos con sexo desconocido; no se pueden mapear a son/daughter.");

  // Grandchildren via sons
  const grandSons = [];
  const grandDaughters = [];
  for (const sid of sons){
    const gc = uniq(getChildren(t, sid)).filter((id) => isAlive(t, id));
    for (const id of gc){
      const sx = sexOf(t, id);
      if (sx === "male") grandSons.push(id);
      else if (sx === "female") grandDaughters.push(id);
    }
  }
  addRole(roleSets, "sons_son", grandSons);
  addRole(roleSets, "sons_daughter", grandDaughters);

  // Parents
  const dp = getParents(t, did);
  const fatherId = dp.fatherId && t.people?.[dp.fatherId] ? dp.fatherId : null;
  const motherId = dp.motherId && t.people?.[dp.motherId] ? dp.motherId : null;

  if (fatherId && isAlive(t, fatherId)) addRole(roleSets, "father", [fatherId]);
  if (motherId && isAlive(t, motherId)) addRole(roleSets, "mother", [motherId]);

  // Paternal grandparents
  let pgf = null;
  let pgm = null;
  if (fatherId){
    const fp = getParents(t, fatherId);
    pgf = fp.fatherId && t.people?.[fp.fatherId] ? fp.fatherId : null;
    pgm = fp.motherId && t.people?.[fp.motherId] ? fp.motherId : null;

    if (pgf && isAlive(t, pgf) && sexOf(t, pgf) === "male") addRole(roleSets, "paternal_grandfather", [pgf]);
    if (pgm && isAlive(t, pgm) && sexOf(t, pgm) === "female") addRole(roleSets, "paternal_grandmother", [pgm]);
  }

  // Maternal grandmother
  let mgm = null;
  if (motherId){
    const mp = getParents(t, motherId);
    mgm = mp.motherId && t.people?.[mp.motherId] ? mp.motherId : null;
    if (mgm && isAlive(t, mgm) && sexOf(t, mgm) === "female") addRole(roleSets, "maternal_grandmother", [mgm]);
  }

  // Great grandmothers
  const paternalGreatGms = [];
  if (pgf){
    const gp = getParents(t, pgf);
    if (gp.motherId) paternalGreatGms.push(gp.motherId);
  }
  if (pgm){
    const gp = getParents(t, pgm);
    if (gp.motherId) paternalGreatGms.push(gp.motherId);
  }
  addRole(
    roleSets,
    "paternal_great_grandmother",
    paternalGreatGms.filter((id) => isAlive(t, id) && sexOf(t, id) === "female")
  );

  const maternalGreatGms = [];
  if (mgm){
    const gp = getParents(t, mgm);
    if (gp.motherId) maternalGreatGms.push(gp.motherId);
  }
  addRole(
    roleSets,
    "maternal_great_grandmother",
    maternalGreatGms.filter((id) => isAlive(t, id) && sexOf(t, id) === "female")
  );

  // Siblings of deceased
  const fullBro = [];
  const fullSis = [];
  const consBro = [];
  const consSis = [];
  const uterBro = [];
  const uterSis = [];

  for (const id of Object.keys(t.people || {})){
    if (id === did) continue;
    if (!isAlive(t, id)) continue;

    const p = getParents(t, id);
    const shareFather = Boolean(fatherId && p.fatherId === fatherId);
    const shareMother = Boolean(motherId && p.motherId === motherId);
    if (!shareFather && !shareMother) continue;

    const sx = sexOf(t, id);
    if (sx === "unknown") continue;

    if (shareFather && shareMother){
      if (sx === "male") fullBro.push(id);
      else fullSis.push(id);
      continue;
    }
    if (shareFather){
      if (sx === "male") consBro.push(id);
      else consSis.push(id);
      continue;
    }
    if (shareMother){
      if (sx === "male") uterBro.push(id);
      else uterSis.push(id);
    }
  }

  addRole(roleSets, "full_brother", fullBro);
  addRole(roleSets, "full_sister", fullSis);
  addRole(roleSets, "consanguine_brother", consBro);
  addRole(roleSets, "consanguine_sister", consSis);
  addRole(roleSets, "uterine_brother", uterBro);
  addRole(roleSets, "uterine_sister", uterSis);

  // Paternal uncles
  const paternalUncleIds = [];
  const consanguinePaternalUncleIds = [];

  if (fatherId && pgf){
    const fatherMother = pgm;

    for (const id of Object.keys(t.people || {})){
      if (id === fatherId) continue;
      if (!isAlive(t, id)) continue;
      if (sexOf(t, id) !== "male") continue;

      const p = getParents(t, id);
      const shareF = Boolean(p.fatherId && p.fatherId === pgf);
      if (!shareF) continue;

      const shareM = Boolean(fatherMother && p.motherId === fatherMother);
      if (shareM) paternalUncleIds.push(id);
      else consanguinePaternalUncleIds.push(id);
    }
  }

  addRole(roleSets, "paternal_uncle", paternalUncleIds);
  addRole(roleSets, "consanguine_paternal_uncle", consanguinePaternalUncleIds);

  const collectUncleDesc = (uncleIds, rolePrefix) => {
    const sons2 = [];
    const daughters2 = [];
    const sonsDaughters = [];

    for (const uid of uncleIds || []){
      const kids = uniq(getChildren(t, uid)).filter((id) => isAlive(t, id));
      const sonsIds = kids.filter((id) => sexOf(t, id) === "male");
      const daughtersIds = kids.filter((id) => sexOf(t, id) === "female");

      sons2.push(...sonsIds);
      daughters2.push(...daughtersIds);

      for (const sid2 of sonsIds){
        const gkids = uniq(getChildren(t, sid2)).filter((id) => isAlive(t, id) && sexOf(t, id) === "female");
        sonsDaughters.push(...gkids);
      }
    }

    addRole(roleSets, `${rolePrefix}_son`, sons2);
    addRole(roleSets, `${rolePrefix}s_daughter`, daughters2);
    addRole(roleSets, `${rolePrefix}_sons_daughter`, sonsDaughters);
  };

  collectUncleDesc(paternalUncleIds, "paternal_uncle");
  collectUncleDesc(consanguinePaternalUncleIds, "consanguine_paternal_uncle");

  // Evidence + unmapped
  const { roleOut, used } = buildEvidence(t, roleSets);
  const adj = buildAdjacency(t);

  const aliveOthers = Object.keys(t.people || {}).filter((id) => id !== did && isAlive(t, id));
  const unmapped = [];

  for (const id of aliveOthers){
    if (used.has(id)) continue;
    const path = shortestPath(adj, did, id);
    unmapped.push({
      id,
      name: personLabel(t.people[id]),
      sex: sexOf(t, id),
      alive: true,
      path: formatPath(path),
      reason: "No existe rol compatible en el contrato del core para esta relacion, o faltan datos en el arbol.",
    });
  }

  // Payload heirs
  const heirs = [];
  for (const role of EXPECTED_ROLES){
    const count = Number(roleOut[role]?.count) || 0;
    if (count > 0) heirs.push({ role, count });
  }

  return {
    ok: true,
    tree: t,
    heirs,
    roles: roleOut,
    warnings,
    unmapped,
  };
}
