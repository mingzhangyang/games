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
    updated,
    storage,
    slot,
    protocolEntries,
    reimport,
}) {
    reset();
    mem.set(legacyKey, JSON.stringify(initial));
    for (const [key, value] of protocolEntries) mem.set(key, value);

    assert.deepEqual(storage.get(slot, []), initial, `${name}: imports legacy stars`);
    assert.equal(mem.get(canonicalKey), JSON.stringify(initial), `${name}: writes canonical stars slot`);
    assert.equal(mem.get(legacyKey), JSON.stringify(initial), `${name}: retains legacy stars key`);
    for (const [key, value] of protocolEntries) {
        assert.equal(mem.get(key), value, `${name}: preserves protocol key ${key}`);
    }

    mem.set(legacyKey, JSON.stringify([1, 1, 1]));
    assert.deepEqual(
        storage.get(slot, []),
        initial,
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

await verifyStarsMigration({
    name: 'Circuit',
    legacyKey: 'cc_stars',
    canonicalKey: 'game:circuit:v1:stars',
    initial: [3, 2, 0, 1],
    updated: [3, 3, 1, 1],
    storage: CIRCUIT_STORAGE,
    slot: CIRCUIT_STORAGE_SLOTS.STARS,
    protocolEntries: [
        ['cc_daily_20261003', '8'],
        ['cc_local_20261003', '[{"name":"legacy","score":9}]'],
    ],
    reimport: async () => (await import('../src/games/circuit/storage.js?reimport=circuit')).CIRCUIT_STORAGE,
});

await verifyStarsMigration({
    name: 'Lumen',
    legacyKey: 'lm_stars',
    canonicalKey: 'game:lumen:v1:stars',
    initial: [3, 0, 2, 1],
    updated: [3, 3, 2, 1],
    storage: LUMEN_STORAGE,
    slot: LUMEN_STORAGE_SLOTS.STARS,
    protocolEntries: [
        ['lm_daily_20261003', '6'],
        ['lm_local_20261003', '[{"name":"legacy","score":7}]'],
    ],
    reimport: async () => (await import('../src/games/lumen/storage.js?reimport=lumen')).LUMEN_STORAGE,
});

console.log('✓ Phase 5 Batch D stars migrations preserve data plus daily/local protocol keys');
