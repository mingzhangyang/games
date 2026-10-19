#!/usr/bin/env node
/**
 * Shadow Loom silhouette lifecycle: first load, slow/failed imports, scene race,
 * re-entry, persistence and real Service Worker offline replay.
 *
 * The shared source test server intentionally disables Service Workers. The
 * offline portion uses an isolated origin, rendering the exact production SW
 * template with a finite source-file manifest and build-tagged HTML.
 */
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { renderServiceWorker } from '../tools/build/service-worker-cache.mjs';

const BASE = process.argv.find(arg => arg.startsWith('http')) || 'http://127.0.0.1:8899';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: LAUNCH_ARGS });
const page = await browser.newPage();
const failures = [];
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));
const ok = (condition, label) => {
    if (condition) console.log('  ✓ ' + label);
    else { failures.push(label); console.error('  ✗ ' + label); }
};
const isChunk = (url, id) => url.includes('/src/generated/shadow-loom/levels/' + id + '.js');
const ready = (target, state, id) => target.waitForFunction(({ state, id }) => {
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

// Exercise the real SW template with the same build injection as Vite, but
// index SOURCE modules so the test can assert lazy import caching by source URL.
const SW_BUILD = 'shadow-loom-source-test';
const SW_ASSET_RE = /\.(css|js|mjs|png|svg|jpg|jpeg|webp|ico|json|woff2?)$/i;
async function collectAssets(dir, urlPrefix) {
    const paths = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        const url = urlPrefix + '/' + entry.name;
        if (entry.isDirectory()) paths.push(...await collectAssets(path, url));
        else if (entry.isFile() && SW_ASSET_RE.test(entry.name)) paths.push(url);
    }
    return paths;
}
const assetGroups = await Promise.all(['src', 'js', 'css', 'assets', 'public'].map(dir =>
    collectAssets(join(ROOT, dir), dir === 'public' ? '' : '/' + dir)));
const testAssets = [...new Set(assetGroups.flat())].sort();
const swSource = await readFile(join(ROOT, 'public/sw.js'), 'utf8');
const injectedWorker = renderServiceWorker(swSource, {
    buildId: SW_BUILD,
    precache: ['/', '/index.html'],
    assets: testAssets,
    htmlRoutes: ['/index.html', '/shadow-loom.html'],
});
let serviceWorkerNetworkDown = false;

// Serve the real SW on a separate origin so browser test suites stay isolated.
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.svg': 'image/svg+xml', '.json': 'application/json', '.webp': 'image/webp',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
function createServiceWorkerTestServer() {
    return createServer(async (req, res) => {
        // CDP offline emulation may not propagate to the separate SW target.
        // Reset server connections too, proving that cached code is sufficient.
        if (serviceWorkerNetworkDown) return req.socket.destroy();
        const relativePath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, '') || 'index.html';
        if (relativePath === 'sw.js') {
            res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
            res.end(injectedWorker);
            return;
        }
        const candidates = [join(ROOT, relativePath), join(ROOT, 'public', relativePath)];
        for (const file of candidates) {
            try {
                let bytes = await readFile(file);
                if (extname(file) === '.html') {
                    const html = bytes.toString('utf8').replace(/<head\b[^>]*>/i,
                        head => `${head}\n<meta name="games-build" content="${SW_BUILD}">`);
                    bytes = Buffer.from(html);
                }
                res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
                res.end(bytes);
                return;
            } catch { /* not found, try public/ */ }
        }
        res.writeHead(404);
        res.end('404');
    });
}

