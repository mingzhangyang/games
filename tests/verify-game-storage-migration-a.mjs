#!/usr/bin/env node
import assert from 'node:assert/strict';

const mem = new Map();
const writes = [];
globalThis.localStorage = {
    get length() { return mem.size; },
    key(i) { return [...mem.keys()][i] ?? null; },
    getItem(key) { return mem.has(key) ? mem.get(key) : null; },
    setItem(key, value) {
        writes.push([key, String(value)]);
        mem.set(key, String(value));
    },
    removeItem(key) { mem.delete(key); },
};

const { CARROT_PULL_STORAGE, CARROT_PULL_STORAGE_SLOTS } =
    await import('../src/games/carrot-pull/storage.js');
const { HOOP_SHOT_STORAGE, HOOP_SHOT_STORAGE_SLOTS } =
    await import('../src/games/hoop-shot/storage.js');
const { BOND_FORGE_STORAGE, BOND_FORGE_STORAGE_SLOTS } =
    await import('../src/games/bond-forge/storage.js');

function reset() {
    mem.clear();
    writes.length = 0;
}

reset();
mem.set('cp_best_score', '27');
assert.equal(CARROT_PULL_STORAGE.get(CARROT_PULL_STORAGE_SLOTS.BEST, 0), 27);
assert.equal(mem.get('game:carrot-pull:v1:best'), '27');
assert.equal(mem.get('cp_best_score'), '27', 'Carrot Pull legacy key is retained');

// Once the versioned slot exists, later legacy changes must not be re-imported.
writes.length = 0;
mem.set('cp_best_score', '99');
assert.equal(CARROT_PULL_STORAGE.get(CARROT_PULL_STORAGE_SLOTS.BEST, 0), 27);
assert.equal(writes.length, 0, 'Carrot Pull migration is idempotent');
CARROT_PULL_STORAGE.set(CARROT_PULL_STORAGE_SLOTS.BEST, 31);
assert.equal(mem.get('game:carrot-pull:v1:best'), '31');
assert.equal(mem.get('cp_best_score'), '99', 'new writes do not delete legacy data');

reset();
const hoopScores = [{ name: 'A', score: 88 }, { name: 'B', score: 42 }];
mem.set('hs_best', '88');
mem.set('hs_longest_streak', '6');
mem.set('hs_local_scores', JSON.stringify(hoopScores));
assert.equal(HOOP_SHOT_STORAGE.get(HOOP_SHOT_STORAGE_SLOTS.BEST, 0), 88);
assert.equal(HOOP_SHOT_STORAGE.get(HOOP_SHOT_STORAGE_SLOTS.LONGEST_STREAK, 0), 6);
assert.deepEqual(
    HOOP_SHOT_STORAGE.get(HOOP_SHOT_STORAGE_SLOTS.LOCAL_SCORES, []),
    hoopScores,
);
assert.equal(mem.get('hs_best'), '88');
assert.equal(mem.get('hs_longest_streak'), '6');
assert.equal(mem.get('hs_local_scores'), JSON.stringify(hoopScores));
assert.equal(mem.get('game:hoop-shot:v1:best'), '88');
assert.equal(mem.get('game:hoop-shot:v1:longestStreak'), '6');
assert.equal(mem.get('game:hoop-shot:v1:localScores'), JSON.stringify(hoopScores));

reset();
const bondProgress = {
    water: { stars: 3, bestDrags: 4 },
    methane: { stars: 2, bestDrags: 7 },
};
mem.set('bf_progress', JSON.stringify(bondProgress));
assert.deepEqual(
    BOND_FORGE_STORAGE.get(BOND_FORGE_STORAGE_SLOTS.PROGRESS, {}),
    bondProgress,
);
assert.equal(mem.get('game:bond-forge:v1:progress'), JSON.stringify(bondProgress));
assert.equal(mem.get('bf_progress'), JSON.stringify(bondProgress));

console.log('✓ Phase 5 Batch A legacy storage migrations preserve data and remain idempotent');
