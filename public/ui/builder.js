let currentTree = null;
let nextId = 1;

function createPerson(gender, label) {
  const id = 'p' + (nextId++);
  currentTree.persons[id] = {
    id,
    gender,
    label,
    parents: [],
    spouses: [],
    children: []
  };
  return currentTree.persons[id];
}
function linkParentChild(parent, child) {
  parent.children.push(child.id);
  child.parents.push(parent.id);
}
function linkSpouses(a, b) {
  a.spouses.push(b.id);
  b.spouses.push(a.id);
}

export function generateTreeFromWizard(data) {
  currentTree = { rootId: null, persons: {} };
  // Crear causante (persona fallecida)
  const decedent = createPerson(data.gender, 'Causante');
  currentTree.rootId = decedent.id;
  // Padres
  if (data.fatherAlive) {
    const father = createPerson('M', 'Padre');
    linkParentChild(father, decedent);
  }
  if (data.motherAlive) {
    const mother = createPerson('F', 'Madre');
    linkParentChild(mother, decedent);
  }
  // Cónyuges
  if (data.gender === 'M') {
    // Causante hombre: agregar esposas
    for (let i = 1; i <= data.wivesCount; i++) {
      const label = (data.wivesCount > 1) ? 'Esposa ' + i : 'Esposa';
      const wife = createPerson('F', label);
      linkSpouses(decedent, wife);
    }
  } else {
    // Causante mujer: agregar esposo (solo 1 posible)
    if (data.husbandsCount > 0) {
      const husband = createPerson('M', 'Esposo');
      linkSpouses(decedent, husband);
    }
  }
  // Hijos
  let sonIndex = 0, daughterIndex = 0;
  for (let i = 1; i <= data.sonsCount; i++) {
    sonIndex++;
    const label = (data.sonsCount > 1) ? 'Hijo ' + sonIndex : 'Hijo';
    const son = createPerson('M', label);
    linkParentChild(decedent, son);
  }
  for (let j = 1; j <= data.daughtersCount; j++) {
    daughterIndex++;
    const label = (data.daughtersCount > 1) ? 'Hija ' + daughterIndex : 'Hija';
    const daughter = createPerson('F', label);
    linkParentChild(decedent, daughter);
  }
  // Nietos: si existen, agregarlos bajo un hijo fantasma si no hay padre/madre directo
  const totalGrand = data.grandsonsCount + data.granddaughtersCount;
  if (totalGrand > 0) {
    const ghost = createPerson('M', 'Hijo (fallecido)');
    linkParentChild(decedent, ghost);
    let gsIndex = 0, gdIndex = 0;
    for (let k = 1; k <= data.grandsonsCount; k++) {
      gsIndex++;
      const label = (data.grandsonsCount > 1) ? 'Nieto ' + gsIndex : 'Nieto';
      const grandson = createPerson('M', label);
      linkParentChild(ghost, grandson);
    }
    for (let l = 1; l <= data.granddaughtersCount; l++) {
      gdIndex++;
      const label = (data.granddaughtersCount > 1) ? 'Nieta ' + gdIndex : 'Nieta';
      const granddaughter = createPerson('F', label);
      linkParentChild(ghost, granddaughter);
    }
  }
  console.log("[Wizard] Árbol base generado:", currentTree);
  return currentTree;
}

export function createEmptyTree() {
  currentTree = { rootId: null, persons: {} };
  const decedent = createPerson('M', 'Causante');
  currentTree.rootId = decedent.id;
  console.log("[Wizard] Árbol base generado (vacío):", currentTree);
  return currentTree;
}

export function addParent(personId) {
  const person = currentTree.persons[personId];
  if (!person) return;
  let hasFather = false, hasMother = false;
  person.parents.forEach(pid => {
    const p = currentTree.persons[pid];
    if (p.gender === 'M') hasFather = true;
    if (p.gender === 'F') hasMother = true;
  });
  if (hasFather && hasMother) {
    console.warn("No se puede añadir más padres a", person.label);
    return;
  }
  let newParent = null;
  if (!hasFather) {
    newParent = createPerson('M', 'Padre');
  } else if (!hasMother) {
    newParent = createPerson('F', 'Madre');
  }
  if (newParent) {
    linkParentChild(newParent, person);
    // No vincular automáticamente este padre como cónyuge del otro progenitor en esta versión básica
    renderTree();
  }
}

export function addSpouse(personId) {
  const person = currentTree.persons[personId];
  if (!person) return;
  if (person.gender === 'M') {
    const currentWives = person.spouses.filter(sid => currentTree.persons[sid].gender === 'F');
    if (currentWives.length >= 4) {
      console.warn("No se pueden añadir más esposas (límite 4)");
      return;
    }
    const newCount = currentWives.length + 1;
    const label = (newCount > 1) ? 'Esposa ' + newCount : 'Esposa';
    const newSpouse = createPerson('F', label);
    linkSpouses(person, newSpouse);
  } else {
    const hasHusband = person.spouses.some(sid => currentTree.persons[sid].gender === 'M');
    if (hasHusband) {
      console.warn("No se puede añadir más de un esposo a", person.label);
      return;
    }
    const newSpouse = createPerson('M', 'Esposo');
    linkSpouses(person, newSpouse);
  }
  renderTree();
}

