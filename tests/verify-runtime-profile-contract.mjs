#!/usr/bin/env node
/** Opt-in profiler contracts; no browser, network, sample timing, or CI FPS gate. */
import assert from 'node:assert/strict';
import { registry } from './lib/registry.mjs';
import { SCENARIOS, validateScenarioCoverage, checkSceneState } from '../tools/lib/runtime-profile/scenarios.mjs';
import { percentile, metricMap, metricDelta, summarizeWindow } from '../tools/lib/runtime-profile/metrics.mjs';
import { reportSummary, renderMarkdown, summarizeRepeatRows } from '../tools/lib/runtime-profile/report.mjs';
import { chooseNeedleDirection, captureInputSample, validateHeldAnchorProgress } from '../tools/lib/runtime-profile/interaction.mjs';
import { parseArgs, VIEWPORTS } from '../tools/lib/runtime-profile/options.mjs';

const games = registry.all();
assert.ok(games.length > 0, 'registry must supply games');
assert.deepEqual(validateScenarioCoverage(games), games.map(g => g.id));
assert.throws(() => validateScenarioCoverage(games, Object.fromEntries(Object.entries(SCENARIOS).slice(1))), /missing=/);
assert.throws(() => validateScenarioCoverage(games.slice(0, -1)), /stale=/);
assert.throws(() => validateScenarioCoverage([...games, games[0]]), /duplicate=/);
assert.throws(() => validateScenarioCoverage(games, { ...SCENARIOS, tetris: { start: { kind: 'test-hook' } } }), /incomplete/);
assert.throws(() => validateScenarioCoverage(games, { ...SCENARIOS, tetris: { ...SCENARIOS.tetris, owner: null,
    start: { kind: 'test-hook', method: 'start' } } }), /test-hook owner/);

const root = {
    game: { state: 'playing', paused: false, method() { return { active: true }; }, owner: { isHeld() { return true; } } },
    document: { querySelector: () => ({ width: 100, height: 100, getBoundingClientRect: () => ({ width: 40 }) }) },
};
assert.deepEqual(SCENARIOS.tetris.start, { kind: 'visible-choice', selectors: ['#mobileStartBtn', '#startBtn'] },
    'Tetris has a separate mobile start button hidden from desktop controls');
assert.equal(checkSceneState({ owner: 'game', path: 'state', equals: 'playing' }, root), true);
assert.equal(checkSceneState({ owner: 'game', path: 'method().active', truthy: true }, root), true);
assert.equal(checkSceneState({ owner: 'game', path: 'owner.isHeld()', equals: true }, root), true);
assert.equal(checkSceneState({ owner: 'game', path: 'paused', equals: false }, root), true);
assert.equal(checkSceneState({ owner: 'game', path: 'state', notEquals: 'menu' }, root), true);
assert.equal(checkSceneState({ owner: 'game', path: 'absent', notEquals: 'menu' }, root), false);
assert.equal(checkSceneState({ kind: 'all', conditions: [
    { owner: 'game', path: 'state', equals: 'playing' },
    { owner: 'game', path: 'paused', equals: false },
] }, root), true);
assert.equal(checkSceneState({ kind: 'canvas', selector: '#board' }, root), true);
assert.equal(checkSceneState({ kind: 'canvas', selector: '#board' }, { document: { querySelector: () => null } }), false);
assert.equal(SCENARIOS['tank-battle'].noMenu, true, 'tank battle auto-start must not be called a menu');
const levelGame = { lmGame: { state: 'playing', isPaused: true, isRunning() { return this.state === 'playing' && !this.isPaused; } } };
assert.equal(checkSceneState(SCENARIOS.lumen.active, levelGame), false, 'a quietly paused level game must not count as active');
levelGame.lmGame.isPaused = false;
assert.equal(checkSceneState(SCENARIOS.lumen.active, levelGame), true);
assert.equal(SCENARIOS['silk-dew'].profileInput.kind, 'held-anchor');
assert.equal(SCENARIOS['needle-awn'].profileInput.kind, 'survival-lane');
assert.deepEqual(SCENARIOS['needle-awn'].start, { kind: 'click', selector: '#na-btn-endless' },
    'Needle Awn must enter a real endless run through its visible mode button');
