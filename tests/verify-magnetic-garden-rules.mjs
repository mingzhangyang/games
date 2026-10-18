import assert from 'node:assert/strict';
import { applyAction, createState, getSeedDirection, legalActions, stateKey, validateLevel } from '../src/games/magnetic-garden/model/rules.js';
import { solveLevel } from '../src/games/magnetic-garden/model/solver.js';
import { LEVELS } from '../src/games/magnetic-garden/model/levels.js';
import { LANGUAGES } from '../src/games/magnetic-garden/i18n.js';
import { describePreview } from '../src/games/magnetic-garden/preview-description.js';

const seed = (id, cell, polarity = 'N') => ({ id, cell, polarity });
const magnet = (id, cell, polarity = 'N', fixed = false) => ({ id, cell, polarity, fixed });
function board(overrides = {}) {
    return { width: 5, height: 5, stones: [], pots: [24], sockets: [0, 10, 14, 20], magnets: [magnet('m1', 10, 'S')], seeds: [seed('s1', 12)], ...overrides };
}
const flip = { type: 'flip', magnetId: 'm1' };

// Like poles repel, unlike poles attract; seeds and pots never occlude the field.
{
    const level = board();
    const state = createState(level);
    assert.deepEqual(getSeedDirection(level, state, state.seeds[0]), [-1, 0]);
    state.magnets[0].polarity = 'N';
    assert.deepEqual(getSeedDirection(level, state, state.seeds[0]), [1, 0]);
    const throughSeed = board({ seeds: [seed('s1', 12), seed('s2', 11, 'S')], pots: [23, 24] });
    assert.deepEqual(getSeedDirection(throughSeed, createState(throughSeed), throughSeed.seeds[0]), [-1, 0]);
    const occluded = board({ stones: [11] });
    assert.equal(getSeedDirection(occluded, createState(occluded), state.seeds[0]), null);
    assert.deepEqual(getSeedDirection(board({ pots: [11] }), createState(level), state.seeds[0]), [-1, 0]);
}
// Equal distances interfere regardless of direction/polarity. Nearer magnets occlude farther ones.
{
    const level = board({ magnets: [magnet('m1', 10), magnet('m2', 14, 'S')] });
    const state = createState(level);
    assert.equal(getSeedDirection(level, state, state.seeds[0]), null);
    level.stones = [13];
    assert.deepEqual(getSeedDirection(level, state, state.seeds[0]), [1, 0]);
    const inline = board({ magnets: [magnet('m1', 10), magnet('m2', 11, 'S')] });
    assert.deepEqual(getSeedDirection(inline, createState(inline), state.seeds[0]), [-1, 0]);
    const corner = board({ magnets: [magnet('m1', 10), magnet('m2', 2)] });
    assert.equal(getSeedDirection(corner, createState(corner), state.seeds[0]), null);
}
// A turn freezes its direction even when another magnet becomes closer.
{
    const level = board({ magnets: [magnet('m1', 10, 'S'), magnet('m2', 14)], seeds: [seed('s1', 11)] });
    const result = applyAction(level, createState(level), flip);
    assert.equal(result.state.seeds[0].cell, 13);
    assert.equal(result.frames.length, 2);
}
// Occupied-at-start means no following through a vacating cell, and no restart later in the turn.
{
    const level = board({ seeds: [seed('s1', 11), seed('s2', 12)], pots: [0, 24] });
    const result = applyAction(level, createState(level), flip);
    assert.deepEqual(result.state.seeds.map(s => s.cell), [11, 14]);
}
// Opposing seeds cannot swap. Simultaneous same-target conflicts stop both, including at a pot.
{
    const level = board({ width: 4, height: 4, sockets: [4, 7], magnets: [magnet('m1', 4, 'S'), magnet('m2', 7)], seeds: [seed('s1', 5), seed('s2', 6)], pots: [0, 15] });
    assert.deepEqual(applyAction(level, createState(level), flip).state.seeds.map(s => s.cell), [5, 6]);
    const conflict = board({ sockets: [10, 14], magnets: [magnet('m1', 10, 'S'), magnet('m2', 14)], seeds: [seed('s1', 11), seed('s2', 13)], pots: [12, 24] });
    const result = applyAction(conflict, createState(conflict), flip);
    assert.deepEqual(result.state.seeds.map(s => s.cell), [11, 13]);
    assert.equal(result.state.won, false);
}
// Capture occurs at the first crossed pot; captured seeds remain permanent movement blockers.
{
    const level = board({ pots: [13], seeds: [seed('s1', 11)] });
    const result = applyAction(level, createState(level), flip);
    assert.equal(result.state.seeds[0].cell, 13);
    assert.equal(result.state.seeds[0].captured, true);
    assert.equal(result.state.won, true);
    assert.deepEqual(result.frames.at(-1).captured, ['s1']);
    assert.equal(legalActions(level, result.state).length, 0);
    assert.equal(applyAction(level, result.state, flip).valid, false);
    const two = board({ pots: [12, 24], seeds: [seed('s1', 12), seed('s2', 11)] });
    const state = createState(two);
    state.seeds[0].captured = true;
    const blocked = applyAction(two, state, flip).state;
    assert.equal(blocked.seeds[1].cell, 11);
    assert.equal(blocked.seeds[0].captured, true);
}
// Empty sockets are traversable. Stones, magnets and edges stop travel.
{
    const level = board({ sockets: [10, 12, 20], seeds: [seed('s1', 11)] });
    assert.equal(applyAction(level, createState(level), flip).state.seeds[0].cell, 14);
    const stone = board({ stones: [13], seeds: [seed('s1', 11)] });
    assert.equal(applyAction(stone, createState(stone), flip).state.seeds[0].cell, 12);
}
// Invalid actions cost zero; valid flips and moves each cost one, even if no seed moves.
{
    const level = board({ sockets: [10, 12, 20], magnets: [magnet('m1', 10, 'S')] });
    const state = createState(level);
    for (const action of [null, { type: 'remove', magnetId: 'm1' }, { type: 'flip', magnetId: 'missing' }, { type: 'move', magnetId: 'm1', cell: 12 }, { type: 'move', magnetId: 'm1', cell: 10 }, { type: 'move', magnetId: 'm1', cell: 4 }]) {
        const result = applyAction(level, state, action);
        assert.equal(result.valid, false);
        assert.equal(result.state, state);
    }
    const snapshot = JSON.stringify({ level, state });
    const result = applyAction(level, state, { type: 'move', magnetId: 'm1', cell: 20 });
    assert.equal(result.state.moves, 1);
    assert.equal(JSON.stringify({ level, state }), snapshot);
    assert.notEqual(result.state.seeds, state.seeds);
    assert.notEqual(result.state.magnets[0], state.magnets[0]);
    result.frames[0]?.seeds.forEach(s => { s.cell = 999; });
    assert.notEqual(result.state.seeds[0].cell, 999);
    const fixed = board({ magnets: [magnet('m1', 10, 'N', true)] });
    assert.equal(applyAction(fixed, createState(fixed), flip).valid, false);
    assert.equal(legalActions(fixed, createState(fixed)).length, 0);
}
// Array order cannot decide ties, conflicts or travel, nor alter search identity.
{
    const level = board({ sockets: [0, 10, 14, 20], magnets: [magnet('m1', 10, 'S'), magnet('m2', 14)], seeds: [seed('s1', 11), seed('s2', 13)], pots: [12, 24] });
    const state = createState(level);
    const reversed = { ...state, magnets: [...state.magnets].reverse(), seeds: [...state.seeds].reverse() };
    assert.equal(stateKey(state), stateKey(reversed));
    for (const action of legalActions(level, state)) {
        const a = applyAction(level, state, action);
        const b = applyAction(level, reversed, action);
        assert.equal(stateKey(a.state), stateKey(b.state));
        assert.equal(a.frames.length, b.frames.length);
        a.frames.forEach((frame, i) => assert.deepEqual([...frame.seeds].sort((x, y) => x.id.localeCompare(y.id)), [...b.frames[i].seeds].sort((x, y) => x.id.localeCompare(y.id))));
    }
}
// Solver budget exhaustion remains unknown. Only an exhausted frontier proves unsolvable.
{
    const impossible = board({ sockets: [10], seeds: [seed('s1', 12)] });
    assert.equal(solveLevel(impossible).status, 'unsolvable');
    assert.equal(solveLevel(impossible, { maxStates: 1 }).status, 'unknown');
    assert.equal(solveLevel(impossible, { maxDepth: 0 }).status, 'unknown');
    assert.deepEqual(validateLevel(board()), []);
    assert.ok(validateLevel(board({ sockets: [24] })).length);
    const inventory = board({ magnets: [magnet('m1', null)] });
    assert.equal(getSeedDirection(inventory, createState(inventory), inventory.seeds[0]), null);
    assert.equal(applyAction(inventory, createState(inventory), { type: 'move', magnetId: 'm1', cell: 10 }).valid, true);
}
// Exact accessibility descriptions use the already-computed physics result.
{
    const level = LEVELS[0], state = createState(level), action = level.solution[0];
    const result = applyAction(level, state, action);
    const preview = { action, result };
    const en = describePreview(level, state, preview, LANGUAGES.en);
    const zh = describePreview(level, state, preview, LANGUAGES.zh);
    assert.match(en, /moving magnet m1 to row 1, column 3/);
    assert.match(en, /N seed s1 will be planted in a pot at Row 3, column 3/);
    assert.match(zh, /磁铁 m1/);
    assert.match(zh, /N 极种子 s1/);
    assert.match(zh, /第 3 行，第 3 列/);
    assert.notEqual(en, zh);
    assert.equal(describePreview(level, state, null, LANGUAGES.en), '');
    const multi = LEVELS.find(item => item.id === 'aurora-3');
    const multiBefore = createState(multi);
    const multiAction = multi.solution[0];
    const multiAfter = applyAction(multi, multiBefore, multiAction);
    const summary = describePreview(multi, multiBefore,
        { action: multiAction, result: multiAfter }, LANGUAGES.en);
    for (const s of multiAfter.state.seeds) {
        assert.ok(summary.includes(`seed ${s.id}`), 'every seed is described');
        assert.ok(summary.includes(`Row ${Math.floor(s.cell / multi.width) + 1}, column ${s.cell % multi.width + 1}`),
            'each exact resulting destination is described');
    }
    const still = board({ seeds: [seed('s1', 9)] });
    const stillBefore = createState(still);
    assert.match(describePreview(still, stillBefore,
        { action: flip, result: applyAction(still, stillBefore, flip) }, LANGUAGES.en),
    /N seed s1 stays at Row 2, column 5/);
    const planted = board({ pots: [12, 24], seeds: [seed('s1', 12), seed('s2', 11)] });
    const plantedBefore = createState(planted); plantedBefore.seeds[0].captured = true;
    const plantedAfter = applyAction(planted, plantedBefore, flip);
    const plantedSummary = describePreview(planted, plantedBefore,
        { action: flip, result: plantedAfter }, LANGUAGES.en);
    assert.match(plantedSummary, /N seed s1 remains planted at Row 3, column 3/);
    assert.match(plantedSummary, /flipping magnet m1 to the N pole/);
}
console.log('✓ Magnetic Garden deterministic rules, collisions, capture, accessible previews, immutability and solver budgets');