let swServer;
let swPage;
try {
    await page.goto(BASE + '/shadow-loom.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await ready(page, 'menu');
    const savedBefore = await page.evaluate(() => localStorage.getItem('game:shadow-loom:v1:progress'));
    await page.click('#sl-level-grid .sl-chip:first-child');
    await page.waitForFunction(() => {
        const el = document.getElementById('sl-load-status');
        return !el.hidden && window.slGame.state === 'menu';
    });
    ok(held.length === 1, 'first scene downloads only the requested chunk');
    await page.evaluate(() => window.slGame.startLevel(1));
    await ready(page, 'playing', 'bird');
    blockRabbit = false;
    for (const request of held) await request.continue();
    await page.waitForFunction(async () => {
        return (await import('/src/generated/shadow-loom/silhouettes.js')).hasSilhouettes('rabbit');
    }, { timeout: 15000 });
    ok(await page.evaluate(() => window.slGame.level.id === 'bird'), 'slow earlier response does not replace selected scene');

    await page.evaluate(() => window.slGame.showMenu());
    await page.evaluate(() => window.slGame.startLevel(0));
    await ready(page, 'playing', 'rabbit');
    await page.evaluate(() => window.slGame.showMenu());
    const repeatedStart = await page.evaluate(async () => {
        await window.slGame.startLevel(0);
        return { moves: window.slGame.moves, elapsed: window.slGame.elapsed };
    });
    ok(repeatedStart.moves === 0 && repeatedStart.elapsed === 0,
        'return and repeat enter reset gameplay only, without altering progress');

    // A lease acquired during download must defer scene activation until ALL
    // leases release; previously this could leave the new scene frozen forever.
    await page.evaluate(() => {
        const game = window.slGame;
        game.showMenu();
        game.pauseOwnership.acquire('ranking');
        game.pauseOwnership.acquire('drawer');
    });
    await page.evaluate(() => window.slGame.startLevel(2));
    ok(await page.evaluate(() => window.slGame.state === 'menu' && window.slGame.pendingLevel?.index === 2),
        'ranking + drawer jointly defer the downloaded scene');
    await page.evaluate(() => window.slGame.pauseOwnership.release('ranking'));
    ok(await page.evaluate(() => window.slGame.state === 'menu'), 'one remaining pause lease still prevents scene start');
    await page.evaluate(() => window.slGame.pauseOwnership.release('drawer'));
    await ready(page, 'playing', 'whale');
    ok(await page.evaluate(() => !window.slGame.isPaused), 'final release activates an unpaused, playable scene');

    await page.evaluate(() => window.slGame.showMenu());
    await page.evaluate(() => window.slGame.startLevel(3));
    await ready(page, 'menu');
    await page.waitForFunction(() => document.querySelector('#sl-load-status .sl-load-retry'));
    ok(await page.evaluate(() => {
        const el = document.getElementById('sl-load-status');
        return /重新加载|Reload/.test(el.textContent);
    }), 'interrupted download exposes a localized reload action');
    ok(await page.evaluate(() => localStorage.getItem('game:shadow-loom:v1:progress')) === savedBefore,
        'failed scene download does not overwrite saved progress');

    blockDeer = false;
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }),
        page.click('#sl-load-status .sl-load-retry'),
    ]);
    await ready(page, 'menu');
    await page.evaluate(() => window.slGame.startLevel(3));
    await ready(page, 'playing', 'deer');
    ok(await page.evaluate(() => window.slGame.level.id === 'deer'), 'reload recovers after an ESM import failure');

    swServer = createServiceWorkerTestServer();
    await new Promise((resolveListen, rejectListen) => {
        swServer.once('error', rejectListen);
        swServer.listen(0, '127.0.0.1', resolveListen);
    });
    const site = 'http://127.0.0.1:' + swServer.address().port;
    swPage = await browser.newPage();
    swPage.on('pageerror', error => pageErrors.push(error.message));
    await swPage.goto(site + '/shadow-loom.html', { waitUntil: 'load', timeout: 45000 });
    await ready(swPage, 'menu');
    await swPage.waitForFunction(() => !!navigator.serviceWorker?.controller, { timeout: 15000 });
    // Cache the navigation as well as its static assets while controlled.
    await swPage.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
    await ready(swPage, 'menu');
    await swPage.evaluate(() => window.slGame.startLevel(0));
    await ready(swPage, 'playing', 'rabbit');
    await swPage.waitForFunction(async () => {
        return !!(await window.caches.match('/src/generated/shadow-loom/levels/rabbit.js'));
    }, { timeout: 15000 });
    ok(true, 'Service Worker caches the selected level module');

    serviceWorkerNetworkDown = true;
    await swPage.setOfflineMode(true);
    await swPage.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
    await ready(swPage, 'menu');
    await swPage.evaluate(() => window.slGame.startLevel(0));
    await ready(swPage, 'playing', 'rabbit');
    ok(await swPage.evaluate(() => window.slGame.st.pieces.length === 4),
        'offline reload uses previously cached geometry and remains playable');
    ok(pageErrors.length === 0, 'no uncaught browser exceptions in lifecycle tests');
} finally {
    serviceWorkerNetworkDown = false;
    if (swPage) await swPage.close().catch(() => {});
    if (swServer) await new Promise(resolveClose => swServer.close(resolveClose));
    await browser.close();
}
console.log('\n' + (failures.length ? '✗' : '✓') + ' shadow-loom lazy loading: ' + failures.length + ' failures');
process.exit(failures.length ? 1 : 0);