assert.equal(SCENARIOS['needle-awn'].restart.method, 'startEndlessMode');
assert.throws(() => validateScenarioCoverage(games, {
    ...SCENARIOS, 'silk-dew': { ...SCENARIOS['silk-dew'], profileInput: { kind: 'unknown', cadenceMs: 250 } },
}), /invalid input contract/);
assert.deepEqual(chooseNeedleDirection({ x: 240, y: 460 }, 0), { x: 0, y: 1 });
assert.deepEqual(chooseNeedleDirection({ x: 70, y: 610 }, 0), { x: 1, y: 0 });
assert.deepEqual(chooseNeedleDirection({ x: 420, y: 610 }, 0), { x: -1, y: 0 });
assert.throws(() => chooseNeedleDirection(null, 0), /position unavailable/);
assert.deepEqual(SCENARIOS['sword-flight'].start.args, ['zen'],
    'Sword Flight baseline needs a run that survives unattended sampling');
assert.deepEqual(SCENARIOS['sword-flight'].restart.args, ['zen']);
assert.deepEqual(SCENARIOS['planet-merge'].start.args, ['endless'], 'Planet Merge must start the UI endless mode, never mode=undefined');
assert.deepEqual(SCENARIOS['planet-merge'].restart.args, ['endless']);
const tetris = { game: { currentPiece: {}, animationId: null, paused: false, gameOver: false } };
assert.equal(checkSceneState(SCENARIOS.tetris.active, tetris), false,
    'the Tetris piece exists at boot but no animation runs until Start');
tetris.game.animationId = 111;
assert.equal(checkSceneState(SCENARIOS.tetris.active, tetris), true);
tetris.game.paused = true;
assert.equal(checkSceneState(SCENARIOS.tetris.active, tetris), false);

assert.equal(percentile([], 95), null);
assert.equal(percentile([10, 20, 30], 50), 20);
assert.equal(percentile([10, 20, 30], 95), 29);
assert.equal(percentile([NaN, 10, 30], 50), 20);
assert.throws(() => percentile([1], 101), /invalid percentile/);
assert.deepEqual(metricMap({ metrics: [{ name: 'TaskDuration', value: 1.3 }, { name: 'Missing', value: NaN }] }), { TaskDuration: 1.3 });
assert.equal(metricDelta({ TaskDuration: 1 }, { TaskDuration: 1.25 }, 'TaskDuration'), 250);
assert.equal(metricDelta({ TaskDuration: 3 }, { TaskDuration: 1 }, 'TaskDuration'), null);
assert.equal(metricDelta({}, {}, 'TaskDuration'), null);
const m = summarizeWindow({
    before: { TaskDuration: 1, JSHeapUsedSize: 3000 },
    after: { TaskDuration: 1.2, JSHeapUsedSize: 5000 },
    observation: { durationMs: 2000, rafTimes: [100, 116, 132, 200], longTasks: [52, 75], longTaskSupported: true },
    domBefore: { nodes: 300 }, domAfter: { nodes: 305 }, sampleRaf: true,
});
assert.equal(m.rafIntervalCount, 3);
assert.equal(m.rafOver50Ms, 1);
assert.equal(m.longTaskCount, 2);
assert.equal(m.longTaskTotalMs, 127);
assert.equal(m.heapDeltaBytes, 2000);
assert.equal(m.domNodeEnd, 305);
assert.ok(Math.abs(m.taskTimeMs - 200) < 1e-6);
assert.equal(m.renderFps, null, 'an rAF probe must never be labelled actual render FPS');
const idle = summarizeWindow({ sampleRaf: false, observation: { rafTimes: [1, 2], longTaskSupported: false } });
assert.equal(idle.rafIntervalCount, null, 'menu idle is not sampled with a synthetic rAF loop');
assert.equal(idle.longTaskCount, null, 'unsupported metrics are N/A, never an invented zero');

