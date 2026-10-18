#!/usr/bin/env node
/**
 * Shadow Loom lazy-chunk lifecycle: slow network, competing selections, failure,
 * recovery, menu/re-entry and SW cache reuse. Runs against the source server.
 */
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';

const BASE = process.argv.find(arg => arg.startsWith('http')) || 'http://127.0.0.1:8899';
const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: LAUNCH_ARGS });
const page = await browser.newPage();
const failures = [];
const ok = (condition, label) => {
    if (condition) console.log('  ✓ ' + label);
    else { failures.push(label); console.error('  ✗ ' + label); }
};
const isChunk = (url, id) => url.includes('/src/generated/shadow-loom/levels/' + id + '.js');
const ready = (state, id) => page.waitForFunction(({ state, id }) => {
    const game = window.slGame;
    return game && game.state === state && (!id || game.level.id === id);
}, { timeout: 15000 }, { state, id });
const held = [];
let blockRabbit = true;
let blockDeer = true;
await page.setRequestInterception(true);
page.on('request', req => {
    if (blockRabbit && isChunk(req.url(), 'rabbit')) {
        held.push(req);
        return;
    }
    if (blockDeer && isChunk(req.url(), 'deer')) {
        void req.abort('failed');
        return;
    }
    void req.continue();
});
try {
    await page.goto(BASE + '/shadow-loom.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await ready('menu');
    const before = await page.evaluate(() => localStorage.getItem('game:shadow-loom:v1:progress'));
    await page.click('#sl-level-grid .sl-chip:first-child');
    await page.waitForFunction(() => {
        const el = document.getElementById('sl-load-status');
        return !el.hidden && window.slGame.state === 'menu';
    });
    ok(held.length === 1, 'first scene downloads only the selected chunk');
    await page.evaluate(() => window.slGame.startLevel(1));
    await ready('playing', 'bird');
    blockRabbit = false;
    for (const request of held) await request.continue();
    await new Promise(resolve => setTimeout(resolve, 100));
    ok(await page.evaluate(() => window.slGame.level.id === 'bird'), 'late response cannot reopen an outdated scene');

    await page.evaluate(() => window.slGame.showMenu());
    await page.evaluate(() => window.slGame.startLevel(0));
    await ready('playing', 'rabbit');
    await page.evaluate(() => window.slGame.showMenu());
    await page.evaluate(() => window.slGame.startLevel(0));
    await ready('playing', 'rabbit');
    ok(await page.evaluate(() => window.slGame.moves === 0 && window.slGame.elapsed === 0), 're-entry starts clean without touching progress');

    await page.evaluate(() => window.slGame.showMenu());
    await page.evaluate(() => window.slGame.startLevel(3));
    await ready('menu');
    await page.waitForFunction(() => document.querySelector('#sl-load-status .sl-load-retry'));
    ok(await page.evaluate(() => document.getElementById('sl-load-status').textContent.includes('重新加载') || document.getElementById('sl-load-status').textContent.includes('Reload')), 'failed load has accessible recovery');
    ok(await page.evaluate(() => localStorage.getItem('game:shadow-loom:v1:progress')) === before, 'failed import preserves saved progress');

    blockDeer = false;
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }),
        page.click('#sl-load-status .sl-load-retry'),
    ]);
    await ready('menu');
    await page.evaluate(() => window.slGame.startLevel(3));
    await ready('playing', 'deer');
    ok(await page.evaluate(() => window.slGame.level.id === 'deer'), 'reload recovers from an ESM load error');

    // Assert that an installed SW can replay a previously cached level offline.
    await page.waitForFunction(() => !!navigator.serviceWorker?.controller, { timeout: 10000 });
    const cached = await page.evaluate(async () => {
        const url = '/src/generated/shadow-loom/levels/rabbit.js';
        await fetch(url);
        return !!(await caches.match(url));
    });
    ok(cached, 'previously downloaded level is in Cache Storage');
    await page.setOfflineMode(true);
    const offline = await page.evaluate(async () => {
        try { return (await fetch('/src/generated/shadow-loom/levels/rabbit.js')).ok; }
        catch { return false; }
    });
    ok(offline, 'cached level remains available offline via Service Worker');
    await page.setOfflineMode(false);
} finally {
    await browser.close();
}
console.log('\n' + (failures.length ? '✗' : '✓') + ' shadow-loom lazy loading: ' + failures.length + ' failures');
process.exit(failures.length ? 1 : 0);
