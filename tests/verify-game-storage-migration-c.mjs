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

const { CRYSTAL_BLOOM_STORAGE, CRYSTAL_BLOOM_STORAGE_SLOTS } =
    await import('../src/games/crystal-bloom/storage.js');
const { FLAME_VERSE_STORAGE, FLAME_VERSE_STORAGE_SLOTS } =
    await import('../src/games/flame-verse/storage.js');
const { RIPPLE_DUET_STORAGE, RIPPLE_DUET_STORAGE_SLOTS } =
    await import('../src/games/ripple-duet/storage.js');

function reset() {
    mem.clear();
}

async function verifyMigration({
    name,
    legacyKey,
    protocolKey,
    canonicalKey,
    initial,
    updated,
    storage,
    slot,
    reimport,
}) {
    reset();
    const protocolValue = '[{"name":"legacy","score":7}]';
    mem.set(legacyKey, JSON.stringify(initial));
    mem.set(protocolKey, protocolValue);

    assert.deepEqual(storage.get(slot, {}), initial, `${name}: imports legacy progress`);
    assert.equal(mem.get(canonicalKey), JSON.stringify(initial), `${name}: writes canonical slot`);
    assert.equal(mem.get(legacyKey), JSON.stringify(initial), `${name}: retains legacy progress key`);
    assert.equal(mem.get(protocolKey), protocolValue, `${name}: leaves leaderboard cache untouched`);

    mem.set(legacyKey, JSON.stringify({ changed: true }));
    assert.deepEqual(
        storage.get(slot, {}),
        initial,
        `${name}: canonical slot wins after the first import`,
    );

    storage.set(slot, updated);
    const fresh = await reimport();
    assert.deepEqual(fresh.get(slot, {}), updated, `${name}: re-import reads the updated canonical slot`);
    assert.equal(
        mem.get(legacyKey),
        JSON.stringify({ changed: true }),
        `${name}: new writes do not overwrite legacy progress`,
    );
    assert.equal(mem.get(protocolKey), protocolValue, `${name}: protocol key remains unchanged`);
}

await verifyMigration({
    name: 'Crystal Bloom',
    legacyKey: 'cb_progress',
    protocolKey: 'cb_lb_crystal-bloom',
    canonicalKey: 'game:crystal-bloom:v1:progress',
    initial: {
        cb1: { stars: 3, bestCost: 4 },
        cb2: { stars: 2, bestCost: 7 },
    },
    updated: {
        cb1: { stars: 3, bestCost: 3 },
    },
    storage: CRYSTAL_BLOOM_STORAGE,
    slot: CRYSTAL_BLOOM_STORAGE_SLOTS.PROGRESS,
    reimport: async () => (await import('../src/games/crystal-bloom/storage.js?reimport=crystal-bloom')).CRYSTAL_BLOOM_STORAGE,
});

await verifyMigration({
    name: 'Flame Verse',
    legacyKey: 'fv_progress',
    protocolKey: 'fv_lb_flame-verse',
    canonicalKey: 'game:flame-verse:v1:progress',
    initial: {
        fv1: { stars: 3, bestCost: 1 },
        fv2: { stars: 2, bestCost: 3 },
    },
    updated: {
        fv1: { stars: 3, bestCost: 1 },
        fv2: { stars: 3, bestCost: 2 },
    },
    storage: FLAME_VERSE_STORAGE,
    slot: FLAME_VERSE_STORAGE_SLOTS.PROGRESS,
    reimport: async () => (await import('../src/games/flame-verse/storage.js?reimport=flame-verse')).FLAME_VERSE_STORAGE,
});

await verifyMigration({
    name: 'Ripple Duet',
    legacyKey: 'rd_progress',
    protocolKey: 'rd_lb_ripple-duet',
    canonicalKey: 'game:ripple-duet:v1:progress',
    initial: {
        rd1: { stars: 3, bestCost: 2 },
        rd2: { stars: 1, bestCost: 8 },
    },
    updated: {
        rd1: { stars: 3, bestCost: 2 },
        rd2: { stars: 2, bestCost: 5 },
    },
    storage: RIPPLE_DUET_STORAGE,
    slot: RIPPLE_DUET_STORAGE_SLOTS.PROGRESS,
    reimport: async () => (await import('../src/games/ripple-duet/storage.js?reimport=ripple-duet')).RIPPLE_DUET_STORAGE,
});

console.log('✓ Phase 5 Batch C legacy progress migrations preserve data and leaderboard protocol keys');
