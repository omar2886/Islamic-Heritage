import assert from 'node:assert/strict';
import { deriveHeirs } from '../../public/app/classic/model/derive_heirs.js';

const tree = {
  decedentId: 'deceased',
  nodes: [
    { id: 'deceased', sex: 'male', alive: false, labels: ['decedent'], meta: { name: 'Muhammad' } },
    { id: 'sp1', sex: 'female', alive: true, labels: ['spouse'], meta: { name: 'Aisha' } },
    { id: 'child1', sex: 'female', alive: true, labels: ['child', 'daughter'], meta: { name: 'Fatima' } }
  ],
  edges: [
    { type: 'spouse', from: 'deceased', to: 'sp1' },
    { type: 'parent', from: 'deceased', to: 'child1' },
    { type: 'parent', from: 'sp1', to: 'child1' }
  ]
};

const result = deriveHeirs(tree);
assert.ok(Array.isArray(result), 'Expected heirs array');

const wifeEntry = result.find((entry) => entry.role === 'wife');
assert.ok(wifeEntry, 'Expected wife entry');
assert.deepStrictEqual(wifeEntry.person_ids, ['sp1']);
assert.deepStrictEqual(wifeEntry.personIds, ['sp1']);
assert.deepStrictEqual(wifeEntry.persons, [{ id: 'sp1', name: 'Aisha' }]);
assert.deepStrictEqual(wifeEntry.people, [{ id: 'sp1', name: 'Aisha' }]);

const daughterEntry = result.find((entry) => entry.role === 'daughter');
assert.ok(daughterEntry, 'Expected daughter entry');
assert.deepStrictEqual(daughterEntry.person_ids, ['child1']);
assert.deepStrictEqual(daughterEntry.persons, [{ id: 'child1', name: 'Fatima' }]);