export function addChild(personId) {
  const person = currentTree.persons[personId];
  if (!person) return;
  let gender = prompt("Género del nuevo hijo/a? (M/F)", "M");
  if (!gender) return;
  gender = gender.toUpperCase();
  if (gender !== 'M' && gender !== 'F') {
    alert("Género inválido");
    return;
  }
  const baseLabel = (gender === 'M') ? 'Hijo' : 'Hija';
  let sameGenderCount = 0;
  person.children.forEach(cid => {
    const child = currentTree.persons[cid];
    if (child.gender === gender && !child.label.toLowerCase().includes('fallecid')) {
      sameGenderCount++;
    }
  });
  const label = (sameGenderCount >= 1) ? baseLabel + ' ' + (sameGenderCount + 1) : baseLabel;
  const newChild = createPerson(gender, label);
  linkParentChild(person, newChild);
  renderTree();
}

export function renderTree() {
  const root = currentTree ? currentTree.persons[currentTree.rootId] : null;
  if (!root) return;
  const container = document.getElementById('builder-content');
  container.innerHTML = '';
  // Tarjeta del causante
  container.appendChild(createPersonCard(root));
  // Sección de padres
  if (root.parents.length > 0) {
    const parentSec = document.createElement('div');
    parentSec.innerHTML = '<strong>Padres:</strong><br>';
    root.parents.forEach(pid => {
      parentSec.appendChild(createPersonCard(currentTree.persons[pid]));
    });
    container.appendChild(parentSec);
  }
  // Sección de cónyuges
  if (root.spouses.length > 0) {
    const spouseSec = document.createElement('div');
    spouseSec.innerHTML = '<strong>Cónyuge(s):</strong><br>';
    root.spouses.forEach(sid => {
      spouseSec.appendChild(createPersonCard(currentTree.persons[sid]));
    });
    container.appendChild(spouseSec);
  }
  // Sección de hijos
  if (root.children.length > 0) {
    const childSec = document.createElement('div');
    childSec.innerHTML = '<strong>Hijos:</strong>';
    const ul = document.createElement('ul');
    ul.className = 'children-list';
    root.children.forEach(cid => {
      const li = document.createElement('li');
      li.appendChild(createSubtree(cid));
      ul.appendChild(li);
    });
    childSec.appendChild(document.createElement('br'));
    childSec.appendChild(ul);
    container.appendChild(childSec);
  }
  updateWarnings();
  console.log("[Builder] Árbol renderizado en UI");
}

function createPersonCard(person) {
  const card = document.createElement('div');
  card.className = 'person-card';
  const nameSpan = document.createElement('span');
  nameSpan.className = 'name';
  nameSpan.textContent = person.label;
  card.appendChild(nameSpan);
  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'actions';
  const btnParent = document.createElement('button');
  btnParent.textContent = '+Padre/Madre';
  btnParent.addEventListener('click', () => addParent(person.id));
  actionsDiv.appendChild(btnParent);
  const btnSpouse = document.createElement('button');
  btnSpouse.textContent = '+Cónyuge';
  btnSpouse.addEventListener('click', () => addSpouse(person.id));
  actionsDiv.appendChild(btnSpouse);
  const btnChild = document.createElement('button');
  btnChild.textContent = '+Hijo';
  btnChild.addEventListener('click', () => addChild(person.id));
  actionsDiv.appendChild(btnChild);
  card.appendChild(actionsDiv);
  return card;
}

function createSubtree(personId) {
  const person = currentTree.persons[personId];
  const container = document.createElement('div');
  container.appendChild(createPersonCard(person));
  if (person.children.length > 0) {
    const title = document.createElement('strong');
    title.textContent = 'Hijos:';
    container.appendChild(title);
    const ul = document.createElement('ul');
    ul.className = 'children-list';
    person.children.forEach(cid => {
      const li = document.createElement('li');
      li.appendChild(createSubtree(cid));
      ul.appendChild(li);
    });
    container.appendChild(ul);
  }
  return container;
}