const expected = [{ game: 'tetris', viewport: 'mobile', repeat: 1 }];
const measured = { ...expected[0], startPath: 'UI click #startBtn', status: 'measured', phases: { active: { metrics: m } } };
assert.equal(reportSummary([measured], expected).complete, true);
assert.equal(reportSummary([], expected).complete, false);
assert.equal(reportSummary([{ ...measured, status: 'incomplete', error: 'did not enter play' }], expected).complete, false);
assert.equal(reportSummary([measured, measured], expected).complete, false);
assert.equal(reportSummary([measured, { ...measured, game: 'unknown' }], expected).complete, false);
const markdown = renderMarkdown({
    meta: { commit: 'a'.repeat(40), source: 'dist', sourceRoot: '/tmp/dist', browserVersion: 'Chrome',
        os: 'linux', cpu: 'CI', cpuCount: 2, browserFlags: ['--disable-gpu'], gpuMode: 'disabled',
        preset: 'quick', repeat: 1 },
    summary: reportSummary([measured], expected), results: [measured],
});
assert.ok(markdown.includes('Runtime Performance Audit') && markdown.includes('not') && markdown.includes('actual game rendering FPS'));
assert.ok(markdown.includes('exploratory'), 'single-run reports must not claim a confirmed baseline');
const repeated = [1, 2, 3].map((repeat, i) => ({
    ...measured, repeat, workload: 'held-anchor S1',
    phases: { active: { metrics: { ...m, rafIntervalP95Ms: 30 + 10 * i, taskTimeMs: 100 + 20 * i,
        longTaskCount: i } , input: { kind: 'held-anchor', api: 'test-only DOM PointerEvent (emulated mobile viewport)', steps: 20 } } },
}));
const aggregate = summarizeRepeatRows(repeated);
assert.equal(aggregate.length, 1);
assert.equal(aggregate[0].rafP95.n, 3);
assert.equal(aggregate[0].rafP95.median, 40);
assert.equal(aggregate[0].rafP95.min, 30);
assert.equal(aggregate[0].rafP95.max, 50);
assert.equal(aggregate[0].taskTime.median, 120);
assert.equal(aggregate[0].tasks.median, 1);
assert.equal(summarizeRepeatRows([repeated[0], { ...repeated[1], workload: 'different mode' }]).length, 2,
    'unlike workloads must never be averaged together');
assert.equal(summarizeRepeatRows([
    repeated[0],
    { ...repeated[1], phases: {
        active: { metrics: m, input: { kind: 'held-anchor', api: 'Puppeteer pointer' } },
    } },
]).length, 2, 'synthetic mobile and genuine desktop input are different recipes');
assert.equal(summarizeRepeatRows([repeated[0], { ...repeated[1], status: 'incomplete' }])[0].runs, 1,
    'incomplete measurements must never contaminate medians');
const repeatedMarkdown = renderMarkdown({
    meta: { commit: 'b'.repeat(40), source: 'dist', sourceRoot: '/tmp/dist',
        browserVersion: 'Chrome', os: 'linux', cpu: 'CI', cpuCount: 2,
        browserFlags: ['--disable-gpu'], gpuMode: 'disabled', preset: 'baseline', repeat: 3 },
    results: repeated, summary: reportSummary(repeated, repeated.map(({ game, viewport, repeat }) => ({
        game, viewport, repeat,
    }))),
});
assert.match(repeatedMarkdown, /repeat-confirmed/);
assert.match(repeatedMarkdown, /40\.0/);
assert.match(repeatedMarkdown, /test-only synthetic DOM PointerEvent/,
    'artifact report must disclose synthetic mobile input rather than claiming physical touch');

// A world that was already at t>0 before holding the anchor may now be frozen.
// The diagnostic must compare times around the sampled interval, not merely t>0.
const validHeldEvidence = { playing: true, held: true, drags: 1, worldTime: 8.5 };
const progress = validateHeldAnchorProgress(6, validHeldEvidence, 1, 4);
assert.equal(progress.worldTimeAdvanceSeconds, 2.5);
assert.equal(progress.holdTickCount, 4);
assert.throws(() => validateHeldAnchorProgress(8.5, validHeldEvidence, 1, 4), /did not advance/,
    'a stalled simulation with a positive pre-existing world clock must be rejected');
assert.throws(() => validateHeldAnchorProgress(9, validHeldEvidence, 1, 4), /did not advance/,
    'a reset or backward world clock cannot prove the sampled game advanced');
