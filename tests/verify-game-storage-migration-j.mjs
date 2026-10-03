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

const storage = await import('../src/games/tower-defense/storage.js');

for (const [index, levelId] of storage.TOWER_DEFENSE_LEVEL_IDS.entries()) {
    mem.set(`td_clear_${levelId}`, '1');
    mem.set(`td_best_${levelId}`, String(1000 + index * 100));
    assert.equal(storage.loadTowerDefenseClear(levelId), true);
    assert.equal(storage.loadTowerDefenseBest(levelId), 1000 + index * 100);
    assert.equal(
        mem.get(storage.TOWER_DEFENSE_STORAGE.key(`clear:${levelId}`)),
        '1',
        `${levelId}: legacy clear imports into canonical slot`,
    );
    assert.equal(
        mem.get(storage.TOWER_DEFENSE_STORAGE.key(`best:${levelId}`)),
        String(1000 + index * 100),
        `${levelId}: legacy best imports into canonical slot`,
    );
    assert.equal(mem.get(`td_clear_${levelId}`), '1');
    assert.equal(mem.get(`td_best_${levelId}`), String(1000 + index * 100));
}

mem.set('td_best', '1800');
mem.set('td_local_scores', JSON.stringify([
    { name: 'Arc', score: 1500, level: 'outpost' },
]));
assert.equal(storage.loadTowerDefenseGlobalBest(), 1800);
assert.deepEqual(storage.loadTowerDefenseLocalScores(), [
    { name: 'Arc', score: 1500, level: 'outpost' },
]);

mem.set('td_best_outpost', '9999');
assert.equal(
    storage.loadTowerDefenseBest('outpost'),
    1000,
    'canonical per-level best wins after one-time import',
);

storage.saveTowerDefenseBest('outpost', 2100);
storage.saveTowerDefenseGlobalBest(2200);
storage.saveTowerDefenseLocalScores([{ name: 'Nova', score: 2100, level: 'outpost' }]);
storage.saveTowerDefenseClear('vanguard');

assert.equal(
    mem.get(storage.TOWER_DEFENSE_STORAGE.key('best:outpost')),
    '2100',
);
assert.equal(
    mem.get(storage.TOWER_DEFENSE_STORAGE.key(storage.TOWER_DEFENSE_STORAGE_SLOTS.GLOBAL_BEST)),
    '2200',
);
assert.deepEqual(
    JSON.parse(mem.get(storage.TOWER_DEFENSE_STORAGE.key(storage.TOWER_DEFENSE_STORAGE_SLOTS.LOCAL_SCORES))),
    [{ name: 'Nova', score: 2100, level: 'outpost' }],
);
assert.equal(mem.get('td_best'), '1800', 'legacy global best stays untouched');
assert.equal(
    mem.get('td_local_scores'),
    JSON.stringify([{ name: 'Arc', score: 1500, level: 'outpost' }]),
    'legacy local board stays untouched',
);
assert.equal(mem.get('td_best_outpost'), '9999', 'legacy per-level best is retained without write-back');
assert.equal(mem.get('td_clear_vanguard'), '1', 'legacy clear flag is retained without write-back');

console.log('✓ Phase 5 Batch J migrates Tower Defense private persistence while preserving legacy and leaderboard contracts');
