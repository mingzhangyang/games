#!/usr/bin/env node
// Actual six-game interruption integration on live DOM + state machines.
// The deterministic lease algebra is also covered by verify-gameplay-interruptions.
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { registry } from './lib/registry.mjs';
import { keepPage, exitIfNoPages } from './lib/page-filter.mjs';

const BASE = process.argv.find(arg => arg.startsWith('http')) || 'http://127.0.0.1:8899';
const IDS = new Set(['carrot-pull', 'firefly-signal', 'math-rain', 'needle-awn', 'shadow-loom', 'tank-battle']);
const games = registry.withCap('leaderboard').filter(g => g.scores?.ui === 'dialog'
    && IDS.has(g.id) && keepPage(g.href));
exitIfNoPages(games, 'smoke-gameplay-interruptions');
const errors = [];

function readState(id) {
    const g = id === 'carrot-pull' ? window.cpGame
        : id === 'firefly-signal' ? window.__fireflySignal
        : id === 'math-rain' ? window.mathRainGame
        : id === 'needle-awn' ? window.gameEngine
        : id === 'shadow-loom' ? window.slGame : window.tankBattleInstance;
    const state = id === 'carrot-pull' ? g?.state?.mode
        : id === 'math-rain' ? g?.gameStateManager?.gameState
        : id === 'tank-battle' ? g?.gameState : g?.state;
    const paused = id === 'carrot-pull' ? g?.state?.paused
        : id === 'firefly-signal' ? g?.paused
        : id === 'shadow-loom' ? g?.isPaused
        : id === 'tank-battle' ? g?.paused : state === 'paused';
    return { state, paused, ranking: g?.pauseOwnership?.isHeld('ranking'),
        hidden: g?.pauseOwnership?.isHeld('hidden'),
        available: !!g?.pauseOwnership };
}
function startInPage(id) {
    if (id === 'carrot-pull') window.cpGame.start();
    else if (id === 'firefly-signal') window.__fireflySignal.startLevel(0);
    else if (id === 'math-rain') window.mathRainGame.restartGame();
    else if (id === 'needle-awn') window.gameEngine.startEndlessMode();
    else if (id === 'shadow-loom') window.slGame.startLevel(0);
    else window.tankBattleInstance.restart();
}
function pauseManuallyInPage(id) {
    if (id === 'carrot-pull') window.cpGame.pauseQuiet();
    else if (id === 'firefly-signal') window.__fireflySignal.pauseQuiet();
    else if (id === 'math-rain') window.mathRainGame.gameStateManager.pauseGame();
    else if (id === 'needle-awn') window.gameEngine.togglePause();
    else if (id === 'shadow-loom') window.slGame.pauseQuiet();
    else window.tankBattleInstance.togglePause();
}
function resumeManuallyInPage(id) {
    if (id === 'math-rain') window.mathRainGame.togglePauseResume();
    else if (id === 'needle-awn') window.gameEngine.togglePause();
    else window.tankBattleInstance.togglePause();
}
function setHiddenInPage(value) {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => value });
    document.dispatchEvent(new Event('visibilitychange'));
}

