// The shipping client must interoperate with legacy KV, Phase 1 D1 and Phase 2 D1.
// Isolated script execution: no Cloudflare credentials, browser network or production writes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setImmediate } from 'node:timers';
import vm from 'node:vm';

const code = readFileSync(new URL('../public/analytics.js', import.meta.url), 'utf8');

async function testClient(stats, failedProbe = false, delayedProbe = false) {
    const sent = [], probes = [], intervals = [], handlers = new Map();
    let resolveProbe;
    let clock = 0, counter = 1;
    let wallNow = Date.parse('2026-10-13T15:59:58Z');
    const TestDate = class extends Date { static now() { return wallNow; } };
    const location = { origin: 'https://games.orangely.xyz', pathname: '/tetris.html' };
    const window = {
        location,
        crypto: { randomUUID: () =>
            'f1cb914e-5c44-4a0d-9a55-' + (counter++).toString(16).padStart(12, '0') },
        addEventListener(name, callback) {
            if (!handlers.has(name)) handlers.set(name, []);
            handlers.get(name).push(callback);
        },
    };
    const document = {
        currentScript: null, visibilityState: 'visible',
        hasFocus: () => true, addEventListener() {},
    };
    const context = {
        window, document, location, Date: TestDate,
        performance: { now: () => clock },
        navigator: { sendBeacon(url, body) {
            assert(String(url).endsWith('/event'));
            sent.push(JSON.parse(body));
            return true;
        } },
        setInterval(fn) { intervals.push(fn); return intervals.length; },
        fetch(url, options) {
            if (String(url).endsWith('/stats?v=2')) {
                probes.push(String(url));
                if (delayedProbe) return new Promise(resolve => { resolveProbe = resolve; });
                return failedProbe ? Promise.reject(new Error('offline'))
                    : Promise.resolve({ ok: true, json: async () => stats });
            }
            assert(String(url).endsWith('/event'), 'unexpected request: ' + url);
            sent.push(JSON.parse(options.body));
            return Promise.resolve({ ok: true, status: 201 });
        },
    };
    vm.runInNewContext(code, context, { filename: 'analytics.js' });
    const drain = () => new Promise(resolve => setImmediate(resolve));
    await drain();
    return { window, sent, probes, intervals, drain, advance(ms) { clock += ms; },
        setWall(value) { wallNow = value; },
        fire(name) { for (const listener of handlers.get(name) || []) listener(); },
        finishProbe(data) { resolveProbe({ ok: true, json: async () => data }); } };
}


const v2Response = {
    scope: 'day', games: {},
    total: { p: 0, f: 0, opens: 0, activeSeconds: 0, playingSeconds: 0 },
};

const fullBuffer = await testClient(null, false, true);
for (let i = 0; i < 8; i++) {
    fullBuffer.window.hubTrack('tetris', 'play');
    fullBuffer.window.hubTrack('tetris', 'finish');
}
assert.equal(fullBuffer.sent.length, 0);
fullBuffer.finishProbe(v2Response);
await fullBuffer.drain();
assert.deepEqual(fullBuffer.sent.map(e => e.event),
    ['open', ...Array.from({ length: 8 }, () => ['play', 'finish']).flat()],
    'the open and all sixteen accepted attempts fit in the bounded transport');
assert(fullBuffer.sent.every(e => e.v === 2 && e.eventId && e.sessionId));

const departing = await testClient(null, false, true);
departing.window.hubTrack('tetris', 'play');
departing.window.hubTrack('tetris', 'finish');
departing.fire('pagehide');
assert.deepEqual(departing.sent, [
    { game: 'tetris', event: 'play' },
    { game: 'tetris', event: 'finish' },
], 'pagehide must send buffered attempts over unload-safe legacy transport');
departing.finishProbe(v2Response);
await departing.drain();
assert.deepEqual(departing.sent.filter(e => e.event === 'play' || e.event === 'finish'),
    [{ game: 'tetris', event: 'play' }, { game: 'tetris', event: 'finish' }],
    'late probe resolution does not duplicate pagehide-fallback attempts');

