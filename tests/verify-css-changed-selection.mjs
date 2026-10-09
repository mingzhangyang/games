#!/usr/bin/env node
import assert from 'node:assert/strict';
import { discover, selectChangedSuite } from './verify-all.mjs';

const hidden = discover().find(step => step.name === 'verify-css-hidden-contract');
assert.ok(hidden, 'the hidden-contract browser test must be discovered');
assert.equal(hidden.needsServer, true, 'the regression needs a real browser/server');
assert.equal(hidden.pages, true, 'the regression must opt into VERIFY_PAGES filtering');

for (const id of ['bond-forge', 'math-rain']) {
    const suite = selectChangedSuite([id + '.html']);
    const selected = suite.find(step => step.name === 'verify-css-hidden-contract');
    assert.ok(selected, id + ' changes must select the hidden-contract browser test');
    assert.equal(selected.env?.VERIFY_PAGES, id,
        id + ' changes must run only that page in the shared regression');
}
assert.equal(
    selectChangedSuite(['tetris.html']).some(step => step.name === 'verify-css-hidden-contract'),
    true,
    'cross-page regressions should still be selected for changes to other games (and skip themselves)',
);
assert.equal(
    selectChangedSuite(['tests/verify-css-hidden-contract.mjs'])
        .some(step => step.name === 'verify-css-hidden-contract'),
    true,
    'changes to the regression script itself must always select the test',
);
const skipOnlyMath = selectChangedSuite(['math-rain.html'])
    .find(step => step.name === 'verify-css-hidden-contract');
assert.equal(skipOnlyMath.env.VERIFY_PAGES, 'math-rain');

console.log('PASS hidden-contract browser registration and page-filtered changed verification');
