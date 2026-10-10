#!/usr/bin/env node
// Concurrency, legacy import, ranking, restart and daily expiry regression.
import assert from 'node:assert/strict';
import { ScoreboardStore } from '../Workers/scoreboard-store.js';

const clone = value => JSON.parse(JSON.stringify(value));

function makeContext(data = new Map()) {
    let locked = Promise.resolve();
    return {
        storage: { kv: {
            get: key => data.has(key) ? clone(data.get(key)) : undefined,
            put: (key, value) => { data.set(key, clone(value)); },
        } },
        blockConcurrencyWhile(callback) {
            const next = locked.then(callback);
            locked = next.catch(() => {});
            return next;
        },
    };
}
const high = { order: 'desc', maxScore: 2000000, maxEntries: 50 };
const old = new Map([['top:tetris', JSON.stringify([{ name: 'Veteran', score: 9000 }])]]);
let imports = 0;
const env = { GAME_SCORES: { async get(key) {
    imports++;
    await new Promise(resolve => setTimeout(resolve, 5));
    return old.get(key) ?? null;
} } };
const persisted = new Map();
const store = new ScoreboardStore(makeContext(persisted), env);
await Promise.all([
    ...Array.from({ length: 80 }, (_, i) => store.submit('tetris', high, 'Player' + i, i * 100)),
    store.submit('tetris', high, 'Champion', 100),
    store.submit('tetris', high, 'Champion', 10000),
    store.submit('tetris', high, 'Champion', 250),
]);
const result = await store.list('tetris', high);
assert.equal(imports, 1, 'overlapping initial requests only import KV once');
assert.equal(result.length, 50, 'top fifty bounded');
assert.deepEqual(result[0], { name: 'Champion', score: 10000 }, 'better concurrent score wins');
assert.deepEqual(result.map(x => x.score), [...result.map(x => x.score)].sort((a,b) => b-a));
assert.ok(result.some(x => x.name === 'Veteran' && x.score === 9000), 'old score retained');
assert.ok(result.some(x => x.name === 'Player79'), 'top competing entry survives');
assert.deepEqual(await new ScoreboardStore(makeContext(persisted), env).list('tetris', high), result,
    'restart reads persisted SQLite-backed data');
assert.equal(imports, 1, 'restart does not re-import stale KV');

const low = { order: 'asc', maxScore: 9999, maxEntries: 50 };
const asc = new ScoreboardStore(makeContext(), { GAME_SCORES: { async get() { return null; } } });
await Promise.all([
    asc.submit('minesweeper-easy', low, 'A', 25),
    asc.submit('minesweeper-easy', low, 'B', 20),
    asc.submit('minesweeper-easy', low, 'A', 35),
    asc.submit('minesweeper-easy', low, 'A', 15),
]);
assert.deepEqual(await asc.list('minesweeper-easy', low),
    [{ name: 'A', score: 15 }, { name: 'B', score: 20 }]);

const daily = { ...high, ttl: 14*24*3600 };
const now = Date.now;
const dailyStore = new ScoreboardStore(makeContext(), { GAME_SCORES: { async get() { return null; } } });
try {
    let clock = 10000000000;
    Date.now = () => clock;
    await dailyStore.submit('needle-awn-d20261010', daily, 'Day1', 50);
    clock += daily.ttl*1000-1;
    assert.equal((await dailyStore.list('needle-awn-d20261010', daily)).length, 1);
    clock += 1;
    assert.deepEqual(await dailyStore.list('needle-awn-d20261010', daily), [], 'daily TTL honored');
    await dailyStore.submit('needle-awn-d20261010', daily, 'Day2', 40);
    assert.deepEqual(await dailyStore.list('needle-awn-d20261010', daily), [{ name: 'Day2', score: 40 }],
        'expired data never reappears');
} finally { Date.now = now; }

const failureEnv = { GAME_SCORES: { async get() { throw new Error('KV unavailable'); } } };
const state = makeContext();
await assert.rejects(new ScoreboardStore(state, failureEnv).list('tetris', high), /KV unavailable/);
failureEnv.GAME_SCORES.get = async () => JSON.stringify([{ name: 'Retained', score: 33 }]);
assert.deepEqual(await new ScoreboardStore(state, failureEnv).list('tetris', high),
    [{ name: 'Retained', score: 33 }], 'failed initial import must not persist empty board');
console.log('PASS durable scoreboard: concurrency, migration, best score, TTL, restart');