assert.throws(() => validateHeldAnchorProgress(NaN, validHeldEvidence, 1, 4), /did not advance/);
assert.throws(() => validateHeldAnchorProgress(6, { ...validHeldEvidence, worldTime: NaN }, 1, 4), /did not advance/);
assert.throws(() => validateHeldAnchorProgress(6, { ...validHeldEvidence, held: false }, 1, 4), /invalid/);
assert.throws(() => validateHeldAnchorProgress(6, { ...validHeldEvidence, playing: false }, 1, 4), /invalid/);
assert.throws(() => validateHeldAnchorProgress(6, { ...validHeldEvidence, drags: 0 }, 1, 4), /invalid/);
assert.throws(() => validateHeldAnchorProgress(6, validHeldEvidence, 1, 0), /invalid/);

/** Deterministic cancellation/lease tests: input must be released even on failure. */
const fakeDriver = (failSample = false) => {
    let seenTick;
    const tickObserved = new Promise(resolve => { seenTick = resolve; });
    const driver = { active: false, stopped: 0, steps: 0, api: 'fake trusted input',
        async start() { this.active = true; },
        async tick() { this.steps++; seenTick(); },
        async inspect() { return { movementDistance: 25 }; },
        async stop() { this.active = false; this.stopped++; } };
    const sample = async () => {
        await tickObserved; // no timer-based assertion: waits for an actual input step
        if (failSample) throw new Error('sample failure');
        return { taskTimeMs: 25 };
    };
    return { driver, sample };
};
const okDriver = fakeDriver();
const captured = await captureInputSample(okDriver.driver,
    { kind: 'survival-lane', cadenceMs: 1 }, okDriver.sample, 'endless');
assert.equal(captured.input.kind, 'survival-lane');
assert.equal(captured.input.workload, 'endless');
assert.equal(captured.metrics.taskTimeMs, 25);
assert.equal(okDriver.driver.stopped, 1);
const badDriver = fakeDriver(true);
await assert.rejects(() => captureInputSample(badDriver.driver,
    { kind: 'held-anchor', cadenceMs: 1 }, badDriver.sample), /sample failure/);
assert.equal(badDriver.driver.stopped, 1, 'failed sample must release held controls');


for (const tag of ['mobile', 'small']) {
    for (const game of games) {
        const vp = VIEWPORTS[tag](game);
        const wantsLandscape = SCENARIOS[game.id].viewport === 'landscape';
        assert.equal(vp.width > vp.height, wantsLandscape,
            `${game.id}@${tag} must match its scenario orientation (rotate overlays block portrait)`);
    }
}
assert.equal(parseArgs(['--all']).games.length, games.length);
assert.deepEqual(parseArgs(['--games=tetris,word-daily', '--viewports=desktop', '--repeat=1']).games, ['tetris', 'word-daily']);
assert.throws(() => parseArgs([]), /choose exactly one/);
assert.throws(() => parseArgs(['--all', '--games=tetris']), /choose exactly one/);
assert.throws(() => parseArgs(['--games=unknown']), /invalid or duplicated/);
assert.throws(() => parseArgs(['--games=tetris,tetris']), /invalid or duplicated/);
assert.throws(() => parseArgs(['--all', '--preset=other']), /unknown preset/);
assert.throws(() => parseArgs(['--all', '--repeat=0']), /--repeat/);
assert.throws(() => parseArgs(['--all', '--viewports=bogus']), /invalid or duplicated/);
assert.throws(() => parseArgs(['--all', '--source=bogus']), /--source/);
assert.throws(() => parseArgs(['--all', '--unexpected=x']), /unknown option/);
assert.throws(() => parseArgs(['--all', '--out=..']), /--out must be/);
assert.throws(() => parseArgs(['--all', '--out=.']), /--out must be/);
assert.throws(() => parseArgs(['--all', '--out=/definitely-outside-repo']), /--out must be/);
assert.ok(parseArgs(['--all', '--out=.tmp-perf/contract']).out.endsWith('contract'));
console.log('PASS PR #138 profile scenarios, input ownership, frozen-world protection, repeat medians, invalidation and CLI contracts');
