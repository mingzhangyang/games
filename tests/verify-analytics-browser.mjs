// verify-all: timeout=120000
// Real Chromium document navigation / Page Visibility / focus / gameplay contract.
// Every event is intercepted at /__analytics on loopback. Production receives none.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';

const BASE = process.argv[2] || 'http://127.0.0.1:8899';
const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: LAUNCH_ARGS });
try {
    const page = await browser.newPage();
    const unexpectedRemote = [];
    await page.setRequestInterception(true);
    page.on('request', request => {
        if (request.url().includes('games-analytics.orangely.workers.dev')) {
            unexpectedRemote.push(request.url());
            return request.abort();
        }
        return request.continue();
    });
    await page.evaluateOnNewDocument(() => {
        window.__ANALYTICS_V2_TEST__ = true;
        window.__analyticsNow = 0;
        window.__analyticsVisibility = 'visible';
        window.__analyticsFocus = true;
        window.__attempts = [];
        window.__beacons = [];
        window.__failNextActive = false;
        Object.defineProperty(performance, 'now', { configurable: true, value: () => window.__analyticsNow });
        Object.defineProperty(document, 'visibilityState',
            { configurable: true, get: () => window.__analyticsVisibility });
        Object.defineProperty(document, 'hasFocus',
            { configurable: true, value: () => window.__analyticsFocus });
        const originalFetch = window.fetch.bind(window);
        window.fetch = (url, options) => {
            const target = String(url);
            if (target.endsWith('/__analytics/stats?v=2')) {
                if (location.search.includes('probe-down')) return Promise.reject(new Error('Worker unavailable'));
                return Promise.resolve({ ok: true, json: async () => ({
                    scope: 'day', games: {},
                    total: { p: 0, f: 0, opens: 0, activeSeconds: 0, playingSeconds: 0 },
                }) });
            }
            if (target.endsWith('/__analytics/event')) {
                const event = JSON.parse(options.body);
                window.__attempts.push(event);
                if (event.event === 'active' && window.__failNextActive) {
                    window.__failNextActive = false;
                    return Promise.reject(new Error('temporary offline'));
                }
                return Promise.resolve({ ok: true, status: 201 });
            }
            return originalFetch(url, options);
        };
        Object.defineProperty(navigator, 'sendBeacon', {
            configurable: true,
            value: (url, body) => {
                if (!String(url).endsWith('/__analytics/event')) return false;
                window.__beacons.push(JSON.parse(body));
                return true;
            },
        });
    });
    const fixture = BASE + '/tests/fixtures/analytics-v2.html';
    const events = () => page.evaluate(() => window.__attempts);
    const seen = (kind) => page.evaluate(type => window.__attempts.filter(e => e.event === type), kind);
    const advance = async (seconds) => {
        await page.evaluate(s => {
            window.__analyticsNow += s * 1000;
            window.hubAnalytics.flush();
        }, seconds);
        // The client sends via a sequential promise-driven queue.
        await page.waitForFunction(() => {
            const client = window.hubAnalytics;
            return client && window.__attempts.length > 0;
        });
    };

    await page.goto(fixture, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__attempts.some(e => e.event === 'open'));
    assert.equal((await seen('open')).length, 1, 'first load emits one open');
    assert.equal((await seen('play')).length, 0, 'initial menu emits no play');
    const firstSession = (await seen('open'))[0].sessionId;
    await page.evaluate(() => {
        const script = document.createElement('script');
        script.src = '/analytics.js';
        document.body.appendChild(script);
    });
    await page.waitForFunction(() => document.querySelectorAll('script[src="/analytics.js"]').length === 2);
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.equal((await seen('open')).length, 1, 'duplicate entry point does not double-open');

    // A user interaction establishes foreground activity, but idle does not
    // create gameplay seconds.
    await page.evaluate(() => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    await advance(2);
    await page.waitForFunction(() => window.__attempts.some(e => e.event === 'active'));
    let active = await seen('active');
    assert.equal(active.at(-1).seconds, 2);
    assert.equal(active.at(-1).playingSeconds, 0);

    await page.click('#start');
    await advance(2);
    await page.waitForFunction(() => window.__attempts.some(e => e.event === 'active' && e.playingSeconds === 2));
    assert.equal((await seen('play')).length, 1);
    assert.equal((await seen('active')).at(-1).playingSeconds, 2, 'playing counts');

    await page.click('#pause');
    await advance(2);
    await page.waitForFunction(() => window.__attempts.filter(e => e.event === 'active').length >= 3);
    assert.equal((await seen('active')).at(-1).playingSeconds, 0, 'pause excludes gameplay');

    await page.click('#resume');
    await advance(2);
    await page.waitForFunction(() => window.__attempts.filter(e => e.event === 'active').length >= 4);
    assert.equal((await seen('active')).at(-1).playingSeconds, 2, 'resume counts gameplay');

    await page.click('#finish');
    await advance(2);
    await page.waitForFunction(() => window.__attempts.filter(e => e.event === 'active').length >= 5);
    assert.equal((await seen('finish')).length, 1, 'one real finish');
    assert.equal((await seen('active')).at(-1).playingSeconds, 0, 'result excludes gameplay');
    await page.click('#restart');
    assert.equal((await seen('open')).length, 1, 'in-page restart never re-opens');
    await page.waitForFunction(() => window.__attempts.filter(e => e.event === 'play').length === 2);

    await page.evaluate(() => {
        window.__analyticsVisibility = 'hidden';
        document.dispatchEvent(new Event('visibilitychange'));
        window.__analyticsNow += 120000;
        window.__analyticsVisibility = 'visible';
        document.dispatchEvent(new Event('visibilitychange'));
        document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });
    const beforeResume = (await seen('active')).length;
    await advance(2);
    await page.waitForFunction(n => window.__attempts.filter(e => e.event === 'active').length > n, {}, beforeResume);
    assert.equal((await seen('active')).at(-1).seconds, 2, 'background interval not backfilled');
    await page.evaluate(() => { window.__analyticsNow += 65000; window.hubAnalytics.flush(); });
    const beforeIdle = (await seen('active')).length;
    await advance(2);
    assert.equal((await seen('active')).length, beforeIdle, 'idle gaps not counted');

    await page.evaluate(() => {
        window.__failNextActive = true;
        document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });
    await advance(2);
    await page.waitForFunction(() => {
        const a = window.__attempts.filter(e => e.event === 'active');
        return a.length >= 7;
    });
    const last = (await seen('active')).at(-1);
    await page.evaluate(() => { window.__analyticsNow += 6000; });
    await page.waitForFunction(id => window.__attempts.filter(e => e.eventId === id).length >= 2,
        { timeout: 5000 }, last.eventId);
    const retries = (await events()).filter(e => e.eventId === last.eventId);
    assert.equal(retries.length, 2, 'one retry with same event ID');
    assert.deepEqual(retries[0], retries[1], 'retry reuses immutable payload');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__attempts.some(e => e.event === 'open'));
    assert.equal((await seen('open')).length, 1, 'refresh emits exactly one new open');
    assert.notEqual((await seen('open'))[0].sessionId, firstSession, 'new document has new session ID');

    await page.goto(fixture + '?probe-down', { waitUntil: 'domcontentloaded' });
    await page.click('#start');
    assert.equal(await page.evaluate(() => window.__fixturePlaying), true, 'game works with Worker unavailable');
    assert.equal((await seen('open')).length, 0, 'failed probe emits no invalid V2 events');

    await page.goto(BASE + '/tests/fixtures/analytics-v2-external.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__attempts.some(e => e.event === 'open'));
    assert.equal((await seen('open'))[0].game, 'dots', 'external fixture uses registered ID');

    for (const game of ['tetris', 'gomoku', 'word-daily', 'silk-dew']) {
        await page.goto(BASE + '/' + game + '.html', { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => window.__attempts.some(e => e.event === 'open'));
        const opens = await seen('open');
        assert.equal(opens.length, 1, game + ': one real browser open');
        assert.equal(opens[0].game, game, game + ': canonical registry ID');
    }
    assert.deepEqual(unexpectedRemote, [], 'browser tests must never request production analytics');
    console.log('Analytics V2 Chromium: opens, gameplay/idle, pause/resume, hide/restore, restart, retry, refresh, outage, standalone mock: PASS');
} finally {
    await browser.close();
}
