function ensureMap(persons) {
  return buildMap(persons || []);
}

export function buildMap(persons = []) {
  const map = new Map();
  persons.forEach((p) => {
    if (p && p.id) {
      map.set(p.id, p);
    }
  });
  return map;
}

export function isAncestor(ancestorId, nodeId, map) {
  if (!ancestorId || !nodeId) return false;
  const visited = new Set();
  const queue = [nodeId];
  while (queue.length) {
    const currentId = queue.shift();
    if (!currentId || visited.has(currentId)) continue;
    visited.add(currentId);
    if (currentId === ancestorId) return true;
    const node = map.get(currentId);
    if (node) {
      if (node.fatherId) queue.push(node.fatherId);
      if (node.motherId) queue.push(node.motherId);
    }
  }
  return false;
}

export function wouldCreateCycle(childId, newParentId, map) {
  if (!childId || !newParentId) return false;
  return isAncestor(childId, newParentId, map);
}

export function canSetFather(childId, fatherId, persons = []) {
  if (!fatherId) return { ok: true };
  const map = ensureMap(persons);
  const child = map.get(childId);
  const father = map.get(fatherId);
  if (!father) return { ok: false, error: 'El padre seleccionado no existe' };
  if (fatherId === childId) return { ok: false, error: 'Una persona no puede ser su propio padre' };
  if (father.sex !== 'male') return { ok: false, error: 'El padre debe ser varón' };
  if (child && child.motherId && child.motherId === fatherId) return { ok: false, error: 'Padre y madre no pueden ser la misma persona' };
  if (wouldCreateCycle(childId, fatherId, map)) return { ok: false, error: 'Asignar este padre genera un ciclo' };
  return { ok: true };
}

export function canSetMother(childId, motherId, persons = []) {
  if (!motherId) return { ok: true };
  const map = ensureMap(persons);
  const child = map.get(childId);
  const mother = map.get(motherId);
  if (!mother) return { ok: false, error: 'La madre seleccionada no existe' };
  if (motherId === childId) return { ok: false, error: 'Una persona no puede ser su propia madre' };
  if (mother.sex !== 'female') return { ok: false, error: 'La madre debe ser mujer' };
  if (child && child.fatherId && child.fatherId === motherId) return { ok: false, error: 'Padre y madre no pueden ser la misma persona' };
  if (wouldCreateCycle(childId, motherId, map)) return { ok: false, error: 'Asignar esta madre genera un ciclo' };
  return { ok: true };
}

function areSiblings(a, b) {
  if (!a || !b) return false;
  return (a.fatherId && a.fatherId === b.fatherId) || (a.motherId && a.motherId === b.motherId);
}

export function canLinkSpouse(aId, bId, persons = []) {
  if (!aId || !bId) return { ok: false, error: 'Seleccione ambas personas' };
  const map = ensureMap(persons);
  const a = map.get(aId);
  const b = map.get(bId);
  if (!a || !b) return { ok: false, error: 'Persona no encontrada' };
  if (aId === bId) return { ok: false, error: 'No se puede casar una persona consigo misma' };
  if (a.sex === b.sex || a.sex === 'unknown' || b.sex === 'unknown') return { ok: false, error: 'El matrimonio requiere sexos opuestos' };
  if (isAncestor(aId, bId, map) || isAncestor(bId, aId, map)) return { ok: false, error: 'No se permite matrimonio entre ascendiente y descendiente' };
  if (areSiblings(a, b)) return { ok: false, error: 'No se permite matrimonio entre hermanos' };

  const aSpouses = Array.isArray(a.spouseIds) ? a.spouseIds : [];
  const bSpouses = Array.isArray(b.spouseIds) ? b.spouseIds : [];

  if (a.sex === 'male' && aSpouses.length >= 4 && !aSpouses.includes(bId)) return { ok: false, error: 'Límite de 4 esposas para el varón' };
  if (a.sex === 'female' && aSpouses.length >= 1 && !aSpouses.includes(bId)) return { ok: false, error: 'Una mujer solo puede tener un esposo' };
  if (b.sex === 'male' && bSpouses.length >= 4 && !bSpouses.includes(aId)) return { ok: false, error: 'Límite de 4 esposas para el varón' };
  if (b.sex === 'female' && bSpouses.length >= 1 && !bSpouses.includes(aId)) return { ok: false, error: 'Una mujer solo puede tener un esposo' };

  return { ok: true };
}

export function validateWholeGraph(persons = []) {
  const map = ensureMap(persons);
  const errors = [];
  const warnings = [];

  persons.forEach((p) => {
    if (!p) return;
    if (p.fatherId) {
      const res = canSetFather(p.id, p.fatherId, persons);
      if (!res.ok) errors.push(`${p.name || p.id}: ${res.error}`);
    }
    if (p.motherId) {
      const res = canSetMother(p.id, p.motherId, persons);
      if (!res.ok) errors.push(`${p.name || p.id}: ${res.error}`);
    }
    if (p.fatherId && p.motherId && p.fatherId === p.motherId) {
      errors.push(`${p.name || p.id}: padre y madre no pueden ser la misma persona`);
    }
    if (wouldCreateCycle(p.id, p.fatherId, map) || wouldCreateCycle(p.id, p.motherId, map)) {
      errors.push(`${p.name || p.id}: la relación genera un ciclo`);
    }
    const spouses = Array.isArray(p.spouseIds) ? p.spouseIds : [];
    const limit = p.sex === 'male' ? 4 : p.sex === 'female' ? 1 : Infinity;
    if (spouses.length > limit) {
      errors.push(`${p.name || p.id}: supera el límite de cónyuges permitidos`);
    }
  });

  persons.forEach((p) => {
    const spouses = Array.isArray(p?.spouseIds) ? p.spouseIds : [];
    spouses.forEach((sid) => {
      const res = canLinkSpouse(p.id, sid, persons);
      if (!res.ok) errors.push(`${p.name || p.id}: ${res.error}`);
      const other = map.get(sid);
      const otherSpouses = Array.isArray(other?.spouseIds) ? other.spouseIds : [];
      if (other && !otherSpouses.includes(p.id)) {
        warnings.push(`Matrimonio asimétrico entre ${p.name || p.id} y ${other.name || other.id}`);
      }
    });
  });

  return { errors, warnings };
}
