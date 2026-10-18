// verify-all: timeout=120000
// Real Chromium Service Worker lifecycle test: no setBypassServiceWorker().
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { renderServiceWorker } from '../tools/build/service-worker-cache.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const source = await readFile(join(ROOT, 'public/sw.js'), 'utf8');
const built = await readFile(join(ROOT, 'dist/sw.js'), 'utf8');
assert(!built.includes('__GAMES_BUILD_ID__') && !built.includes('__GAMES_PRECACHE__')
    && !built.includes('__GAMES_ASSETS__'),
    'production SW must be stamped by Vite, not served as an unexpanded template');

function send(res, code, type, body) {
    res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(body);
}
async function listen(server) {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    return 'http://127.0.0.1:' + server.address().port;
}
async function stop(server) {
    await new Promise(resolve => server.close(resolve));
}
const distServer = createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const path = pathname === '/' ? 'index.html' : pathname.slice(1);
    if (path.includes('..')) return send(res, 404, 'text/plain', 'missing');
    try {
        const body = await readFile(join(ROOT, 'dist', path));
        const types = {
            '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
            '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
            '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg',
            '.ico': 'image/x-icon', '.woff2': 'font/woff2',
        };
        send(res, 200, types[extname(path)] || 'application/octet-stream', body);
    } catch { send(res, 404, 'text/plain', 'missing'); }
});
let release = 'v1';
let brokenInstall = false;
let failedInstallRequests = 0;
const cacheName = version => 'games-cache-v3-test-' + version;
const swFor = version => renderServiceWorker(source, {
    buildId: 'test-' + version,
    precache: ['/', '/index.html', '/assets/js/home-' + version + '.js',
        ...(brokenInstall ? ['/assets/js/install-error.js'] : [])],
    assets: ['/assets/js/home-' + version + '.js', '/assets/js/game-' + version + '.js',
        '/assets/js/extra-' + version + '.js'],
});
const shell = game => '<!doctype html><html><head><meta charset="utf-8"></head><body>'
    + '<h1>' + (game ? 'Game ' : 'Home ') + release + '</h1>'
    + '<script src="/assets/js/' + (game ? 'game-' : 'home-') + release + '.js"></script>'
    + '</body></html>';
