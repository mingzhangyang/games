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

const { CIRCUIT_STORAGE, CIRCUIT_STORAGE_SLOTS } =
    await import('../src/games/circuit/storage.js');
const { LUMEN_STORAGE, LUMEN_STORAGE_SLOTS } =
    await import('../src/games/lumen/storage.js');

function reset() {
    mem.clear();
}

async function verifyStarsMigration({
    name,
    legacyKey,
    canonicalKey,
    initial,
    expected = initial,
    updated,
    storage,
    slot,
    protocolEntries,
    reimport,
}) {
    reset();
    mem.set(legacyKey, JSON.stringify(initial));
    for (const [key, value] of protocolEntries) mem.set(key, value);

    assert.deepEqual(storage.get(slot, []), expected, `${name}: imports legacy stars`);
    assert.equal(mem.get(canonicalKey), JSON.stringify(expected), `${name}: writes canonical stars slot`);
    assert.equal(mem.get(legacyKey), JSON.stringify(initial), `${name}: retains legacy stars key`);
    for (const [key, value] of protocolEntries) {
        assert.equal(mem.get(key), value, `${name}: preserves protocol key ${key}`);
    }

    mem.set(legacyKey, JSON.stringify([1, 1, 1]));
    assert.deepEqual(
        storage.get(slot, []),
        expected,
        `${name}: canonical slot wins after the first import`,
    );

    storage.set(slot, updated);
    const fresh = await reimport();
    assert.deepEqual(fresh.get(slot, []), updated, `${name}: re-import reads updated canonical stars`);
    assert.equal(
        mem.get(legacyKey),
        JSON.stringify([1, 1, 1]),
        `${name}: canonical writes do not overwrite the legacy stars key`,
    );
    for (const [key, value] of protocolEntries) {
        assert.equal(mem.get(key), value, `${name}: canonical writes do not alter ${key}`);
    }
}

const legacyCircuit = new Array(20).fill(0);
legacyCircuit[0] = 1;  // removed S1 cannot be reassigned to the new first level
legacyCircuit[9] = 3;  // retained M5
legacyCircuit[12] = 2; // retained H3
const mappedCircuit = new Array(20).fill(0);
mappedCircuit[0] = 3;
mappedCircuit[1] = 2;

await verifyStarsMigration({
    name: 'Circuit',
    legacyKey: 'cc_stars',
    canonicalKey: 'game:circuit:v2:stars',
    initial: legacyCircuit,
    expected: mappedCircuit,
    updated: [3, 3, 1, 1],
    storage: CIRCUIT_STORAGE,
    slot: CIRCUIT_STORAGE_SLOTS.STARS,
    protocolEntries: [
        ['cc_daily_20261003', '8'],
        ['cc_local_20261003', '[{"name":"legacy","score":9}]'],
    ],
    reimport: async () => (await import('../src/games/circuit/storage.js?reimport=circuit')).CIRCUIT_STORAGE,
});

reset();
mem.set('cc_stars', JSON.stringify(legacyCircuit));
mem.set('game:circuit:v2:stars', JSON.stringify([2, 1, 3]));
assert.deepEqual(CIRCUIT_STORAGE.get(CIRCUIT_STORAGE_SLOTS.STARS, []), [2, 1, 3],
    'existing v2 canonical state takes precedence over legacy imports');

reset();
const previous = new Array(20).fill(0);
previous[0] = 1; // 已删除的 S1，不能落到新的第一关
previous[9] = 3; // M5
previous[12] = 2; // H3
mem.set('game:circuit:v1:stars', JSON.stringify(previous));
const migrated = CIRCUIT_STORAGE.get(CIRCUIT_STORAGE_SLOTS.STARS, []);
assert.deepEqual(migrated.slice(0, 3), [3, 2, 0], 'v1 星级按关卡 id 迁到删关后的顺序');
assert.equal(migrated.length, 20, '迁完的星级数组跟现关卡数一样长');
assert.equal(mem.get('game:circuit:v2:stars'), JSON.stringify(migrated), 'v1 星级写入 v2');

// Lumen 2026-10 难度重做：旧 25 关全部换新，按下标存的旧星级不再对应任何关卡 → 迁成空对象；
// v2 起按关卡 id 存对象。旧键（lm_stars / v1）原样保留。
await verifyStarsMigration({
    name: 'Lumen',
    legacyKey: 'lm_stars',
    canonicalKey: 'game:lumen:v2:stars',
    initial: [3, 0, 2, 1],
    expected: {},
    updated: { 'refract-1': 3, 'shadow-2': 2 },
    storage: LUMEN_STORAGE,
    slot: LUMEN_STORAGE_SLOTS.STARS,
    protocolEntries: [
        ['lm_daily_20261003', '6'],
        ['lm_local_20261003', '[{"name":"legacy","score":7}]'],
    ],
    reimport: async () => (await import('../src/games/lumen/storage.js?reimport=lumen')).LUMEN_STORAGE,
});

reset();
mem.set('game:lumen:v1:stars', JSON.stringify([3, 3, 3]));
assert.deepEqual(LUMEN_STORAGE.get(LUMEN_STORAGE_SLOTS.STARS, {}), {},
    'Lumen v1 index stars retire to an empty v2 object');
assert.equal(mem.get('game:lumen:v1:stars'), JSON.stringify([3, 3, 3]), 'Lumen v1 key is retained');
mem.set('game:lumen:v2:stars', JSON.stringify({ 'link-1': 3 }));
assert.deepEqual(LUMEN_STORAGE.get(LUMEN_STORAGE_SLOTS.STARS, {}), { 'link-1': 3 },
    'Lumen v2 canonical state takes precedence over v1');

console.log('✓ Phase 5 Batch D stars migrations preserve data plus daily/local protocol keys');