function updateWarnings() {
  const warnDiv = document.getElementById('builder-warnings');
  const root = currentTree.persons[currentTree.rootId];
  let fatherAlive = 0, motherAlive = 0, husbandsCount = 0, wivesCount = 0;
  root.parents.forEach(pid => {
    const p = currentTree.persons[pid];
    if (p.gender === 'M') fatherAlive = 1;
    if (p.gender === 'F') motherAlive = 1;
  });
  if (root.gender === 'M') {
    wivesCount = root.spouses.filter(sid => currentTree.persons[sid].gender === 'F').length;
    husbandsCount = 0;
  } else {
    husbandsCount = root.spouses.filter(sid => currentTree.persons[sid].gender === 'M').length;
    wivesCount = 0;
  }
  let sonsCount = 0, daughtersCount = 0;
  root.children.forEach(cid => {
    const child = currentTree.persons[cid];
    if (child.gender === 'M') {
      if (!child.label.toLowerCase().includes('fallecid')) sonsCount++;
    } else if (child.gender === 'F') {
      if (!child.label.toLowerCase().includes('fallecid')) daughtersCount++;
    }
  });
  let grandsonsCount = 0, granddaughtersCount = 0;
  root.children.forEach(cid => {
    const child = currentTree.persons[cid];
    child.children.forEach(gcid => {
      const grandchild = currentTree.persons[gcid];
      if (grandchild.gender === 'M') grandsonsCount++;
      if (grandchild.gender === 'F') granddaughtersCount++;
    });
  });
  let summary = `Padre: ${fatherAlive ? 'Sí' : 'No'}, Madre: ${motherAlive ? 'Sí' : 'No'}`;
  if (root.gender === 'M') {
    summary += `, Esposas: ${wivesCount}`;
  } else {
    summary += `, Esposo: ${husbandsCount ? 'Sí' : 'No'}`;
  }
  summary += `, Hijos varones: ${sonsCount}, Hijas: ${daughtersCount}`;
  summary += `, Nietos: ${grandsonsCount}, Nietas: ${granddaughtersCount}.`;
  const recognizedIds = new Set();
  root.parents.forEach(pid => {
    const p = currentTree.persons[pid];
    if ((p.gender === 'M' && fatherAlive) || (p.gender === 'F' && motherAlive)) {
      recognizedIds.add(pid);
    }
  });
  root.spouses.forEach(sid => {
    const s = currentTree.persons[sid];
    if ((s.gender === 'M' && husbandsCount > 0) || (s.gender === 'F' && wivesCount > 0)) {
      recognizedIds.add(sid);
    }
  });
  root.children.forEach(cid => {
    const child = currentTree.persons[cid];
    if (!child.label.toLowerCase().includes('fallecid')) {
      recognizedIds.add(cid);
    }
  });
  root.children.forEach(cid => {
    const child = currentTree.persons[cid];
    child.children.forEach(gcid => {
      recognizedIds.add(gcid);
    });
  });
  const unmappedLabels = [];
  for (const pid in currentTree.persons) {
    if (pid === root.id) continue;
    if (!recognizedIds.has(pid)) {
      unmappedLabels.push(currentTree.persons[pid].label);
    }
  }
  warnDiv.innerHTML = '';
  const rolesDiv = document.createElement('div');
  rolesDiv.textContent = 'Roles derivados del árbol: ' + summary;
  warnDiv.appendChild(rolesDiv);
  if (unmappedLabels.length > 0) {
    const warnP = document.createElement('div');
    warnP.textContent = 'Advertencia: Los siguientes miembros no se consideran en el cálculo: ' + unmappedLabels.join(', ') + '.';
    warnDiv.appendChild(warnP);
  }
  console.log("[Builder] Roles derivados:", {fatherAlive, motherAlive, wivesCount, husbandsCount, sonsCount, daughtersCount, grandsonsCount, granddaughtersCount, unmapped: unmappedLabels});
}

export function getRolesPayload() {
  const root = currentTree.persons[currentTree.rootId];
  let fatherAlive = 0, motherAlive = 0, husbandsCount = 0, wivesCount = 0;
  root.parents.forEach(pid => {
    const p = currentTree.persons[pid];
    if (p.gender === 'M') fatherAlive = 1;
    if (p.gender === 'F') motherAlive = 1;
  });
  if (root.gender === 'M') {
    wivesCount = root.spouses.filter(sid => currentTree.persons[sid].gender === 'F').length;
    husbandsCount = 0;
  } else {
    husbandsCount = root.spouses.filter(sid => currentTree.persons[sid].gender === 'M').length;
    wivesCount = 0;
  }
  let sonsCount = 0, daughtersCount = 0;
  root.children.forEach(cid => {
    const child = currentTree.persons[cid];
    if (child.gender === 'M' && !child.label.toLowerCase().includes('fallecid')) sonsCount++;
    if (child.gender === 'F' && !child.label.toLowerCase().includes('fallecid')) daughtersCount++;
  });
  let grandsonsCount = 0, granddaughtersCount = 0;
  root.children.forEach(cid => {
    const child = currentTree.persons[cid];
    child.children.forEach(gcid => {
      const grandchild = currentTree.persons[gcid];
      if (grandchild.gender === 'M') grandsonsCount++;
      if (grandchild.gender === 'F') granddaughtersCount++;
    });
  });
  return { fatherAlive, motherAlive, husbandsCount, wivesCount, sonsCount, daughtersCount, grandsonsCount, granddaughtersCount };
}

export function hasTree() {
  return currentTree && currentTree.rootId;
}
