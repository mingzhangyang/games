#!/usr/bin/env node
// Contextual topbar retry: live only during gameplay, never a dead menu action.
// The twelve consumers share one controller and preserve their own game rules.
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { keepPage, exitIfNoPages } from './lib/page-filter.mjs';
import { registry } from './lib/registry.mjs';

const BASE = process.argv.find(arg => arg.startsWith('http')) || 'http://127.0.0.1:8899';
const CASES = {
    'lumen': ['lm', 'lmGame', 'startLevel', 'showMenu'],
    'circuit': ['cc', 'ccGame', 'startLevel', 'showMenu'],
    'silk-dew': ['sd', 'sdGame', 'startLevel', 'toMenu'],
    'echo-cave': ['ec', 'ecGame', 'startLevel', 'toMenu'],
    'bond-forge': ['bf', 'bfGame', 'startLevel', 'toMenu'],
    'flame-verse': ['fv', 'fvGame', 'startLevel', 'toMenu'],
    'ripple-duet': ['rd', 'rdGame', 'startLevel', 'toMenu'],
    'carrot-pull': ['cp', 'cpGame', 'start', null],
    'crystal-bloom': ['cb', 'cbGame', 'startLevel', 'toMenu'],
    'maxwell-demon': ['md', 'mdGame', 'startLevel', 'toMenu'],
    'shadow-loom': ['sl', 'slGame', 'startLevel', 'showMenu'],
    'gravity-slingshot': ['gd', 'gdGame', 'startLevelMode', 'enterMenu'],
};

// Every game with a live R shortcut must route it through the same controller.
// This list is cross-checked against runtime bindings, so new shortcuts cannot
// silently avoid the browser confirmation/pause tests.
const R_SHORTCUT_GAMES = new Set([
    'silk-dew', 'echo-cave', 'flame-verse', 'ripple-duet',
    'crystal-bloom', 'maxwell-demon', 'shadow-loom', 'gravity-slingshot',
]);

