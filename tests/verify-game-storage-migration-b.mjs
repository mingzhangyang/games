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

const { SHADOW_LOOM_STORAGE, SHADOW_LOOM_STORAGE_SLOTS } =
    await import('../src/games/shadow-loom/storage.js');
const { ECHO_CAVE_STORAGE, ECHO_CAVE_STORAGE_SLOTS } =
    await import('../src/games/echo-cave/storage.js');
const { MAXWELL_DEMON_STORAGE, MAXWELL_DEMON_STORAGE_SLOTS } =
    await import('../src/games/maxwell-demon/storage.js');

function reset() {
    mem.clear();
    writes.length = 0;
}

// Shadow Loom owns two private slots: level records and chapter-intro history.
reset();
const shadowProgress = {
    crane: { time: 8400, moves: 7, best: 0.94, first: true },
};
const shadowSeen = { 0: 1, 1: 1 };
mem.set('sl_progress', JSON.stringify(shadowProgress));
mem.set('sl_seen_chapters', JSON.stringify(shadowSeen));
assert.deepEqual(
    SHADOW_LOOM_STORAGE.get(SHADOW_LOOM_STORAGE_SLOTS.PROGRESS, {}),
    shadowProgress,
);
assert.deepEqual(
    SHADOW_LOOM_STORAGE.get(SHADOW_LOOM_STORAGE_SLOTS.SEEN_CHAPTERS, {}),
    shadowSeen,
);
assert.equal(mem.get('game:shadow-loom:v1:progress'), JSON.stringify(shadowProgress));
assert.equal(mem.get('game:shadow-loom:v1:seenChapters'), JSON.stringify(shadowSeen));
assert.equal(mem.get('sl_progress'), JSON.stringify(shadowProgress));
assert.equal(mem.get('sl_seen_chapters'), JSON.stringify(shadowSeen));

mem.set('sl_progress', JSON.stringify({ changed: true }));
assert.deepEqual(
    SHADOW_LOOM_STORAGE.get(SHADOW_LOOM_STORAGE_SLOTS.PROGRESS, {}),
    shadowProgress,
    'Shadow Loom does not re-import a changed legacy value once the versioned slot exists',
);
const updatedShadowProgress = {
    crane: { time: 7900, moves: 6, best: 0.97, first: true },
};
SHADOW_LOOM_STORAGE.set(SHADOW_LOOM_STORAGE_SLOTS.PROGRESS, updatedShadowProgress);
SHADOW_LOOM_STORAGE.set(SHADOW_LOOM_STORAGE_SLOTS.SEEN_CHAPTERS, { 0: 1, 1: 1, 2: 1 });
const { SHADOW_LOOM_STORAGE: REIMPORTED_SHADOW_LOOM_STORAGE } =
    await import('../src/games/shadow-loom/storage.js?reimport=shadow-loom');
assert.deepEqual(
    REIMPORTED_SHADOW_LOOM_STORAGE.get(SHADOW_LOOM_STORAGE_SLOTS.PROGRESS, {}),
    updatedShadowProgress,
);
assert.equal(
    mem.get('sl_progress'),
    JSON.stringify({ changed: true }),
    'Shadow Loom new writes preserve the legacy progress key',
);
assert.equal(
    mem.get('sl_seen_chapters'),
    JSON.stringify(shadowSeen),
    'Shadow Loom new writes preserve the legacy seen-chapters key',
);

// Echo Cave migrates progress only. Local leaderboard cache keys remain protocol compatibility keys.
reset();
const echoProgress = {
    cave1: { stars: 3, bestPulses: 8 },
    cave2: { stars: 2, bestPulses: 14 },
};
mem.set('ec_progress', JSON.stringify(echoProgress));
mem.set('ec_lb_echo-cave', '[{"name":"legacy","score":9}]');
assert.deepEqual(
    ECHO_CAVE_STORAGE.get(ECHO_CAVE_STORAGE_SLOTS.PROGRESS, {}),
    echoProgress,
);
assert.equal(mem.get('game:echo-cave:v1:progress'), JSON.stringify(echoProgress));
assert.equal(mem.get('ec_progress'), JSON.stringify(echoProgress));
const updatedEchoProgress = {
    cave1: { stars: 3, bestPulses: 7 },
};
ECHO_CAVE_STORAGE.set(ECHO_CAVE_STORAGE_SLOTS.PROGRESS, updatedEchoProgress);
const { ECHO_CAVE_STORAGE: REIMPORTED_ECHO_CAVE_STORAGE } =
    await import('../src/games/echo-cave/storage.js?reimport=echo-cave');
assert.deepEqual(
    REIMPORTED_ECHO_CAVE_STORAGE.get(ECHO_CAVE_STORAGE_SLOTS.PROGRESS, {}),
    updatedEchoProgress,
);
assert.equal(mem.get('ec_progress'), JSON.stringify(echoProgress));
assert.equal(
    mem.get('ec_lb_echo-cave'),
    '[{"name":"legacy","score":9}]',
    'Echo Cave leaderboard cache remains untouched',
);

// Maxwell Demon follows the same split: private progress migrates, leaderboard cache stays compatible.
reset();
const maxwellProgress = {
    vessel1: { stars: 3, bestSpent: 5 },
    vessel2: { stars: 2, bestSpent: 9 },
};
mem.set('md_progress', JSON.stringify(maxwellProgress));
mem.set('md_lb_maxwell-demon', '[{"name":"legacy","score":5}]');
assert.deepEqual(
    MAXWELL_DEMON_STORAGE.get(MAXWELL_DEMON_STORAGE_SLOTS.PROGRESS, {}),
    maxwellProgress,
);
assert.equal(mem.get('game:maxwell-demon:v1:progress'), JSON.stringify(maxwellProgress));
assert.equal(mem.get('md_progress'), JSON.stringify(maxwellProgress));
const updatedMaxwellProgress = {
    vessel1: { stars: 3, bestSpent: 4 },
};
MAXWELL_DEMON_STORAGE.set(MAXWELL_DEMON_STORAGE_SLOTS.PROGRESS, updatedMaxwellProgress);
const { MAXWELL_DEMON_STORAGE: REIMPORTED_MAXWELL_DEMON_STORAGE } =
    await import('../src/games/maxwell-demon/storage.js?reimport=maxwell-demon');
assert.deepEqual(
    REIMPORTED_MAXWELL_DEMON_STORAGE.get(MAXWELL_DEMON_STORAGE_SLOTS.PROGRESS, {}),
    updatedMaxwellProgress,
);
assert.equal(mem.get('md_progress'), JSON.stringify(maxwellProgress));
assert.equal(
    mem.get('md_lb_maxwell-demon'),
    '[{"name":"legacy","score":5}]',
    'Maxwell Demon leaderboard cache remains untouched',
);

console.log('✓ Phase 5 Batch B legacy storage migrations preserve data and protocol keys');
