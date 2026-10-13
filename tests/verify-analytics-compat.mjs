// The shipping client must interoperate with legacy KV, Phase 1 D1 and Phase 2 D1.
// Isolated script execution: no Cloudflare credentials, browser network or production writes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const code = readFileSync(new URL('../public/analytics.js', import.meta.url), 'utf8');

async function testClient(stats, failedProbe = false) {
    const sent = [], probes = [], intervals = [];
    let clock = 0, counter = 1;
    const location = { origin: 'https://games.orangely.xyz', pathname: '/tetris.html' };
    const window = {
        location,
        crypto: { randomUUID: () =>
            'f1cb914e-5c44-4a0d-9a55-' + (counter++).toString(16).padStart(12, '0') },
        addEventListener() {},
    };
    const document = {
        currentScript: null, visibilityState: 'visible',
        hasFocus: () => true, addEventListener() {},
    };
    const context = {
        window, document, location,
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
    return { window, sent, probes, intervals, drain, advance(ms) { clock += ms; } };
}

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