const fixtureServer = createServer((req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path === '/sw.js') return send(res, 200, 'text/javascript', swFor(release));
    if (path === '/' || path === '/index.html') return send(res, 200, 'text/html', shell(false));
    if (path === '/game.html') return send(res, 200, 'text/html', shell(true));
    if (path === '/assets/js/install-error.js') {
        failedInstallRequests++;
        return send(res, 503, 'text/plain', 'blocked');
    }
    const match = /^\/assets\/js\/(home|game|extra)-(v\d+)\.js$/.exec(path);
    if (match && match[2] === release) {
        return send(res, 200, 'text/javascript',
            'document.body.dataset.' + match[1] + ' = "' + match[2] + '";');
    }
    send(res, 404, 'text/plain', 'missing');
});
const prodBase = await listen(distServer);
const base = await listen(fixtureServer);
const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: LAUNCH_ARGS });
let page;
const keys = p => p.evaluate(() => caches.keys());
const owned = async p => (await keys(p)).filter(name => name.startsWith('games-cache-')).sort();
const counts = p => p.evaluate(async () => {
    const result = {};
    for (const name of await caches.keys()) {
        if (!name.startsWith('games-cache-')) continue;
        result[name] = (await (await caches.open(name)).keys()).length;
    }
    return result;
});
const waitForOwned = async (p, names) => {
    const want = names.sort();
    await p.waitForFunction(async expected => {
        const have = (await caches.keys()).filter(name => name.startsWith('games-cache-')).sort();
        return JSON.stringify(have) === JSON.stringify(expected);
    }, { timeout: 10000 }, want);
};
async function open(path) {
    const next = await browser.newPage();
    await next.goto(base + path, { waitUntil: 'load' });
    return next;
}
async function update(p) {
    await p.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
}
async function waitForWaiting(p) {
    await p.waitForFunction(async () => {
        const reg = await navigator.serviceWorker.getRegistration();
        return reg?.waiting?.state === 'installed';
    }, { timeout: 12000 });
}
async function checkSaved(p) {
    const values = await p.evaluate(() => [
        localStorage.getItem('game:sample:v1:save'),
        localStorage.getItem('scoreboard:pending:v1'),
        localStorage.getItem('site_lang'),
        localStorage.getItem('site_theme'),
    ]);
    assert.deepEqual(values, ['{"level":7}', '[{"score":25,"game":"sample"}]', 'zh', 'dark']);
}
try {
    // Use the real Vite build, not just a fixture copy of the worker:
    // registration, first-install precache and offline entry must work together.
    const productionPage = await browser.newPage();
    try {
        await productionPage.goto(prodBase + '/', { waitUntil: 'load', timeout: 30000 });
        await productionPage.waitForFunction(() => Boolean(navigator.serviceWorker.controller),
            { timeout: 25000 });
        await productionPage.setOfflineMode(true);
        await productionPage.reload({ waitUntil: 'domcontentloaded' });
        await productionPage.waitForFunction(() => {
            const filter = document.getElementById('games-filter');
            return filter && !filter.hidden && document.querySelectorAll('.game-card').length >= 10;
        }, { timeout: 10000 });
    } finally {
        await productionPage.close();
    }

    page = await open('/');
    await page.evaluate(async () => {
        const legacy = await caches.open('games-cache-v2');
        for (let i = 0; i < 30; i++) {
            await legacy.put('/assets/js/obsolete-' + i + '.js', new Response('old_' + i));
        }
        await legacy.put('/old-game.html?daily=1',
            new Response('<!doctype html><title>Old offline game</title>', {
                headers: { 'Content-Type': 'text/html' },
            }));
        await caches.open('unrelated-feature-cache');
        localStorage.setItem('game:sample:v1:save', '{"level":7}');
        localStorage.setItem('scoreboard:pending:v1', '[{"score":25,"game":"sample"}]');
        localStorage.setItem('site_lang', 'zh');
        localStorage.setItem('site_theme', 'dark');
    });
    const legacyCount = (await counts(page))['games-cache-v2'];
    assert.equal(legacyCount, 31, 'reproduce an accumulated legacy cache');
    await page.evaluate(async () => {
        await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
        await navigator.serviceWorker.ready;
    });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    await waitForOwned(page, ['games-cache-v2', cacheName('v1')]);
    await page.setOfflineMode(true);
    await page.reload({ waitUntil: 'load' });
    assert.equal(await page.$eval('body', el => el.dataset.home), 'v1', 'first-install offline homepage');
    // Prior v2 cache used full navigation URLs. Ignore search while migrating.
    await page.goto(base + '/old-game.html', { waitUntil: 'domcontentloaded' });
    assert.equal(await page.title(), 'Old offline game', 'legacy query navigation still works offline');
    await page.setOfflineMode(false);
    await page.goto(base + '/game.html?daily=1', { waitUntil: 'load' });
    assert.equal(await page.$eval('body', el => el.dataset.game), 'v1');
    await page.waitForFunction(async () => Boolean(await (await caches.open('games-cache-v3-test-v1')).match('/game.html')));
    const urls = await page.evaluate(async () => (await (await caches.open('games-cache-v3-test-v1')).keys()).map(r => r.url));
    assert(!urls.some(url => url.includes('?daily=')), 'navigation queries do not add cache keys');

    release = 'v2';
    await update(page);
    await waitForWaiting(page);
    assert((await keys(page)).includes(cacheName('v1')), 'old tab keeps its hashed resources');
    await page.setOfflineMode(true);
    await page.reload({ waitUntil: 'load' });
    assert.equal(await page.$eval('body', el => el.dataset.game), 'v1', 'old tab is usable while update waits');
    await page.setOfflineMode(false);
    await page.close();
    page = await open('/');
    await waitForOwned(page, [cacheName('v1'), cacheName('v2')]);
    assert.equal(await page.$eval('body', el => el.dataset.home), 'v2');
    await checkSaved(page);
    assert((await keys(page)).includes('unrelated-feature-cache'), 'unowned caches preserved');
    assert(!('games-cache-v2' in await counts(page)), 'legacy cache is removed on next activation');
    console.log('SW growth: legacy ' + legacyCount + ' entries; after v2 ' + JSON.stringify(await counts(page)));

    await page.setOfflineMode(true);
    await page.goto(base + '/game.html', { waitUntil: 'load' });
    assert.equal(await page.$eval('body', el => el.dataset.game), 'v1', 'previous-version offline game entry');
    await page.setOfflineMode(false);
    await page.goto(base + '/game.html', { waitUntil: 'load' });
    assert.equal(await page.$eval('body', el => el.dataset.game), 'v2');
    await page.waitForFunction(async () => Boolean(await (await caches.open('games-cache-v3-test-v2')).match('/game.html')));

    release = 'v3';
    await update(page);
    await waitForWaiting(page);
    await page.close();
    page = await open('/');
    await waitForOwned(page, [cacheName('v2'), cacheName('v3')]);
    await checkSaved(page);
    await page.setOfflineMode(true);
    await page.goto(base + '/game.html', { waitUntil: 'load' });
    assert.equal(await page.$eval('body', el => el.dataset.game), 'v2', 'last version still available offline');
    await page.setOfflineMode(false);
    console.log('SW bounded after three releases: ' + JSON.stringify(await counts(page)));

    release = 'v4';
    brokenInstall = true;
    await update(page).catch(() => {});
    // Observe the actual failed server request: checking !installing alone may
    // pass prematurely before Chromium even starts installing the update.
    for (let attempt = 0; attempt < 100 && failedInstallRequests === 0; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert(failedInstallRequests > 0, 'v4 install really requested the broken URL');
    await page.waitForFunction(async () => {
        const r = await navigator.serviceWorker.getRegistration();
        return !r.installing;
    }, { timeout: 10000 });
    assert.deepEqual(await owned(page), [cacheName('v2'), cacheName('v3')].sort(),
        'failed v4 precache removes its partial cache');
    assert.equal(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).waiting), null);
    brokenInstall = false;

    release = 'v2';
    await update(page);
    await waitForWaiting(page);
    await page.close();
    page = await open('/');
    await waitForOwned(page, [cacheName('v2'), cacheName('v3')]);
    await page.reload({ waitUntil: 'load' });
    assert.equal(await page.$eval('body', el => el.dataset.home), 'v2', 'rollback to earlier build');
    await checkSaved(page);
    console.log('PASS real Chromium SW: stamped production offline, 3 deploys, open tabs, failed install, rollback, stored data');
} finally {
    if (page && !page.isClosed()) await page.close();
    await browser.close();
    await stop(fixtureServer);
    await stop(distServer);
}
