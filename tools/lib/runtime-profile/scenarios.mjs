/**
 * PR #136: test-only adapters. The registry owns *membership*; this table owns
 * the independently reviewed way to enter and recognise a real playable run.
 * Do not add these debug/test hooks to production code or games.config.json.
 */
import { registry } from '../registry.mjs';

const state = (owner, path, equals = 'playing') => ({ owner, path, equals });
const truthy = (owner, path) => ({ owner, path, truthy: true });
const call = (method, ...args) => ({ kind: 'test-hook', method, args });
const click = selector => ({ kind: 'click', selector });
const auto = () => ({ kind: 'already-active' });
// Level runtimes keep state === 'playing' while pauseQuiet() sets isPaused; isRunning() covers both.
const level = (owner, method = 'startLevel', arg = 0) => ({ owner, start: call(method, arg), restart: call(method, arg), ready: truthy(owner, 'state'), active: truthy(owner, 'isRunning()') });

// The 16 shared-drawer starts come from tests/verify-stats-drawer.mjs. They
// intentionally do not mutate difficulty, scores, or the deterministic clock.
// A hook is labelled test-hook in every result: never call it a UI click.
export const SCENARIOS = Object.freeze({
    'math-rain': {
        owner: 'mathRainGame', start: click('#start-game-btn'),
        ready: truthy('mathRainGame', 'gameStateManager'),
        active: state('mathRainGame', 'gameStateManager.getState().gameState'),
        activity: 'continuous',
    },
    'tetris': {
        owner: 'game', start: { kind: 'visible-choice', selectors: ['#mobileStartBtn', '#startBtn'] },
        ready: truthy('game', 'canvas'), active: { kind: 'all', conditions: [
            truthy('game', 'animationId'), { owner: 'game', path: 'paused', equals: false },
            { owner: 'game', path: 'gameOver', equals: false },
        ] },
        restart: call('restart'), activity: 'continuous',
    },
    'tank-battle': {
        owner: 'tankBattleInstance', start: auto(), noMenu: true,
        ready: truthy('tankBattleInstance', 'art.ready'),
        active: state('tankBattleInstance', 'gameState'),
        activity: 'continuous', viewport: 'landscape',
    },
    'gomoku': {
        start: { kind: 'canvas-click', selector: '#gameBoard', x: 0.5, y: 0.5 }, noMenu: true,
        ready: { kind: 'canvas', selector: '#gameBoard' },
        active: { kind: 'canvas', selector: '#gameBoard' },
        activity: 'discrete',
    },
    'planet-merge': {
        owner: 'planetMergeGame', start: call('startGame', 'endless'), restart: call('startGame', 'endless'),
        ready: truthy('planetMergeGame', 'state'), active: state('planetMergeGame', 'state'),
        activity: 'continuous',
    },
    'word-daily': {
        owner: 'wordDailyGame', start: auto(), noMenu: true,
        ready: truthy('wordDailyGame', 'el'),
        active: state('wordDailyGame', 'status'),
        interaction: { kind: 'type', selector: '#wd-input', text: 'a', verify: truthy('wordDailyGame', 'current') },
        activity: 'discrete',
    },
    'hoop-shot': {
        owner: 'hoopShotGame', start: call('startGame'), restart: call('startGame'),
        ready: truthy('hoopShotGame', 'state'), active: state('hoopShotGame', 'state'),
        activity: 'continuous',
    },
    'minesweeper': {
        owner: 'msGame', start: { kind: 'sequence', actions: [click('#ms-btn-play'), click('#ms-board .ms-cell:nth-child(20)')] },
        ready: truthy('msGame', 'boardEl'), active: state('msGame', 'state'),
        activity: 'discrete',
    },
    'reversi': {
        owner: 'rvGame', start: click('#rv-btn-play'),
        ready: truthy('rvGame', 'boardEl'), active: state('rvGame', 'state'),
        interaction: { kind: 'click', selector: '#rv-board .rv-cell:nth-child(20)', verify: state('rvGame', 'board.19', 1) },
        activity: 'discrete',
    },
    'tower-defense': {
        owner: 'tdGame', start: click('#td-btn-play'),
        ready: { owner: 'tdGame', path: 'artStatus', notEquals: 'loading' },
        active: state('tdGame', 'state'),
        activity: 'continuous', viewport: 'landscape',
    },
    'gravity-slingshot': {
        owner: 'gdGame', start: call('startLevelMode', 0), restart: call('startLevelMode', 0),
        ready: truthy('gdGame', 'phase'),
        active: { kind: 'all', conditions: [
            { owner: 'gdGame', path: 'phase', notEquals: 'menu' },
            { owner: 'gdGame', path: 'isPaused', equals: false },
        ] }, activity: 'simulation',
    },
    'needle-awn': {
        owner: 'gameEngine', start: click('#na-btn-endless'), restart: call('startEndlessMode'),
        ready: truthy('gameEngine', 'artReady'), active: truthy('gameEngine', 'isRunning()'),
        activity: 'continuous', workload: 'endless wave survival',
        profileInput: { kind: 'survival-lane', cadenceMs: 250 },
    },
    // Zen (the menu's meditation flight) takes no damage, so an unattended run
    // stays active through the whole active/pause/resume baseline; idle endless
    // dies inside the 15s window. Zen spawns fewer hazards than endless.
    'sword-flight': {
        owner: 'game', start: call('startFlight', 'zen'), restart: call('startFlight', 'zen'),
        ready: truthy('game', 'canvas'),
        active: { kind: 'all', conditions: [
            truthy('game', 'isPlaying'),
            { owner: 'game', path: 'isPaused', equals: false },
        ] }, activity: 'continuous',
    },
    'lumen': { ...level('lmGame'), activity: 'simulation' },
    'circuit': { ...level('ccGame'), activity: 'simulation' },
    'silk-dew': {
        ...level('sdGame'), activity: 'simulation', workload: 'S1 held-anchor rope physics',
        profileInput: { kind: 'held-anchor', cadenceMs: 300 },
    },
    'bond-forge': { ...level('bfGame'), activity: 'simulation' },
    'echo-cave': { ...level('ecGame'), activity: 'simulation' },
    'maxwell-demon': { ...level('mdGame'), activity: 'simulation' },
    'crystal-bloom': { ...level('cbGame'), activity: 'simulation' },
    'flame-verse': { ...level('fvGame'), activity: 'simulation' },
    'ripple-duet': { ...level('rdGame'), activity: 'simulation' },
    'carrot-pull': {
        owner: 'cpGame', start: click('#cp-start-btn'),
        ready: truthy('cpGame', 'state'),
        active: truthy('cpGame', 'isRunning()'), activity: 'continuous',
    },
    'firefly-signal': {
        owner: '__fireflySignal', start: click('#fs-level-list .fs-level-btn'),
        ready: truthy('__fireflySignal', 'state'),
        active: state('__fireflySignal', 'state'), activity: 'continuous',
    },
    'shadow-loom': {
        owner: 'slGame', start: click('#sl-level-grid .sl-chip'), restart: call('startLevel', 0),
        ready: truthy('slGame', 'state'),
        active: truthy('slGame', 'isRunning()'), activity: 'simulation',
    },
    // The pen only enters the field on the first pointer input, so an unattended run
    // (monsters wandering, nothing drawn) survives the whole baseline. Start through the
    // hook, not a click: a synthetic mousemove after the menu hides would place the pen
    // under the cursor and let dashers end the run mid-sample.
    'loop-jail': {
        owner: 'ljGame', start: call('start'), restart: call('start'),
        ready: truthy('ljGame', 'el'),
        active: truthy('ljGame', 'isRunning()'), activity: 'continuous',
    },
    // The board itself is discrete, but the mist layer drifts on rAF for the whole
    // unpaused round, so the round is profiled as a continuous loop.
    'sudoku-mist': {
        owner: 'smGame', start: click('#sm-level-thin-1'), restart: call('startLevel', 0),
        ready: truthy('smGame', 'el'),
        active: truthy('smGame', 'isRunning()'), activity: 'continuous',
    },
});

