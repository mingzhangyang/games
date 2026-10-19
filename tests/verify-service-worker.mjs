// verify-all: timeout=120000
// Real Chromium Service Worker lifecycle test: no setBypassServiceWorker().
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { renderServiceWorker } from '../tools/build/service-worker-cache.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const source = await readFile(join(ROOT, 'public/sw.js'), 'utf8');
// Source-only verification needs no build. If either build entry point
// exists, require the other too: partial output should fail, not be skipped.
const distDir = join(ROOT, 'dist');
const hasBuiltOutput = ['sw.js', 'index.html']
    .some(name => existsSync(join(distDir, name)));
if (hasBuiltOutput) {
    const built = await readFile(join(distDir, 'sw.js'), 'utf8');
    for (const marker of ['__GAMES_BUILD_ID__', '__GAMES_PRECACHE__', '__GAMES_ASSETS__',
        '__GAMES_HTML_ROUTES__']) {
        assert(!built.includes(marker), `production SW contains unexpanded marker ${marker}`);
    }
    const builtHome = await readFile(join(distDir, 'index.html'), 'utf8');
    assert(/<meta name="games-build" content="[a-f0-9]{16}">/.test(builtHome),
        'production HTML embeds the same build ID as the generated Service Worker');
}

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
let productionNetworkDown = false;
const distServer = createServer(async (req, res) => {
    if (productionNetworkDown) return req.socket.destroy();
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
let fixtureNetworkDown = false;
let brokenInstall = false;
let failedInstallRequests = 0;
let mismatchedInstallPath = null;
let mismatchedInstallRequests = 0;
let v4HomeAssetRequests = 0;
const cacheName = version => 'games-cache-v3-test-' + version;
const swFor = version => renderServiceWorker(source, {
    buildId: 'test-' + version,
    precache: ['/', '/index.html', '/assets/js/home-' + version + '.js',
        ...(brokenInstall ? ['/assets/js/install-error.js'] : [])],
    assets: ['/assets/js/home-' + version + '.js', '/assets/js/game-' + version + '.js',
        '/assets/js/extra-' + version + '.js'],
    htmlRoutes: ['/index.html', '/game.html'],
});
const shell = (game, version = release) => '<!doctype html><html><head><meta charset="utf-8">'
    + '<meta name="games-build" content="test-' + version + '"></head><body>'
    + '<h1>' + (game ? 'Game ' : 'Home ') + version + '</h1>'
    + '<script src="/assets/js/' + (game ? 'game-' : 'home-') + version + '.js"></script>'
    + '</body></html>';
const fixtureServer = createServer((req, res) => {
    // CDP's page.setOfflineMode does not necessarily block fetches performed
    // by the separate Service Worker target. Fail at the actual HTTP server.
    if (fixtureNetworkDown) return req.socket.destroy();
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path === '/sw.js') return send(res, 200, 'text/javascript', swFor(release));
    if (path === '/' || path === '/index.html') {
        if (path === mismatchedInstallPath) {
            mismatchedInstallRequests++;
            // All HTTP requests still succeed, but this HTML belongs to v5.
            return send(res, 200, 'text/html', shell(false, 'v5'));
        }
        return send(res, 200, 'text/html', shell(false));
    }
    // Cloudflare's default HTML handling redirects /game.html to /game.
    if (path === '/game.html') {
        res.writeHead(308, { Location: '/game', 'Cache-Control': 'no-store' });
        return res.end();
    }
    if (path === '/game') return send(res, 200, 'text/html', shell(true));
    if (path === '/assets/js/install-error.js') {
        failedInstallRequests++;
        return send(res, 503, 'text/plain', 'blocked');
    }
    const match = /^\/assets\/js\/(home|game|extra)-(v\d+)\.js$/.exec(path);
    if (match && match[2] === release) {
        if (match[1] === 'home' && match[2] === 'v4') v4HomeAssetRequests++;
        return send(res, 200, 'text/javascript',
            'document.body.dataset.' + match[1] + ' = "' + match[2] + '";');
    }
    send(res, 404, 'text/plain', 'missing');
});
const prodBase = hasBuiltOutput ? await listen(distServer) : null;
const base = await listen(fixtureServer);
const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: LAUNCH_ARGS });
// Capture install errors from the Service Worker target, not just the page:
// navigator.serviceWorker.register() can resolve before install fails.
browser.on('targetcreated', async target => {
    if (target.type() !== 'service_worker') return;
    try {
        const session = await target.createCDPSession();
        session.on('Runtime.consoleAPICalled', event => {
            if (event.type === 'error') {
                console.error('SW console:', event.args.map(arg => arg.value ?? arg.description).join(' '));
            }
        });
        session.on('Runtime.exceptionThrown', event => {
            console.error('SW exception:', event.exceptionDetails?.text,
                event.exceptionDetails?.exception?.description);
        });
        await session.send('Runtime.enable');
    } catch {
        // The worker can already have exited after a rejected install.
    }
});
let page;
const keys = p => p.evaluate(() => globalThis.caches.keys());
const owned = async p => (await keys(p)).filter(name => name.startsWith('games-cache-')).sort();
const counts = p => p.evaluate(async () => {
    const result = {};
    for (const name of await globalThis.caches.keys()) {
        if (!name.startsWith('games-cache-')) continue;
        result[name] = (await (await globalThis.caches.open(name)).keys()).length;
    }
    return result;
});
const waitForOwned = async (p, names) => {
    const want = names.sort();
    await p.waitForFunction(async expected => {
        const have = (await globalThis.caches.keys()).filter(name => name.startsWith('games-cache-')).sort();
        return JSON.stringify(have) === JSON.stringify(expected);
    }, { timeout: 10000 }, want);
};

