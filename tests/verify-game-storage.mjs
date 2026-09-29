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

const { createGameStorage } = await import('../src/platform/storage/game-storage.js');

mem.set('legacy_scores', JSON.stringify([{ score: 42 }]));
const scores = createGameStorage('demo', { version: 1, legacy: { scores: 'legacy_scores' } });
assert.deepEqual(scores.get('scores', []), [{ score: 42 }]);
assert.equal(mem.get('game:demo:v1:scores'), JSON.stringify([{ score: 42 }]));

mem.set('legacy_flag', '1');
const flags = createGameStorage('flags', { version: 1, legacy: { enabled: 'legacy_flag' } });
const migrated = flags.get('enabled', false);
assert.ok(migrated === 1 || migrated === '1' || migrated === true);
assert.ok([true, 1, '1'].includes(migrated));

const v1 = createGameStorage('versioned', { version: 1 });
v1.set('state', { n: 2 });
const v2 = createGameStorage('versioned', {
    version: 2,
    migrations: { 1: value => ({ ...value, n: value.n + 1 }) },
});
assert.deepEqual(v2.get('state', null), { n: 3 });

console.log('✓ versioned game storage legacy + schema migration');
