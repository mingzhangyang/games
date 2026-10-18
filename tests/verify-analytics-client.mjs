// V2-only contract: VM-local browser + network mocks, no production traffic.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setImmediate } from 'node:timers';
import vm from 'node:vm';
const code = readFileSync(new URL('../public/analytics.js', import.meta.url), 'utf8');

function fixture({ origin = 'https://games.orangely.xyz', path = '/tetris.html',
    game = null, external = false, localTest = false, noCrypto = false,
    offline = false, stalled = false } = {}) {
    let clock = 0, wall = Date.parse('2026-10-13T15:59:58Z'), id = 1;
    const sent = [], addresses = [], beacons = [], intervals = [], listeners = new Map();
    const TestDate = class extends Date { static now() { return wall; } };
    const location = { origin, pathname: path };
    const window = {
        location, __ANALYTICS_V2_TEST__: localTest,
        ...(noCrypto ? {} : { crypto: { randomUUID: () =>
            'f1cb914e-5c44-4a0d-9a55-' + (id++).toString(16).padStart(12, '0') } }),
        addEventListener(name, fn) {
            if (!listeners.has(name)) listeners.set(name, []);
            listeners.get(name).push(fn);
        },
    };
    const document = {
        currentScript: game === null ? null : { getAttribute(name) {
            if (name === 'data-analytics-game') return game;
            if (name === 'data-analytics-external') return external ? 'true' : null;
            return null;
        } },
        visibilityState: 'visible', hasFocus: () => true, addEventListener() {},
    };
    const context = {
        window, document, location, Date: TestDate,
        performance: { now: () => clock },
        navigator: { sendBeacon(url, body) {
            beacons.push({ url: String(url), body: JSON.parse(body) }); return true;
        } },
        setInterval(fn) { intervals.push(fn); return intervals.length; },
        fetch(url, options) {
            const address = String(url);
            addresses.push(address);
            if (!address.endsWith('/event')) return Promise.reject(Error('unexpected route: ' + address));
            sent.push(JSON.parse(options.body));
            if (stalled) return new Promise(() => {});
            if (offline) return Promise.reject(Error('worker unavailable'));
            return Promise.resolve({ ok: true, status: 201 });
        },
    };
    vm.runInNewContext(code, context, { filename: 'analytics.js' });
    return { window, sent, addresses, beacons, intervals, drain: () => new Promise(setImmediate),
        wall(ms) { wall = ms; }, advance(ms) { clock += ms; },
        fire(name) { for (const fn of listeners.get(name) || []) fn(); } };
}
function assertV2(events) {
    for (const e of events) {
        assert.equal(e.v, 2);
        assert(typeof e.eventId === 'string' && typeof e.sessionId === 'string');
        assert(Number.isSafeInteger(e.occurredAt));
        if (e.event === 'active') {
            assert(Number.isInteger(e.seconds) && e.seconds >= 1);
            assert(Number.isInteger(e.playingSeconds)
                && e.playingSeconds >= 0 && e.playingSeconds <= e.seconds);
        }
    }
}
const basic = fixture();
assert.deepEqual(basic.sent.map(e => e.event), ['open'], 'open is immediate, no probe');
assert.equal(basic.intervals.length, 1);
basic.window.hubTrack('tetris', 'play');
basic.window.hubTrack('tetris', 'finish');
await basic.drain();
assert.deepEqual(basic.sent.map(e => e.event), ['open', 'play', 'finish']);
assertV2(basic.sent);
assert.equal(new Set(basic.sent.map(e => e.sessionId)).size, 1);
assert.equal(new Set(basic.sent.map(e => e.eventId)).size, 3);
assert(basic.addresses.every(u => u.endsWith('/event')));
basic.window.hubTrack('gomoku', 'play');
basic.window.hubTrack('tetris', 'bad-event');
await basic.drain();
assert.equal(basic.sent.length, 3);

const crossDay = fixture();
const before = Date.parse('2026-10-13T15:59:59Z');
const after = Date.parse('2026-10-13T16:00:01Z');
crossDay.wall(before); crossDay.window.hubTrack('tetris', 'play');
crossDay.wall(after); crossDay.window.hubTrack('tetris', 'finish');
await crossDay.drain();
assert.equal(crossDay.sent[1].occurredAt, before);
assert.equal(crossDay.sent[2].occurredAt, after);
assertV2(crossDay.sent);

const playing = fixture();
playing.window.hubTrack('tetris', 'play');
playing.advance(2000); playing.window.hubAnalytics.flush();
await playing.drain();
const active = playing.sent.find(e => e.event === 'active');
assert.equal(active.seconds, 2);
assert.equal(active.playingSeconds, 2);
assertV2(playing.sent);
const paused = fixture();
paused.window.hubAnalytics.bindPlaying('tetris', () => false);
paused.window.hubTrack('tetris', 'play');
paused.advance(2000); paused.window.hubAnalytics.flush();
await paused.drain();
assert.equal(paused.sent.find(e => e.event === 'active').playingSeconds, 0);

const failed = fixture({ offline: true });
failed.window.hubTrack('tetris', 'play');
await failed.drain();
assertV2(failed.sent);
assert(failed.addresses.every(u => u.endsWith('/event')));
const stalled = fixture({ stalled: true });
for (let i = 0; i < 24; i++) stalled.window.hubTrack('tetris', i % 2 ? 'finish' : 'play');
stalled.fire('pagehide');
assert.equal(stalled.beacons.length, 16, 'bounded queue includes open');
assertV2(stalled.beacons.map(x => x.body));
assert.equal(stalled.beacons[0].body.eventId, stalled.sent[0].eventId);

for (const args of [
    { origin: 'https://untrusted.example.org' }, { path: '/index.html' },
    { origin: 'http://127.0.0.1:8899' },
    { origin: 'https://dots-and-boxes.orangely.xyz', path: '/', game: 'dots' },
    { origin: 'https://wrong.example.org', path: '/', game: 'dots', external: true },
    { noCrypto: true },
]) {
    const blocked = fixture(args);
    blocked.window.hubTrack('tetris', 'play');
    assert.deepEqual(blocked.sent, []);
}
const external = fixture({ origin: 'https://dots-and-boxes.orangely.xyz',
    path: '/', game: 'dots', external: true });
assert.equal(external.sent[0].game, 'dots');
assertV2(external.sent);
const local = fixture({ origin: 'http://127.0.0.1:8899', localTest: true });
assert.deepEqual(local.sent.map(e => e.event), ['open']);
assert(local.addresses.every(u => u.startsWith('http://127.0.0.1:8899/__analytics/event')));
console.log('V2-only analytics client tests: PASS');
