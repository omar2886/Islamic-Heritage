export class StateManager {
  static updatePersonState(personId, alive, familyTree) {
    const p = familyTree.persons.get(personId);
    if (!p) return false;
    p.alive = alive;
    return true;
  }

  static renderPersonState(person, rowEl) {
    rowEl.className = person.alive ? 'person-alive' : 'person-deceased';
    const cell = rowEl.querySelector('.person-status');
    if (cell) {
      cell.innerHTML = person.alive ? '<span class="status-alive">✅ VIVO</span>' :
                                     '<span class="status-deceased">💀 FALLECIDO</span>';
    }
  }
}
