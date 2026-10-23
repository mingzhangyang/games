#!/usr/bin/env node
// verify-all: timeout=300000
// Step 6c-2c: five actual embedded scoreboards; source and dist fault injection.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { keepPage, exitIfNoPages } from './lib/page-filter.mjs';

const BASE = process.argv.find(x => x.startsWith('http')) || 'http://127.0.0.1:8899';
const PENDING = 'scoreboard:pending:v1';
const cases = [
    { id: 'hoop-shot', handle: 'hoopShotGame', prefix: 'hs' },
    { id: 'minesweeper', handle: 'msGame', prefix: 'ms' },
    { id: 'reversi', handle: 'rvGame', prefix: 'rv' },
    { id: 'tower-defense', handle: 'tdGame', prefix: 'td' },
    { id: 'planet-merge', handle: 'planetMergeGame', prefix: 'pm', dual: true },
].filter(x => keepPage(x.id));
exitIfNoPages(cases, 'verify-scoreboard-classic-batch');

const browser = await puppeteer.launch({ executablePath: CHROME_PATH, args: LAUNCH_ARGS, headless: 'new' });
const headers = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type' };
let count = 0;
function check(value, message) { assert.ok(value, message); count++; }
async function fixture(game, mode = 'failure', seed = null) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    const errors = [];
    const net = { mode, get: 'success', posts: [], gets: [], heldGets: [], label: 'Remote latest' };
    page.on('pageerror', error => errors.push(error.message));
    await page.setBypassServiceWorker(true);
    await page.setViewport({ width: 390, height: 664 });
    await page.setRequestInterception(true);
    page.on('request', request => {
        void (async () => {
            if (request.url().startsWith('https://game-scores.orangely.workers.dev/')) {
                if (request.method() === 'OPTIONS') {
                    return request.respond({ status: 204, headers });
                }
                if (request.method() === 'POST') {
                    const entry = JSON.parse(request.postData());
                    net.posts.push(entry);
                    if (net.mode === 'network') return request.abort('failed');
                    const accepted = net.mode === 'success'
                        || (net.mode === 'partial' && entry.game === 'planet-merge');
                    return request.respond({ status: accepted ? 200 : 500, headers, body: '{}' });
                }
                net.gets.push(request.url());
                if (net.get === 'hold') { net.heldGets.push(request); return; }
                return request.respond({ status: 200, headers, contentType: 'application/json',
                    body: JSON.stringify([{ name: net.label, score: 11 }]) });
            }
            if (/^https?:/.test(request.url()) && !request.url().startsWith(BASE)) {
                return request.respond({ status: 204, headers });
            }
            return request.continue();
        })().catch(error => { if (!page.isClosed()) errors.push(error.message); });
    });
    await page.evaluateOnNewDocument(({ seed }) => {
        localStorage.setItem('player_name', 'Classic tester');
        localStorage.setItem('site_lang', 'en');
        if (seed) localStorage.setItem('scoreboard:pending:v1', JSON.stringify(seed));
    }, { seed });
    await page.goto(BASE + '/' + game.id + '.html', { waitUntil: 'load' });
    await page.waitForFunction(handle => !!window[handle], {}, game.handle);
    return { context, page, net, errors };
}
const pending = page => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), PENDING);
async function until(page, predicate, data, label) {
    try {
        await page.waitForFunction(predicate, { timeout: 12000, polling: 25 }, data);
    } catch {
        throw new Error(label);
    }
}
async function waitStatus(page, game, status) {
    await until(page, ({ handle, dual, status }) => {
        const g = window[handle];
        const sessions = dual ? Object.values(g.resultSessions) : [g.resultSession];
        return sessions.length && sessions.every(session => session.getState()?.submission === status);
    }, { handle: game.handle, dual: game.dual, status }, game.id + ': timeout waiting for ' + status);
}
async function finish(page, game, score, opts = {}) {
    return page.evaluate(async ({ game, score, opts }) => {
        const g = window[game.handle];
        const original = Date.now;
        if (opts.midnight) Date.now = () => Date.UTC(2026, 9, 22, 15, 59, 59);
        try {
            switch (game.id) {
                case 'planet-merge':
                    g.startGame(opts.endless ? 'endless' : 'daily');
                    break;
                case 'hoop-shot': g.startGame(); break;
                case 'minesweeper':
                    g.diff = opts.diff || 'easy';
                    g.newGame();
                    g.state = 'playing';
                    g.startTs = performance.now() - score * 1000;
                    break;
                case 'reversi':
                    g.mode = opts.twoPlayers ? '2p' : 'ai';
                    g.newGame();
                    g.streak = score - 1;
                    g.board.fill(1);
                    break;
                case 'tower-defense': g.startGame(); break;
            }
            const date = g.dailyDay;
            if (opts.midnight) Date.now = () => Date.UTC(2026, 9, 22, 16, 0, 1);
            if (game.id !== 'minesweeper' && game.id !== 'reversi') g.score = score;
            if (game.id === 'planet-merge') g.endGame();
            if (game.id === 'hoop-shot') g.onMiss();
            if (game.id === 'minesweeper') await g.finishGame(!opts.lose);
            if (game.id === 'reversi') await g.gameOver();
            if (game.id === 'tower-defense') await g.endGame(false);
            const sessions = game.dual ? Object.values(g.resultSessions) : [g.resultSession];
            return { date, snapshots: sessions.map(session => session.getState()?.entry).filter(Boolean) };
        } finally {
            Date.now = original;
        }
    }, { game, score, opts });
}
async function mutate(page, game) {
    await page.evaluate(game => {
        const g = window[game.handle];
        g.score = 9999; g.dailyDay = '20990101';
        g.elapsed = 9999; g.streak = 9999;
        localStorage.setItem('player_name', 'Future player');
    }, game);
}
const visible = (page, game) => page.$eval('#' + game.prefix + '-lb-status', el => el.textContent);
async function waitVisible(page, game, word) {
    await until(page, ({ prefix, word }) => {
        const el = document.getElementById(prefix + '-lb-status');
        return !!el && el.checkVisibility() && el.textContent.includes(word);
    }, { prefix: game.prefix, word }, game.id + ': missing UI ' + word);
}
async function waitReads(page, game) {
    await until(page, ({ handle, dual }) => {
        const g = window[handle];
        const sessions = dual ? Object.values(g.resultSessions) : [g.resultSession];
        return sessions.every(session => session.getState()?.board === 'ready');
    }, { handle: game.handle, dual: game.dual }, game.id + ': GET should be ready');
}
try {
    for (const game of cases) {
        // HTTP 500 despite GET 200; complete challenge on day 1, upload on day 2
        // after nickname, score and menu state have changed.
        {
            const { context, page, net, errors } = await fixture(game);
            try {
                const { date, snapshots } = await finish(page, game, 29, { midnight: true });
                await waitStatus(page, game, 'queued');
                await waitReads(page, game);
                const saved = await pending(page);
                check(saved.length === (game.dual ? 2 : 1), game.id + ': all original POSTs journaled');
                check(saved.every(x => x.name === 'Classic tester' && x.score === snapshots[0].score),
                    game.id + ': original identity journaled');
                check(saved.every(x => snapshots.some(entry => entry.game === x.game)),
                    game.id + ': journal uses the exact historical game keys');
                if (game.dual) {
                    check(date === '20261022' && saved.some(x => x.game === 'planet-merge-d20261022'),
                        'planet-merge: both boards retain challenge start day');
                }
                check(!(await visible(page, game)).includes('Score uploaded'),
                    game.id + ': successful GET cannot impersonate successful POST');
                await page.evaluate(() => {
                    localStorage.setItem('site_lang', 'zh');
                    window.dispatchEvent(new Event('site-settings:changed'));
                });
                await waitVisible(page, game, '成绩已暂存');
                net.mode = 'success';
                await mutate(page, game);
                const before = net.posts.length;
                await page.evaluate(() => window.dispatchEvent(new Event('online')));
                await waitStatus(page, game, 'sent');
                await until(page, key => JSON.parse(localStorage.getItem(key) || '[]').length === 0,
                    PENDING, game.id + ': queued scores not cleared');
                check(net.posts.length > before && net.posts.slice(before).every(entry =>
                    saved.some(original => original.game === entry.game && original.name === entry.name
                        && original.score === entry.score)), game.id + ': retry uses frozen identity');
                check(errors.length === 0, game.id + ': no runtime errors ' + errors.join('; '));
            } finally { await context.close(); }
        }
        // Network exception: same journal semantics as HTTP 500.
        {
            const { context, page, errors } = await fixture(game, 'network');
            try {
                await finish(page, game, 23);
                await waitStatus(page, game, 'queued');
                check((await pending(page)).length === (game.dual ? 2 : 1),
                    game.id + ': network error is persisted');
                check(errors.length === 0, game.id + ': network exception caught');
            } finally { await context.close(); }
        }
        // Quota denial: no bogus 'saved locally'; retry original in memory.
        {
            const { context, page, net, errors } = await fixture(game);
            try {
                await page.evaluate(key => {
                    const original = window.Storage.prototype.setItem;
                    window.__restorePending = () => { window.Storage.prototype.setItem = original; };
                    window.Storage.prototype.setItem = function (name, value) {
                        if (name === key) throw Error('Injected journal quota denied');
                        return original.call(this, name, value);
                    };
                }, PENDING);
                await finish(page, game, 32);
                await waitStatus(page, game, 'notSaved');
                check((await pending(page)).length === 0, game.id + ': quota denied journal');
                await waitVisible(page, game, 'not uploaded or saved');
                net.mode = 'success';
                const before = net.posts.length;
                await page.evaluate(() => { window.__restorePending(); window.dispatchEvent(new Event('online')); });
                await waitStatus(page, game, 'sent');
                check(net.posts.length > before, game.id + ': unsaved in-memory score can retry');
                check(errors.length === 0, game.id + ': storage quota handled');
            } finally { await context.close(); }
        }
        // Duplicate completion and late network GET cannot corrupt a second run.
        {
            const { context, page, net, errors } = await fixture(game, 'success');
            try {
                net.get = 'hold';
                await finish(page, game, 37);
                await until(page, ({ handle, dual }) => {
                    const g = window[handle];
                    const sessions = dual ? Object.values(g.resultSessions) : [g.resultSession];
                    return sessions.every(session => session.getState()?.submission === 'sent');
                }, { handle: game.handle, dual: game.dual }, game.id + ': POST not accepted');
                await until(page, ({ handle, dual }) => {
                    const g = window[handle];
                    const sessions = dual ? Object.values(g.resultSessions) : [g.resultSession];
                    return sessions.every(session => session.getState()?.board === 'loading');
                }, { handle: game.handle, dual: game.dual }, game.id + ': GET never started');
                const initialPosts = net.posts.length;
                await page.evaluate(game => {
                    const g = window[game.handle];
                    if (game.id === 'planet-merge') g.endGame();
                    if (game.id === 'hoop-shot') g.onMiss();
                    if (game.id === 'minesweeper') void g.finishGame(true);
                    if (game.id === 'reversi') g.gameOver();
                    if (game.id === 'tower-defense') void g.endGame(false);
                }, game);
                check(net.posts.length === initialPosts,
                    game.id + ': repeat finish has no second POST');
                net.get = 'success'; net.label = 'Current board';
                await finish(page, game, 41);
                await waitStatus(page, game, 'sent');
                await waitReads(page, game);
                await waitVisible(page, game, 'Score uploaded');
                for (const request of net.heldGets) {
                    await request.respond({ status: 200, headers, contentType: 'application/json',
                        body: JSON.stringify([{ name: 'Stale board', score: 999 }]) });
                }
                await page.evaluate(() => new Promise(resolve =>
                    requestAnimationFrame(() => requestAnimationFrame(resolve))));
                const rows = await page.$eval('#' + game.prefix + '-lb-list', el => el.textContent);
                check(rows.includes('Current board') && !rows.includes('Stale board'),
                    game.id + ': stale GET cannot paint new result');
                check(net.posts.length === initialPosts * 2, game.id + ': new run submits once');
                check(errors.length === 0, game.id + ': old response isolation errors');
            } finally { await context.close(); }
        }
        // Rehydrate a pending entry from the previous UTC+8 day on a new page.
        {
            const historical = { game: game.dual ? 'planet-merge-d20261022'
                : game.id === 'minesweeper' ? 'minesweeper-easy'
                : game.id === 'tower-defense' ? 'tower-defense-first-light'
                : game.id === 'reversi' ? 'reversi' : 'hoop-shot',
                name: 'Yesterday player', score: 19, at: Date.now() };
            const { context, page, net, errors } = await fixture(game, 'success', [historical]);
            try {
                await until(page, () => JSON.parse(localStorage.getItem('scoreboard:pending:v1') || '[]').length === 0,
                    null, game.id + ': old journal not retried at boot');
                check(net.posts.some(entry => entry.game === historical.game
                    && entry.name === historical.name && entry.score === historical.score),
                game.id + ': page refresh restores exact persisted score');
                check(errors.length === 0, game.id + ': startup replay is safe');
            } finally { await context.close(); }
        }
        // Original score eligibility: no invented scores for disqualified modes.
        {
            const { context, page, net } = await fixture(game, 'success');
            try {
                if (game.id === 'minesweeper') {
                    await finish(page, game, 13, { lose: true, diff: 'hard' });
                } else if (game.id === 'reversi') {
                    await finish(page, game, 13, { twoPlayers: true });
                } else if (game.id === 'hoop-shot' || game.id === 'planet-merge') {
                    await finish(page, game, 0);
                } else {
                    await finish(page, game, 13);
                    await waitStatus(page, game, 'sent');
                }
                check(net.posts.length === (game.id === 'tower-defense' ? 1 : 0),
                    game.id + ': special-mode score eligibility preserved');
            } finally { await context.close(); }
        }
        // Eligibility and board dimension stay owned by each game.
        if (game.id === 'minesweeper') {
            const { context, page, net } = await fixture(game, 'success');
            try {
                await finish(page, game, 17, { diff: 'hard' });
                await waitStatus(page, game, 'sent');
                check(net.posts.length === 1 && net.posts[0].game === 'minesweeper-hard'
                    && net.posts[0].score === 17, 'minesweeper: hard win submits fastest-time seconds');
                await finish(page, game, 12, { diff: 'medium' });
                await waitStatus(page, game, 'sent');
                check(net.posts.length === 2 && net.posts[1].game === 'minesweeper-medium',
                    'minesweeper: difficulties have distinct remote boards');
            } finally { await context.close(); }
        }
        if (game.id === 'reversi') {
            const { context, page, net } = await fixture(game, 'success');
            try {
                const states = await page.evaluate(() => {
                    const g = window.rvGame;
                    g.mode = 'ai';
                    g.newGame();
                    g.streak = 5;
                    g.board.fill(2);
                    g.gameOver();
                    const lost = { streak: g.streak, result: g.resultSession.getState() };
                    g.newGame();
                    g.streak = 5;
                    for (let i = 0; i < 64; i++) g.board[i] = i < 32 ? 1 : 2;
                    g.gameOver();
                    const drawn = { streak: g.streak, result: g.resultSession.getState() };
                    return { lost, drawn };
                });
                check(states.lost.streak === 0 && states.lost.result === null,
                    'reversi: AI defeat resets streak but never publishes');
                check(states.drawn.streak === 5 && states.drawn.result === null,
                    'reversi: AI draw preserves streak but never publishes');
                check(net.posts.length === 0, 'reversi: defeat/draw do not POST');
            } finally { await context.close(); }
        }
        if (game.id === 'tower-defense') {
            const { context, page, net } = await fixture(game, 'success');
            try {
                await page.evaluate(() => { window.tdGame.level = window.__TD_LEVELS__[1]; });
                const { snapshots } = await finish(page, game, 67);
                await waitStatus(page, game, 'sent');
                const level = await page.evaluate(() => window.__TD_LEVELS__[1].id);
                check(snapshots[0].game === 'tower-defense-' + level,
                    'tower-defense: board follows selected level');
                check(net.posts.length === 1 && net.posts[0].game === snapshots[0].game,
                    'tower-defense: score submitted only to selected level');
            } finally { await context.close(); }
        }
        console.log('PASS ' + game.id + ': immutable receipts, fault recovery, view isolation, eligibility');
    }
    if (cases.some(game => game.dual)) {
        const game = cases.find(game => game.dual);
        const { context, page, net } = await fixture(game, 'partial');
        try {
            const { snapshots } = await finish(page, game, 57, { endless: true });
            await until(page, () => {
                const g = window.planetMergeGame;
                return g.resultSessions.alltime.getState()?.submission === 'sent'
                    && g.resultSessions.daily.getState()?.submission === 'queued';
            }, null, 'planet-merge: independent board receipts');
            check(snapshots.length === 2 && net.posts.some(p => p.game === 'planet-merge')
                && net.posts.some(p => p.game.startsWith('planet-merge-d')),
                'planet-merge: endless also sends both historical boards');
            check((await pending(page)).length === 1
                && (await pending(page))[0].game.startsWith('planet-merge-d'),
            'planet-merge: only failing daily POST remains queued');
            await page.click('#pm-tab-daily');
            await waitVisible(page, game, 'Saved on this device');
            await page.click('#pm-tab-alltime');
            await waitVisible(page, game, 'Score uploaded');
            net.mode = 'success';
            await page.evaluate(() => window.dispatchEvent(new Event('online')));
            await waitStatus(page, game, 'sent');
            await until(page, key => JSON.parse(localStorage.getItem(key) || '[]').length === 0,
                PENDING, 'planet-merge: only pending board should retry');
            check(net.posts.filter(x => x.game === 'planet-merge').length === 1,
                'planet-merge: successful all-time POST never re-journaled');
        } finally { await context.close(); }
    }
    console.log('PASS scoreboard classic batch: ' + count + ' assertions');
} finally {
    await browser.close();
}
