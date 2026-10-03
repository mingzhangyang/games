#!/usr/bin/env node
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = {
    get length() { return mem.size; },
    key(i) { return [...mem.keys()][i] ?? null; },
    getItem(key) { return mem.has(key) ? mem.get(key) : null; },
    setItem(key, value) { mem.set(key, String(value)); },
    removeItem(key) { mem.delete(key); },
};

const { PLANET_MERGE_STORAGE, PLANET_MERGE_STORAGE_SLOTS } =
    await import('../src/games/planet-merge/storage.js');

const legacyScores = [
    { name: 'Nova', score: 4321, day: '20261003', mode: 'daily' },
    { name: 'Orbit', score: 3210, day: '20261002', mode: 'endless' },
];

mem.set('pm_skin', 'fruits');
mem.set('pm_best', '4321');
mem.set('pm_local_scores', JSON.stringify(legacyScores));
mem.set('pm_muted', '1');
mem.set('pm_daily_20261003', '4000');

assert.equal(
    PLANET_MERGE_STORAGE.get(PLANET_MERGE_STORAGE_SLOTS.SKIN, 'planets'),
    'fruits',
);
assert.equal(
    PLANET_MERGE_STORAGE.get(PLANET_MERGE_STORAGE_SLOTS.BEST, 0),
    4321,
);
assert.deepEqual(
    PLANET_MERGE_STORAGE.get(PLANET_MERGE_STORAGE_SLOTS.LOCAL_SCORES, []),
    legacyScores,
);

assert.equal(mem.get('game:planet-merge:v1:skin'), JSON.stringify('fruits'));
assert.equal(mem.get('game:planet-merge:v1:best'), '4321');
assert.equal(mem.get('game:planet-merge:v1:localScores'), JSON.stringify(legacyScores));
assert.equal(mem.get('pm_skin'), 'fruits');
assert.equal(mem.get('pm_best'), '4321');
assert.equal(mem.get('pm_local_scores'), JSON.stringify(legacyScores));
assert.equal(mem.get('pm_muted'), '1');
assert.equal(mem.get('pm_daily_20261003'), '4000');

mem.set('pm_skin', 'faces');
mem.set('pm_best', '1');
mem.set('pm_local_scores', '[]');

const { PLANET_MERGE_STORAGE: REIMPORTED_PLANET_MERGE_STORAGE } =
    await import('../src/games/planet-merge/storage.js?reimport=planet-merge');

assert.equal(
    REIMPORTED_PLANET_MERGE_STORAGE.get(PLANET_MERGE_STORAGE_SLOTS.SKIN, 'planets'),
    'fruits',
);
assert.equal(
    REIMPORTED_PLANET_MERGE_STORAGE.get(PLANET_MERGE_STORAGE_SLOTS.BEST, 0),
    4321,
);
assert.deepEqual(
    REIMPORTED_PLANET_MERGE_STORAGE.get(PLANET_MERGE_STORAGE_SLOTS.LOCAL_SCORES, []),
    legacyScores,
);

REIMPORTED_PLANET_MERGE_STORAGE.set(PLANET_MERGE_STORAGE_SLOTS.SKIN, 'faces');
REIMPORTED_PLANET_MERGE_STORAGE.set(PLANET_MERGE_STORAGE_SLOTS.BEST, 5000);
REIMPORTED_PLANET_MERGE_STORAGE.set(PLANET_MERGE_STORAGE_SLOTS.LOCAL_SCORES, legacyScores.slice(0, 1));

assert.equal(mem.get('game:planet-merge:v1:skin'), JSON.stringify('faces'));
assert.equal(mem.get('game:planet-merge:v1:best'), '5000');
assert.equal(mem.get('game:planet-merge:v1:localScores'), JSON.stringify(legacyScores.slice(0, 1)));
assert.equal(mem.get('pm_skin'), 'faces');
assert.equal(mem.get('pm_best'), '1');
assert.equal(mem.get('pm_local_scores'), '[]');
assert.equal(mem.get('pm_muted'), '1');
assert.equal(mem.get('pm_daily_20261003'), '4000');
assert.equal(mem.has('game:planet-merge:v1:muted'), false);
assert.equal(mem.has('game:planet-merge:v1:daily'), false);

console.log('✓ Phase 5 Batch F migrates Planet Merge private state while preserving global/Daily compatibility keys');
