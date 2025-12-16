import assert from 'node:assert/strict';
import { TreeState } from '../../public/app/v2/core/state.js';
import { deriveHeirs } from '../../public/app/v2/core/derive.js';

const state = new TreeState();
const decedentId = state.ensureDecedent();

const spouseId = state.addSpouse(decedentId);

const fatherId = state.addFather(decedentId);
const motherId = state.addMother(decedentId);

const paternalGrandfatherId = state.addFather(fatherId);
const paternalGrandmotherId = state.addMother(fatherId);

const maternalGrandmotherId = state.addMother(motherId);

const paternalGreatGrandmotherId = state.addMother(paternalGrandfatherId);
const maternalGreatGrandmotherId = state.addMother(maternalGrandmotherId);

const sonId = state.addChildOfCouple(decedentId, spouseId, 'male');
const daughterId = state.addChildOfCouple(decedentId, spouseId, 'female');

const sonsSpouseId = state.addSpouse(sonId);
const paternalGrandsonId = state.addChildOfCouple(sonId, sonsSpouseId, 'male');
const paternalGranddaughterId = state.addChildOfCouple(sonId, sonsSpouseId, 'female');

const fullBrotherId = state.addChildOfCouple(fatherId, motherId, 'male');
const fullSisterId = state.addChildOfCouple(fatherId, motherId, 'female');
const consanguineBrotherId = state.addChild(fatherId, 'male');
const uterineSisterId = state.addChild(motherId, 'female');

const fullPaternalUncleId = state.addChildOfCouple(paternalGrandfatherId, paternalGrandmotherId, 'male');
const consanguinePaternalUncleId = state.addChild(paternalGrandfatherId, 'male');

const fullPaternalUncleSpouseId = state.addSpouse(fullPaternalUncleId);
const consanguinePaternalUncleSpouseId = state.addSpouse(consanguinePaternalUncleId);

const paternalUncleSonId = state.addChildOfCouple(fullPaternalUncleId, fullPaternalUncleSpouseId, 'male');
const paternalUncleDaughterId = state.addChildOfCouple(fullPaternalUncleId, fullPaternalUncleSpouseId, 'female');
const paternalUncleSonSpouseId = state.addSpouse(paternalUncleSonId);
const paternalUncleSonsDaughterId = state.addChildOfCouple(
  paternalUncleSonId,
  paternalUncleSonSpouseId,
  'female',
);

const consanguinePaternalUncleSonId = state.addChildOfCouple(
  consanguinePaternalUncleId,
  consanguinePaternalUncleSpouseId,
  'male',
);
const consanguinePaternalUncleDaughterId = state.addChildOfCouple(
  consanguinePaternalUncleId,
  consanguinePaternalUncleSpouseId,
  'female',
);
const consanguinePaternalUncleSonSpouseId = state.addSpouse(consanguinePaternalUncleSonId);
const consanguinePaternalUncleSonsDaughterId = state.addChildOfCouple(
  consanguinePaternalUncleSonId,
  consanguinePaternalUncleSonSpouseId,
  'female',
);

const result = deriveHeirs(state);
const { individuals, heirs } = result;

const findByCanonicalRole = (role) => individuals.find((entry) => entry.canonicalRole === role);

const assertRole = (role, id, message) => {
  assert.equal(findByCanonicalRole(role)?.id, id, message);
};

assertRole('wife', spouseId, 'Spouse should be classified as wife for a male decedent');
assertRole('father', fatherId, 'Father should be detected using child parentId');
assertRole('mother', motherId, 'Mother should be detected using child jointParent');
assertRole('son', sonId, 'Male child should be detected as son');
assertRole('daughter', daughterId, 'Female child should be detected as daughter');
assertRole('sons_son', paternalGrandsonId, 'Grandson through a son should map to sons_son');
assertRole('sons_daughter', paternalGranddaughterId, 'Granddaughter through a son should map to sons_daughter');
assertRole('paternal_grandfather', paternalGrandfatherId, 'Paternal grandfather should be detected');
assertRole('paternal_grandmother', paternalGrandmotherId, 'Paternal grandmother should be detected');
assertRole('maternal_grandmother', maternalGrandmotherId, 'Maternal grandmother should be detected');
assertRole('paternal_great_grandmother', paternalGreatGrandmotherId, 'Paternal great grandmother should be detected');
assertRole(
  'maternal_great_grandmother',
  maternalGreatGrandmotherId,
  'Maternal great grandmother should be detected',
);
assertRole('full_brother', fullBrotherId, 'Full brother should share both parents with decedent');
assertRole('full_sister', fullSisterId, 'Full sister should share both parents with decedent');
assertRole('consanguine_brother', consanguineBrotherId, 'Brother sharing only the father should be consanguine');
assertRole('uterine_sister', uterineSisterId, 'Sister sharing only the mother should be uterine');
assertRole('paternal_uncle', fullPaternalUncleId, 'Full paternal uncle should be detected via father siblings');
assertRole(
  'consanguine_paternal_uncle',
  consanguinePaternalUncleId,
  'Consanguine paternal uncle should share only the grandfather',
);
assertRole('paternal_uncle_son', paternalUncleSonId, 'Son of a paternal uncle should be detected');
assertRole(
  'consanguine_paternal_uncle_son',
  consanguinePaternalUncleSonId,
  'Son of a consanguine paternal uncle should be detected',
);
assertRole(
  'paternal_uncles_daughter',
  paternalUncleDaughterId,
  'Daughter of a paternal uncle should be detected',
);
assertRole(
  'consanguine_paternal_uncles_daughter',
  consanguinePaternalUncleDaughterId,
  'Daughter of a consanguine paternal uncle should be detected',
);
assertRole(
  'paternal_uncle_sons_daughter',
  paternalUncleSonsDaughterId,
  'Daughter of a paternal uncle son should be detected',
);
assertRole(
  'consanguine_paternal_uncle_sons_daughter',
  consanguinePaternalUncleSonsDaughterId,
  'Daughter of a consanguine paternal uncle son should be detected',
);

const groupFullSister = heirs.find((entry) => entry.role === 'full_sister');
assert.equal(groupFullSister?.count, 1, 'Aggregated heirs should include full sister group');
assert.deepEqual(groupFullSister?.personIds, [fullSisterId], 'Group should track unique person ids');

console.log('deriveHeirs v2 relationships test passed');
