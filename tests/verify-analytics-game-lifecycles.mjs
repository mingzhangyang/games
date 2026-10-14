// verify-all: timeout=120000
// Representative REAL game runtimes, not just a synthetic pause/finish fixture.
// All telemetry is redirected to a loopback mock; production is never contacted.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { keepPage, exitIfNoPages } from './lib/page-filter.mjs';

const BASE = process.argv.find(a => a.startsWith('http')) || 'http://127.0.0.1:8899';
// Each scenario is one real game page; `verify:changed` runs only the affected
// ones through VERIFY_PAGES (same contract as verify-desktop-frame).
const SCENARIOS = ['bond-forge', 'ripple-duet', 'firefly-signal', 'minesweeper',
    'word-daily', 'tetris', 'math-rain'].filter(id => keepPage(id));
exitIfNoPages(SCENARIOS, 'verify-analytics-game-lifecycles');
const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: LAUNCH_ARGS });
try {
    const page = await browser.newPage();
    const remoteRequests = [];
    await page.setRequestInterception(true);
    page.on('request', request => {
        const url = request.url();
        if (url.includes('games-analytics.orangely.workers.dev')) {
            remoteRequests.push(url);
            return request.abort();
        }
        // A real win/finish may submit leaderboard or Word Daily stats.
        // Mock those Workers too: synthetic browser runs must never write production data.
        if (/^https:\/\/(?:game-scores|word-daily-stats)\.orangely\.workers\.dev\//.test(url)) {
            return request.respond({
                status: request.method() === 'OPTIONS' ? 204 : 200,
                headers: {
                    'Access-Control-Allow-Origin': new URL(BASE).origin,
                    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type',
                },
                contentType: 'application/json',
                body: request.method() === 'GET' ? '[]' : '',
            });
        }
        return request.continue();
    });
    await page.evaluateOnNewDocument(() => {
        window.__ANALYTICS_V2_TEST__ = true;
        window.__analyticsEvents = [];
        const originalFetch = window.fetch.bind(window);
        window.fetch = (url, options) => {
            const name = String(url);
            if (name.endsWith('/__analytics/stats?v=2')) {
                return Promise.resolve({ ok: true, json: async () => ({
                    scope: 'day', games: {},
                    total: { p: 0, f: 0, opens: 0, activeSeconds: 0, playingSeconds: 0 },
                }) });
            }
            if (name.endsWith('/__analytics/event')) {
                window.__analyticsEvents.push(JSON.parse(options.body));
                return Promise.resolve({ ok: true, status: 201 });
            }
            return originalFetch(url, options);
        };
        Object.defineProperty(navigator, 'sendBeacon', {
            configurable: true,
            value: (url, body) => {
                if (!String(url).endsWith('/__analytics/event')) return false;
                window.__analyticsEvents.push(JSON.parse(body));
                return true;
            },
        });
    });
    const playing = id => page.evaluate(name =>
        !!window.__gamesAnalyticsPlaying?.get(name)?.(), id);

    async function expectEvents(id, play, finish) {
        await page.waitForFunction(({ id, play, finish }) => {
            const events = window.__analyticsEvents.filter(e => e.game === id);
            return events.filter(e => e.event === 'open').length >= 1
                && events.filter(e => e.event === 'play').length >= play
                && events.filter(e => e.event === 'finish').length >= finish;
        }, { timeout: 12000 }, { id, play, finish });
        const actual = await page.evaluate(name => {
            const events = window.__analyticsEvents.filter(e => e.game === name);
            return [
                events.filter(e => e.event === 'open').length,
                events.filter(e => e.event === 'play').length,
                events.filter(e => e.event === 'finish').length,
            ];
        }, id);
        assert.deepEqual(actual, [1, play, finish], id + ': exact open/play/finish counts');
    }

    async function open(id, runtimeName) {
        await page.goto(BASE + '/' + id + '.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForFunction(name => !!window[name], { timeout: 15000 }, runtimeName);
        await page.waitForFunction(name =>
            typeof window.__gamesAnalyticsPlaying?.get(name) === 'function',
        { timeout: 15000 }, id);
        await expectEvents(id, 0, 0);
        assert.equal(await playing(id), false, id + ': no gameplay on menu');
    }

    const scenarios = {
        // Bond Forge: each level attempt terminates on clear, not on campaign/daily summary.
        'bond-forge': async () => {
            await open('bond-forge', 'bfGame');
            await page.evaluate(() => window.bfGame.startLevel(0));
            await expectEvents('bond-forge', 1, 0);
            assert.equal(await playing('bond-forge'), true);
            await page.evaluate(() => { window.bfGame.onLevelCleared(); window.bfGame.onLevelCleared(); });
            await expectEvents('bond-forge', 1, 1);
            assert.equal(await playing('bond-forge'), false);
            await page.evaluate(() => window.bfGame.nextLevel());
            await expectEvents('bond-forge', 2, 1);
            await page.evaluate(() => window.bfGame.onLevelCleared());
            await expectEvents('bond-forge', 2, 2);
            await page.evaluate(() => window.bfGame.startSandbox());
            await expectEvents('bond-forge', 3, 2);
            assert.equal(await playing('bond-forge'), true);
            await page.evaluate(() => window.bfGame.onLevelCleared());
            await expectEvents('bond-forge', 3, 2);
        },
        // Ripple Duet: the entire daily course is ONE play, ONE finish, regardless of waves.
        'ripple-duet': async () => {
            await open('ripple-duet', 'rdGame');
            await page.evaluate(() => window.rdGame.startDaily());
            await expectEvents('ripple-duet', 1, 0);
            const waveCount = await page.evaluate(() => window.rdGame.daily.course.length);
            assert(waveCount > 1);
            for (let i = 0; i < waveCount; i++) {
                await page.evaluate(() => window.rdGame.winLevel());
                await expectEvents('ripple-duet', 1, i === waveCount - 1 ? 1 : 0);
                assert.equal(await playing('ripple-duet'), false, 'completed wave is not playing');
                if (i < waveCount - 1) {
                    await page.evaluate(() => window.rdGame.nextLevel());
                    await expectEvents('ripple-duet', 1, 0);
                    assert.equal(await playing('ripple-duet'), true);
                }
            }
            await page.evaluate(() => window.rdGame.nextLevel());
            await expectEvents('ripple-duet', 1, 1);
        },
        // Firefly Signal: menu ambient animation is not gameplay; pause and result are excluded.
        'firefly-signal': async () => {
            await open('firefly-signal', '__fireflySignal');
            await page.evaluate(() => window.__fireflySignal.startLevel(0, { manual: true }));
            await expectEvents('firefly-signal', 1, 0);
            assert.equal(await playing('firefly-signal'), true);
            await page.evaluate(() => window.__fireflySignal.pauseQuiet());
            assert.equal(await playing('firefly-signal'), false);
            await page.evaluate(() => window.__fireflySignal.resumeQuiet());
            assert.equal(await playing('firefly-signal'), true);
            await page.evaluate(() => window.__fireflySignal.finish(false));
            await expectEvents('firefly-signal', 1, 1);
            assert.equal(await playing('firefly-signal'), false);
        },
        // Minesweeper: menu dismissal is not a play; first legal reveal is.
        'minesweeper': async () => {
            await open('minesweeper', 'msGame');
            await page.evaluate(() => window.msGame.hideStart());
            await expectEvents('minesweeper', 0, 0);
            await page.evaluate(() => window.msGame.handleReveal(0));
            await expectEvents('minesweeper', 1, 0);
            assert.equal(await playing('minesweeper'), true);
            await page.evaluate(() => window.msGame.lose(0));
            await expectEvents('minesweeper', 1, 1);
            assert.equal(await playing('minesweeper'), false);
        },
        // Word Daily: partial word input does not start play; first committed guess does.
        'word-daily': async () => {
            await open('word-daily', 'wordDailyGame');
            await page.evaluate(() => {
                const g = window.wordDailyGame;
                g.el.input.value = g.answer.slice(0, 1);
                g.el.input.dispatchEvent(new Event('input', { bubbles: true }));
            });
            assert.equal(await playing('word-daily'), false, 'unsubmitted word is not an attempt');
            await expectEvents('word-daily', 0, 0);
            await page.evaluate(() => window.wordDailyGame.commitGuess(window.wordDailyGame.answer));
            await expectEvents('word-daily', 1, 1);
            assert.equal(await playing('word-daily'), false);
        },
        // Tetris: page load does not start the run; pause is not finish or a new play.
        'tetris': async () => {
            await open('tetris', 'game');
            await page.evaluate(() => window.game.start());
            await expectEvents('tetris', 1, 0);
            assert.equal(await playing('tetris'), true);
            await page.evaluate(() => window.game.togglePause());
            assert.equal(await playing('tetris'), false);
            await page.evaluate(() => window.game.togglePause());
            assert.equal(await playing('tetris'), true);
            await expectEvents('tetris', 1, 0);
            await page.evaluate(() => window.game.restart());
            await expectEvents('tetris', 2, 0);
        },
        // Math Rain: start, UI restart and session retry/next level are each a new run.
        'math-rain': async () => {
            await open('math-rain', 'mathRainGame');
            await page.waitForFunction(() => window.__mathRainInitialized === true, { timeout: 15000 });
            await page.evaluate(() => window.mathRainGame.startGame());
            await expectEvents('math-rain', 1, 0);
            assert.equal(await playing('math-rain'), true);
            await page.evaluate(() => window.mathRainGame.restartGame());
            await expectEvents('math-rain', 2, 0);
            assert.equal(await playing('math-rain'), true);
        },
    };
    for (const id of SCENARIOS) await scenarios[id]();

    assert.deepEqual(remoteRequests, [], 'no test traffic may reach production analytics');
    console.log('Analytics real-game lifecycle: stage/daily, pause, first action and restart: PASS');
} finally {
    await browser.close();
}
