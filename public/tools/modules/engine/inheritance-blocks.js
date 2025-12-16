export class InheritanceBlocks {
  static calculateBlocks(familyTree) {
    const blocks = new Set();
    const living = familyTree.listPersons().filter(p => p.alive && p.id !== 'deceased');
    const roles = new Set(living.map(p => p.role));

    // 1) Padre vivo bloquea abuelos paternos
    if (roles.has('father')) {
      blocks.add('paternal_grandfather');
      blocks.add('paternal_grandmother');
    }
    // 2) Madre viva bloquea abuela materna
    if (roles.has('mother')) {
      blocks.add('maternal_grandmother');
    }
    // 3) Hijo varón: advertencia dura -> bloquear hermanos y colaterales agnáticos (UI)
    if (roles.has('son')) {
      ['full_brother','full_sister','consanguine_brother','consanguine_sister','uterine_brother','uterine_sister','paternal_uncle','paternal_uncle_son']
        .forEach(r => blocks.add(r));
    }
    // 4) Hijas + nietos por línea de hijo: UI sugiere bloquear nietos si hay hijas
    if (roles.has('daughter') && (roles.has('sons_son') || roles.has('sons_daughter'))) {
      blocks.add('sons_son');
      blocks.add('sons_daughter');
    }

    return blocks;
  }

  static validateBlockingRules(familyTree) {
    const warnings = [];
    const living = familyTree.listPersons().filter(p => p.alive && p.id !== 'deceased');
    const roles = new Set(living.map(p => p.role));

    if (roles.has('father') && (roles.has('paternal_grandfather') || roles.has('paternal_grandmother'))) {
      warnings.push('Padre vivo: abuelos paternos serán excluidos.');
    }
    if (roles.has('mother') && roles.has('maternal_grandmother')) {
      warnings.push('Madre viva: abuela materna será excluida.');
    }
    if (roles.has('son') && (['full_brother','consanguine_brother','uterine_brother','full_sister','consanguine_sister','uterine_sister'].some(r => roles.has(r)))) {
      warnings.push('Hijo varón presente: hermanos pueden quedar excluidos.');
    }
    if (roles.has('daughter') && (roles.has('sons_son') || roles.has('sons_daughter'))) {
      warnings.push('Hijas presentes: nietos (sons_*) pueden quedar excluidos.');
    }
    return warnings;
  }
}
