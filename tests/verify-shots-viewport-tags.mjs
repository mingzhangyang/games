// Regression: screenshot capture must never overwrite different heights of
// the same-width viewport or a different language.
import assert from 'node:assert/strict';
import { parseShotViewports, shotFilename } from '../tools/dev/shots-config.mjs';

const viewports = parseShotViewports('390x664,390x844,1280x900');
assert.deepEqual(viewports.map(v => v.tag), ['m390x664', 'm390x844', 'd1280x900']);
assert.deepEqual(viewports.map(v => [v.width, v.height]), [[390, 664], [390, 844], [1280, 900]]);

const names = viewports.flatMap(v => ['zh', 'en'].map(lang => shotFilename('magnetic-garden', v, lang)));
assert.equal(new Set(names).size, names.length);
assert.ok(names.includes('magnetic-garden-m390x664-zh.png'));
assert.ok(names.includes('magnetic-garden-m390x844-en.png'));
assert.equal(shotFilename('magnetic-garden', { tag: 'm' }), 'magnetic-garden-m.png');

assert.throws(() => parseShotViewports('390x664,390x664'), /Duplicate SHOTS_VIEWPORTS/);
for (const spec of ['', '390', '390x', 'x664', '390x0', '-390x664', '390xNaN', '390x664x2']) {
    assert.throws(() => parseShotViewports(spec), /Invalid SHOTS_VIEWPORTS/, spec);
}
console.log('✓ verify-shots-viewport-tags: distinct width × height × language screenshot names');
