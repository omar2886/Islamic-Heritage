import { clearState, loadState, nextPersonId, normalizeState, removePerson, saveState } from "../storage_people.js";
import { validateGraph } from "./graph_validate.js";

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function mapById(people) {
  const m = new Map();
  for (const p of people) m.set(p.id, p);
  return m;
}

function ancestorsOf(map, id) {
  const seen = new Set();
  const stack = [];
  const start = map.get(id);
  if (start) stack.push(start);
  while (stack.length) {
    const cur = stack.pop();
    const father = cur.fatherId && map.get(cur.fatherId);
    const mother = cur.motherId && map.get(cur.motherId);
    for (const parent of [father, mother]) {
      if (parent && !seen.has(parent.id)) {
        seen.add(parent.id);
        stack.push(parent);
      }
    }
  }
  return seen;
}

function isAncestor(map, ancestorId, targetId) {
  return ancestorsOf(map, targetId).has(ancestorId);
}

function renderOption(select, value, label, isSelected = false) {
  const opt = document.createElement("option");
  opt.value = value;
  opt.textContent = label;
  opt.selected = isSelected;
  select.appendChild(opt);
}

export async function mountGenealogy2() {
  const root = document.getElementById("g2-app");
  if (!root) throw new Error("No se encontró el contenedor g2-app");

  const els = {
    list: root.querySelector("#g2-people-list"),
    newPerson: root.querySelector("#g2-new-person"),
    search: root.querySelector("#g2-search"),
    stats: root.querySelector("#g2-stats"),
    errors: root.querySelector("#g2-errors"),
    warnings: root.querySelector("#g2-warnings"),
    editorForm: root.querySelector("#g2-editor"),
    editorEmpty: root.querySelector("#g2-editor-empty"),
    name: root.querySelector("#g2-name"),
    sex: root.querySelector("#g2-sex"),
    alive: root.querySelector("#g2-alive"),
    id: root.querySelector("#g2-id"),
    father: root.querySelector("#g2-father"),
    mother: root.querySelector("#g2-mother"),
    spousePick: root.querySelector("#g2-spouse-pick"),
    spouseList: root.querySelector("#g2-spouse-list"),
    addSpouse: root.querySelector("#g2-add-spouse"),
    save: root.querySelector("#g2-save"),
    reset: root.querySelector("#g2-reset"),
    deleteBtn: root.querySelector("#g2-delete-person"),
    setDecedent: root.querySelector("#g2-set-decedent"),
  };

  let state = normalizeState(loadState());
  let selectedId = null;
  let draft = null;
  let validation = validateGraph(state);

  if (validation.fixedState) {
    state = normalizeState(validation.fixedState);
    validation = validateGraph(state);
    saveState(state);
  }

  function setValidation(result) {
    validation = { errors: result.errors || [], warnings: result.warnings || [] };
    renderValidation();
  }

  function applyState(newState, { persist = true, allowErrors = false } = {}) {
    const normalized = normalizeState(newState);
    const validated = validateGraph(normalized);
    const finalState = normalizeState(validated.fixedState || normalized);
    const finalValidation = validateGraph(finalState);
    setValidation(finalValidation);
    if (finalValidation.errors.length && !allowErrors) {
      return false;
    }
    state = finalState;
    if (persist) saveState(state);
    renderAll();
    return true;
  }

  function renderValidation() {
    if (!els.errors || !els.warnings) return;
    if (validation.errors.length) {
      els.errors.textContent = validation.errors.join("\n");
      els.errors.hidden = false;
    } else {
      els.errors.hidden = true;
      els.errors.textContent = "";
    }
    if (validation.warnings.length) {
      els.warnings.textContent = validation.warnings.join("\n");
      els.warnings.hidden = false;
    } else {
      els.warnings.hidden = true;
      els.warnings.textContent = "";
    }
  }

  function renderStats() {
    if (!els.stats) return;
    const total = state.people.length;
    const male = state.people.filter(p => p.sex === "male").length;
    const female = state.people.filter(p => p.sex === "female").length;
    const unknown = total - male - female;
    const decedent = state.decedentId ? `Causante: ${state.decedentId}` : "Causante sin asignar";
    const text = `Total: ${total} · Varón: ${male} · Mujer: ${female} · Sin dato: ${unknown} · ${decedent}`;
    els.stats.textContent = text;
  }

  function personLabel(p) {
    const name = p.name ? p.name : "(Sin nombre)";
    return `${name} — ${p.id}`;
  }

  function renderList() {
    if (!els.list) return;
    const term = (els.search?.value || "").toLowerCase();
    const frag = document.createDocumentFragment();
    const filtered = state.people.filter(p => p.name.toLowerCase().includes(term));

    filtered.sort((a, b) => a.name.localeCompare(b.name));

    for (const p of filtered) {
      const card = document.createElement("div");
      card.className = "card" + (p.id === selectedId ? " active" : "");
      card.dataset.id = p.id;

      const title = document.createElement("div");
      title.className = "card-title";
      title.textContent = p.name || "(Sin nombre)";
      card.appendChild(title);

      const meta = document.createElement("div");
      meta.className = "card-meta";
      const parts = [p.id];
      parts.push(p.sex === "male" ? "Varón" : p.sex === "female" ? "Mujer" : "Sexo no definido");
      parts.push(p.alive ? "Vivo" : "Fallecido");
      meta.textContent = parts.join(" · ");
      card.appendChild(meta);

      card.addEventListener("click", () => {
        selectedId = p.id;
        draft = clone(p);
        renderAll();
      });

      frag.appendChild(card);
    }

    if (filtered.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "Sin resultados";
      frag.appendChild(empty);
    }

    els.list.replaceChildren(frag);
  }

  function populateParentSelect(select, list, selectedValue) {
    if (!select) return;
    select.replaceChildren();
    renderOption(select, "", "— Sin asignar —", !selectedValue);
    for (const p of list) {
      renderOption(select, p.id, personLabel(p), selectedValue === p.id);
    }
  }

  function populateSpouseSelect(person) {
    if (!els.spousePick) return;
    const map = mapById(state.people);
    const ancestors = ancestorsOf(map, person.id);
    els.spousePick.replaceChildren();
    renderOption(els.spousePick, "", "— Selecciona —", true);
    const candidates = state.people.filter(p => p.id !== person.id && !ancestors.has(p.id) && !isAncestor(map, person.id, p.id));
    candidates.sort((a, b) => a.name.localeCompare(b.name));
    for (const c of candidates) {
      renderOption(els.spousePick, c.id, personLabel(c), false);
    }
  }

  function renderSpouseList(person) {
    if (!els.spouseList) return;
    const frag = document.createDocumentFragment();
    const map = mapById(state.people);
    for (const sid of person.spouseIds) {
      const sp = map.get(sid);
      if (!sp) continue;
      const chip = document.createElement("div");
      chip.className = "chip";
      const label = document.createElement("span");
      label.textContent = personLabel(sp);
      chip.appendChild(label);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip-close";
      btn.textContent = "×";
      btn.addEventListener("click", () => {
        draft.spouseIds = draft.spouseIds.filter(x => x !== sid);
        renderSpouseList(draft);
        populateSpouseSelect(draft);
      });
      chip.appendChild(btn);
      frag.appendChild(chip);
    }
    if (person.spouseIds.length === 0) {
      const empty = document.createElement("div");
      empty.className = "muted";
      empty.textContent = "Sin cónyuges";
      frag.appendChild(empty);
    }
    els.spouseList.replaceChildren(frag);
  }

  function renderEditor() {
    if (!els.editorForm || !els.editorEmpty) return;
    const person = state.people.find(p => p.id === selectedId);
    if (!person) {
      els.editorForm.hidden = true;
      els.editorEmpty.hidden = false;
      draft = null;
      return;
    }
    draft = draft && draft.id === person.id ? draft : clone(person);
    els.editorForm.hidden = false;
    els.editorEmpty.hidden = true;

    els.name.value = draft.name;
    els.sex.value = draft.sex;
    els.alive.value = draft.alive ? "1" : "0";
    els.id.value = draft.id;

    const fathers = state.people.filter(p => p.sex === "male" && p.id !== draft.id);
    fathers.sort((a, b) => a.name.localeCompare(b.name));
    populateParentSelect(els.father, fathers, draft.fatherId);

    const mothers = state.people.filter(p => p.sex === "female" && p.id !== draft.id);
    mothers.sort((a, b) => a.name.localeCompare(b.name));
    populateParentSelect(els.mother, mothers, draft.motherId);

    populateSpouseSelect(draft);
    renderSpouseList(draft);

    if (els.save) els.save.disabled = validation.errors.length > 0;
    if (els.deleteBtn) els.deleteBtn.disabled = validation.errors.length > 0;
    if (els.setDecedent) els.setDecedent.disabled = validation.errors.length > 0;
  }

  function renderAll() {
    renderValidation();
    renderStats();
    renderList();
    renderEditor();
  }

  function updateDraftFromInputs() {
    if (!draft) return;
    draft.name = els.name.value.trim();
    draft.sex = els.sex.value;
    draft.alive = els.alive.value === "1";
    draft.fatherId = els.father.value || null;
    draft.motherId = els.mother.value || null;
  }

  // Events
  els.search?.addEventListener("input", () => {
    renderList();
  });

  els.newPerson?.addEventListener("click", () => {
    const id = nextPersonId(state);
    const person = { id, name: "", sex: "unknown", alive: true, fatherId: null, motherId: null, spouseIds: [] };
    const next = clone(state);
    next.people.push(person);
    if (applyState(next)) {
      selectedId = id;
      draft = clone(person);
      renderAll();
    }
  });

  els.addSpouse?.addEventListener("click", () => {
    if (!draft) return;
    const pick = els.spousePick.value;
    if (!pick) return;
    if (!draft.spouseIds.includes(pick)) {
      draft.spouseIds.push(pick);
      renderSpouseList(draft);
      populateSpouseSelect(draft);
    }
  });

  els.save?.addEventListener("click", () => {
    if (!draft) return;
    updateDraftFromInputs();
    const next = clone(state);
    const idx = next.people.findIndex(p => p.id === draft.id);
    if (idx >= 0) next.people[idx] = clone(draft);
    if (!applyState(next)) {
      return;
    }
    selectedId = draft.id;
  });

  els.deleteBtn?.addEventListener("click", () => {
    if (!draft) return;
    const targetId = draft.id;
    const referenced = state.people.some(p => p.id !== targetId && (p.fatherId === targetId || p.motherId === targetId || p.spouseIds.includes(targetId)));
    if (referenced) {
      setValidation({ errors: ["No se puede eliminar: la persona está referenciada"], warnings: validation.warnings });
      return;
    }
    const next = removePerson(state, targetId);
    selectedId = null;
    draft = null;
    setValidation(validateGraph(next));
    state = normalizeState(next);
    renderAll();
  });

  els.setDecedent?.addEventListener("click", () => {
    if (!draft) return;
    const next = clone(state);
    next.decedentId = draft.id;
    applyState(next);
  });

  els.reset?.addEventListener("click", () => {
    clearState();
    window.location.reload();
  });

  for (const field of [els.name, els.sex, els.alive, els.father, els.mother]) {
    field?.addEventListener("change", () => {
      updateDraftFromInputs();
    });
  }

  renderAll();
}
