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

const {
    GRAVITY_SLINGSHOT_STORAGE,
    GRAVITY_SLINGSHOT_STORAGE_SLOTS,
    loadGravityStars,
    saveGravityStars,
} = await import('../src/games/gravity-slingshot/storage.js');

const canonicalKey = GRAVITY_SLINGSHOT_STORAGE.key(
    GRAVITY_SLINGSHOT_STORAGE_SLOTS.STARS,
);
const legacyStars = [3, 2];

mem.set('gd_stars', JSON.stringify(legacyStars));
mem.set('gd_daily_20261003', '9');
mem.set('gs_daily_20261003', '1');
mem.set('gd_local_20261003', JSON.stringify([{ name: 'Orbit', score: 9 }]));
mem.set('gd_course_20261003', JSON.stringify([{ id: 'cached-course' }]));

assert.deepEqual(loadGravityStars(4), [3, 2, 0, 0]);
assert.equal(mem.get(canonicalKey), JSON.stringify(legacyStars));
assert.equal(mem.get('gd_stars'), JSON.stringify(legacyStars));
assert.equal(mem.get('gd_daily_20261003'), '9');
assert.equal(mem.get('gs_daily_20261003'), '1');
assert.equal(
    mem.get('gd_local_20261003'),
    JSON.stringify([{ name: 'Orbit', score: 9 }]),
);
assert.equal(
    mem.get('gd_course_20261003'),
    JSON.stringify([{ id: 'cached-course' }]),
);

mem.set('gd_stars', JSON.stringify([0]));
assert.deepEqual(
    loadGravityStars(4),
    [3, 2, 0, 0],
    'canonical stars must win after the first import',
);

const improvedStars = [3, 3, 1, 0];
assert.equal(saveGravityStars(improvedStars), true);
assert.equal(mem.get(canonicalKey), JSON.stringify(improvedStars));
assert.equal(
    mem.get('gd_stars'),
    JSON.stringify([0]),
    'canonical writes must retain the legacy stars key unchanged',
);
assert.equal(mem.get('gd_daily_20261003'), '9');
assert.equal(mem.get('gs_daily_20261003'), '1');
assert.equal(
    mem.get('gd_local_20261003'),
    JSON.stringify([{ name: 'Orbit', score: 9 }]),
);
assert.equal(
    mem.get('gd_course_20261003'),
    JSON.stringify([{ id: 'cached-course' }]),
);

mem.clear();
mem.set('gd_stars', JSON.stringify({ unexpected: true }));
assert.deepEqual(loadGravityStars(3), [0, 0, 0]);
assert.equal(mem.get(canonicalKey), JSON.stringify([]));

console.log('✓ Phase 5 Batch H migrates Gravity Slingshot stars while preserving Daily, hub, board, and course compatibility keys');
