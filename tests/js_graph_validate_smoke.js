#!/usr/bin/env node
const assert = (cond, msg) => {
  if (!cond) {
    throw new Error(msg);
  }
};

(async () => {
  const { validateGraph } = await import("../public/js/ui/graph_validate.js");

  // Cycle detection
  const cycleState = {
    people: [
      { id: "P1", name: "A", sex: "male", alive: true, fatherId: "P2", motherId: null, spouseIds: [] },
      { id: "P2", name: "B", sex: "female", alive: true, fatherId: "P1", motherId: null, spouseIds: [] },
    ],
    decedentId: null,
    version: 1,
  };
  const cycleResult = validateGraph(cycleState);
  assert(cycleResult.errors.some(e => e.toLowerCase().includes("ciclo")), "Cycle should be detected");

  // Parent sex validation
  const wrongParent = {
    people: [
      { id: "P1", name: "Hija", sex: "female", alive: true, fatherId: "P2", motherId: null, spouseIds: [] },
      { id: "P2", name: "Madre", sex: "female", alive: true, fatherId: null, motherId: null, spouseIds: [] },
    ],
    decedentId: null,
    version: 1,
  };
  const wrongParentResult = validateGraph(wrongParent);
  assert(wrongParentResult.errors.some(e => e.includes("padre debe ser varón")), "Should reject female father");

  // Female with multiple spouses
  const multiSpouse = {
    people: [
      { id: "P1", name: "Ella", sex: "female", alive: true, fatherId: null, motherId: null, spouseIds: ["P2", "P3"] },
      { id: "P2", name: "El", sex: "male", alive: true, fatherId: null, motherId: null, spouseIds: [] },
      { id: "P3", name: "El2", sex: "male", alive: true, fatherId: null, motherId: null, spouseIds: [] },
    ],
    decedentId: null,
    version: 1,
  };
  const multiResult = validateGraph(multiSpouse);
  assert(multiResult.errors.some(e => e.includes("más de un cónyuge")), "Should block multiple spouses for female");

  // Symmetry autocorrect
  const asym = {
    people: [
      { id: "P1", name: "Uno", sex: "male", alive: true, fatherId: null, motherId: null, spouseIds: ["P2"] },
      { id: "P2", name: "Dos", sex: "female", alive: true, fatherId: null, motherId: null, spouseIds: [] },
    ],
    decedentId: null,
    version: 1,
  };
  const asymResult = validateGraph(asym);
  assert(asymResult.warnings.length > 0, "Symmetry should trigger warning");
  const fixed = asymResult.fixedState.people.find(p => p.id === "P2");
  assert(fixed && fixed.spouseIds.includes("P1"), "Spouse symmetry should be enforced in fixed state");

  console.log("js_graph_validate_smoke: ok");
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
