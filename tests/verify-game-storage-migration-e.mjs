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

const { NEEDLE_AWN_STORAGE, NEEDLE_AWN_STORAGE_SLOTS } =
    await import('../src/games/needle-awn/storage.js');
const { SWORD_FLIGHT_STORAGE, SWORD_FLIGHT_STORAGE_SLOTS } =
    await import('../src/games/sword-flight/storage.js');

function reset() {
    mem.clear();
}

function assertLegacyPreserved(key, expected, label) {
    assert.equal(mem.get(key), expected, label);
}

// Needle Awn: four private records migrate; Daily remains on zj_daily_*.
reset();
const needleLegacy = {
    na_unlocked_level: '6',
    na_level_stars: JSON.stringify({ 1: 3, 2: 2, 5: 1 }),
    na_endless_best: '12345',
    na_clash_max: '27',
};
for (const [key, value] of Object.entries(needleLegacy)) mem.set(key, value);
mem.set('zj_daily_20261003', '8800');

assert.equal(
    NEEDLE_AWN_STORAGE.get(NEEDLE_AWN_STORAGE_SLOTS.UNLOCKED_LEVEL, 1),
    6,
);
assert.deepEqual(
    NEEDLE_AWN_STORAGE.get(NEEDLE_AWN_STORAGE_SLOTS.LEVEL_STARS, {}),
    { 1: 3, 2: 2, 5: 1 },
);
assert.equal(
    NEEDLE_AWN_STORAGE.get(NEEDLE_AWN_STORAGE_SLOTS.ENDLESS_BEST, 0),
    12345,
);
assert.equal(
    NEEDLE_AWN_STORAGE.get(NEEDLE_AWN_STORAGE_SLOTS.CLASH_MAX, 0),
    27,
);
assert.equal(mem.get('game:needle-awn:v1:unlockedLevel'), '6');
assert.equal(mem.get('game:needle-awn:v1:levelStars'), JSON.stringify({ 1: 3, 2: 2, 5: 1 }));
assert.equal(mem.get('game:needle-awn:v1:endlessBest'), '12345');
assert.equal(mem.get('game:needle-awn:v1:clashMax'), '27');
for (const [key, value] of Object.entries(needleLegacy)) {
    assertLegacyPreserved(key, value, `Needle Awn keeps legacy key ${key}`);
}
assert.equal(mem.get('zj_daily_20261003'), '8800');

mem.set('na_endless_best', '1');
NEEDLE_AWN_STORAGE.set(NEEDLE_AWN_STORAGE_SLOTS.ENDLESS_BEST, 15000);
const { NEEDLE_AWN_STORAGE: REIMPORTED_NEEDLE_AWN_STORAGE } =
    await import('../src/games/needle-awn/storage.js?reimport=needle-awn');
assert.equal(
    REIMPORTED_NEEDLE_AWN_STORAGE.get(NEEDLE_AWN_STORAGE_SLOTS.ENDLESS_BEST, 0),
    15000,
);
assert.equal(mem.get('na_endless_best'), '1');
assert.equal(mem.get('zj_daily_20261003'), '8800');

// Sword Flight: five private records migrate; Daily remains on sf_daily_*.
reset();
const swordLegacy = {
    sf_unlocked_stage: '7',
    sf_stage_stars: JSON.stringify({ 1: 3, 2: 3, 6: 2 }),
    sf_endless_best: '54321',
    sf_max_realm: '元婴期',
    sf_max_combo: '19',
};
for (const [key, value] of Object.entries(swordLegacy)) mem.set(key, value);
mem.set('sf_daily_20261003', '1200');

assert.equal(
    SWORD_FLIGHT_STORAGE.get(SWORD_FLIGHT_STORAGE_SLOTS.UNLOCKED_STAGE, 1),
    7,
);
assert.deepEqual(
    SWORD_FLIGHT_STORAGE.get(SWORD_FLIGHT_STORAGE_SLOTS.STAGE_STARS, {}),
    { 1: 3, 2: 3, 6: 2 },
);
assert.equal(
    SWORD_FLIGHT_STORAGE.get(SWORD_FLIGHT_STORAGE_SLOTS.ENDLESS_BEST, 0),
    54321,
);
assert.equal(
    SWORD_FLIGHT_STORAGE.get(SWORD_FLIGHT_STORAGE_SLOTS.MAX_REALM, '炼气期'),
    '元婴期',
);
assert.equal(
    SWORD_FLIGHT_STORAGE.get(SWORD_FLIGHT_STORAGE_SLOTS.MAX_COMBO, 1),
    19,
);
assert.equal(mem.get('game:sword-flight:v1:unlockedStage'), '7');
assert.equal(mem.get('game:sword-flight:v1:stageStars'), JSON.stringify({ 1: 3, 2: 3, 6: 2 }));
assert.equal(mem.get('game:sword-flight:v1:endlessBest'), '54321');
assert.equal(mem.get('game:sword-flight:v1:maxRealm'), JSON.stringify('元婴期'));
assert.equal(mem.get('game:sword-flight:v1:maxCombo'), '19');
for (const [key, value] of Object.entries(swordLegacy)) {
    assertLegacyPreserved(key, value, `Sword Flight keeps legacy key ${key}`);
}
assert.equal(mem.get('sf_daily_20261003'), '1200');

mem.set('sf_max_combo', '2');
SWORD_FLIGHT_STORAGE.set(SWORD_FLIGHT_STORAGE_SLOTS.MAX_COMBO, 24);
const { SWORD_FLIGHT_STORAGE: REIMPORTED_SWORD_FLIGHT_STORAGE } =
    await import('../src/games/sword-flight/storage.js?reimport=sword-flight');
assert.equal(
    REIMPORTED_SWORD_FLIGHT_STORAGE.get(SWORD_FLIGHT_STORAGE_SLOTS.MAX_COMBO, 1),
    24,
);
assert.equal(mem.get('sf_max_combo'), '2');
assert.equal(mem.get('sf_daily_20261003'), '1200');

console.log('✓ Phase 5 Batch E private records migrate without touching Daily protocol keys');
