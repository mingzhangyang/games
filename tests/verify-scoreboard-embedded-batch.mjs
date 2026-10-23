#!/usr/bin/env node
// verify-all: timeout=300000
// Chrome 6c-2a: real result overlays, real session/journal, fault-injected network.
// Unlike the existing Echo/Maxwell suite, these four games exercise the batch
// migration adapter while preserving their distinct scoring and eligibility.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { keepPage, exitIfNoPages } from './lib/page-filter.mjs';

const BASE = process.argv.find(arg => arg.startsWith('http')) || 'http://127.0.0.1:8899';
const PENDING = 'scoreboard:pending:v1';
const CASES = [
    { id: 'silk-dew', prefix: 'sd', total: 'totalDrags', campaign: false },
    { id: 'crystal-bloom', prefix: 'cb', total: 'totalCost', campaign: true },
    { id: 'flame-verse', prefix: 'fv', total: 'totalCost', campaign: true },
    { id: 'ripple-duet', prefix: 'rd', total: 'totalCost', campaign: true },
].filter(game => keepPage(game.id));
exitIfNoPages(CASES, 'verify-scoreboard-embedded-batch');
const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: LAUNCH_ARGS });
const headers = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
};
let checks = 0;
function check(value, why) { assert.ok(value, why); checks++; }
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function until(condition, reason) {
    const deadline = Date.now() + 9000;
    while (!condition()) {
        if (Date.now() >= deadline) throw new Error(reason);
        await wait(20);
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
        localStorage.setItem('player_name', 'Batch tester');
        if (seed) localStorage.setItem(key, JSON.stringify(seed));
    }, { key: PENDING, seed: pending });
    await page.goto(BASE + '/' + game.id + '.html', { waitUntil: 'load' });
    await page.waitForFunction(prefix => !!window[prefix + 'Game'], {}, game.prefix);
    return { context, page, net, errors };
}
async function finish(page, game, score = 17) {
    return page.evaluate(({ prefix, total, score, qualified }) => {
        const g = window[prefix + 'Game'];
        g.startDaily();
        g.daily[total] = score;
        if (qualified) {
            g.daily.results = g.daily.course.map(() => ({ stars: 3, drags: 1 }));
            g.daily.stars = 3 * g.daily.course.length;
        }
        const key = g.daily.key;
        g.finishDaily();
        return { key, score };
    }, { ...game, score, qualified: game.id === 'silk-dew' });
}
const queue = page => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), PENDING);
async function waitStatus(page, game, label, suffix = 'lb-status') {
    await page.waitForFunction(({ prefix, label, suffix }) => {
        const node = document.getElementById(prefix + '-' + suffix);
        return !!node && node.checkVisibility() && node.textContent.includes(label);
    }, { timeout: 9000 }, { prefix: game.prefix, label, suffix });
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

try {
    for (const game of CASES) {
        // GET 200 never certifies POST 500. The failed immutable snapshot survives
        // language changes, tomorrow's date/name/score and a real online event.
        {
            const { context, page, net, errors } = await fixture(game);
            try {
                const result = await finish(page, game);
                await waitRows(page, game, 'Remote player');
                await waitStatus(page, game, 'Saved on this device');
                const saved = await queue(page);
                check(saved.length === 1 && saved[0].game === game.id + '-d' + result.key.replaceAll('-', '')
                    && saved[0].name === 'Batch tester' && saved[0].score === result.score,
                game.id + ': failed POST is journaled with exact immutable identity');
                const status = await page.$eval('#' + game.prefix + '-lb-status', node => node.textContent);
                check(!status.includes('Score uploaded'), game.id + ': successful GET does not masquerade as POST success');
                await page.evaluate(() => {
                    localStorage.setItem('site_lang', 'zh');
                    window.dispatchEvent(new Event('site-settings:changed'));
                });
                await waitStatus(page, game, '成绩已暂存');
                await settled(page, game);
                const count = net.posts.length;
                net.post = 'success';
                await page.evaluate(({ prefix, total }) => {
                    const g = window[prefix + 'Game'];
                    g.daily.key = '2099-01-01';
                    g.daily[total] = 999;
                    localStorage.setItem('player_name', 'Future player');
                    window.dispatchEvent(new Event('online'));
                }, game);
                await waitStatus(page, game, '成绩已上传');
                await page.waitForFunction(key => JSON.parse(localStorage.getItem(key) || '[]').length === 0, {}, PENDING);
                check(net.posts.length > count && net.posts.slice(count).every(entry =>
                    entry.game === saved[0].game && entry.name === saved[0].name && entry.score === saved[0].score),
                game.id + ': reconnect never rewrites yesterday, original player or score');
                check(errors.length === 0, game.id + ': no errors in offline/retry flow: ' + errors.join('; '));
            } finally { await context.close(); }
        }
        // Network errors must be treated like HTTP errors, not unhandled throws.
        {
            const { context, page, errors } = await fixture(game, 'network');
            try {
                await finish(page, game, 21);
                await waitStatus(page, game, 'Saved on this device');
                check((await queue(page)).length === 1, game.id + ': network error preserves a durable entry');
                check(errors.length === 0, game.id + ': no unhandled network errors: ' + errors.join('; '));
            } finally { await context.close(); }
        }
        // Denied storage is visibly NOT SAVED. Online recovery uses the in-memory
        // frozen snapshot; neither cached rows nor a missing journal is a receipt.
        {
            const { context, page, net, errors } = await fixture(game);
            try {
                await page.evaluate(key => {
                    const original = window.Storage.prototype.setItem;
                    window.__restoreScoreStorage = () => { window.Storage.prototype.setItem = original; };
                    window.Storage.prototype.setItem = function (name, value) {
                        if (name === key) throw new Error('Injected journal quota failure');
                        return original.call(this, name, value);
                    };
                }, PENDING);
                await finish(page, game, 23);
                await waitRows(page, game, 'Remote player');
                await waitStatus(page, game, 'not uploaded or saved');
                check((await queue(page)).length === 0, game.id + ': storage denial must not invent a persisted score');
                await settled(page, game);
                net.post = 'success';
                const count = net.posts.length;
                await page.evaluate(() => {
                    window.__restoreScoreStorage();
                    window.dispatchEvent(new Event('online'));
                });
                await waitStatus(page, game, 'Score uploaded');
                check(net.posts.length > count && net.posts.slice(count).every(entry => entry.score === 23),
                    game.id + ': original unsaved score retries from memory');
                check(errors.length === 0, game.id + ': storage denial handled without page errors');
            } finally { await context.close(); }
        }
        // A repeated completion cannot submit twice or overwrite a frozen
        // identity. A late GET from a dismissed result must not overwrite a new run.
        {
            const { context, page, net, errors } = await fixture(game, 'hold');
            try {
                const initial = await finish(page, game, 31);
                await until(() => net.heldPosts.length === 1, game.id + ': expected a held POST');
                await page.evaluate(({ prefix, total }) => {
                    const g = window[prefix + 'Game'];
                    g.daily.key = '2099-01-01';
                    g.daily[total] = 999;
                    g.finishDaily();
                    g.finishDaily();
                }, game);
                check(net.posts.length === 1 && net.posts[0].score === 31
                    && net.posts[0].game === game.id + '-d' + initial.key.replaceAll('-', ''),
                game.id + ': duplicate settlement cannot alter the first submission');
                net.post = 'success';
                await net.heldPosts[0].respond({ status: 200, headers, body: '{}' });
                await waitStatus(page, game, 'Score uploaded');

                net.get = 'hold';
                await page.evaluate(prefix => window[prefix + 'Game'].toMenu(), game.prefix);
                await finish(page, game, 13);
                await until(() => net.heldGets.length > 0, game.id + ': expected old GET');
                net.get = 'success';
                net.label = 'Current result';
                await page.evaluate(prefix => window[prefix + 'Game'].toMenu(), game.prefix);
                await finish(page, game, 29);
                await waitRows(page, game, 'Current result');
                const old = net.heldGets[0];
                const oldResponse = page.waitForResponse(response => response.request() === old);
                await old.respond({ status: 200, headers, contentType: 'application/json',
                    body: JSON.stringify([{ name: 'Stale result', score: 13 }]) });
                await (await oldResponse).text();
                await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
                const rows = await page.$eval('#' + game.prefix + '-lb-list', node => node.textContent);
                check(rows.includes('Current result') && !rows.includes('Stale result'),
                    game.id + ': stale GET cannot overwrite the new view');
                const score = await page.$eval('#' + game.prefix + '-over-score', node => node.textContent);
                check(score.includes('29'), game.id + ': next result preserves its own score');
                check(errors.length === 0, game.id + ': no errors in duplicate/stale GET flow: ' + errors.join('; '));
            } finally { await context.close(); }
        }
        // Previously queued scores recover on boot, including while the user
        // remains in the menu. This must not require another completion event.
        {
            const entry = { game: game.id + '-d20261022', name: 'Original player', score: 19, at: Date.now() };
            const { context, page, net, errors } = await fixture(game, 'success', [entry]);
            try {
                await until(() => net.posts.length > 0, game.id + ': startup retry not observed');
                await page.waitForFunction(key => JSON.parse(localStorage.getItem(key) || '[]').length === 0, {}, PENDING);
                check(net.posts[0].game === entry.game && net.posts[0].name === entry.name
                    && net.posts[0].score === entry.score, game.id + ': bootstrap replays original snapshot');
                check(await page.evaluate(prefix => window[prefix + 'Game'].state === 'menu', game.prefix),
                    game.id + ': startup retry does not start a new game');
                check(errors.length === 0, game.id + ': startup retry has no errors');
            } finally { await context.close(); }
        }
        if (game.campaign) {
            // Three all-time campaigns use the level-clear panel; a new run with
            // incomplete progress cannot inherit the previous upload message.
            const { context, page, net, errors } = await fixture(game);
            try {
                await page.evaluate(prefix => {
                    const g = window[prefix + 'Game'];
                    const buttons = [...g.el['level-grid'].querySelectorAll('button[data-level], button[data-index]')];
                    assertNotEmpty(buttons);
                    for (const button of buttons) {
                        g.startLevel(Number(button.dataset.level ?? button.dataset.index));
                        g.progress[g.spec.id] = { stars: 3, bestCost: 3 };
                    }
                    g.startLevel(0);
                    g.maybeSubmitCampaign();
                    g.showClearPanel(3, 3);
                    function assertNotEmpty(value) { if (!value.length) throw Error('No level grid buttons'); }
                }, game.prefix);
                await waitStatus(page, game, 'Saved on this device', 'clear-status');
                check((await queue(page))[0]?.game === game.id, game.id + ': campaign keeps its all-time board key');
                check(await page.$eval('#' + game.prefix + '-over', node => !node.checkVisibility()),
                    game.id + ': campaign receipt uses clear panel without opening daily overlay');
                await settled(page, game);
                net.post = 'success';
                await page.evaluate(() => window.dispatchEvent(new Event('online')));
                await waitStatus(page, game, 'Score uploaded', 'clear-status');
                await page.evaluate(prefix => {
                    const g = window[prefix + 'Game'];
                    g.toMenu();
                    g.progress = {};
                    g.startLevel(0);
                    g.showClearPanel(3, 3);
                }, game.prefix);
                check(await page.$eval('#' + game.prefix + '-clear-status', node => !node.checkVisibility()),
                    game.id + ': incomplete new campaign cannot inherit old receipt');
                check(errors.length === 0, game.id + ': campaign has no page errors: ' + errors.join('; '));
            } finally { await context.close(); }
        } else {
            // Silk Dew is not eligible until every daily stage has THREE stars.
            // It has no campaign submission, even with all campaign levels clear.
            const { context, page, net, errors } = await fixture(game, 'success');
            try {
                await page.evaluate(prefix => {
                    const g = window[prefix + 'Game'];
                    g.startDaily();
                    g.daily.results = g.daily.course.map(() => ({ stars: 2, drags: 1 }));
                    g.daily.totalDrags = g.daily.course.length;
                    g.daily.stars = g.daily.course.length * 2;
                    g.finishDaily();
                }, game.prefix);
                check(net.posts.length === 0, game.id + ': incomplete mastery must not POST');
                check((await queue(page)).length === 0, game.id + ': no misleading pending entry for ineligible run');
                await page.evaluate(prefix => window[prefix + 'Game'].toMenu(), game.prefix);
                await finish(page, game, 11);
                await waitStatus(page, game, 'Score uploaded');
                check(net.posts.length === 1, game.id + ': fully mastered daily run POSTs exactly once');
                check(errors.length === 0, game.id + ': qualification flow has no page errors');
            } finally { await context.close(); }
        }
        console.log('PASS ' + game.id + ': status, retry, persistence, dedupe, stale GET, eligibility and boot');
    }
    console.log('PASS scoreboard embedded batch: ' + checks + ' assertions');
} finally {
    await browser.close();
}
