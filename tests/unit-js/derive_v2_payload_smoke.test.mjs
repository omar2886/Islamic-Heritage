import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { TreeState } from '../../public/app/v2/core/state.js';
import { deriveHeirs } from '../../public/app/v2/core/derive.js';

const state = new TreeState();
const decedentId = state.ensureDecedent();
state.addFather(decedentId);
state.addMother(decedentId);
const spouseId = state.addSpouse(decedentId);
state.addChildOfCouple(decedentId, spouseId, 'male');
state.addChildOfCouple(decedentId, spouseId, 'female');

const result = deriveHeirs(state);
const payload = { heirs: result.heirs };

assert.ok(payload.heirs.length > 0, 'Aggregated heirs should not be empty');
const roles = payload.heirs.map((entry) => entry.role);
assert.ok(roles.includes('wife'), 'Payload should include canonical wife role');
assert.ok(roles.includes('son'), 'Payload should include canonical son role');
assert.ok(roles.includes('daughter'), 'Payload should include canonical daughter role');

const phpFile = fileURLToPath(new URL('../../scripts/CalcRunner.php', import.meta.url));
const escapedPhpFile = phpFile.replace(/\\/g, '\\\\').replace(/'/g, "'\\''");
const phpCode = `require '${escapedPhpFile}'; $payload = json_decode(stream_get_contents(STDIN), true); \\App\\Scripts\\validatePayload($payload);`;

const php = spawnSync('php', ['-r', phpCode], {
  input: JSON.stringify(payload),
  encoding: 'utf8',
});

assert.equal(php.status, 0, php.stderr || php.stdout || 'validatePayload did not exit cleanly');