const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: LAUNCH_ARGS });
try {
    for (const game of games) {
        const page = await browser.newPage();
        const localErrors = [];
        page.on('pageerror', e => localErrors.push(String(e.message || e)));
        const landscape = game.id === 'tank-battle';
        await page.setViewport({ width: landscape ? 844 : 390,
            height: landscape ? 390 : 844, deviceScaleFactor: 2,
            isMobile: true, hasTouch: true });
        await page.setBypassServiceWorker(true);
        await page.setRequestInterception(true);
        page.on('request', req => {
            if (req.url().startsWith('https://game-scores.orangely.workers.dev/scores')) {
                void req.respond({ status: 200, contentType: 'application/json',
                    headers: { 'access-control-allow-origin': '*' }, body: '[]' });
            } else void req.continue();
        });
        await page.evaluateOnNewDocument(() => {
            try { localStorage.setItem('site_lang', 'en'); localStorage.setItem('site_muted', '1'); } catch {}
        });
        try {
            await page.goto(BASE + '/' + game.href, { waitUntil: 'domcontentloaded', timeout: 45000 });
            await page.waitForFunction(id => {
                const instances = {
                    'carrot-pull': window.cpGame, 'firefly-signal': window.__fireflySignal,
                    'math-rain': window.mathRainGame, 'needle-awn': window.gameEngine,
                    'shadow-loom': window.slGame, 'tank-battle': window.tankBattleInstance,
                };
                const ready = id === 'carrot-pull'
                    ? ['ready', 'fallback'].includes(document.getElementById('cp-stage')?.dataset.artState)
                    : id === 'needle-awn' ? !!window.gameEngine?.artReady
                    : id === 'math-rain' ? !!window.__mathRainInitialized : true;
                return ready && !!instances[id]?.pauseOwnership
                    && !!document.querySelector('.scoreboard-trigger--icon');
            }, { timeout: 30000 }, game.id);

            await page.evaluate(startInPage, game.id);
            const start = await page.evaluate(readState, game.id);
            if (start.paused || start.state !== 'playing') {
                throw new Error('not playing after start: ' + JSON.stringify(start));
            }
            // Open a real dialog, switch to background, close the dialog while
            // hidden; the dialog does not own the background lease.
            await page.evaluate(() => document.querySelector('.scoreboard-trigger--icon').click());
            await page.waitForFunction(() => document.querySelector('dialog[data-scoreboard-dialog]')?.open);
            let snap = await page.evaluate(readState, game.id);
            if (!snap.paused || !snap.ranking) throw new Error('ranking did not pause: ' + JSON.stringify(snap));
            // Native close is asynchronous. An old close event must never
            // release the lease or viewport observers for a newly reopened
            // instance of the same native dialog.
            await page.evaluate(() => {
                const dialog = document.querySelector('dialog[data-scoreboard-dialog]');
                dialog.close();
                document.querySelector('.scoreboard-trigger--icon').click();
            });
            await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 90)));
            snap = await page.evaluate(readState, game.id);
            if (!snap.ranking || !snap.paused || !await page.evaluate(() =>
                document.querySelector('dialog[data-scoreboard-dialog]')?.open)) {
                throw new Error('stale close event released reopened dialog: ' + JSON.stringify(snap));
            }
            await page.evaluate(setHiddenInPage, true);
            snap = await page.evaluate(readState, game.id);
            if (!snap.hidden || !snap.paused) throw new Error('hidden lease missing: ' + JSON.stringify(snap));
            await page.evaluate(() => document.querySelector('dialog[data-scoreboard-dialog]').close());
            await page.waitForFunction(id => {
                const owners = {
                    'carrot-pull': window.cpGame, 'firefly-signal': window.__fireflySignal,
                    'math-rain': window.mathRainGame, 'needle-awn': window.gameEngine,
                    'shadow-loom': window.slGame, 'tank-battle': window.tankBattleInstance,
                };
                return !owners[id].pauseOwnership.isHeld('ranking');
            }, { timeout: 6000 }, game.id);
            snap = await page.evaluate(readState, game.id);
            if (!snap.hidden || !snap.paused) throw new Error('dialog close resumed hidden run: ' + JSON.stringify(snap));

            await page.evaluate(setHiddenInPage, false);
            snap = await page.evaluate(readState, game.id);
            const autoResume = ['carrot-pull', 'firefly-signal', 'shadow-loom'].includes(game.id);
            if (snap.hidden || snap.paused === autoResume) {
                throw new Error('wrong foreground resume policy: ' + JSON.stringify(snap));
            }
            if (!autoResume) {
                await page.evaluate(resumeManuallyInPage, game.id);
                snap = await page.evaluate(readState, game.id);
                if (snap.paused) throw new Error('no manual resume available: ' + JSON.stringify(snap));
            }

            // Manual pre-pause: opening/closing an unrelated dialog never
            // steals permission to restart gameplay.
            await page.evaluate(pauseManuallyInPage, game.id);
            await page.evaluate(() => document.querySelector('.scoreboard-trigger--icon').click());
            await page.waitForFunction(() => document.querySelector('dialog[data-scoreboard-dialog]')?.open);
            await page.evaluate(() => document.querySelector('dialog[data-scoreboard-dialog]').close());
            await page.waitForFunction(id => {
                const owners = { 'carrot-pull': window.cpGame, 'firefly-signal': window.__fireflySignal,
                    'math-rain': window.mathRainGame, 'needle-awn': window.gameEngine,
                    'shadow-loom': window.slGame, 'tank-battle': window.tankBattleInstance };
                return !owners[id].pauseOwnership.isHeld('ranking');
            }, { timeout: 6000 }, game.id);
            snap = await page.evaluate(readState, game.id);
            if (!snap.paused) throw new Error('manual pause overridden: ' + JSON.stringify(snap));

            // A fresh run started while a stale modal is open invalidates that
            // modal's resume permission. The new run is stopped, not resumed
            // when the old dialog closes.
            await page.evaluate(() => document.querySelector('.scoreboard-trigger--icon').click());
            await page.waitForFunction(() => document.querySelector('dialog[data-scoreboard-dialog]')?.open);
            await page.evaluate(startInPage, game.id);
            snap = await page.evaluate(readState, game.id);
            if (!snap.paused || !snap.ranking) throw new Error('new run bypassed modal: ' + JSON.stringify(snap));
            await page.evaluate(() => document.querySelector('dialog[data-scoreboard-dialog]').close());
            await page.waitForFunction(id => {
                const owners = { 'carrot-pull': window.cpGame, 'firefly-signal': window.__fireflySignal,
                    'math-rain': window.mathRainGame, 'needle-awn': window.gameEngine,
                    'shadow-loom': window.slGame, 'tank-battle': window.tankBattleInstance };
                return !owners[id].pauseOwnership.isHeld('ranking');
            }, { timeout: 6000 }, game.id);
            snap = await page.evaluate(readState, game.id);
            if (!snap.paused) throw new Error('old dialog resumed a replacement run: ' + JSON.stringify(snap));
            if (localErrors.length) throw new Error('page error: ' + localErrors.slice(0, 2).join(' | '));
        } catch (err) {
            errors.push(game.id + ': ' + String(err.message || err));
        } finally {
            await page.close();
        }
    }
} finally {
    await browser.close();
}
if (errors.length) {
    console.error('FAIL gameplay interruption browser integration\n' + errors.join('\n'));
    process.exit(1);
}
console.log('PASS gameplay interruption browser integration: ' + games.length + ' games');
