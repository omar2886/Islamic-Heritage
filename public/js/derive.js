// derive.js — Deriva counts agrupados (solo vivos) desde Persons[].
// Aplica validaciones topológicas sobre counts (padre/madre vivos => bloqueos).
import { Persons } from './persons.js';

function byId(id){
  return id ? Persons.byId.get(id) : null;
}

export function deriveCountsFromPersons(){
  const counts = new Map();
  for (const p of Persons.list){
    if (!p.alive) continue;                    // solo vivos
    const role = String(p.role || '').trim();
    if (!role) continue;
    counts.set(role, (counts.get(role) || 0) + 1);
  }
  return counts;
}

export function deriveCountsGraph(decedentId){
  const D = byId(decedentId);
  const counts = new Map();
  if (!D) return counts;

  const f = byId(D.fatherId);
  const m = byId(D.motherId);

  const inc = (role)=> counts.set(role, (counts.get(role)||0)+1);

  for (const p of Persons.list){
    if (!p.alive) continue;
    if (p.id === D.id) continue;

    if (f && p.id === f.id) { inc('father'); continue; }
    if (m && p.id === m.id) { inc('mother'); continue; }

    if ((p.spouseIds||[]).includes(D.id)){
      if (p.sex === 'female') inc('wife');
      else if (p.sex === 'male') inc('husband');
      continue;
    }

    const isChildOfD =
      (D.sex === 'male'   && p.fatherId === D.id) ||
      (D.sex === 'female' && p.motherId === D.id) ||
      (D.sex === 'unknown' && (p.fatherId === D.id || p.motherId === D.id));
    if (isChildOfD){
      if (p.sex === 'male') inc('son'); else inc('daughter');
      continue;
    }

    const sameFather = !!(f && p.fatherId && p.fatherId === f.id);
    const sameMother = !!(m && p.motherId && p.motherId === m.id);
    if (sameFather || sameMother){
      if (sameFather && sameMother){
        inc(p.sex==='male' ? 'full_brother' : 'full_sister');
      } else if (sameFather){
        inc(p.sex==='male' ? 'consanguine_brother' : 'consanguine_sister');
      } else if (sameMother){
        inc(p.sex==='male' ? 'uterine_brother' : 'uterine_sister');
      }
      continue;
    }

    if (f){
      const ff = byId(f.fatherId), fm = byId(f.motherId);
      if (ff && p.id === ff.id){ inc('paternal_grandfather'); continue; }
      if (fm && p.id === fm.id){ inc('paternal_grandmother'); continue; }
    }
    if (m){
      const mm = byId(m.motherId);
      if (mm && p.id === mm.id){ inc('maternal_grandmother'); continue; }
    }
  }

  return counts;
}

// Aplica reglas de bloqueo previas al envío (matching UI validation)
export function applyHierarchyScreening(countsIn){
  const c = new Map(countsIn);
  const v = (r)=> c.get(r) || 0;
  const set = (r,n)=> c.set(r, Math.max(0, n|0));
  const warnings = [];

  if (v('father') > 0) {
    ['paternal_grandfather','paternal_grandmother'].forEach(r=>{
      if (v(r)>0) warnings.push(`Padre vivo ⇒ excluye ${r}.`); set(r,0);
    });
    ['full_brother','full_sister','consanguine_brother','consanguine_sister','uterine_brother','uterine_sister'].forEach(r=>{
      if (v(r)>0) warnings.push(`Padre vivo ⇒ excluye ${r}.`); set(r,0);
    });
  }
  if (v('mother') > 0) {
    if (v('maternal_grandmother')>0) warnings.push('Madre viva ⇒ excluye maternal_grandmother.');
    set('maternal_grandmother', 0);
  }
  return { counts: c, warnings };
}
