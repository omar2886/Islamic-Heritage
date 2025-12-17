// public/js/ui/graph_validate.js
function byId(state) {
  const m = new Map();
  for (const p of state.people) m.set(p.id, p);
  return m;
}

function ancestorsOf(map, id) {
  const out = new Set();
  let cur = map.get(id);
  while (cur) {
    const f = cur.fatherId && map.get(cur.fatherId);
    const m = cur.motherId && map.get(cur.motherId);
    if (f) { if (out.has(f.id)) break; out.add(f.id); cur = f; continue; }
    if (m) { if (out.has(m.id)) break; out.add(m.id); cur = m; continue; }
    break;
  }
  return out;
}

function buildParentGraph(map) {
  const edges = new Map(); // id -> [fatherId,motherId]
  for (const [id, p] of map.entries()) {
    edges.set(id, [p.fatherId, p.motherId].filter(Boolean));
  }
  return edges;
}

function hasCycle(edges) {
  const temp = new Set();
  const perm = new Set();

  function visit(n) {
    if (perm.has(n)) return false;
    if (temp.has(n)) return true;
    temp.add(n);
    const nxt = edges.get(n) || [];
    for (const v of nxt) if (visit(v)) return true;
    temp.delete(n);
    perm.add(n);
    return false;
  }

  for (const n of edges.keys()) {
    if (visit(n)) return true;
  }
  return false;
}

export function validateGraph(state) {
  const errors = [];
  const warnings = [];
  const fixed = JSON.parse(JSON.stringify(state)); // deep copy small
  const map = byId(fixed);

  // Basic parent sex + self checks
  for (const p of fixed.people) {
    if (p.fatherId === p.id) errors.push(`${p.id}: no puede ser su propio padre`);
    if (p.motherId === p.id) errors.push(`${p.id}: no puede ser su propia madre`);
    if (p.spouseIds.includes(p.id)) errors.push(`${p.id}: no puede ser su propio cónyuge`);

    if (p.fatherId) {
      const f = map.get(p.fatherId);
      if (!f) { p.fatherId = null; warnings.push(`${p.id}: padre inexistente eliminado`); }
      else if (f.sex !== "male") errors.push(`${p.id}: el padre debe ser varón`);
    }
    if (p.motherId) {
      const m = map.get(p.motherId);
      if (!m) { p.motherId = null; warnings.push(`${p.id}: madre inexistente eliminada`); }
      else if (m.sex !== "female") errors.push(`${p.id}: la madre debe ser mujer`);
    }
  }

  // Cycle check (parents only)
  const edges = buildParentGraph(map);
  if (hasCycle(edges)) errors.push("Ciclo detectado en relaciones padre/madre (árbol inválido)");

  // Spouse symmetry + constraints
  for (const p of fixed.people) {
    // Female max 1 spouse
    if (p.sex === "female" && p.spouseIds.length > 1) {
      errors.push(`${p.id}: una mujer no puede tener más de un cónyuge en el árbol`);
    }

    // Symmetry autocorrect
    for (const sid of [...p.spouseIds]) {
      const s = map.get(sid);
      if (!s) {
        p.spouseIds = p.spouseIds.filter(x => x !== sid);
        warnings.push(`${p.id}: cónyuge inexistente eliminado`);
        continue;
      }
      if (!s.spouseIds.includes(p.id)) {
        s.spouseIds.push(p.id);
        s.spouseIds = Array.from(new Set(s.spouseIds));
        warnings.push(`Autocorrección: ${s.id} añadió a ${p.id} como cónyuge (simetría)`);
      }

      // spouse cannot be ancestor/descendant
      const a1 = ancestorsOf(map, p.id);
      const a2 = ancestorsOf(map, s.id);
      if (a1.has(s.id) || a2.has(p.id)) {
        errors.push(`${p.id} y ${s.id}: cónyuges no pueden ser ancestro/descendiente`);
      }
    }
  }

  return { errors, warnings, fixedState: fixed };
}
