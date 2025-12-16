// Utilidades de detección automática de roles a partir de la estructura familiar.
export class RoleDetector {
  /**
   * Normaliza los roles de hermanos/hermanas en función de los progenitores
   * registrados. Agrupa por (padre,madre) y deduce el tipo (pleno, consanguíneo,
   * uterino) para aplicar el rol canónico según el género.
   *
   * @param {import('../core/family-tree.js').FamilyTree} tree
   */
  static applySiblingRoles(tree) {
    if (!tree || typeof tree.listPersons !== 'function') { return; }

    const persons = tree.listPersons();
    if (!Array.isArray(persons) || persons.length === 0) { return; }

    const isSiblingCandidate = (person) => {
      if (!person || person.id === 'deceased') { return false; }
      const role = person.role || '';
      if (typeof role === 'string' && /_(brother|sister)$/.test(role)) { return true; }
      const id = person.id || '';
      return typeof id === 'string' && (/^bro_/i.test(id) || /^sis_/i.test(id));
    };

    const groups = new Map();

    for (const person of persons) {
      if (!isSiblingCandidate(person)) { continue; }
      const parents = person.parents || {};
      const rawFather = parents.father ?? null;
      const rawMother = parents.mother ?? null;
      const father = rawFather || null;
      const mother = rawMother || null;
      if (!father && !mother) { continue; }
      const key = `${father || ''}::${mother || ''}`;
      if (!groups.has(key)) {
        groups.set(key, { father, mother, members: [] });
      }
      groups.get(key).members.push(person);
    }

    const canonicalRole = (type, gender) => {
      const table = {
        full: { male: 'full_brother', female: 'full_sister' },
        consanguine: { male: 'consanguine_brother', female: 'consanguine_sister' },
        uterine: { male: 'uterine_brother', female: 'uterine_sister' }
      };
      return table[type]?.[gender] || null;
    };

    for (const { father, mother, members } of groups.values()) {
      if (!Array.isArray(members) || members.length === 0) { continue; }
      const hasFather = Boolean(father);
      const hasMother = Boolean(mother);
      let type = null;
      if (hasFather && hasMother) {
        type = 'full';
      } else if (hasFather) {
        type = 'consanguine';
      } else if (hasMother) {
        type = 'uterine';
      }
      if (!type) { continue; }

      for (const member of members) {
        const role = canonicalRole(type, member.gender);
        if (role) {
          member.role = role;
        }
      }
    }
  }
}
