#!/usr/bin/env node
// PR #133: interruption leases must never turn a temporary pause into
// permission to resume a user's pause, hidden page, or different run.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPauseOwnership, bindPageVisibility } from '../src/platform/runtime/pause-ownership.js';
import { registry } from './lib/registry.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFileSync(join(ROOT, file), 'utf8');
const expected = ['carrot-pull', 'firefly-signal', 'loop-jail', 'magnetic-garden', 'math-rain', 'needle-awn', 'shadow-loom', 'tank-battle'];
const actual = registry.withCap('leaderboard').filter(g => g.scores?.ui === 'dialog')
    .map(g => g.id).sort();
assert.deepEqual(actual, expected, 'audit every shared-dialog game when registry changes');

function harness(start = 'playing') {
    const game = { state: start, pauses: 0, resumes: 0, inputs: 0 };
    const owner = createPauseOwnership({
        isRunning: () => game.state === 'playing',
        canResume: () => game.state === 'paused',
        pause: () => { game.state = 'paused'; game.pauses++; },
        resume: () => { game.state = 'playing'; game.resumes++; },
        releaseInputs: () => { game.inputs++; },
    });
    return { game, owner };
}

// Named reasons are idempotent and the last release is the only resume.
{
    const { game, owner } = harness();
    assert.equal(owner.acquire('ranking'), true);
    assert.equal(owner.acquire('ranking'), false);
    owner.acquire('drawer');
    assert.equal(game.pauses, 1);
    owner.release('ranking');
    assert.equal(game.resumes, 0);
    owner.release('drawer');
    assert.equal(game.resumes, 1);
    assert.equal(owner.release('drawer'), false);
    assert.equal(game.resumes, 1);
}
// An already manual-paused game never belongs to a modal.
{
    const { game, owner } = harness('paused');
    owner.acquire('ranking');
    owner.release('ranking');
    assert.equal(game.state, 'paused');
    assert.equal(game.resumes, 0);
}
// Background with manual-resume policy blocks a modal's old resume right
// even when the modal is closed before or after returning to foreground.
for (const firstRelease of ['ranking', 'hidden']) {
    const { game, owner } = harness();
    owner.acquire('ranking');
    owner.acquire('hidden', { autoResume: false });
    owner.release(firstRelease);
    assert.equal(game.state, 'paused');
    owner.release(firstRelease === 'ranking' ? 'hidden' : 'ranking');
    assert.equal(game.state, 'paused');
    assert.equal(game.resumes, 0);
}
// Auto-resuming games must await both the page and UI releases.
{
    const { game, owner } = harness();
    owner.acquire('hidden');
    owner.acquire('ranking');
    owner.release('hidden');
    assert.equal(game.state, 'paused');
    owner.release('ranking');
    assert.equal(game.resumes, 1);
}
// Do not resurrect a previous run after restarting, returning to menu,
// completing, or a programmatic start while a dialog is still displayed.
{
    const { game, owner } = harness();
    owner.acquire('ranking');
    game.state = 'playing'; // new run starts beneath the old modal
    owner.invalidate();
    assert.equal(game.state, 'paused', 'new run cannot run behind active UI');
    owner.release('ranking');
    assert.equal(game.resumes, 0, 'old modal cannot resume the replacement run');
    game.state = 'playing';
    owner.acquire('ranking');
    game.state = 'over';
    owner.invalidate();
    owner.release('ranking');
    assert.equal(game.resumes, 0, 'completed run must stay complete');
}
// An unexpected running state while another owner is held gets paused,
// but never inherits the earlier run's permission to auto-resume.
{
    const { game, owner } = harness();
    owner.acquire('ranking');
    game.state = 'playing';
    owner.acquire('drawer');
    owner.release('ranking');
    owner.release('drawer');
    assert.equal(game.state, 'paused');
    assert.equal(game.resumes, 0);
}
// Browser visibility is an idempotent lease, including initial hidden state.
{
    const previous = globalThis.document;
    const fake = new globalThis.EventTarget();
    let hidden = true;
    Object.defineProperty(fake, 'hidden', { get: () => hidden });
    globalThis.document = fake;
    try {
        const { game, owner } = harness();
        let announcements = 0;
        const unbind = bindPageVisibility(owner, {
            autoResume: true, onHidden: () => { announcements++; },
        });
        assert.equal(owner.isHeld('hidden'), true, 'initially hidden tab acquires a lease');
        assert.equal(game.state, 'paused');
        fake.dispatchEvent(new Event('visibilitychange'));
        assert.equal(game.pauses, 1, 'repeated hidden events do not pause twice');
        owner.acquire('ranking');
        owner.release('ranking');
        assert.equal(game.resumes, 0);
        hidden = false;
        fake.dispatchEvent(new Event('visibilitychange'));
        assert.equal(game.resumes, 1);
        unbind();
        hidden = true;
        fake.dispatchEvent(new Event('visibilitychange'));
        assert.equal(owner.isHeld(), false, 'unbind removed the listener');
        assert.equal(announcements, 2);
    } finally {
        if (previous === undefined) delete globalThis.document;
        else globalThis.document = previous;
    }
}
// The UI callbacks for drawer consumers use leases even when already paused;
// the two games with manual visible-resume and the automatic three are
// explicitly reviewed, never inferred from generic state strings.
const owners = new Map([
    ['carrot-pull', 'src/games/carrot-pull/runtime.js'],
    ['firefly-signal', 'src/games/firefly-signal/index.js'],
    ['loop-jail', 'src/games/loop-jail/runtime.js'],
    ['magnetic-garden', 'src/games/magnetic-garden/runtime.js'],
    ['math-rain', 'src/games/math-rain/index.js'],
    ['needle-awn', 'src/games/needle-awn/runtime.js'],
    ['shadow-loom', 'src/games/shadow-loom/runtime.js'],
    ['tank-battle', 'src/games/tank-battle/index.js'],
]);
for (const [game, file] of owners) {
    // Firefly's page entry owns the leases while the game object owns run
    // transitions; both files are part of one game-level lifecycle contract.
    const source = read(file) + (game === 'firefly-signal'
        ? read('src/games/firefly-signal/game.js') : '');
    assert.match(source, /createPauseOwnership\(/, game + ': missing shared ownership');
    assert.match(source, /bindPageVisibility\(/, game + ': visibility must share ownership');
    assert.match(source, /\.invalidate\(\)/, game + ': run transition invalidation required');
}
for (const game of ['carrot-pull', 'needle-awn', 'shadow-loom']) {
    const entry = read('src/games/' + game + '/index.js');
    assert.match(entry, /onAcquire:/, game + ': drawer must acquire a reason');
    assert.match(entry, /onRelease:/, game + ': drawer must release its reason');
}
// A hidden first load must initialize the menu before acquiring its first
// visibility lease, otherwise toMenu() invalidates the pending resume.
const fireflyEntry = read('src/games/firefly-signal/index.js');
assert.match(fireflyEntry, /game\.toMenu\(\);\s*bindPageVisibility\(game\.pauseOwnership/,
    'Firefly menu initialization must precede initial hidden visibility lease');

// Settings is another resume initiator. It must route through the same
// application event that checks the current leases and visibility.
const mathSettings = read('src/games/math-rain/core/UIController.js');
assert.match(mathSettings, /this\.eventSystem\.emit\('ui:resume:game'\)/,
    'Math Rain settings closure must use the guarded application resume event');
assert.doesNotMatch(mathSettings, /this\.gameStateManager\.resumeGame\(\)/,
    'Settings must not bypass application lifecycle ownership');

console.log('PASS gameplay interruption leases / eight-game integration contract');
