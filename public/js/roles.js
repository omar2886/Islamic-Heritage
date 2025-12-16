// Catálogo de roles y secciones. Carga remota desde /api/roles.php con fallback local.
import { getRoles } from './api.js';

const FALLBACK = [
  'husband','wife','son','daughter','father','mother',
  'paternal_grandfather','paternal_grandmother','maternal_grandmother',
  'full_brother','full_sister','consanguine_brother','consanguine_sister','uterine_brother','uterine_sister'
];
// Nota: en el backend no existe 'maternal_grandfather' (lo omitimos).

export const Roles = {
  list: new Set(FALLBACK),
  sections: {
    spouses:    ['husband','wife'],
    children:   ['son','daughter'],
    parents:    ['father','mother'],
    grandparents:['paternal_grandfather','paternal_grandmother','maternal_grandmother'],
    siblings:   ['full_brother','full_sister','consanguine_brother','consanguine_sister','uterine_brother','uterine_sister'],
  },
  ready: false,
};

export async function loadRoles(){
  try {
    const remote = await getRoles();              // si Sprint 1 aún no está, devolverá []
    if (Array.isArray(remote) && remote.length){
      Roles.list = new Set(remote);
      // Filtra secciones por lo que exista realmente en backend
      Object.keys(Roles.sections).forEach(k=>{
        Roles.sections[k] = Roles.sections[k].filter(r => Roles.list.has(r));
      });
    }
  } catch {/* fallback ya cargado */}
  Roles.ready = true;
}
