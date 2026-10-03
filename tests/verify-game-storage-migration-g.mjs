#!/usr/bin/env node
import assert from 'node:assert/strict';

const mem = new Map();
let blockedKey = null;

globalThis.localStorage = {
    get length() { return mem.size; },
    key(i) { return [...mem.keys()][i] ?? null; },
    getItem(key) { return mem.has(key) ? mem.get(key) : null; },
    setItem(key, value) {
        if (key === blockedKey) throw new DOMException('simulated quota failure', 'QuotaExceededError');
        mem.set(key, String(value));
    },
    removeItem(key) { mem.delete(key); },
};

const {
    SILK_DEW_STORAGE,
    SILK_DEW_STORAGE_SLOTS,
    loadSilkDewProgress,
    saveSilkDewProgress,
} = await import('../src/games/silk-dew/storage.js');

const canonicalKey = SILK_DEW_STORAGE.key(SILK_DEW_STORAGE_SLOTS.PROGRESS);
const v1Legacy = {
    S1: { stars: 3, bestDrags: 1 },
    S2: { stars: 2, bestDrags: 4 },
    S3: { stars: 0, bestDrags: 8 },
};
const migrated = {
    S1: { stars: 1, bestDrags: 0 },
    S2: { stars: 1, bestDrags: 0 },
};

mem.set('sd_progress', JSON.stringify(v1Legacy));
mem.set('sd_lb_silk-dew-daily-20261003', JSON.stringify([{ name: 'Dew', score: 9 }]));

assert.deepEqual(loadSilkDewProgress(), migrated);
assert.equal(mem.get('sd_progress_version'), '2');
assert.equal(mem.get('sd_progress'), JSON.stringify(migrated));
assert.equal(mem.get(canonicalKey), JSON.stringify(migrated));
assert.equal(
    mem.get('sd_lb_silk-dew-daily-20261003'),
    JSON.stringify([{ name: 'Dew', score: 9 }]),
);

mem.set('sd_progress', JSON.stringify({ S1: { stars: 3, bestDrags: 1 } }));
assert.deepEqual(
    loadSilkDewProgress(),
    migrated,
    'canonical progress must win after the first migration',
);

const improved = {
    S1: { stars: 3, bestDrags: 1 },
    S2: { stars: 2, bestDrags: 3 },
};
assert.equal(saveSilkDewProgress(improved), true);
assert.equal(mem.get(canonicalKey), JSON.stringify(improved));
assert.equal(
    mem.get('sd_progress'),
    JSON.stringify({ S1: { stars: 3, bestDrags: 1 } }),
    'new canonical writes must not overwrite the retained legacy payload',
);
assert.equal(mem.get('sd_progress_version'), '2');

mem.clear();
mem.set('sd_progress_version', '2');
mem.set('sd_progress', JSON.stringify({ S1: { stars: 3, bestDrags: 2 } }));
assert.deepEqual(loadSilkDewProgress(), { S1: { stars: 3, bestDrags: 2 } });
assert.equal(canonicalKey in Object.fromEntries(mem), true);
assert.equal(mem.get(canonicalKey), JSON.stringify({ S1: { stars: 3, bestDrags: 2 } }));

mem.clear();
mem.set('sd_progress', JSON.stringify(v1Legacy));
blockedKey = 'sd_progress';
assert.deepEqual(loadSilkDewProgress(), migrated);
assert.equal(mem.get('sd_progress_version'), undefined);
assert.equal(mem.get(canonicalKey), undefined);
blockedKey = null;
assert.deepEqual(loadSilkDewProgress(), migrated);
assert.equal(mem.get('sd_progress_version'), '2');
assert.equal(mem.get(canonicalKey), JSON.stringify(migrated));

mem.clear();
mem.set('sd_progress', JSON.stringify(v1Legacy));
blockedKey = canonicalKey;
assert.deepEqual(loadSilkDewProgress(), migrated);
assert.equal(mem.get('sd_progress_version'), '2');
assert.equal(mem.get(canonicalKey), undefined);
blockedKey = null;
assert.deepEqual(loadSilkDewProgress(), migrated);
assert.equal(mem.get(canonicalKey), JSON.stringify(migrated));

mem.clear();
mem.set('sd_progress', '{invalid json');
assert.deepEqual(loadSilkDewProgress(), {});
assert.equal(mem.get('sd_progress_version'), undefined);
assert.equal(mem.get(canonicalKey), undefined);

console.log('✓ Phase 5 Batch G migrates Silk Dew progress without weakening its historical v2 transaction or leaderboard compatibility');
