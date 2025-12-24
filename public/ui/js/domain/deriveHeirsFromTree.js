// public/ui/js/domain/deriveHeirsFromTree.js
import { ensureTree, sanitizeTree, getParents, getChildren, getSpouses } from "./familyTree.js";

/*
  Deriva roles del core desde el árbol (tree) sin inventar.

  Alcance MVP:
  - spouse: husband / wife
  - ascendants: father / mother
  - descendants: son / daughter
  - grandchildren via son: sons_son / sons_daughter

  Reglas:
  - Solo cuentan personas vivas (alive === true) como herederos.
  - El causante (deceasedId) siempre se excluye, aunque esté marcado alive por error.
  - Si falta información mínima (por ejemplo sexo del causante), se emite warning y se intenta derivar lo mejor posible.
*/

function safeSex(v){
  return v === "male" || v === "female" ? v : null;
}

function isAliveHeir(tree, id){
  if (!id || id === tree.deceasedId) return false;
  const p = tree.people[id];
  return Boolean(p && p.alive === true);
}

function uniq(arr){
  const out = [];
  const seen = new Set();
  for (const x of arr || []){
    if (!x) continue;
    const k = String(x);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

// DFS upwards to detect ancestry (for warnings and guardrails display)
function buildAncestorSet(tree, startId, maxDepth = 32){
  const seen = new Set();
  const stack = [{ id: startId, depth: 0 }];
  while (stack.length){
    const { id, depth } = stack.pop();
    if (!id || depth > maxDepth) continue;
    const parents = getParents(tree, id);
    for (const pid of [parents.fatherId, parents.motherId]){
      if (!pid) continue;
      const k = String(pid);
      if (seen.has(k)) continue;
      seen.add(k);
      stack.push({ id: k, depth: depth + 1 });
    }
  }
  return seen;
}

export function deriveHeirsByRoleFromTree(rawTree){
  const tree = ensureTree(sanitizeTree(rawTree), null);
  const warnings = [];
  const roleToPersons = Object.create(null);

  const deceased = tree.people[tree.deceasedId];
  const dSex = safeSex(deceased?.sex);
  if (!dSex){
    warnings.push("Sexo del causante desconocido. Algunas derivaciones pueden ser imprecisas.");
  }

  const addRolePerson = (role, personId) => {
    if (!role || !personId) return;
    const id = String(personId);
    if (!isAliveHeir(tree, id)) return;
    if (!roleToPersons[role]) roleToPersons[role] = [];
    if (!roleToPersons[role].includes(id)) roleToPersons[role].push(id);
  };

  // 1) Cónyuges
  const spouses = uniq(getSpouses(tree, tree.deceasedId));
  for (const sid of spouses){
    const sp = tree.people[sid];
    if (!sp) continue;
    const sSex = safeSex(sp.sex);

    // En herencia islámica solo aplica cónyuge de sexo opuesto. Si no cuadra, warning y NO mapear.
    if (dSex && sSex && dSex === sSex){
      warnings.push(`Cónyuge inválido: ${sid} tiene el mismo sexo que el causante.`);
      continue;
    }

    if (dSex === "male"){
      addRolePerson("wife", sid);
    } else if (dSex === "female"){
      addRolePerson("husband", sid);
    } else {
      // sin sexo del causante: derivar por sexo del cónyuge si existe
      if (sSex === "male") addRolePerson("husband", sid);
      if (sSex === "female") addRolePerson("wife", sid);
    }
  }

  // 2) Padres
  const parents = getParents(tree, tree.deceasedId);
  if (parents.fatherId){
    const fp = tree.people[parents.fatherId];
    if (fp && safeSex(fp.sex) && safeSex(fp.sex) !== "male"){
      warnings.push(`Padre inválido: ${parents.fatherId} no es sexo masculino.`);
    } else {
      addRolePerson("father", parents.fatherId);
    }
  }
  if (parents.motherId){
    const mp = tree.people[parents.motherId];
    if (mp && safeSex(mp.sex) && safeSex(mp.sex) !== "female"){
      warnings.push(`Madre inválida: ${parents.motherId} no es sexo femenino.`);
    } else {
      addRolePerson("mother", parents.motherId);
    }
  }

  // 3) Hijos directos
  const children = uniq(getChildren(tree, tree.deceasedId));
  for (const cid of children){
    const c = tree.people[cid];
    if (!c) continue;
    const cSex = safeSex(c.sex);
    if (cSex === "male") addRolePerson("son", cid);
    else if (cSex === "female") addRolePerson("daughter", cid);
    else warnings.push(`Hijo/a con sexo desconocido: ${cid} no se puede mapear a son/daughter.`);
  }

  // 4) Nietos por hijo (hijos de un hijo varón del causante)
  const sons = children.filter((cid) => safeSex(tree.people[cid]?.sex) === "male");
  for (const sonId of sons){
    const grand = uniq(getChildren(tree, sonId));
    for (const gid of grand){
      const g = tree.people[gid];
      if (!g) continue;
      const gSex = safeSex(g.sex);
      if (gSex === "male") addRolePerson("sons_son", gid);
      else if (gSex === "female") addRolePerson("sons_daughter", gid);
      else warnings.push(`Nieto/a por hijo con sexo desconocido: ${gid} no se puede mapear.`);
    }
  }

  // Unmapped: personas vivas conectadas al causante pero no mapeadas
  // Conectado = aparece en BFS de generaciones (spouse/parents/children edges)
  const connected = new Set([tree.deceasedId]);
  const q = [tree.deceasedId];

  while (q.length){
    const id = q.shift();
    const parentsRow = getParents(tree, id);
    for (const pid of [parentsRow.fatherId, parentsRow.motherId]){
      if (!pid) continue;
      const k = String(pid);
      if (!tree.people[k] || connected.has(k)) continue;
      connected.add(k);
      q.push(k);
    }

    for (const sid of uniq(getSpouses(tree, id))){
      const k = String(sid);
      if (!tree.people[k] || connected.has(k)) continue;
      connected.add(k);
      q.push(k);
    }

    for (const cid of uniq(getChildren(tree, id))){
      const k = String(cid);
      if (!tree.people[k] || connected.has(k)) continue;
      connected.add(k);
      q.push(k);
    }
  }

  const mappedIds = new Set();
  for (const ids of Object.values(roleToPersons)){
    for (const id of ids) mappedIds.add(String(id));
  }

  const unmapped = [];
  for (const id of connected){
    if (!isAliveHeir(tree, id)) continue;
    if (mappedIds.has(String(id))) continue;
    unmapped.push(String(id));
  }
  unmapped.sort((a, b) => a.localeCompare(b));

  const heirs = Object.entries(roleToPersons)
    .map(([role, ids]) => ({ role, count: ids.length }))
    .filter((x) => x.count > 0)
    .sort((a, b) => a.role.localeCompare(b.role));

  // Warnings extra: ciclos potenciales (detectar si causante es su propio ancestro)
  const anc = buildAncestorSet(tree, tree.deceasedId);
  if (anc.has(tree.deceasedId)){
    warnings.push("Ciclo detectado: el causante aparece como su propio ancestro.");
  }

  return {
    heirs,
    roleToPersons,
    unmapped,
    warnings,
  };
}
