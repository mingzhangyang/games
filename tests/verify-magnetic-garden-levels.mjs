import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { LEVELS, CHAPTERS, getLevel } from '../src/games/magnetic-garden/model/levels.js';
import { applyAction, createState, getSeedDirection, legalActions, stateKey, validateLevel } from '../src/games/magnetic-garden/model/rules.js';
import { solveLevel } from '../src/games/magnetic-garden/model/solver.js';

assert.equal(LEVELS.length, 24);
assert.equal(new Set(LEVELS.map(level => level.id)).size, 24);
assert.deepEqual(CHAPTERS.map(chapter => chapter.id), ['greenhouse', 'twins', 'stonepath', 'aurora']);
const expectedPars = [[1, 1, 2, 3, 4, 5], [4, 5, 5, 6, 8, 8], [5, 6, 7, 7, 8, 9], [5, 6, 7, 8, 8, 9]];
let capturedBrakes = 0;
let seedBrakes = 0;
let initialInterference = 0;
let totalVisited = 0;
let tripleLevels = 0;
for (const [chapterIndex, chapter] of CHAPTERS.entries()) {
    const levels = LEVELS.filter(level => level.chapter === chapter.id);
    assert.equal(levels.length, 6);
    assert.deepEqual(chapter.levelIds, levels.map(level => level.id));
    assert.deepEqual(levels.map(level => level.par), expectedPars[chapterIndex]);
    assert.ok(chapter.title.en && chapter.title.zh && chapter.description.en && chapter.description.zh);
}
for (const [index, level] of LEVELS.entries()) {
    const label = level.id;
    assert.equal(getLevel(label), level);
    assert.deepEqual(validateLevel(level), [], label);
    assert.equal(level.number, index + 1, label);
    assert.equal(level.version, 1, label);
    assert.ok(level.title.en && level.title.zh && level.hint.en && level.hint.zh, label);
    assert.equal(level.excellent, level.par + 2, label);
    assert.equal(level.solution.length, level.par, label);
    if (level.seeds.length === 3) tripleLevels++;
    let state = createState(level);
    const original = JSON.stringify(level);
    const usedMagnets = new Set();
    if (level.magnets.length === 2 && state.seeds.some(seed => {
        const aligned = state.magnets.filter(m => m.cell % level.width === seed.cell % level.width || Math.floor(m.cell / level.width) === Math.floor(seed.cell / level.width));
        return aligned.length === 2 && getSeedDirection(level, state, seed) === null;
    })) initialInterference++;
    for (const action of level.solution) {
        usedMagnets.add(action.magnetId);
        assert.ok(legalActions(level, state).some(candidate => JSON.stringify(candidate) === JSON.stringify(action)), label);
        const snapshot = JSON.stringify(state);
        const result = applyAction(level, state, action);
        assert.equal(result.valid, true, label);
        assert.equal(JSON.stringify(state), snapshot, `${label}: immutable input`);
        assert.equal(result.state.moves, state.moves + 1, label);
        const reversed = { ...state, seeds: [...state.seeds].reverse(), magnets: [...state.magnets].reverse() };
        const permutation = applyAction(level, reversed, action);
        assert.equal(stateKey(result.state), stateKey(permutation.state), `${label}: permutation invariant`);
        assert.equal(result.frames.length, permutation.frames.length, label);
        const afterAction = { ...state, magnets: result.state.magnets };
        for (const current of result.state.seeds) {
            const previous = state.seeds.find(seed => seed.id === current.id);
            if (previous.captured) assert.deepEqual(current, previous, `${label}: capture permanent`);
            if (current.captured) continue;
            const direction = getSeedDirection(level, afterAction, previous);
            if (!direction) continue;
            const target = current.cell + direction[0] + direction[1] * level.width;
            const brake = result.state.seeds.find(seed => seed.id !== current.id && seed.cell === target);
            if (brake) {
                seedBrakes++;
                if (brake.captured) capturedBrakes++;
            }
        }
        state = result.state;
    }
    assert.equal(JSON.stringify(level), original, `${label}: immutable content`);
    assert.equal(state.won, true, label);
    assert.equal(state.moves, level.par, label);
    assert.ok(state.seeds.every(seed => seed.captured && level.pots.includes(seed.cell)), label);
    assert.equal(new Set(state.seeds.map(seed => seed.cell)).size, state.seeds.length, label);
    if (level.magnets.length === 2) assert.equal(usedMagnets.size, 2, `${label}: both magnets matter in proof`);
    if (level.chapter === 'stonepath') {
        const withoutStones = solveLevel({ ...level, stones: [] }, { maxStates: 10000 });
        assert.equal(withoutStones.status, 'solved', `${label}: obstacle comparison`);
        assert.notEqual(withoutStones.depth, level.par, `${label}: stones play a necessary strategic role`);
    }
    const proof = solveLevel(level, { maxStates: 100000 });
    assert.equal(proof.status, 'solved', label);
    assert.equal(proof.depth, level.par, `${label}: shortest-path proof`);
    assert.equal(proof.visited, level.proof.visited, `${label}: stable proof fingerprint`);
    assert.deepEqual(proof.solution, level.solution, `${label}: runtime and offline solver agree`);
    totalVisited += proof.visited;
}
assert.ok(initialInterference >= 1, 'Two-magnet chapter teaches interference');
assert.ok(seedBrakes >= 5, 'Multiple authored routes use occupied-seed blocking');
assert.ok(capturedBrakes >= 3, 'Captured flowers have a strategic blocking role');
assert.equal(tripleLevels, 3, 'Three final-chapter routes coordinate three seeds');
assert.equal(getLevel('missing'), undefined);
execFileSync(process.execPath, ['tools/generators/magnetic-garden-levels.mjs', '--check'], { cwd: new URL('..', import.meta.url), stdio: 'pipe' });
console.log(`✓ Magnetic Garden: 24 bilingual levels, optimal BFS proofs (${totalVisited} visited), solution replays and content drift`);
