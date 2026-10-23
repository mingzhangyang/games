#!/usr/bin/env node
// Real result views: an acknowledged GET must never stand in for a score POST.
// Gameplay completion is arranged through the existing game handles; all network,
// storage, language, navigation and result rendering below use the real page code.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { keepPage, exitIfNoPages } from './lib/page-filter.mjs';

const BASE = process.argv.find(arg => arg.startsWith('http')) || 'http://127.0.0.1:8899';
const PENDING = 'scoreboard:pending:v1';
const CASES = [
    { id: 'echo-cave', prefix: 'ec', total: 'totalPulses', best: 'bestPulses' },
    { id: 'maxwell-demon', prefix: 'md', total: 'totalSpent', best: 'bestSpent' },
].filter(game => keepPage(game.id));
exitIfNoPages(CASES, 'verify-scoreboard-results');
const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: LAUNCH_ARGS });
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const headers = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
};

async function until(condition, message) {
    const deadline = Date.now() + 8000;
    while (!condition()) {
        if (Date.now() >= deadline) throw new Error(message);
        await new Promise(resolve => setTimeout(resolve, 20));
    }
}

async function fixture(game, post = 'failure', pending = null) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    const errors = [];
    const net = { post, get: 'success', label: 'Remote player', posts: [], gets: [], heldPosts: [], heldGets: [] };
    page.on('pageerror', error => errors.push(error.message));
    await page.setBypassServiceWorker(true);
    await page.setViewport({ width: 390, height: 664 });
    await page.setRequestInterception(true);
    page.on('request', request => {
        void (async () => {
            if (request.url().startsWith('https://game-scores.orangely.workers.dev/')) {
                if (request.method() === 'OPTIONS') return request.respond({ status: 204, headers });
                if (request.method() === 'POST') {
                    net.posts.push(JSON.parse(request.postData()));
                    if (net.post === 'hold') { net.heldPosts.push(request); return; }
                    if (net.post === 'network') return request.abort('failed');
                    return request.respond({ status: net.post === 'success' ? 200 : 500, headers, body: '{}' });
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
    await page.evaluateOnNewDocument(({ key, seed }) => {
        localStorage.setItem('site_lang', 'en');
        localStorage.setItem('player_name', 'Result tester');
        if (seed) localStorage.setItem(key, JSON.stringify(seed));
    }, { key: PENDING, seed: pending });
    await page.goto(`${BASE}/${game.id}.html`, { waitUntil: 'load' });
    await page.waitForFunction(prefix => !!window[prefix + 'Game'], {}, game.prefix);
    return { context, page, net, errors };
}

async function finish(page, game, score = 17) {
    return page.evaluate(({ prefix, total, score }) => {
        const g = window[prefix + 'Game'];
        g.startDaily();
        g.daily[total] = score;
        const key = g.daily.key;
        g.finishDaily();
        return { key, score };
    }, { ...game, score });
}

const status = (page, game) => page.$eval(`#${game.prefix}-lb-status`, node => node.textContent);
const queue = page => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), PENDING);
async function waitStatus(page, game, text, suffix = 'lb-status') {
    await page.waitForFunction(({ prefix, text, suffix }) => {
        const node = document.getElementById(`${prefix}-${suffix}`);
        return node?.checkVisibility() && node.textContent.includes(text);
    }, { timeout: 8000 }, { prefix: game.prefix, text, suffix });
}
async function waitRows(page, game, text) {
    await page.waitForFunction(({ prefix, text }) =>
        document.getElementById(prefix + '-lb-list').textContent.includes(text),
    { timeout: 8000 }, { prefix: game.prefix, text });
}

// A ready board is rendered before its automatic retry finishes. Wait for the
// existing publish promise so only the subsequent online event can recover it.
async function settledResult(page, game) {
    await page.evaluate(prefix => {
        const session = window[prefix + 'Game'].resultSession;
        return session.publish(session.getState().entry);
    }, game.prefix);
}

try {
    for (const game of CASES) {
        // HTTP failure + valid GET; then restore the network on the real online path.
        {
            const { context, page, net, errors } = await fixture(game);
            try {
                const result = await finish(page, game);
                await waitRows(page, game, 'Remote player');
                await waitStatus(page, game, 'Saved on this device');
                check(!(await status(page, game)).includes('Score uploaded'), `${game.id}: GET never acknowledges POST`);
                const saved = await queue(page);
                check(saved.length === 1 && saved[0].score === 17
                    && saved[0].game === `${game.id}-d${result.key.replaceAll('-', '')}`,
                `${game.id}: failed score is durably journaled with its own day`);
                await page.evaluate(() => {
                    localStorage.setItem('site_lang', 'zh');
                    window.dispatchEvent(new Event('site-settings:changed'));
                });
                await waitStatus(page, game, '成绩已暂存');
                check((await status(page, game)).includes('联网后重试'), `${game.id}: pending state relocalizes`);
                await settledResult(page, game);
                const beforeOnline = net.posts.length;
                net.post = 'success';
                await page.evaluate(({ prefix, total }) => {
                    const g = window[prefix + 'Game'];
                    g.daily.key = '2099-01-01';
                    g.daily[total] = 999;
                    localStorage.setItem('player_name', 'Later player');
                    window.dispatchEvent(new Event('online'));
                }, game);
                await waitStatus(page, game, '成绩已上传');
                await page.waitForFunction(key => JSON.parse(localStorage.getItem(key) || '[]').length === 0, {}, PENDING);
                check(net.posts.length > beforeOnline, `${game.id}: online event starts a new POST`);
                check(net.posts.slice(beforeOnline).every(entry => entry.game === saved[0].game
                    && entry.name === 'Result tester' && entry.score === 17),
                `${game.id}: later day, name and score never rewrite the failed result`);
                check(errors.length === 0, `${game.id}: no page errors: ${errors.join('; ')}`);
            } finally { await context.close(); }
        }

        // A network error has the same durable semantics as HTTP 500.
        {
            const { context, page, errors } = await fixture(game, 'network');
            try {
                await finish(page, game);
                await waitRows(page, game, 'Remote player');
                await waitStatus(page, game, 'Saved on this device');
                check((await queue(page)).length === 1, `${game.id}: network failure preserves retry entry`);
                check(errors.length === 0, `${game.id}: network failure is handled`);
            } finally { await context.close(); }
        }

        // Storage denial must be visible, and the still-open result can recover from memory.
        {
            const { context, page, net, errors } = await fixture(game);
            try {
                await page.evaluate(key => {
                    const original = window.Storage.prototype.setItem;
                    window.__restoreScoreStorage = () => { window.Storage.prototype.setItem = original; };
                    window.Storage.prototype.setItem = function (name, value) {
                        if (name === key) throw new Error('Injected quota failure');
                        return original.call(this, name, value);
                    };
                }, PENDING);
                await finish(page, game, 23);
                await waitRows(page, game, 'Remote player');
                await waitStatus(page, game, 'not uploaded or saved');
                check((await queue(page)).length === 0, `${game.id}: no imaginary durable save`);
                await settledResult(page, game);
                const beforeOnline = net.posts.length;
                net.post = 'success';
                await page.evaluate(() => {
                    window.__restoreScoreStorage();
                    window.dispatchEvent(new Event('online'));
                });
                await waitStatus(page, game, 'Score uploaded');
                check(net.posts.length > beforeOnline && net.posts.slice(beforeOnline).every(entry => entry.score === 23),
                    `${game.id}: unsaved snapshot really retries from memory on online`);
                check(errors.length === 0, `${game.id}: storage failure is handled`);
            } finally { await context.close(); }
        }

        // Campaign results use the clear panel, not the daily result overlay.
        {
            const { context, page, net, errors } = await fixture(game);
            try {
                await page.evaluate(({ prefix, best }) => {
                    const g = window[prefix + 'Game'];
                    g.startLevels();
                    for (const button of g.el['level-grid'].querySelectorAll('[data-level]')) {
                        g.startLevel(Number(button.dataset.level));
                        g.progress[g.spec.id] = { stars: 3, [best]: 3 };
                    }
                    g.startLevels();
                    g.pulseUsed = 3;
                    g.world.spent = 3;
                    g.onLevelWon();
                    g.onLevelWon();
                }, game);
                await waitStatus(page, game, 'Saved on this device', 'clear-status');
                await settledResult(page, game);
                const beforeOnline = net.posts.length;
                check((await queue(page))[0]?.game === game.id, `${game.id}: campaign keeps the all-time board key`);
                check(await page.$eval(`#${game.prefix}-over`, node => !node.checkVisibility()),
                    `${game.id}: campaign feedback is visible without opening the daily overlay`);
                net.post = 'success';
                await page.evaluate(() => window.dispatchEvent(new Event('online')));
                await waitStatus(page, game, 'Score uploaded', 'clear-status');
                check(net.posts.length > beforeOnline, `${game.id}: campaign result recovers on online`);
                await page.evaluate(prefix => {
                    const g = window[prefix + 'Game'];
                    g.toMenu();
                    g.progress = {};
                    g.startLevels();
                    g.onLevelWon();
                }, game.prefix);
                check(await page.$eval(`#${game.prefix}-clear-status`, node => !node.checkVisibility()),
                    `${game.id}: an incomplete campaign never inherits the previous result notice`);
                check(errors.length === 0, `${game.id}: campaign feedback has no page errors`);
            } finally { await context.close(); }
        }

        // Same-run duplicate completion and a date/name/score change during the POST.
        {
            const { context, page, net, errors } = await fixture(game, 'hold');
            try {
                const result = await finish(page, game, 31);
                await until(() => net.heldPosts.length === 1, `${game.id}: initial POST was not observed`);
                await page.evaluate(({ prefix, total }) => {
                    const g = window[prefix + 'Game'];
                    g.daily[total] = 999;
                    g.daily.key = '2099-01-01';
                    localStorage.setItem('player_name', 'Later name');
                    g.finishDaily();
                    g.finishDaily();
                }, game);
                check(net.posts.length === 1, `${game.id}: duplicate completion starts only one POST`);
                check(net.posts[0].name === 'Result tester' && net.posts[0].score === 31
                    && net.posts[0].game === `${game.id}-d${result.key.replaceAll('-', '')}`,
                `${game.id}: submitted identity, score and day are a frozen snapshot`);
                net.post = 'success';
                await net.heldPosts[0].respond({ status: 200, headers, body: '{}' });
                await waitStatus(page, game, 'Score uploaded');
                check(net.posts.length === 1, `${game.id}: acknowledged first submission is not replayed`);
                check(errors.length === 0, `${game.id}: duplicate completion remains safe`);
            } finally { await context.close(); }
        }

        // An old successful GET must not paint over the next result on the same board.
        {
            const { context, page, net, errors } = await fixture(game, 'success');
            try {
                net.get = 'hold';
                await finish(page, game, 13);
                await until(() => net.heldGets.length === 1, `${game.id}: first GET was not observed`);
                net.get = 'success';
                net.label = 'Current result';
                await page.evaluate(prefix => window[prefix + 'Game'].toMenu(), game.prefix);
                await finish(page, game, 29);
                await waitRows(page, game, 'Current result');
                await waitStatus(page, game, 'Score uploaded');
                const oldResponse = page.waitForResponse(response => response.request() === net.heldGets[0]);
                await net.heldGets[0].respond({ status: 200, headers, contentType: 'application/json',
                    body: JSON.stringify([{ name: 'Stale result', score: 13 }]) });
                await (await oldResponse).text();
                await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
                const rows = await page.$eval(`#${game.prefix}-lb-list`, node => node.textContent);
                check(rows.includes('Current result') && !rows.includes('Stale result'), `${game.id}: stale GET is ignored`);
                const score = await page.$eval(`#${game.prefix}-over-score`, node => node.textContent);
                check(score.includes('29'), `${game.id}: new result keeps its own score`);
                check(errors.length === 0, `${game.id}: close/reopen has no page errors`);
            } finally { await context.close(); }
        }

        // A previous day's durable entry retries on boot without completing a new game.
        {
            const entry = { game: `${game.id}-d20261022`, name: 'Original player', score: 19, at: Date.now() };
            const { context, page, net, errors } = await fixture(game, 'success', [entry]);
            try {
                await until(() => net.posts.length > 0, `${game.id}: startup did not retry pending scores`);
                await page.waitForFunction(key => JSON.parse(localStorage.getItem(key) || '[]').length === 0, {}, PENDING);
                check(net.posts[0].game === entry.game && net.posts[0].name === entry.name && net.posts[0].score === entry.score,
                    `${game.id}: startup retry preserves the original day, player and score`);
                check(await page.evaluate(prefix => window[prefix + 'Game'].state === 'menu', game.prefix),
                    `${game.id}: startup retry works while still on the menu`);
                check(errors.length === 0, `${game.id}: startup retry has no page errors`);
            } finally { await context.close(); }
        }
        console.log(`PASS ${game.id}: daily/campaign failure, durable retry, memory recovery, frozen result, stale GET and startup`);
    }
    console.log(`PASS scoreboard result views: ${checks} assertions`);
} finally {
    await browser.close();
}
