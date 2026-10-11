#!/usr/bin/env node
// All shared statistics drawers must participate in one interruption owner.
// This gate closes the registry coverage and tests deterministic lease ordering;
// verify-stats-drawer.mjs runs the real browser interaction sequences.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bindDrawerPauseOwnership } from '../src/platform/runtime/pause-ownership.js';
import { registry } from './lib/registry.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(join(root, path), 'utf8');
const migrated = [
    'planet-merge', 'hoop-shot', 'gravity-slingshot', 'sword-flight',
    'lumen', 'circuit', 'silk-dew', 'bond-forge', 'echo-cave',
    'maxwell-demon', 'crystal-bloom', 'flame-verse', 'ripple-duet',
];
const existing = ['carrot-pull', 'needle-awn', 'shadow-loom'];
const actual = registry.withCap('drawer').map(g => g.id).sort();
assert.deepEqual(actual, [...migrated, ...existing, 'tetris'].sort(),
    'all sixteen shared drawers and the dedicated Tetris drawer are accounted for');

const manualForeground = new Set(['planet-merge', 'hoop-shot', 'sword-flight']);
for (const id of migrated) {
    const index = read('src/games/' + id + '/index.js');
    assert.match(index, /bindDrawerPauseOwnership\(game,/, id);
    assert.match(index, /onAcquire: interruptions\.onAcquire/, id);
    assert.match(index, /onRelease: interruptions\.onRelease/, id);
    assert.doesNotMatch(index, /onPause:|onResume:/, id + ' cannot retain legacy pause flags');
    assert.ok(index.includes('autoResumeOnForeground: ' + !manualForeground.has(id) + ','),
        id + ' has explicit foreground policy');
    const transition = id === 'sword-flight'
        ? read('src/games/sword-flight/model/run-state.js')
        : read('src/games/' + id + '/runtime.js');
    assert.match(transition, /pauseOwnership\?\.invalidate\(\)/,
        id + ' must invalidate ownership when replacing gameplay');
}
for (const id of existing) {
    const index = read('src/games/' + id + '/index.js');
    assert.match(index, /onAcquire:/);
    assert.match(index, /onRelease:/);
}
assert.doesNotMatch(read('src/games/sword-flight/input/keyboard.js'),
    /visibilitychange/, 'Sword Flight must not have a second visibility listener');
for (const id of ['planet-merge', 'hoop-shot', 'gravity-slingshot']) {
    assert.doesNotMatch(read('src/games/' + id + '/runtime.js'),
        /visibilitychange/, id + ' must use one shared visibility owner');
}

const previous = globalThis.document;
const fakeDocument = new globalThis.EventTarget();
let hidden = false;
Object.defineProperty(fakeDocument, 'hidden', { get: () => hidden });
globalThis.document = fakeDocument;
try {
    for (const autoResumeOnForeground of [true, false]) {
        const game = {
            state: 'playing', paused: false, pauses: 0, resumes: 0,
            isRunning() { return this.state === 'playing' && !this.paused; },
            pauseQuiet() { this.paused = true; this.pauses++; },
            resumeQuiet() { this.paused = false; this.resumes++; },
        };
        let hiddenCalls = 0;
        const drawer = bindDrawerPauseOwnership(game, {
            canResume: g => g.state === 'playing' && g.paused,
            autoResumeOnForeground,
            onHidden: () => { hiddenCalls++; },
        });
        drawer.onAcquire();
        assert.equal(game.pauses, 1);
        hidden = true;
        fakeDocument.dispatchEvent(new Event('visibilitychange'));
        drawer.onRelease();
        assert.equal(game.resumes, 0, 'drawer must not resume a hidden game');
        hidden = false;
        fakeDocument.dispatchEvent(new Event('visibilitychange'));
        assert.equal(game.resumes, autoResumeOnForeground ? 1 : 0,
            'foreground policy must not be inferred from generic game state');
        assert.equal(hiddenCalls, 1);
        if (!autoResumeOnForeground) game.resumeQuiet();
        game.pauseQuiet(); // manual pause
        drawer.onAcquire();
        drawer.onRelease();
        assert.equal(game.paused, true, 'manual pause cannot be stolen');
        game.resumeQuiet();
        drawer.onAcquire();
        game.paused = false; // replacement run starting behind an active drawer
        game.pauseOwnership.invalidate();
        assert.equal(game.paused, true, 'replacement must stop immediately');
        drawer.onRelease();
        assert.equal(game.paused, true, 'old lease cannot resume replacement');
        drawer.dispose();
        assert.equal(game.pauseOwnership.isHeld(), false);
    }
} finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
}
console.log('PASS PR #134 shared-drawer interruption ownership');
