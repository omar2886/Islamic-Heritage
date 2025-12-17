// public/js/derive_heirs_from_graph.js
// Wrapper liviano para derivar herederos desde el grafo de Genealogía v2.
import { deriveCountsGraph } from './derive.js';

export function deriveHeirsFromGraph(decedentId){
  const counts = deriveCountsGraph(decedentId);
  const heirs = [];
  for (const [role, count] of counts.entries()) {
    const n = Number(count) || 0;
    if (n > 0) heirs.push({ role, count: n });
  }
  heirs.sort((a, b) => a.role.localeCompare(b.role));
  return heirs;
}
