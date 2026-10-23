#!/usr/bin/env node
// verify-all: timeout=300000
// Chrome 6c-2b: real daily result overlays, immutable day/score/name and journal
// replay. Run unchanged against source and the production-built dist.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { keepPage, exitIfNoPages } from './lib/page-filter.mjs';

const BASE = process.argv.find(arg => arg.startsWith('http')) || 'http://127.0.0.1:8899';
const PENDING = 'scoreboard:pending:v1';
const CASES = [
    { id: 'gravity-slingshot', prefix: 'gd', keyPrefix: 'gravity', start: 'startDailyMode',
        score: 'totalLaunches', date: 'dailyDateKey', finish: 'finishDaily', menu: 'enterMenu',
        other: 'startLevelMode', localKey: 'gd_daily_' },
    { id: 'circuit', prefix: 'cc', keyPrefix: 'circuit', start: 'startDaily',
        score: 'moves', date: 'dailyDateKey', finish: 'finishDaily', menu: 'showMenu',
        other: 'startLevel', localKey: 'cc_daily_' },
    { id: 'lumen', prefix: 'lm', keyPrefix: 'lumen', start: 'startDaily',
        score: 'flips', date: 'daily.dateKey', finish: 'finishDaily', menu: 'showMenu',
        other: 'startLevel', localKey: 'lm_daily_' },
    { id: 'bond-forge', prefix: 'bf', keyPrefix: 'bond-forge', start: 'startDaily',
        score: 'dailyTotalDrags', date: 'dailyDateKey', finish: 'finishDaily', menu: 'toMenu',
        other: 'startLevels', localKey: 'bf_daily_' },
].filter(game => keepPage(game.id));
exitIfNoPages(CASES, 'verify-scoreboard-daily-batch');

const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: LAUNCH_ARGS });
const headers = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
};
let checks = 0;
function check(value, label) { assert.ok(value, label); checks++; }
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, label) {
    const expires = Date.now() + 9000;
    while (!predicate()) {
        if (Date.now() >= expires) throw new Error(label);
        await wait(20);
    }
}
async function fixture(game, post = 'failure', seed = null) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    const errors = [];
    const net = {
        post, get: 'success', label: 'Remote player',
        posts: [], gets: [], heldPosts: [], heldGets: [],
    };
    page.on('pageerror', error => errors.push(error.message));
    await page.setBypassServiceWorker(true);
    await page.setViewport({ width: 390, height: 664 });
    await page.setRequestInterception(true);
    page.on('request', request => {
        void (async () => {
            if (request.url().startsWith('https://game-scores.orangely.workers.dev/')) {
                if (request.method() === 'OPTIONS') return request.respond({ status: 204, headers });
                if (request.method() === 'POST') {
                    const entry = JSON.parse(request.postData());
                    net.posts.push(entry);
                    if (net.post === 'hold') { net.heldPosts.push(request); return; }
                    if (net.post === 'network') return request.abort('failed');
                    const accepted = net.post === 'success'
                        || (net.post === 'selective' && entry.score === 37);
                    return request.respond({ status: accepted ? 200 : 500, headers, body: '{}' });
                }
                net.gets.push(request.url());
                if (net.get === 'hold') { net.heldGets.push(request); return; }
                return request.respond({ status: 200, headers, contentType: 'application/json',
                    body: JSON.stringify([{ name: net.label, score: 7 }]) });
            }
            if (/^https?:/.test(request.url()) && !request.url().startsWith(BASE)) {
                return request.respond({ status: 204, headers });
            }
            return request.continue();
        })().catch(error => { if (!page.isClosed()) errors.push(error.message); });
    });
    await page.evaluateOnNewDocument(({ key, initial }) => {
        localStorage.setItem('site_lang', 'en');
        localStorage.setItem('player_name', 'Original daily player');
        if (initial) localStorage.setItem(key, JSON.stringify(initial));
    }, { key: PENDING, initial: seed });
    await page.goto(BASE + '/' + game.id + '.html', { waitUntil: 'load' });
    await page.waitForFunction(prefix => !!window[prefix + 'Game'], {}, game.prefix);
    return { context, page, net, errors };
}
async function finish(page, game, score, crossMidnight = false) {
    return page.evaluate(({ game, score, crossMidnight }) => {
        const g = window[game.prefix + 'Game'];
        const now = Date.now;
        if (crossMidnight) Date.now = () => Date.UTC(2026, 9, 22, 15, 59, 59);
        try {
            g[game.start]();
            const date = game.date === 'daily.dateKey' ? g.daily.dateKey : g[game.date];
            if (crossMidnight) Date.now = () => Date.UTC(2026, 9, 22, 16, 0, 1);
            if (game.prefix === 'lm') g.session.flips = score;
            else g[game.score] = score;
            g[game.finish]();
            return { date, score, game: game.keyPrefix + '-d' + date };
        } finally {
            Date.now = now;
        }
    }, { game, score, crossMidnight });
}
const queue = page => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), PENDING);
async function waitStatus(page, game, label) {
    await page.waitForFunction(({ prefix, label }) => {
        const el = document.getElementById(prefix + '-lb-status');
        return el && el.checkVisibility() && el.textContent.includes(label);
    }, { timeout: 9000 }, { prefix: game.prefix, label });
}
async function waitRows(page, game, label) {
    await page.waitForFunction(({ prefix, label }) =>
        document.getElementById(prefix + '-lb-list').textContent.includes(label),
    { timeout: 9000 }, { prefix: game.prefix, label });
}
async function settled(page, game) {
    await page.evaluate(prefix => {
        const session = window[prefix + 'Game'].resultSession;
        return session.publish(session.getState().entry);
    }, game.prefix);
}
async function mutateRun(page, game) {
    await page.evaluate(game => {
        const g = window[game.prefix + 'Game'];
        if (game.prefix === 'lm') {
            g.daily.dateKey = '20990101';
            g.session.flips = 999;
        } else {
            g[game.date] = '20990101';
            if (game.prefix === 'bf') g.dailyStartedAt = Date.UTC(2099, 0, 1);
            g[game.score] = 999;
        }
        localStorage.setItem('player_name', 'Future player');
    }, game);
}