const crossingMidnight = await testClient(null, false, true);
const beforeMidnight = Date.parse('2026-10-13T15:59:59Z');
const afterMidnight = Date.parse('2026-10-13T16:00:01Z');
crossingMidnight.setWall(beforeMidnight);
crossingMidnight.window.hubTrack('tetris', 'play');
crossingMidnight.setWall(afterMidnight);
crossingMidnight.window.hubTrack('tetris', 'finish');
crossingMidnight.finishProbe(v2Response);
await crossingMidnight.drain();
assert.deepEqual(crossingMidnight.sent.map(e => e.event), ['open', 'play', 'finish']);
assert.equal(crossingMidnight.sent[1].occurredAt, beforeMidnight,
    'pre-midnight play must retain its occurrence time');
assert.equal(crossingMidnight.sent[2].occurredAt, afterMidnight,
    'post-midnight finish must retain its occurrence time');
assert.equal(crossingMidnight.sent[0].occurredAt, afterMidnight,
    'the new document open uses probe-resolution time');

const delayed = await testClient(null, false, true);
delayed.window.hubTrack('tetris', 'play');
delayed.window.hubTrack('tetris', 'finish');
assert.equal(delayed.sent.length, 0, 'events stay buffered before V2 capability probe resolves');
delayed.finishProbe({
    scope: 'day', games: {},
    total: { p: 0, f: 0, opens: 0, activeSeconds: 0, playingSeconds: 0 },
});
await delayed.drain();
assert.deepEqual(delayed.sent.map(e => e.event), ['open', 'play', 'finish'],
    'delayed V2 probe replays attempts after the open as V2 events');
assert(delayed.sent.every(e => e.v === 2 && e.eventId && e.sessionId));

const delayedOld = await testClient(null, false, true);
delayedOld.window.hubTrack('tetris', 'play');
assert.equal(delayedOld.sent.length, 0);
delayedOld.finishProbe({ tetris: { p: 0, f: 0 }, total: { p: 0, f: 0 } });
await delayedOld.drain();
assert.deepEqual(delayedOld.sent, [{ game: 'tetris', event: 'play' }],
    'legacy fallback happens only once after an invalid/non-V2 capability response');

const legacy = await testClient({ tetris: { p: 1, f: 2 }, total: { p: 1, f: 2 } });
assert.equal(legacy.probes.length, 1);
assert.equal(legacy.intervals.length, 0, 'legacy Worker must not sample time');
assert.equal(legacy.sent.length, 0, 'legacy Worker must not receive open');
legacy.window.hubTrack('tetris', 'play');
legacy.window.hubTrack('tetris', 'finish');
assert.deepEqual(legacy.sent, [
    { game: 'tetris', event: 'play' }, { game: 'tetris', event: 'finish' },
], 'legacy payloads retain exact two-field format');

const offline = await testClient(null, true);
offline.window.hubTrack('tetris', 'play');
assert.deepEqual(offline.sent, [{ game: 'tetris', event: 'play' }],
    'a failed probe still permits the legacy play event');

const phase1 = await testClient({
    scope: 'day', games: {}, total: { p: 0, f: 0, opens: 0, activeSeconds: 0 },
});
phase1.window.hubTrack('tetris', 'play');
phase1.advance(2000);
phase1.window.hubAnalytics.flush();
await phase1.drain();
assert.deepEqual(phase1.sent.map(e => e.event), ['open', 'play', 'active']);
assert.equal(phase1.sent[2].seconds, 2);
assert.equal(Object.hasOwn(phase1.sent[2], 'playingSeconds'), false);
assert(phase1.sent.every(e => !Object.hasOwn(e, 'occurredAt')),
    'Phase 1 Worker never receives fields that it rejects');

const phase2 = await testClient({
    scope: 'day', games: {},
    total: { p: 0, f: 0, opens: 0, activeSeconds: 0, playingSeconds: 0 },
});
phase2.window.hubTrack('tetris', 'play');
phase2.advance(2000);
phase2.window.hubAnalytics.flush();
await phase2.drain();
assert.deepEqual(phase2.sent.map(e => e.event), ['open', 'play', 'active']);
assert.equal(phase2.sent[2].seconds, 2);
assert.equal(phase2.sent[2].playingSeconds, 2);
assert(Number.isSafeInteger(phase2.sent[2].occurredAt));
assert.equal(phase2.intervals.length, 1, 'only one sampling timer');
console.log('Analytics protocol: legacy KV, worker outage, Phase 1 D1, Phase 2 D1: PASS');
