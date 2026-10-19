// Source-only Service Worker smoke: deliberately runs before any Vite build.
// The complete multi-version lifecycle test remains tests/verify-service-worker.mjs.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from '../../tests/lib/browser.mjs';
import { renderServiceWorker } from '../build/service-worker-cache.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
assert(!existsSync(join(ROOT, 'dist')), 'source-only smoke must run before production build');
const source = await readFile(join(ROOT, 'public/sw.js'), 'utf8');
const built = renderServiceWorker(source, {
    buildId: 'test-source',
    precache: ['/', '/index.html', '/assets/js/home.js'],
    assets: ['/assets/js/home.js'],
    htmlRoutes: ['/index.html'],
});
const html = '<!doctype html><html><head>'
    + '<meta name="games-build" content="test-source"></head><body>'
    + '<script src="/assets/js/home.js"></script></body></html>';
let offline = false;
const server = createServer((req, res) => {
    if (offline) return req.socket.destroy();
    const path = new URL(req.url, 'http://localhost').pathname;
    const result = path === '/sw.js'
        ? ['text/javascript', built]
        : path === '/' || path === '/index.html'
            ? ['text/html', html]
            : path === '/assets/js/home.js'
                ? ['text/javascript', 'document.body.dataset.ready = "yes";']
                : null;
    if (!result) {
        res.writeHead(404);
        return res.end('missing');
    }
    res.writeHead(200, { 'Content-Type': result[0], 'Cache-Control': 'no-store' });
    res.end(result[1]);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = 'http://127.0.0.1:' + server.address().port;
let browser;
try {
    browser = await puppeteer.launch({
        executablePath: CHROME_PATH, headless: 'new', args: LAUNCH_ARGS,
    });
    const page = await browser.newPage();
    await page.goto(url + '/', { waitUntil: 'load' });
    await page.evaluate(async () => {
        await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
        await navigator.serviceWorker.ready;
    });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller),
        { timeout: 15000 });
    const cached = await page.evaluate(async () => {
        const names = await globalThis.caches.keys();
        if (names.includes('games-cache-v2')) throw new Error('legacy cache survived initial activation');
        const cache = await globalThis.caches.open('games-cache-v3-test-source');
        return (await cache.keys()).map(request => new URL(request.url).pathname).sort();
    });
    assert.deepEqual(cached, ['/', '/assets/js/home.js', '/index.html'],
        'source-only install precaches the expected shell');
    offline = true;
    await page.setOfflineMode(true);
    await page.reload({ waitUntil: 'load', timeout: 15000 });
    assert.equal(await page.$eval('body', el => el.dataset.ready), 'yes',
        'built-independent homepage and JS work offline');
    console.log('PASS source-only SW: clean checkout, installation, precache and offline reload');
} finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
}
