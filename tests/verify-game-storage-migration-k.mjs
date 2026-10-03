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

const mathRain = await import('../src/games/math-rain/storage.js');

const legacyInventory = {
    coins: 37,
    freezeCount: 4,
    bombCount: 2,
    shieldCount: 1,
};
mem.set('math-rain-inventory', JSON.stringify(legacyInventory));
mem.set('mr_sfx_volume', '65');
mem.set('mr_music_volume', '35');

assert.deepEqual(mathRain.loadMathRainInventory(), legacyInventory);
assert.equal(mathRain.loadMathRainSfxVolume(), 65);
assert.equal(mathRain.loadMathRainMusicVolume(), 35);

assert.equal(
    mem.get(mathRain.MATH_RAIN_STORAGE.key(mathRain.MATH_RAIN_STORAGE_SLOTS.INVENTORY)),
    JSON.stringify(legacyInventory),
);
assert.equal(
    mem.get(mathRain.MATH_RAIN_STORAGE.key(mathRain.MATH_RAIN_STORAGE_SLOTS.SFX_VOLUME)),
    '65',
);
assert.equal(
    mem.get(mathRain.MATH_RAIN_STORAGE.key(mathRain.MATH_RAIN_STORAGE_SLOTS.MUSIC_VOLUME)),
    '35',
);

mem.set('math-rain-inventory', JSON.stringify({ ...legacyInventory, coins: 999 }));
mem.set('mr_sfx_volume', '99');
assert.deepEqual(
    mathRain.loadMathRainInventory(),
    legacyInventory,
    'canonical inventory wins after one-time import',
);
assert.equal(mathRain.loadMathRainSfxVolume(), 65, 'canonical SFX volume wins after import');

const nextInventory = {
    coins: 52,
    freezeCount: 3,
    bombCount: 5,
    shieldCount: 2,
};
mathRain.saveMathRainInventory(nextInventory);
mathRain.saveMathRainSfxVolume(72);
mathRain.saveMathRainMusicVolume(48);

assert.deepEqual(mathRain.loadMathRainInventory(), nextInventory);
assert.equal(mathRain.loadMathRainSfxVolume(), 72);
assert.equal(mathRain.loadMathRainMusicVolume(), 48);
assert.equal(
    mem.get('math-rain-inventory'),
    JSON.stringify({ ...legacyInventory, coins: 999 }),
    'legacy inventory stays untouched',
);
assert.equal(mem.get('mr_sfx_volume'), '99', 'legacy SFX volume stays untouched');
assert.equal(mem.get('mr_music_volume'), '35', 'legacy music volume stays untouched');

mathRain.saveMathRainSfxVolume(150);
mathRain.saveMathRainMusicVolume(-10);
assert.equal(mathRain.loadMathRainSfxVolume(), 100, 'SFX volume remains within slider bounds');
assert.equal(mathRain.loadMathRainMusicVolume(), 0, 'music volume remains within slider bounds');

console.log('✓ Phase 5 Batch K migrates Math Rain inventory and volume preferences while retaining legacy keys');