try {
    for (const game of CASES) {
        // Finish a run after UTC+8 midnight: completion marker and POST must
        // still belong to the day's challenge selected when it was started.
        {
            const { context, page, net, errors } = await fixture(game);
            try {
                const result = await finish(page, game, 17, true);
                await waitRows(page, game, 'Remote player');
                await waitStatus(page, game, 'Saved on this device');
                const saved = await queue(page);
                check(result.date === '20261022' && saved.length === 1
                    && saved[0].game === game.keyPrefix + '-d20261022'
                    && saved[0].name === 'Original daily player' && saved[0].score === 17,
                game.id + ': cross-midnight result identity and failed POST are durable');
                check(await page.evaluate(key => localStorage.getItem(key), game.localKey + '20261022') === '17',
                    game.id + ': original local completion record keeps the start date');
                const status = await page.$eval('#' + game.prefix + '-lb-status', el => el.textContent);
                check(!status.includes('Score uploaded'), game.id + ': successful GET cannot confirm failed POST');
                await page.evaluate(() => {
                    localStorage.setItem('site_lang', 'zh');
                    window.dispatchEvent(new Event('site-settings:changed'));
                });
                await waitStatus(page, game, '成绩已暂存');
                await settled(page, game);
                const before = net.posts.length;
                net.post = 'success';
                await mutateRun(page, game);
                await page.evaluate(() => window.dispatchEvent(new Event('online')));
                await waitStatus(page, game, '成绩已上传');
                await page.waitForFunction(key => JSON.parse(localStorage.getItem(key) || '[]').length === 0, {}, PENDING);
                check(net.posts.length > before && net.posts.slice(before).every(item =>
                    item.game === result.game && item.name === saved[0].name && item.score === 17),
                game.id + ': retry never reads tomorrow, edited nickname, or changed score');
                check(errors.length === 0, game.id + ': no browser errors: ' + errors.join('; '));
            } finally { await context.close(); }
        }
        // A network exception and HTTP 500 must both preserve the original
        // retry entry; quota-denied storage must never claim it was saved.
        {
            const { context, page, errors } = await fixture(game, 'network');
            try {
                const result = await finish(page, game, 21);
                await waitStatus(page, game, 'Saved on this device');
                const items = await queue(page);
                check(items.length === 1 && items[0].game === result.game && items[0].score === 21,
                    game.id + ': network error journals the original score');
                check(errors.length === 0, game.id + ': network error handled');
            } finally { await context.close(); }
        }
        {
            const { context, page, net, errors } = await fixture(game);
            try {
                await page.evaluate(key => {
                    const original = Storage.prototype.setItem;
                    window.__restoreScoreStorage = () => { Storage.prototype.setItem = original; };
                    Storage.prototype.setItem = function (name, value) {
                        if (name === key) throw new Error('Injected journal quota failure');
                        return original.call(this, name, value);
                    };
                }, PENDING);
                await finish(page, game, 23);
                await waitRows(page, game, 'Remote player');
                await waitStatus(page, game, 'not uploaded or saved');
                check((await queue(page)).length === 0, game.id + ': storage denial is not queued');
                await settled(page, game);
                const before = net.posts.length;
                net.post = 'success';
                await page.evaluate(() => {
                    window.__restoreScoreStorage();
                    window.dispatchEvent(new Event('online'));
                });
                await waitStatus(page, game, 'Score uploaded');
                check(net.posts.length > before && net.posts.slice(before).every(item => item.score === 23),
                    game.id + ': unsaved in-memory entry retries unchanged');
                check(errors.length === 0, game.id + ': quota failure handled');
            } finally { await context.close(); }
        }
        // Repeated completion is an idempotent run, and a late GET must not
        // repaint a newer run after navigating or restarting the daily mode.
        {
            const { context, page, net, errors } = await fixture(game, 'hold');
            try {
                const original = await finish(page, game, 31);
                await until(() => net.heldPosts.length === 1, game.id + ': expected a held POST');
                await mutateRun(page, game);
                await page.evaluate(game => {
                    const g = window[game.prefix + 'Game'];
                    g[game.finish]();
                    g[game.finish]();
                }, game);
                check(net.posts.length === 1 && net.posts[0].game === original.game
                    && net.posts[0].name === 'Original daily player' && net.posts[0].score === 31,
                game.id + ': repeated settlement cannot submit again or rewrite the POST');
                net.post = 'success';
                await net.heldPosts[0].respond({ status: 200, headers, body: '{}' });
                await waitStatus(page, game, 'Score uploaded');

                net.get = 'hold';
                await finish(page, game, 13);
                await until(() => net.heldGets.length > 0, game.id + ': expected held prior GET');
                await page.evaluate(game => {
                    const g = window[game.prefix + 'Game'];
                    g[game.menu]();
                }, game);
                net.get = 'success';
                net.label = 'Current result';
                await finish(page, game, 29);
                await waitRows(page, game, 'Current result');
                const old = net.heldGets[0];
                const oldResponse = page.waitForResponse(response => response.request() === old);
                await old.respond({ status: 200, headers, contentType: 'application/json',
                    body: JSON.stringify([{ name: 'Stale result', score: 13 }]) });
                await (await oldResponse).text();
                await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
                const rows = await page.$eval('#' + game.prefix + '-lb-list', el => el.textContent);
                check(rows.includes('Current result') && !rows.includes('Stale result'),
                    game.id + ': dismissed stale GET cannot repaint a newer result');
                const score = await page.$eval('#' + game.prefix + '-over-score', el => el.textContent);
                check(score.includes('29'), game.id + ': current visible score stays on the new run');
                check(errors.length === 0, game.id + ': old response isolation has no browser errors');
            } finally { await context.close(); }
        }
        // Reloading a page with no open result replays an old pending date/name.
        {
            const old = { game: game.keyPrefix + '-d20261022',
                name: 'Yesterday original', score: 19, at: Date.now() };
            const { context, page, net, errors } = await fixture(game, 'success', [old]);
            try {
                await until(() => net.posts.length > 0, game.id + ': bootstrap POST missing');
                await page.waitForFunction(key => JSON.parse(localStorage.getItem(key) || '[]').length === 0, {}, PENDING);
                check(net.posts[0].game === old.game && net.posts[0].name === old.name
                    && net.posts[0].score === old.score,
                game.id + ': bootstrap recovers original date/name/score');
                check(await page.evaluate(prefix => {
                    const g = window[prefix + 'Game'];
                    return prefix === 'gd' ? g.phase === 'menu' : g.state === 'menu';
                }, game.prefix), game.id + ': bootstrap leaves the menu alone');
                check(errors.length === 0, game.id + ': boot recovery has no page errors');
            } finally { await context.close(); }
        }
        // Two results on the same day remain separate. One can succeed while
        // the other stays queued; concurrent online events must not drop either.
        {
            const { context, page, net, errors } = await fixture(game);
            try {
                await finish(page, game, 37);
                await waitStatus(page, game, 'Saved on this device');
                await finish(page, game, 41);
                await waitStatus(page, game, 'Saved on this device');
                check((await queue(page)).length === 2, game.id + ': two results remain individually retryable');
                net.post = 'selective';
                await page.evaluate(() => window.dispatchEvent(new Event('online')));
                await page.waitForFunction(key => {
                    const rows = JSON.parse(localStorage.getItem(key) || '[]');
                    return rows.length === 1 && rows[0].score === 41;
                }, { timeout: 9000 }, PENDING);
                await waitStatus(page, game, 'Saved on this device');
                check(net.posts.some(item => item.score === 37) && (await queue(page))[0].score === 41,
                    game.id + ': partial successful retry cannot hide a different pending score');
                net.post = 'success';
                await page.evaluate(() => {
                    window.dispatchEvent(new Event('online'));
                    window.dispatchEvent(new Event('online'));
                });
                await waitStatus(page, game, 'Score uploaded');
                await page.waitForFunction(key => JSON.parse(localStorage.getItem(key) || '[]').length === 0, {}, PENDING);
                check(net.posts.some(item => item.score === 41), game.id + ': concurrent online recovers remaining score');
                check(errors.length === 0, game.id + ': mixed outcomes have no browser errors');
            } finally { await context.close(); }
        }
        // Chapter / level / sandbox sessions must not submit daily scores.
        {
            const { context, page, net, errors } = await fixture(game, 'success');
            try {
                await page.evaluate(game => {
                    const g = window[game.prefix + 'Game'];
                    if (game.prefix === 'bf') {
                        g.startLevels();
                        g.startSandbox();
                        g.finishDaily(); // Must not submit a sandbox run.
                    } else {
                        g[game.other](0);
                    }
                }, game);
                check(net.posts.length === 0 && (await queue(page)).length === 0,
                    game.id + ': non-daily modes never submit to the daily board');
                check(errors.length === 0, game.id + ': non-daily mode has no browser errors');
            } finally { await context.close(); }
        }
        console.log('PASS ' + game.id + ': immutable daily, retries, stale GET, partial replay, modes');
    }
    console.log('PASS scoreboard daily batch: ' + checks + ' assertions');
} finally {
    await browser.close();
}
