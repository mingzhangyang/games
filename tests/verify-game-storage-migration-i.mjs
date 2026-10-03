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

const reversi = await import('../src/games/reversi/storage.js');
const minesweeper = await import('../src/games/minesweeper/storage.js');
const firefly = await import('../src/games/firefly-signal/storage.js');

mem.set('rv_mode', '2p');
mem.set('rv_diff', 'hard');
mem.set('rv_best_streak', '7');
mem.set('rv_streak', '3');
mem.set('rv_local_scores', JSON.stringify([{ name: 'Disk', score: 7 }]));

assert.equal(reversi.loadReversiMode(), '2p');
assert.equal(reversi.loadReversiDifficulty(), 'hard');
assert.equal(reversi.loadReversiBestStreak(), 7);
assert.equal(reversi.loadReversiStreak(), 3);
assert.deepEqual(reversi.loadReversiLocalScores(), [{ name: 'Disk', score: 7 }]);
assert.equal(
    mem.get(reversi.REVERSI_STORAGE.key(reversi.REVERSI_STORAGE_SLOTS.MODE)),
    JSON.stringify('2p'),
);
assert.equal(mem.get('rv_mode'), '2p');

mem.set('rv_mode', 'ai');
assert.equal(reversi.loadReversiMode(), '2p', 'canonical Reversi mode wins after import');
reversi.saveReversiBestStreak(9);
assert.equal(
    mem.get(reversi.REVERSI_STORAGE.key(reversi.REVERSI_STORAGE_SLOTS.BEST_STREAK)),
    '9',
);
assert.equal(mem.get('rv_best_streak'), '7', 'legacy Reversi best streak stays untouched');

mem.set('ms_diff', 'medium');
mem.set('ms_best_medium', '42');
mem.set('ms_local_medium', JSON.stringify([{ name: 'Flag', score: 42 }]));

assert.equal(minesweeper.loadMinesweeperDifficulty(), 'medium');
assert.equal(minesweeper.loadMinesweeperBestTime('medium'), 42);
assert.deepEqual(
    minesweeper.loadMinesweeperLocalScores('medium'),
    [{ name: 'Flag', score: 42 }],
);
assert.equal(
    mem.get(minesweeper.MINESWEEPER_STORAGE.key(minesweeper.MINESWEEPER_STORAGE_SLOTS.BEST_MEDIUM)),
    '42',
);
minesweeper.saveMinesweeperBestTime('medium', 39);
assert.equal(
    mem.get(minesweeper.MINESWEEPER_STORAGE.key(minesweeper.MINESWEEPER_STORAGE_SLOTS.BEST_MEDIUM)),
    '39',
);
assert.equal(mem.get('ms_best_medium'), '42', 'legacy Minesweeper best time stays untouched');

const legacyFireflyBest = { used: 2, harmony: 0.91 };
mem.set('fs_best_first-light', JSON.stringify(legacyFireflyBest));
assert.deepEqual(firefly.loadBest('first-light'), legacyFireflyBest);
assert.equal(
    mem.get(firefly.FIREFLY_SIGNAL_STORAGE.key(firefly.FIREFLY_SIGNAL_STORAGE_SLOTS.BEST_FIRST_LIGHT)),
    JSON.stringify(legacyFireflyBest),
);
assert.equal(firefly.saveBest('first-light', 2, 0.95), true);
assert.deepEqual(firefly.loadBest('first-light'), { used: 2, harmony: 0.95 });
assert.equal(
    mem.get('fs_best_first-light'),
    JSON.stringify(legacyFireflyBest),
    'legacy Firefly best stays untouched',
);

console.log('✓ Phase 5 Batch I migrates Reversi, Minesweeper, and Firefly Signal private state while retaining legacy keys');
