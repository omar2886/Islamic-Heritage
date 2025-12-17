// public/js/storage_people.js
const KEY = "heritage_g2_state_v1";

export function defaultState() {
  return { people: [], decedentId: null, version: 1 };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultState();
    const obj = JSON.parse(raw);
    return normalizeState(obj);
  } catch {
    return defaultState();
  }
}

export function saveState(state) {
  const clean = normalizeState(state);
  localStorage.setItem(KEY, JSON.stringify(clean));
}

export function clearState() {
  localStorage.removeItem(KEY);
}

export function normalizeState(input) {
  const st = input && typeof input === "object" ? input : defaultState();
  const people = Array.isArray(st.people) ? st.people : [];
  const out = { people: [], decedentId: st.decedentId || null, version: 1 };

  const seen = new Set();
  for (const p of people) {
    if (!p || typeof p !== "object") continue;
    const id = typeof p.id === "string" && /^P\d+$/.test(p.id) ? p.id : null;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.people.push({
      id,
      name: typeof p.name === "string" ? p.name.slice(0, 80) : "",
      sex: p.sex === "male" || p.sex === "female" ? p.sex : "unknown",
      alive: p.alive === false ? false : true,
      fatherId: typeof p.fatherId === "string" && /^P\d+$/.test(p.fatherId) ? p.fatherId : null,
      motherId: typeof p.motherId === "string" && /^P\d+$/.test(p.motherId) ? p.motherId : null,
      spouseIds: Array.isArray(p.spouseIds)
        ? Array.from(new Set(p.spouseIds.filter(x => typeof x === "string" && /^P\d+$/.test(x))))
        : [],
    });
  }

  // Ensure decedentId exists
  if (out.decedentId && !out.people.some(p => p.id === out.decedentId)) {
    out.decedentId = null;
  }

  return out;
}

export function nextPersonId(state) {
  let max = 0;
  for (const p of state.people) {
    const n = parseInt(p.id.slice(1), 10);
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  return `P${max + 1}`;
}

export function addPerson(state, person) {
  const st = normalizeState(state);
  st.people.push(person);
  saveState(st);
  return st;
}

export function updatePerson(state, updated) {
  const st = normalizeState(state);
  const idx = st.people.findIndex(p => p.id === updated.id);
  if (idx >= 0) st.people[idx] = updated;
  saveState(st);
  return st;
}

export function removePerson(state, id) {
  const st = normalizeState(state);
  st.people = st.people.filter(p => p.id !== id);
  // Remove references
  for (const p of st.people) {
    if (p.fatherId === id) p.fatherId = null;
    if (p.motherId === id) p.motherId = null;
    p.spouseIds = p.spouseIds.filter(x => x !== id);
  }
  if (st.decedentId === id) st.decedentId = null;
  saveState(st);
  return st;
}