// A waiting worker may activate only after the last old-client tab closes.
 // Poll Cache Storage through DevTools from an about:blank probe so the probe
 // does not become another controlled client or race its first navigation.
async function waitForReleasedGeneration(names) {
    const expected = [...names].sort();
    const probe = await browser.newPage();
    const session = await probe.createCDPSession();
    let current = [];
    try {
        for (let attempt = 0; attempt < 120; attempt++) {
            const result = await session.send('CacheStorage.requestCacheNames', {
                securityOrigin: base,
            });
            current = result.caches.map(entry => entry.cacheName)
                .filter(name => name.startsWith('games-cache-')).sort();
            if (JSON.stringify(current) === JSON.stringify(expected)) return;
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        throw new Error(`Waiting for SW cache activation: expected ${JSON.stringify(expected)}, got ${JSON.stringify(current)}`);
    } finally {
        await session.detach();
        await probe.close();
    }
}
async function open(path) {
    const next = await browser.newPage();
    await next.goto(base + path, { waitUntil: 'load' });
    return next;
}
async function update(p) {
    await p.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
}
async function offline(p, enabled) {
    fixtureNetworkDown = enabled;
    await p.setOfflineMode(enabled);
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
async function verifyProductionBuild() {
    if (!hasBuiltOutput) {
        console.log('SKIP built-output Service Worker checks: no dist build (run npm run build)');
        return;
    }
    // Real Vite output: registration, shell precaching and offline reentry.
    const productionPage = await browser.newPage();
    try {
        await productionPage.goto(prodBase + '/', { waitUntil: 'load', timeout: 30000 });
        try {
            await productionPage.waitForFunction(() => Boolean(navigator.serviceWorker.controller),
                { timeout: 25000 });
        } catch (error) {
            console.error('Production SW diagnostics:', await productionPage.evaluate(async () => {
                const reg = await navigator.serviceWorker.getRegistration();
                return {
                    registration: reg && { active: reg.active?.state, waiting: reg.waiting?.state,
                        installing: reg.installing?.state },
                    caches: await globalThis.caches.keys(),
                };
            }));
            throw error;
        }
        productionNetworkDown = true;
        await productionPage.setOfflineMode(true);
        await productionPage.reload({ waitUntil: 'domcontentloaded' });
        await productionPage.waitForFunction(() => {
            const filter = document.getElementById('games-filter');
            return filter && !filter.hidden && document.querySelectorAll('.game-card').length >= 10;
        }, { timeout: 10000 });
    } finally {
        productionNetworkDown = false;
        await productionPage.close();
    }
}

try {
    await verifyProductionBuild();

    page = await open('/');
    await page.evaluate(async () => {
        const legacy = await globalThis.caches.open('games-cache-v2');
        for (let i = 0; i < 30; i++) {
            await legacy.put('/assets/js/obsolete-' + i + '.js', new globalThis.Response('old_' + i));
        }
        await legacy.put('/old-game.html?daily=1',
            new globalThis.Response('<!doctype html><title>Old offline game</title>', {
                headers: { 'Content-Type': 'text/html' },
            }));
        await globalThis.caches.open('unrelated-feature-cache');
        // The prior install died immediately after creating its cache.
        const interrupted = await globalThis.caches.open('games-cache-v3-test-v1');
        if ((await interrupted.keys()).length !== 0) throw new Error('expected empty interrupted cache');
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
    await waitForOwned(page, [cacheName('v1')]);
    assert.equal((await counts(page))[cacheName('v1')], 3,
        'first install repairs an already-existing empty cache');
    assert(!('games-cache-v2' in await counts(page)),
        'first activation immediately deletes all legacy v2 resources');
    await offline(page, true);
    await page.reload({ waitUntil: 'load' });
    assert.equal(await page.$eval('body', el => el.dataset.home), 'v1', 'first-install offline homepage');
    // Legacy cache content must never be served after the new SW activates.
    await page.goto(base + '/old-game.html', { waitUntil: 'load' });
    assert.equal(await page.$eval('h1', el => el.textContent), 'Home v1',
        'offline unknown route falls back to current homepage, not legacy HTML');
    await offline(page, false);
    await page.goto(base + '/game.html?daily=1', { waitUntil: 'load' });
    assert.equal(new URL(page.url()).pathname, '/game', 'Cloudflare-style redirect to extensionless URL');
    assert.equal(await page.$eval('body', el => el.dataset.game), 'v1');
    await page.waitForFunction(async () => Boolean(await (await globalThis.caches.open('games-cache-v3-test-v1')).match('/game.html')));
    const urls = await page.evaluate(async () => (await (await globalThis.caches.open('games-cache-v3-test-v1')).keys()).map(r => r.url));
    assert(!urls.some(url => url.includes('?daily=')), 'navigation queries do not add cache keys');
    await offline(page, true);
    await page.goto(base + '/game', { waitUntil: 'load' });
    assert.equal(await page.$eval('body', el => el.dataset.game), 'v1',
        'extensionless game URL reloads from same cached document offline');
    await offline(page, false);

    release = 'v2';
    await update(page);
    await waitForWaiting(page);
    assert((await keys(page)).includes(cacheName('v1')), 'old tab keeps its hashed resources');
    // The still-active v1 worker must NOT persist online v2 HTML that points
    // at game-v2.js; it must keep its complete v1 offline shell intact.
    await page.reload({ waitUntil: 'load' });
    assert.equal(await page.$eval('body', el => el.dataset.game), 'v2',
        'online navigation gets the fresh release while v2 is waiting');
    const oldHtml = await page.evaluate(async () =>
        (await (await globalThis.caches.open('games-cache-v3-test-v1')).match('/game.html')).text());
    assert(oldHtml.includes('game-v1.js') && oldHtml.includes('content="test-v1"'),
        'old SW must reject mismatched v2 HTML when caching');
    await offline(page, true);
    await page.reload({ waitUntil: 'load' });
    assert.equal(await page.$eval('body', el => el.dataset.game), 'v1',
        'offline game remains complete while newer release waits');
    await offline(page, false);
    await page.close();
    await waitForReleasedGeneration([cacheName('v2')]);
    page = await open('/');
    await waitForOwned(page, [cacheName('v2')]);
    assert.equal(await page.$eval('body', el => el.dataset.home), 'v2');
    await checkSaved(page);
    assert((await keys(page)).includes('unrelated-feature-cache'), 'unowned caches preserved');
    assert(!(await keys(page)).includes(cacheName('v1')),
        'previous generation fully deleted on activation');
    console.log('SW growth: legacy ' + legacyCount + ' entries; after v2 ' + JSON.stringify(await counts(page)));

    await offline(page, true);
    await page.goto(base + '/game.html', { waitUntil: 'load' });
    assert.equal(await page.$eval('h1', el => el.textContent), 'Home v2',
        'previously visited old game is not served offline after update');
    await offline(page, false);
    await page.goto(base + '/game.html', { waitUntil: 'load' });
    assert.equal(await page.$eval('body', el => el.dataset.game), 'v2');
    await page.waitForFunction(async () => Boolean(await (await globalThis.caches.open('games-cache-v3-test-v2')).match('/game.html')));

    release = 'v3';
    await update(page);
    await waitForWaiting(page);
    await page.close();
    await waitForReleasedGeneration([cacheName('v3')]);
    page = await open('/');
    await waitForOwned(page, [cacheName('v3')]);
    await checkSaved(page);
    await offline(page, true);
    await page.goto(base + '/game.html', { waitUntil: 'load' });
    assert.equal(await page.$eval('h1', el => el.textContent), 'Home v3',
        'no old v2 game survives a v3 deployment');
    await offline(page, false);
    await page.goto(base + '/game.html', { waitUntil: 'load' });
    assert.equal(await page.$eval('body', el => el.dataset.game), 'v3');
    await page.waitForFunction(async () =>
        Boolean(await (await globalThis.caches.open('games-cache-v3-test-v3')).match('/game.html')));
    await offline(page, true);
    await page.reload({ waitUntil: 'load' });
    assert.equal(await page.$eval('body', el => el.dataset.game), 'v3',
        'current version of game works offline after visiting it');
    await offline(page, false);
    console.log('SW bounded after three releases: ' + JSON.stringify(await counts(page)));

    release = 'v4';
    // Simulate a crashed v4 install with one valid script and missing HTML.
    // Repair must not fetch or overwrite the already-cached script.
    const stagingPaths = await page.evaluate(async () => {
        const staged = await globalThis.caches.open('games-cache-v3-test-v4');
        const script = await fetch('/assets/js/home-v4.js');
        if (!script.ok || script.type !== 'basic') throw new Error('invalid staging fixture');
        await staged.put('/assets/js/home-v4.js', script);
        return (await staged.keys()).map(request => new URL(request.url).pathname);
    });
    assert.deepEqual(stagingPaths, ['/assets/js/home-v4.js'],
        'reproduce a partial cache from an interrupted installation');
    assert.equal(v4HomeAssetRequests, 1, 'only the staging fixture fetched v4 script');
    mismatchedInstallPath = '/index.html';
    await update(page).catch(() => {});
    // The other homepage URL and all shell assets return 200; only this
    // response has the wrong build marker. The candidate must NOT activate.
    for (let attempt = 0; attempt < 100 && mismatchedInstallRequests === 0; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert(mismatchedInstallRequests > 0, 'mismatched HTTP 200 HTML was fetched during install');
    await page.waitForFunction(async () => {
        const r = await navigator.serviceWorker.getRegistration();
        return !r.installing;
    }, { timeout: 10000 });
    assert.deepEqual(await owned(page), [cacheName('v3'), cacheName('v4')],
        'failed v4 install preserves old active cache and incomplete v4 staging');
    assert.equal(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).waiting), null,
        'mismatched-build install must not leave a waiting worker');
    assert.equal(v4HomeAssetRequests, 1, 'failed install did not re-fetch valid staged script');
    mismatchedInstallPath = null;
    await offline(page, true);
    await page.reload({ waitUntil: 'load' });
    assert.equal(await page.$eval('body', el => el.dataset.game), 'v3',
        'previous version remains playable offline after mismatched install');
    await offline(page, false);

    // Retrying the exact same v4 release must repair the old staging cache,
    // without clearing site data or overwriting its valid script.
    await update(page);
    await waitForWaiting(page);
    assert.equal(v4HomeAssetRequests, 1, 'retry reuses valid script without fetching it again');
    const repaired = await page.evaluate(async () => {
        const cache = await globalThis.caches.open('games-cache-v3-test-v4');
        const root = await cache.match('/');
        const index = await cache.match('/index.html');
        const script = await cache.match('/assets/js/home-v4.js');
        return {
            entries: (await cache.keys()).length,
            root: root && await root.text(),
            index: index && await index.text(),
            script: script && await script.text(),
        };
    });
    assert.equal(repaired.entries, 3, 'recovered cache has all required shell entries');
    const htmlBuildMatches = repaired.root?.includes('content="test-v4"')
        && repaired.index?.includes('content="test-v4"');
    assert(htmlBuildMatches, 'recovered HTML uses exactly the expected build marker');
    assert(repaired.script?.includes('dataset.home'), 'existing valid script survived recovery');
    await page.close();
    await waitForReleasedGeneration([cacheName('v4')]);
    page = await open('/');
    await waitForOwned(page, [cacheName('v4')]);
    await checkSaved(page);
    await offline(page, true);
    await page.reload({ waitUntil: 'load' });
    assert.equal(await page.$eval('body', el => el.dataset.home), 'v4',
        'recovered version works offline after activation');
    await offline(page, false);

    release = 'v5';
    brokenInstall = true;
    await update(page).catch(() => {});
    // Observe the actual failed server request: checking !installing alone may
    // pass prematurely before Chromium even starts installing the update.
    for (let attempt = 0; attempt < 100 && failedInstallRequests === 0; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert(failedInstallRequests > 0, 'v5 install really requested the broken URL');
    await page.waitForFunction(async () => {
        const r = await navigator.serviceWorker.getRegistration();
        return !r.installing;
    }, { timeout: 10000 });
    assert.deepEqual(await owned(page), [cacheName('v4')],
        'failed v5 precache removes its partial cache without losing current version');
    assert.equal(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).waiting), null);
    brokenInstall = false;

    release = 'v2';
    await update(page);
    await waitForWaiting(page);
    await page.close();
    await waitForReleasedGeneration([cacheName('v2')]);
    page = await open('/');
    await waitForOwned(page, [cacheName('v2')]);
    await page.reload({ waitUntil: 'load' });
    assert.equal(await page.$eval('body', el => el.dataset.home), 'v2', 'rollback to earlier build');
    assert(!(await keys(page)).includes(cacheName('v4')),
        'rollback also removes superseded version cache');
    await checkSaved(page);
    console.log('PASS real Chromium SW: current-only cache, crash recovery, selective precache repair, old tabs, mismatched HTML, failed install, rollback, storage preserved');
} finally {
    if (page && !page.isClosed()) await page.close();
    await browser.close();
    await stop(fixtureServer);
    if (hasBuiltOutput) await stop(distServer);
}
