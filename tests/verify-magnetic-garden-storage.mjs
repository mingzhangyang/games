import assert from 'node:assert/strict';
import { LEVELS } from '../src/games/magnetic-garden/model/levels.js';
import { applyAction, createState } from '../src/games/magnetic-garden/model/rules.js';
import { loadProgress, replaySaved, writeProgress } from '../src/games/magnetic-garden/storage.js';

const key = 'game:magnetic-garden:v1:progress';
const memory = new Map();
globalThis.localStorage = {
    getItem: name => memory.get(name) ?? null,
    setItem: (name, value) => memory.set(name, value),
    removeItem: name => memory.delete(name),
};
const level = LEVELS.find(item => item.par >= 3);
const record = { version: level.version, moves: level.par, actions: level.solution };
const initial = createState(level);
const first = applyAction(level, initial, level.solution[0]).state;
const current = {
    levelId: level.id, levelVersion: level.version, actions: level.solution.slice(0, 1),
    state: first, history: [{ bogus: 'serialized history is never authoritative' }],
};
assert.equal(writeProgress({ [level.id]: record }, current), true);
let loaded = loadProgress();
assert.equal(loaded.best[level.id].moves, level.par);
assert.deepEqual(loaded.current.state, first);
assert.deepEqual(loaded.current.history, [initial], 'undo history comes from legal replay');
assert.equal(replaySaved({ ...current, levelVersion: level.version + 1 }), null);
assert.equal(replaySaved({ ...current, actions: [{ type: 'move', magnetId: 'm1', cell: -1 }] }), null);
assert.equal(replaySaved({ ...current, actions: Array(4001).fill(level.solution[0]) }), null);

// A corrupt record cannot disable the game or hide other valid completed gardens.
const other = LEVELS.find(item => item.id !== level.id);
for (const corrupt of [null, 'bad', {}, { seeds: null }, { seeds: [], magnets: [] }]) {
    memory.set(key, JSON.stringify({ schema: 1,
        best: { [level.id]: record, [other.id]: {
            version: other.version, moves: other.par, actions: other.solution, state: corrupt,
        } }, current: { ...current, state: corrupt } }));
    loaded = loadProgress();
    assert.equal(loaded.best[level.id].moves, level.par);
}

// Neither a forged move count nor an incomplete replay is a valid best record.
for (const bad of [{ ...record, moves: 0 }, { ...record, actions: [] }, { ...record, version: 999 }]) {
    memory.set(key, JSON.stringify({ schema: 1, best: { [level.id]: bad } }));
    assert.deepEqual(loadProgress().best, {});
}
for (const raw of ['{bad json', 'null', '42', JSON.stringify({ schema: 999, best: { [level.id]: record }, current })]) {
    memory.set(key, raw);
    assert.deepEqual(loadProgress().best, {});
    assert.equal(loadProgress().current, null);
}
globalThis.localStorage = {
    getItem: () => { throw new Error('denied'); },
    setItem: () => { throw new Error('quota'); },
};
assert.deepEqual(loadProgress().best, {});
assert.equal(writeProgress({}, null), false, 'storage denial is reported to the caller');
delete globalThis.localStorage;
console.log('✓ Magnetic Garden replay, undo reconstruction, corrupt saves, content versions and denied storage');
