#!/usr/bin/env node
import assert from 'node:assert/strict';

import { verifyStaticRulePopulation } from './lib/css/rule-population.mjs';

const errorsFor = (baseCount, currentCount, familyRuleDelta, migrationRuleDelta) => {
    const errors = [];
    verifyStaticRulePopulation({
        baseCount, currentCount, familyRuleDelta, migrationRuleDelta, errors,
    });
    return errors;
};

// A valid mixed PR removes two rules via family extraction and one via dedupe.
// The old family-only whole-tree comparison incorrectly rejected this change.
assert.deepEqual(errorsFor(100, 97, -2, -1), []);
assert.deepEqual(errorsFor(100, 98, -2, 0), []);
assert.deepEqual(errorsFor(100, 99, 0, -1), []);
assert.deepEqual(errorsFor(100, 100, 0, 0), []);

// The orchestration check must still reject unregistered rule additions and
// removals, including when both migration types are present.
assert.deepEqual(errorsFor(100, 98, -2, -1), [
    'Static ordinary rule population differs from the comparison base plus current family and rule migrations: 98 !== 97.',
]);
assert.deepEqual(errorsFor(100, 96, -2, -1), [
    'Static ordinary rule population differs from the comparison base plus current family and rule migrations: 96 !== 97.',
]);
// Old transactions already merged into the base must not be applied twice.
assert.deepEqual(errorsFor(97, 97, 0, 0), []);

console.log('PASS combined CSS static rule population delta for mixed family/dedupe migrations');
