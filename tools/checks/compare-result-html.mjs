// One-time 6c-3 baseline guard: migrated HTML must differ *only* by ownership markers.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registry } from '../lib/registry.mjs';
import { resultRoles } from '../../src/platform/shell/render-result-overlays.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const baseline = process.argv[2];
if (!/^[0-9a-f]{40}$/i.test(baseline || '')) {
    console.error('usage: node tools/checks/compare-result-html.mjs <baseline-sha>');
    process.exit(2);
}
let total = 0;
for (const game of registry.all().filter(g => resultRoles(g).length)) {
    const before = execFileSync('git', ['show', baseline + ':' + game.href], { cwd: ROOT, encoding: 'utf8' });
    const after = readFileSync(join(ROOT, game.href), 'utf8');
    const stripped = after.replace(/^[ \t]*<!-- registry:(?:begin|end) result-(?:over|clear) -->\r?\n/gm, '');
    assert.equal(stripped, before, game.id + ': all original markup and non-target bytes must be unchanged');
    const n = (after.match(/registry:begin result-(?:over|clear)/g) || []).length;
    assert.equal(n, resultRoles(game).length, game.id + ': exact result overlay ownership');
    total += n;
    console.log('DOM-identical:', game.id, n + ' overlays');
}
assert.equal(total, 18, 'expected ten daily and eight generated clear overlays');
console.log('Step 6c-3 baseline byte/DOM parity: ' + total + '/18');