export function validateScenarioCoverage(games = registry.all(), scenarios = SCENARIOS) {
    const ids = games.map(game => game.id);
    const missing = ids.filter(id => !Object.hasOwn(scenarios, id));
    const stale = Object.keys(scenarios).filter(id => !ids.includes(id));
    const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (missing.length || stale.length || duplicates.length) {
        throw new Error(`Runtime profile coverage: missing=${missing.join(',') || '-'} stale=${stale.join(',') || '-'} duplicate=${duplicates.join(',') || '-'}`);
    }
    for (const [id, spec] of Object.entries(scenarios)) {
        if (!spec || !spec.start || !spec.ready || !spec.active) {
            throw new Error(`Runtime profile scenario incomplete: ${id}`);
        }
        if (spec.start.kind === 'test-hook' && !spec.owner) {
            throw new Error(`Runtime profile missing test-hook owner: ${id}`);
        }
        if (!['continuous', 'simulation', 'discrete'].includes(spec.activity)) {
            throw new Error(`Runtime profile invalid activity class: ${id}`);
        }
        if (spec.profileInput && (!['held-anchor', 'survival-lane'].includes(spec.profileInput.kind)
            || !Number.isInteger(spec.profileInput.cadenceMs) || spec.profileInput.cadenceMs < 100
            || !spec.workload)) {
            throw new Error(`Runtime profile invalid input contract: ${id}`);
        }
    }
    return ids;
}

/** Pure predicate used by tests and by page.evaluate (no source-string eval). */
export function checkSceneState(spec, root = globalThis) {
    if (spec.kind === 'all') return spec.conditions.every(part => checkSceneState(part, root));
    if (spec.kind === 'canvas') {
        const el = root.document?.querySelector(spec.selector);
        return !!el && el.width > 0 && el.height > 0 && el.getBoundingClientRect().width > 0;
    }
    const obj = root[spec.owner];
    const value = spec.path.split('.').reduce((current, key) => {
        if (current == null) return undefined;
        return key.endsWith('()')
            ? (typeof current[key.slice(0, -2)] === 'function'
                ? current[key.slice(0, -2)]() : undefined)
            : current[key];
    }, obj);
    if ('equals' in spec) return value === spec.equals;
    if ('notEquals' in spec) return value !== undefined && value !== spec.notEquals;
    if (spec.truthy) return Boolean(value);
    throw new Error('Unrecognised profile state predicate');
}
