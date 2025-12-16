import assert from 'node:assert/strict';
import { TreeState } from '../../public/app/v2/core/state.js';
import { mockDerive } from '../../public/app/v2/api/compute.js';

const state = new TreeState();
const decedentId = state.ensureDecedent();
const fatherId = state.addFather(decedentId);
const motherId = state.addMother(decedentId);
const childId = state.addChild(decedentId, 'female');
state.updateNode(childId, { name: 'Hija heredera' });
state.updateNode(fatherId, { name: 'Padre Ejemplo' });
const spouseId = state.addSpouse(decedentId);

const snapshot = state.snapshot();

assert.ok(snapshot && Array.isArray(snapshot.nodes), 'Snapshot nodes array expected');
assert.ok(Array.isArray(snapshot.edges), 'Snapshot edges array expected');

const nodeIds = new Set(snapshot.nodes.map((node) => node.id));
assert.ok(nodeIds.size >= 4, 'Expected at least decedent and three relatives');
assert.ok(nodeIds.has(decedentId), 'Snapshot should include decedent');
assert.ok(nodeIds.has(fatherId), 'Snapshot should include father');
assert.ok(nodeIds.has(motherId), 'Snapshot should include mother');
assert.ok(nodeIds.has(spouseId), 'Snapshot should include spouse');

for (const edge of snapshot.edges) {
  assert.ok(edge && typeof edge === 'object', 'Edge should be an object');
  assert.ok(edge.from && nodeIds.has(edge.from), `Edge.from should reference existing node (${edge?.from})`);
  assert.ok(edge.to && nodeIds.has(edge.to), `Edge.to should reference existing node (${edge?.to})`);
}

const result = await mockDerive(snapshot);

assert.equal(result.totals.nodes, snapshot.nodes.length, 'mockDerive nodes count should match snapshot');
assert.equal(result.totals.edges, snapshot.edges.length, 'mockDerive edges count should match snapshot');
assert.deepStrictEqual(result.samplePath, snapshot.edges.map((edge) => edge.to));

console.log('mockDerive snapshot smoke passed');