// Negative contract: adding an unreviewed topbar reset must not silently pass.
const topbarGames = registry.withCap('topbar').map(g => g.id);
const discovered = topbarGames.filter(id => {
    const html = readFileSync(new URL('../' + id + '.html', import.meta.url), 'utf8');
    return /<button\b[^>]*id="[a-z]{2}-reset-btn"/.test(html);
});
if (JSON.stringify(discovered.sort()) !== JSON.stringify(Object.keys(CASES).sort())) {
    throw new Error('Topbar restart consumers changed without reviewing the contract: '
        + JSON.stringify(discovered));
}
for (const id of Object.keys(CASES)) {
    if (!topbarGames.includes(id)) throw new Error(id + ' is not a topbar page');
    const [pre] = CASES[id];
    const html = readFileSync(new URL('../' + id + '.html', import.meta.url), 'utf8');
    const tags = html.match(new RegExp('<button\\b[^>]*id="' + pre + '-reset-btn"[^>]*>', 'g')) || [];
    if (tags.length !== 1 || !tags[0].includes('data-contextual-restart=')
        || !tags[0].includes(' hidden')) {
        throw new Error(id + ': topbar retry must be initially hidden and explicitly opted in');
    }
    const src = readFileSync(new URL('../src/games/' + id + '/runtime.js', import.meta.url), 'utf8');
    if (!src.includes('bindContextualRestart({')
        || !src.includes("from '../../platform/contextual-restart.js'")) {
        throw new Error(id + ': the shared restart controller is missing');
    }
    const transitions = id === 'carrot-pull'
        ? /\bstate\.(?:mode|paused)\s*=\s*(?:'[^']*'|true|false|paused)\s*;/g
        : id === 'gravity-slingshot'
            ? /\bthis\.(?:phase|isPaused)\s*=\s*(?:'[^']*'|true|false)\s*;/g
            : /\bthis\.(?:state|isPaused)\s*=\s*(?:'[^']*'|true|false)\s*;/g;
    const hasRShortcut = /\b(?:e\.key|k)\s*===\s*['"]r['"]/.test(src);
    if (hasRShortcut !== R_SHORTCUT_GAMES.has(id)
        || (hasRShortcut && !src.includes('this.contextualRestart?.requestRestart()'))) {
        throw new Error(id + ': R shortcut must use the shared controller and have browser coverage');
    }
    const lines = src.split('\n');
    const unsignaled = lines.flatMap((line, index) => {
        if (line.trimStart().startsWith('//')) return [];
        const assignments = [...line.matchAll(transitions)];
        // Constructor transitions are also signaled safely via optional chaining.
        return assignments.length && !line.includes('contextualRestart?.sync()')
            ? [index + 1] : [];
    });
    if (unsignaled.length) {
        throw new Error(id + ': state transitions lack contextual retry sync at '
            + unsignaled.join(', '));
    }
}
// Every destructive restart has an explicit progress owner and matching
// rollback invariant; a new case cannot silently skip its confirmation test.
const PROGRESS = {
    'lumen': 'flips',
    'circuit': 'moves',
    'silk-dew': 'drags',
    'echo-cave': 'world.pulseCount',
    'bond-forge': 'drags',
    'flame-verse': 'throws',
    'ripple-duet': 'cost',
    'carrot-pull': 'pulls',
    'crystal-bloom': 'anchors',
    'maxwell-demon': 'world.spent',
    'shadow-loom': 'moves',
};
const expectedDestructive = Object.keys(CASES).filter(id => id !== 'gravity-slingshot').sort();
if (JSON.stringify(Object.keys(PROGRESS).sort()) !== JSON.stringify(expectedDestructive)) {
    throw new Error('Missing progress test for a destructive topbar restart');
}
const PAGES = Object.keys(CASES).filter(keepPage);
exitIfNoPages(PAGES, 'verify-contextual-restart');

const browser = await puppeteer.launch({
    executablePath: CHROME_PATH, headless: 'new', args: LAUNCH_ARGS,
});
const failures = [];
let count = 0;
const check = (truth, message) => {
    if (truth) count++;
    else failures.push(message);
};
const isHidden = sel => {
    const button = document.querySelector(sel);
    return !!button && button.disabled && getComputedStyle(button).display === 'none';
};
try {
    for (const id of PAGES) {
        const [prefix, global, startMethod, menuMethod] = CASES[id];
        const page = await browser.newPage();
        const selector = '#' + prefix + '-reset-btn';
        const errors = [];
        let phase = 'boot';
        // Native dialogs block page clicks. Keep one always-on handler rather
        // than waiting forever for a dialog that a game may not produce.
        // When a dialog is unexpected, dismiss it and record the regression.
        const dialogs = [];
        let dialogAction = 'dismiss';
        page.on('dialog', async dialog => {
            const action = dialogAction;
            dialogs.push({ message: dialog.message(), action });
            try {
                if (action === 'accept') await dialog.accept();
                else await dialog.dismiss();
            } catch (error) {
                errors.push('dialog handling: ' + error.message);
            }
        });
        const checkpoint = name => {
            phase = name;
            console.log('[contextual-restart] ' + id + ': ' + name);
        };
        page.on('pageerror', err => errors.push(err.message));
        // Default click/evaluate interactions must never wait indefinitely.
        // Test-specific state waits below retain their tighter explicit limits.
        page.setDefaultTimeout(6000);
        page.setDefaultNavigationTimeout(15000);
        await page.setViewport({ width: 390, height: 844 });
        await page.setBypassServiceWorker(true);
        await page.setRequestInterception(true);
        page.on('request', request => {
            if (/^https:\/\/(?:game-scores|games-analytics)\.orangely\.workers\.dev\//.test(request.url())) {
                void request.respond({
                    status: 200,
                    headers: { 'access-control-allow-origin': '*' },
                    contentType: 'application/json',
                    body: '[]',
                });
            } else void request.continue();
        });
        try {
            checkpoint('navigate');
            await page.evaluateOnNewDocument(() => {
                try {
                    localStorage.setItem('site_lang', 'en');
                    localStorage.setItem('site_muted', '1');
                } catch { /* storage unavailable */ }
            });
            await page.goto(BASE + '/' + id + '.html', { waitUntil: 'domcontentloaded', timeout: 15000 });
            await page.waitForFunction(key => !!window[key], { timeout: 15000 }, global);
            checkpoint('menu');
            check(await page.evaluate(isHidden, selector), id + ': reset hidden on menu');
            if (id === 'carrot-pull') {
                await page.waitForFunction(() => ['ready', 'fallback']
                    .includes(document.getElementById('cp-stage')?.dataset.artState), { timeout: 15000 });
            }
            const start = () => page.evaluate(({ key, method }) => window[key][method](0),
                { key: global, method: startMethod });
            await start();
            if (id === 'gravity-slingshot') {
                checkpoint('idle aiming');
                check(await page.evaluate(isHidden, selector),
                    'gravity-slingshot: idle aiming hides its no-op reset');
                const idleKey = await page.evaluate(key => {
                    const g = window[key], before = g.launches;
                    window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'r', bubbles: true }));
                    return { phase: g.phase, launches: g.launches, unchanged: g.launches === before,
                        disabled: document.getElementById('gd-reset-btn').disabled };
                }, global);
                check(idleKey.phase === 'aiming' && idleKey.unchanged && idleKey.disabled,
                    'gravity-slingshot: R cannot reset an untouched shot ' + JSON.stringify(idleKey));
                // A genuine launch makes the contextual action available.
                await page.evaluate(key => window[key].fire(130, -70), global);
            }
            await page.waitForFunction(sel => {
                const b = document.querySelector(sel);
                return b && !b.disabled && getComputedStyle(b).display !== 'none';
            }, { timeout: 4000 }, selector);
            checkpoint('playing');
            const geometry = await page.evaluate(sel => {
                const b = document.querySelector(sel);
                const rect = b.getBoundingClientRect();
                return { label: b.getAttribute('aria-label'), title: b.title, width: rect.width, height: rect.height };
            }, selector);
            check(geometry.label?.length > 4 && geometry.label === geometry.title && !/^Reset$/.test(geometry.label)
                && geometry.width >= 32 && geometry.height >= 32,
            id + ': accessible playing-state action ' + JSON.stringify(geometry));

            if (id === 'shadow-loom') {
                await page.evaluate(() => { window.slGame.elapsed = 0; });
            }
            checkpoint('fresh retry');
            const beforeFreshDialog = dialogs.length;
            if (id === 'carrot-pull') {
                // Even a single animation frame consumes round time, so reset
                // the clock and click atomically before the next frame.
                await page.evaluate(sel => {
                    window.cpGame.state.time = 45;
                    document.querySelector(sel).click();
                }, selector);
            } else if (id === 'gravity-slingshot') {
                // Resolved flights can auto-return to aiming; keep the shot
                // active during this single-turn reset assertion.
                await page.evaluate(sel => {
                    const g = window.gdGame;
                    g.phase = 'flying'; g.contextualRestart?.sync();
                    document.querySelector(sel).click();
                }, selector);
            } else {
                await page.click(selector);
            }
            check(dialogs.length === beforeFreshDialog,
                id + ': non-destructive restart must not ask to discard progress: '
                + JSON.stringify(dialogs.slice(beforeFreshDialog)));
            const untouched = await page.evaluate(({ key, id: gameId }) => {
                const g = window[key];
                return gameId === 'carrot-pull' ? g.state.mode === 'menu'
                    : gameId === 'gravity-slingshot' ? g.phase === 'aiming'
                        : g.state === 'playing';
            }, { key: global, id });
            check(untouched, id + ': reset without progress works');

            // Carrot Pull's untouched action intentionally returns to the
            // menu. Re-enter gameplay before testing pause/resume; otherwise
            // the pause hook correctly does nothing in menu state.
            if (id === 'carrot-pull') await start();

            if (id === 'gravity-slingshot') {
                const keepsAttemptCount = await page.evaluate(key => {
                    const g = window[key];
                    g.launches = 2;
                    g.fire(130, -70);
                    document.getElementById('gd-reset-btn').click();
                    const b = document.getElementById('gd-reset-btn');
                    return { phase: g.phase, launches: g.launches,
                        hidden: b.disabled && getComputedStyle(b).display === 'none' };
                }, global);
                check(keepsAttemptCount.phase === 'aiming' && keepsAttemptCount.launches === 3
                    && keepsAttemptCount.hidden,
                'gravity-slingshot: reset preserves attempts and becomes hidden '
                    + JSON.stringify(keepsAttemptCount));
                const keyboardShot = await page.evaluate(key => {
                    const g = window[key];
                    g.launches = 3;
                    g.fire(130, -70);
                    const beforeActive = g.launches;
                    window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'r', bubbles: true }));
                    const active = { phase: g.phase, launches: g.launches, before: beforeActive };
                    g.fire(130, -70);
                    g.isPaused = true; g.contextualRestart?.sync();
                    const beforePaused = g.launches;
                    window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'r', bubbles: true }));
                    const paused = { phase: g.phase, launches: g.launches, before: beforePaused };
                    g.isPaused = false;
                    g.resetHole();
                    return { active, paused };
                }, global);
                check(keyboardShot.active.phase === 'aiming'
                    && keyboardShot.active.launches === keyboardShot.active.before
                    && keyboardShot.paused.phase === 'flying'
                    && keyboardShot.paused.launches === keyboardShot.paused.before,
                'gravity-slingshot: R resets only current shot; disabled while paused '
                    + JSON.stringify(keyboardShot));
            }
            // The controls also follow quiet drawer / visibility pauses without
            // waiting for a menu-overlay mutation.
            if (id === 'gravity-slingshot') {
                // A genuine flight can end between async browser operations.
                // Verify pause and resume atomically against that same shot.
                const quiet = await page.evaluate(key => {
                    const g = window[key], b = document.getElementById('gd-reset-btn');
                    g.fire(130, -70);
                    const shown = !b.disabled && getComputedStyle(b).display !== 'none';
                    g.pauseQuiet();
                    const hidden = b.disabled && getComputedStyle(b).display === 'none';
                    g.resumeQuiet();
                    const restored = !b.disabled && getComputedStyle(b).display !== 'none';
                    g.resetHole();
                    return { shown, hidden, restored };
                }, global);
                check(quiet.shown && quiet.hidden, id + ': quiet pause hides restart '
                    + JSON.stringify(quiet));
                check(quiet.restored, id + ': quiet resume restores restart');
            } else {
                await page.evaluate(key => window[key].pauseQuiet(), global);
                await page.waitForFunction(isHidden, { timeout: 4000 }, selector);
                check(true, id + ': quiet pause immediately hides retry');
                await page.evaluate(key => window[key].resumeQuiet(), global);
                await page.waitForFunction(sel => !document.querySelector(sel)?.disabled,
                    { timeout: 4000 }, selector);
                check(true, id + ': quiet resume restores retry');
            }

            if (id === 'echo-cave') {
                checkpoint('movement-only protection');
                // Traverse the actual simulation without sonar, then require a
                // confirmation for discardable exploration progress.
                await page.evaluate(() => { window.ecGame.keys.add('r'); });
                await page.waitForFunction(() => window.ecGame.world?.hasMoved, { timeout: 3000 });
                await page.evaluate(() => { window.ecGame.keys.delete('r'); });
                const moved = await page.evaluate(() => ({
                    count: window.ecGame.world.pulseCount,
                    moved: window.ecGame.world.hasMoved,
                }));
                check(moved.moved && moved.count === 0,
                    'echo-cave: moving without a pulse is meaningful progress ' + JSON.stringify(moved));

                dialogAction = 'dismiss';
                let beforeMovementDialog = dialogs.length;
                await page.click(selector);
                const movementDialogs = dialogs.slice(beforeMovementDialog);
                const retained = await page.evaluate(() => ({
                    moved: window.ecGame.world.hasMoved,
                    pulses: window.ecGame.world.pulseCount,
                }));
                check(movementDialogs.length === 1
                    && /Restart this level/.test(movementDialogs[0].message)
                    && retained.moved && retained.pulses === 0,
                'echo-cave: cancelled restart preserves exploration-only progress');

                // The R shortcut must not bypass the topbar's confirmation.
                await page.evaluate(() => document.activeElement?.blur());
                beforeMovementDialog = dialogs.length;
                await page.keyboard.press('r');
                const shortcutDialogs = dialogs.slice(beforeMovementDialog);
                const shortcutRetained = await page.evaluate(() => window.ecGame.world.hasMoved);
                check(shortcutDialogs.length === 1 && shortcutRetained,
                    'echo-cave: R shortcut also requires a discard confirmation');

                dialogAction = 'accept';
                beforeMovementDialog = dialogs.length;
                await page.click(selector);
                dialogAction = 'dismiss';
                const acceptedMovementDialogs = dialogs.slice(beforeMovementDialog);
                const clean = await page.evaluate(() => ({
                    moved: window.ecGame.world.hasMoved,
                    pulses: window.ecGame.world.pulseCount,
                    got: window.ecGame.world.got,
                    hearts: window.ecGame.world.hearts,
                }));
                check(acceptedMovementDialogs.length === 1
                    && clean.moved === false && clean.pulses === 0
                    && clean.got === 0 && clean.hearts === 3,
                'echo-cave: confirmed restart creates a clean world ' + JSON.stringify(clean));
            }

            if (id !== 'gravity-slingshot') {
                const field = PROGRESS[id];
                const mutateProgress = async () => {
                    if (field === 'world.pulseCount') {
                        // Real sonar input; pulseUsed is overwritten from the world each frame.
                        await page.evaluate(key => { window[key].wantPulse = true; }, global);
                        await page.waitForFunction(key => window[key].world?.pulseCount > 0,
                            { timeout: 3000 }, global);
                        return page.evaluate(key => window[key].world.pulseCount, global);
                    }
                    return page.evaluate(({ key, path }) => {
                        const g = window[key];
                        if (path === 'anchors') {
                            g.anchors.push({ t: 1, T: g.spec.t0 });
                            return g.anchors.length;
                        }
                        if (path === 'world.spent') {
                            g.world.spent = 2;
                            return g.world.spent;
                        }
                        const state = path === 'pulls' ? g.state : g;
                        state[path] = 1;
                        return state[path];
                    }, { key: global, path: field });
                };
                const readProgress = () => page.evaluate(({ key, path }) => {
                    const g = window[key];
                    if (path === 'anchors') return g.anchors.length;
                    if (path === 'world.spent') return g.world.spent;
                    if (path === 'world.pulseCount') return g.world.pulseCount;
                    return (path === 'pulls' ? g.state : g)[path];
                }, { key: global, path: field });
                const scoreBefore = await mutateProgress();
                check(scoreBefore > 0, id + ': fixture created meaningful game progress');

                if (R_SHORTCUT_GAMES.has(id)) {
                    checkpoint('decline keyboard restart');
                    await page.evaluate(() => document.activeElement?.blur());
                    dialogAction = 'dismiss';
                    const beforeShortcut = dialogs.length;
                    await page.keyboard.press('r');
                    const shortcutEvents = dialogs.slice(beforeShortcut);
                    const shortcutRetained = await readProgress();
                    check(shortcutEvents.length === 1
                        && /^Restart this level\?/.test(shortcutEvents[0].message)
                        && shortcutRetained === scoreBefore,
                    id + ': R shortcut confirms and cancel preserves progress '
                        + JSON.stringify({ shortcutEvents, shortcutRetained }));

                    // Quiet pause must not allow a hidden keyboard shortcut to
                    // restart a run behind the drawer.
                    await page.evaluate(key => window[key].pauseQuiet(), global);
                    const beforePausedKey = dialogs.length;
                    await page.keyboard.press('r');
                    const pausedRetained = await readProgress();
                    check(dialogs.length === beforePausedKey && pausedRetained === scoreBefore,
                        id + ': paused R shortcut cannot restart or prompt');
                    await page.evaluate(key => window[key].resumeQuiet(), global);
                }

                checkpoint('decline destructive restart');
                dialogAction = 'dismiss';
                const beforeDecline = dialogs.length;
                await page.click(selector);
                const declinedEvents = dialogs.slice(beforeDecline);
                const declinedMessage = declinedEvents[0]?.message || '';
                check(declinedEvents.length === 1,
                    id + ': discard action must open exactly one confirmation: '
                    + JSON.stringify(declinedEvents));
                const retained = await readProgress();
                check(/^(Restart this level|End this round)\?/.test(declinedMessage)
                    && retained === scoreBefore,
                id + ': English confirmation and cancellation preserve progress ' + declinedMessage);

                // Test the actual consumer listener ordering, not just getLang().
                const localized = await page.evaluate(sel => {
                    localStorage.setItem('site_lang', 'zh');
                    window.dispatchEvent(new CustomEvent('site-settings:changed'));
                    const btn = document.querySelector(sel);
                    return { title: btn.title, aria: btn.getAttribute('aria-label') };
                }, selector);
                check(localized.title === localized.aria
                    && /重开|结束本局/.test(localized.title),
                id + ': Chinese locale retains controller-owned button label ' + JSON.stringify(localized));

                checkpoint('accept destructive restart');
                dialogAction = 'accept';
                const beforeAccept = dialogs.length;
                await page.click(selector);
                dialogAction = 'dismiss';
                const acceptedEvents = dialogs.slice(beforeAccept);
                const acceptedMessage = acceptedEvents[0]?.message || '';
                check(acceptedEvents.length === 1,
                    id + ': accepting discard must display exactly one confirmation: '
                    + JSON.stringify(acceptedEvents));
                const after = await readProgress();
                const expectedState = id === 'carrot-pull' ? 'menu' : 'playing';
                const actualState = await page.evaluate(({ key, name }) =>
                    name === 'carrot-pull' ? window[key].state.mode : window[key].state,
                { key: global, name: id });
                check(/^(重新开始本关|结束本局)/.test(acceptedMessage)
                    && after === 0 && actualState === expectedState,
                id + ': Chinese confirmation restores expected game state ' + JSON.stringify({
                    acceptedMessage, after, actualState,
                }));
            }

            // Progress facts must cover more than visible counters.
            if (id === 'carrot-pull') {
                checkpoint('time-only round progress');
                await start();
                dialogAction = 'dismiss';
                const beforeTime = dialogs.length;
                const timeOnly = await page.evaluate(() => {
                    const g = window.cpGame;
                    g.state.score = 0;
                    g.state.pulls = 0;
                    g.state.time = 44; // a single miss deducts one second
                    document.getElementById('cp-reset-btn').click();
                    return { mode: g.state.mode, time: g.state.time,
                        pulls: g.state.pulls, score: g.state.score };
                });
                const timeDialogs = dialogs.slice(beforeTime);
                check(timeDialogs.length === 1 && /^结束本局/.test(timeDialogs[0].message)
                    && timeOnly.mode === 'playing' && timeOnly.time <= 44
                    && timeOnly.pulls === 0 && timeOnly.score === 0,
                id + ': time-only progress prompts; cancelling preserves round '
                    + JSON.stringify({ timeOnly, timeDialogs }));
                dialogAction = 'accept';
                const beforeTimeAccept = dialogs.length;
                await page.evaluate(() => document.getElementById('cp-reset-btn').click());
                dialogAction = 'dismiss';
                const reset = await page.evaluate(() => ({
                    mode: window.cpGame.state.mode, time: window.cpGame.state.time,
                }));
                check(dialogs.length === beforeTimeAccept + 1
                    && reset.mode === 'menu' && reset.time === 45,
                id + ': confirmed time-only exit returns to menu ' + JSON.stringify(reset));
            }
            if (id === 'crystal-bloom') {
                checkpoint('growth-only progress');
                dialogAction = 'dismiss';
                const beforeGrow = dialogs.length;
                const growth = await page.evaluate(() => {
                    const g = window.cbGame;
                    const fresh = g.phase === 'draw' && g.anchors.length === 0 && g.stirs.length === 0;
                    g.pressGrow();
                    const before = g.phase;
                    document.getElementById('cb-reset-btn').click();
                    return { fresh, before, after: g.phase,
                        anchors: g.anchors.length, stirs: g.stirs.length };
                });
                const growthDialogs = dialogs.slice(beforeGrow);
                check(growth.fresh && growth.before === 'grow' && growth.after === 'grow'
                    && growth.anchors === 0 && growth.stirs === 0
                    && growthDialogs.length === 1 && /^重新开始本关/.test(growthDialogs[0].message),
                id + ': growth-only progress prompts; cancelling keeps growth '
                    + JSON.stringify({ growth, growthDialogs }));
                dialogAction = 'accept';
                const beforeGrowAccept = dialogs.length;
                await page.evaluate(() => document.getElementById('cb-reset-btn').click());
                dialogAction = 'dismiss';
                const reset = await page.evaluate(() => ({
                    state: window.cbGame.state, phase: window.cbGame.phase,
                    anchors: window.cbGame.anchors.length, stirs: window.cbGame.stirs.length,
                }));
                check(dialogs.length === beforeGrowAccept + 1 && reset.state === 'playing'
                    && reset.phase === 'draw' && reset.anchors === 0 && reset.stirs === 0,
                id + ': confirmed growth-only restart returns to drawing ' + JSON.stringify(reset));
            }

            checkpoint('menu transition');
            if (id === 'carrot-pull') {
                await start();
                await page.evaluate(() => { window.cpGame.state.time = 0.001; });
                await page.waitForFunction(() => window.cpGame.state.mode === 'over', { timeout: 3000 });
                check(await page.evaluate(isHidden, selector),
                    'carrot-pull: terminal game state immediately hides exit button');
            }
            if (id !== 'carrot-pull') {
                await page.evaluate(({ key, method }) => window[key][method](true),
                    { key: global, method: menuMethod });
            }
            await page.waitForFunction(isHidden, { timeout: 4000 }, selector);
            check(true, id + ': menu transition hides retry');

            if (id !== 'carrot-pull') {
                await start();
                if (id === 'gravity-slingshot') {
                    const liveShot = await page.evaluate(key => {
                        const g = window[key];
                        g.fire(130, -70);
                        const b = document.getElementById('gd-reset-btn');
                        return !b.disabled && getComputedStyle(b).display !== 'none';
                    }, global);
                    check(liveShot, id + ': launched shot exposes reset');
                } else {
                    await page.waitForFunction(sel => !document.querySelector(sel)?.disabled,
                        { timeout: 4000 }, selector);
                }
                const resultId = id === 'shadow-loom' ? prefix + '-result'
                    : id === 'gravity-slingshot' ? prefix + '-over' : prefix + '-clear';
                // Assert the *state-only* transition before any result DOM change.
                // Shadow Loom enters "solving", Bond Forge "clear" and delays
                // the result overlay: a stale restart icon would remain actionable.
                if (id === 'shadow-loom' || id === 'bond-forge') {
                    const pure = await page.evaluate(({ key, name, sel }) => {
                        const g = window[key], button = document.querySelector(sel);
                        if (name === 'shadow-loom') g.solve();
                        else g.onLevelCleared();
                        return { state: g.state, hidden: button.disabled
                            && getComputedStyle(button).display === 'none' };
                    }, { key: global, name: id, sel: selector });
                    check(pure.hidden && pure.state === (id === 'shadow-loom' ? 'solving' : 'clear'),
                        id + ': state-only completion hides restart before result overlay '
                        + JSON.stringify(pure));
                }
                const exists = await page.evaluate(({ key, name, nodeId }) => {
                    const g = window[key], result = document.getElementById(nodeId);
                    if (!result) return false;
                    if (name === 'gravity-slingshot') g.phase = 'resolved';
                    else g.state = 'done';
                    result.classList.remove('hidden');
                    return true;
                }, { key: global, name: id, nodeId: resultId });
                check(exists, id + ': result overlay owns the replay action');
                await page.waitForFunction(isHidden, { timeout: 4000 }, selector);
                check(true, id + ': topbar retry not shown over result');
            }
            check(!errors.length, id + ': no page errors: ' + errors.join(' | ').slice(0, 250));
            checkpoint('passed');
        } catch (err) {
            failures.push(id + ' @ ' + phase + ': ' + String(err.message || err).slice(0, 700));
            checkpoint('failed @ ' + phase);
        } finally {
            await page.close();
        }
    }
} finally {
    await browser.close();
}
if (failures.length) {
    console.error('FAIL contextual restart\n' + failures.join('\n'));
    process.exit(1);
}
console.log('PASS contextual restart: ' + PAGES.length + ' games / ' + count + ' checks');
