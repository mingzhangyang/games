import assert from 'node:assert/strict';

import { verifyMonotonicState } from './lib/css/migration-contract.mjs';
import { hydrateMigrationState } from './lib/css/migration-state.mjs';

const RULE_ROOT = 'tests/css-layer-migrations/rules/';
const MODULE_PATH = RULE_ROOT + 'fixture-rule.json';

const mapping = {
    id: 'fixture-rule',
    source: { selector: '.fixture', layer: null },
    destinations: [{ selector: '.fixture', layer: 'layout' }],
    conflicts: { normal: [], important: [] },
};

const metadata = {
    schemaVersion: 2,
    migratedKeyframes: [],
    migratedRuntimeStyleSources: [],
};

const legacyState = {
    ...metadata,
    migratedRules: [mapping],
};

const shardedManifest = {
    ...metadata,
    migratedRuleModules: [MODULE_PATH],
};

const readFixtureModule = path => path === MODULE_PATH ? JSON.stringify(mapping) : null;
const hydratedSharded = hydrateMigrationState(
    shardedManifest,
    readFixtureModule,
    'sharded fixture',
);
const hydratedLegacy = hydrateMigrationState(
    legacyState,
    () => {
        throw new Error('legacy state must not read modules');
    },
    'legacy fixture',
);

assert.deepEqual(hydratedSharded.migratedRules, hydratedLegacy.migratedRules);
const { migratedRuleModules: _modulePaths, ...shardedSemanticState } = hydratedSharded;
assert.deepEqual(shardedSemanticState, hydratedLegacy);

// Missing modules fail closed rather than silently dropping historical entries.
assert.throws(
    () => hydrateMigrationState(shardedManifest, () => null, 'missing-module fixture'),
    /cannot read rule module/,
);

// Duplicate module references are rejected before they can duplicate ledger history.
assert.throws(
    () => hydrateMigrationState(
        { ...shardedManifest, migratedRuleModules: [MODULE_PATH, MODULE_PATH] },
        readFixtureModule,
        'duplicate-module fixture',
    ),
    /duplicate rule module/,
);

// A module filename is part of the stable identity and must match mapping.id.
assert.throws(
    () => hydrateMigrationState(
        shardedManifest,
        () => JSON.stringify({ ...mapping, id: 'different-id' }),
        'id-mismatch fixture',
    ),
    /module path must match mapping id/,
);

// Storage formats may not be mixed; there is exactly one source of mapping truth.
assert.throws(
    () => hydrateMigrationState(
        { ...shardedManifest, migratedRules: [mapping] },
        readFixtureModule,
        'mixed-storage fixture',
    ),
    /inline migratedRules cannot coexist with migratedRuleModules/,
);

// Hydration must not weaken the append-only ratchet.
const removedState = { ...hydratedSharded, migratedRules: [] };
const removedErrors = [];
verifyMonotonicState(hydratedSharded, removedState, removedErrors);
assert.ok(removedErrors.some(error => /was removed/.test(error)));

const modifiedState = JSON.parse(JSON.stringify(hydratedSharded));
modifiedState.migratedRules[0].source.selector = '.tampered';
const modifiedErrors = [];
verifyMonotonicState(hydratedSharded, modifiedState, modifiedErrors);
assert.ok(modifiedErrors.some(error => /was modified/.test(error)));

console.log('PASS CSS migration state legacy/sharded loading, validation and ratchet regressions');
