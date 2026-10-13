// Self-contained HTTP + real SQLite migration test; no Wrangler, remote D1 or KV.
// Node 22's node:sqlite is used only by this checker, never by the Worker.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker, { dayKeyUTC8 } from '../Workers/games-analytics.js';

const Request = globalThis.Request;
const sql = readFileSync(new URL('../Workers/migrations/analytics/0001_analytics_v2.sql', import.meta.url), 'utf8');
const db = new DatabaseSync(':memory:');
db.exec(sql);
db.exec(readFileSync(new URL('../Workers/migrations/analytics/0002_playing_seconds.sql', import.meta.url), 'utf8'));
db.exec(readFileSync(new URL('../Workers/migrations/analytics/0003_event_occurred_at.sql', import.meta.url), 'utf8'));
const rateKeys = [];
const limiter = { async limit({ key }) { rateKeys.push(key); return { success: true }; } };
const binding = {
    prepare(sqlText) {
        const statement = db.prepare(sqlText);
        return {
            bind(...values) {
                return {
                    async first() { return statement.get(...values) ?? null; },
                    async all() { return { results: statement.all(...values) }; },
                    async run() { return { meta: { changes: statement.run(...values).changes } }; },
                };
            },
            async first() { return statement.get() ?? null; },
            async all() { return { results: statement.all() }; },
            async run() { return { meta: { changes: statement.run().changes } }; },
        };
    },
};
const now = Date.now;
Date.now = () => Date.parse('2026-10-13T12:00:00Z');
const send = async (body, { origin = 'https://games.orangely.xyz', method = 'POST' } = {}) =>
    worker.fetch(new Request('https://example.com/event', {
        method, headers: origin ? { Origin: origin, 'Content-Type': 'text/plain', 'CF-Connecting-IP': '192.0.2.123' } : {},
        body: JSON.stringify(body),
    }), { ANALYTICS_DB: binding, ANALYTICS_RATE_LIMITER: limiter });
const get = async (q = '', opts = {}) =>
    worker.fetch(new Request('https://example.com/stats' + q,
        { headers: opts.origin ? { Origin: opts.origin } : {} }), { ANALYTICS_DB: binding, ANALYTICS_RATE_LIMITER: limiter });
const fixture = (kind, id, seconds) => ({
    v: 2, game: 'tetris', event: kind,
    eventId: 'f1cb914e-5c44-4a0d-9a55-' + id.toString(16).padStart(12, '0'),
    sessionId: 'ff99744d-2acd-41e7-bcac-e811f1709b7b',
    ...(seconds === undefined ? {} : { seconds }),
});
const ymd = dayKeyUTC8();
const result = async (query, options) => (await get(query, options)).json();

assert.equal(dayKeyUTC8(Date.parse('2026-10-13T15:59:59Z')), '20261013');
assert.equal(dayKeyUTC8(Date.parse('2026-10-13T16:00:00Z')), '20261014');
assert.deepEqual(await result('?day=19991231'), {});
assert.deepEqual(await result('?scope=total'), {});
assert.deepEqual((await result('?v=2')).total, { p: 0, f: 0, opens: 0, activeSeconds: 0, playingSeconds: 0 });

assert.equal((await send({ game: 'tetris', event: 'play' })).status, 200);
assert.equal((await send({ game: 'tetris', event: 'finish' }, { origin: '' })).status, 200);
const old = await result('?day=' + ymd);
assert.deepEqual(old, { tetris: { p: 1, f: 1 }, total: { p: 1, f: 1 } });
assert.deepEqual(await result('?scope=total'), old);
assert.deepEqual(await result('?scope=total&v=2'), {
    scope: 'total', games: { tetris: { p: 1, f: 1, opens: 0, activeSeconds: 0, playingSeconds: 0 } },
    total: { p: 1, f: 1, opens: 0, activeSeconds: 0, playingSeconds: 0 },
});

// Legacy callers have no eventId and are explicitly NOT retry idempotent.
await send({ game: 'tetris', event: 'play' });
assert.equal((await result('?scope=total')).total.p, 2);

const open = fixture('open', 1);
const play = fixture('play', 2);
const finish = fixture('finish', 3);
const active = fixture('active', 4, 15);
assert.equal((await send(open)).status, 201);
assert.equal((await send(open)).status, 200);
assert.equal((await send({ ...open, eventId: fixture('open', 5).eventId })).status, 200);
assert.equal((await send({ ...open, game: 'gomoku' })).status, 409);
assert.equal((await send({ ...open, eventId: play.eventId, game: 'gomoku' })).status, 409);
assert.equal((await send(play)).status, 201);
assert.equal((await send(finish)).status, 201);
assert.equal((await send(active)).status, 201);
assert.equal((await send(active)).status, 200);
assert(rateKeys.includes('192.0.2.123'), 'native limiter keyed by Cloudflare caller address');
assert.equal((await send({ ...active, seconds: 16 })).status, 409);
const metrics = (await result('?v=2&day=' + ymd)).games.tetris;
assert.deepEqual(metrics, { p: 3, f: 2, opens: 1, activeSeconds: 15, playingSeconds: 0 });

// Check concurrent retries and distinct inserts; SQLite trigger rollup is atomic.
const retry = fixture('active', 6, 20);
const concurrent = await Promise.all(Array.from({ length: 40 }, () => send(retry)));
assert.equal(concurrent.filter(x => x.status === 201).length, 1);
assert.equal(concurrent.filter(x => x.status === 200).length, 39);
await Promise.all(Array.from({ length: 30 }, (_, i) => send(fixture('active', i + 100, 1))));
assert.equal((await result('?v=2&scope=total')).total.activeSeconds, 65);
const eventCount = db.prepare('SELECT count(*) n FROM analytics_events').get().n;
assert.equal(eventCount, 38); // 3 legacy + open/play/finish/active + retry + 30 distinct
assert.equal(db.prepare('SELECT sum(active_seconds) n FROM analytics_events').get().n, 65);
// Old V2 checkpoints without the new field stay valid; new ones count both
// independently, with idempotent retries and strict <= active constraint.
const measured = { ...fixture('active', 901, 12), playingSeconds: 8 };
assert.equal((await send(measured)).status, 201);
assert.equal((await send(measured)).status, 200);
assert.equal((await send({ ...measured, playingSeconds: 7 })).status, 409);
assert.deepEqual((await result('?v=2&scope=total')).total, {
    p: 3, f: 2, opens: 1, activeSeconds: 77, playingSeconds: 8,
});
assert.equal(db.prepare('SELECT sum(playing_seconds) n FROM analytics_events').get().n, 8);
// Two fresh events delivered after/before a UTC+8 midnight must be attributed
// to their actual occurrence day even if Worker receives both at the same time.
const priorDay = { ...fixture('active', 902, 3),
    playingSeconds: 2, occurredAt: Date.parse('2026-10-13T15:59:59Z') };
const nextDay = { ...fixture('active', 903, 5),
    playingSeconds: 4, occurredAt: Date.parse('2026-10-13T16:00:01Z') };
assert.equal((await send(priorDay)).status, 201);
assert.equal((await send(nextDay)).status, 201);
assert.equal((await send(priorDay)).status, 200);
assert.equal((await send({ ...priorDay, occurredAt: priorDay.occurredAt + 1000 })).status, 409);
assert.equal((await send({ ...priorDay, occurredAt: nextDay.occurredAt })).status, 409);
assert.equal((await send({ ...priorDay, occurredAt: undefined })).status, 400);
const { occurredAt: omittedTimestamp, ...withoutTimestamp } = priorDay;
assert.equal((await send(withoutTimestamp)).status, 409);
assert.equal(db.prepare('SELECT occurred_at FROM analytics_events WHERE event_id = ?').get(priorDay.eventId).occurred_at, priorDay.occurredAt);
assert.equal((await send({ ...open, occurredAt: priorDay.occurredAt })).status, 409);
assert.equal((await result('?v=2&day=20261013')).games.tetris.playingSeconds, 10);
assert.equal((await result('?v=2&day=20261014')).games.tetris.playingSeconds, 4);
assert.equal((await send({ ...priorDay, occurredAt: Date.parse('2026-09-01') })).status, 400);

for (const bad of [
    { game: 'bogus', event: 'play' }, { game: 'tetris', event: 'open' },
    { ...open, v: 3 }, { ...active, seconds: 0 }, { ...active, seconds: 61 },
    { ...active, seconds: 1.5 }, { ...active, seconds: '15' },
    { ...open, seconds: 0 }, { ...open, extra: 'field' },
    { ...open, eventId: 'foo' }, { ...open, sessionId: 'foo' },
    { ...play, event: 'start_levels' },
    { ...active, playingSeconds: -1 }, { ...active, playingSeconds: 16 },
    { ...active, playingSeconds: 0.5 }, { ...active, playingSeconds: '4' },
    { ...open, playingSeconds: 0 },
    { ...open, occurredAt: '2026-10-13' },
    { ...open, occurredAt: Date.parse('2026-01-01') },
    { ...active, occurredAt: Date.parse('2026-01-01') },
    { ...active, occurredAt: Date.parse('2026-10-13T12:00:00Z'), unknown: 1 },
]) assert.equal((await send(bad)).status, 400, JSON.stringify(bad));
const oversize = await send({ game: 'tetris', event: 'play', pad: 'x'.repeat(1100) });
assert.equal(oversize.status, 400);
const malformed = await worker.fetch(
    new Request('https://example.com/event', { method: 'POST', body: '{not json' }),
    { ANALYTICS_DB: binding, ANALYTICS_RATE_LIMITER: limiter },
);
assert.equal(malformed.status, 400);
assert.equal((await worker.fetch(new Request('https://example.com/event',
    { method: 'POST', body: JSON.stringify(open) }), {})).status, 503);
assert.equal((await worker.fetch(new Request('https://example.com/event',
    { method: 'POST', body: JSON.stringify(open) }), { ANALYTICS_DB: binding })).status, 503);
const beforeThrottle = db.prepare('SELECT count(*) n FROM analytics_events').get().n;
assert.equal((await worker.fetch(new Request('https://example.com/event',
    { method: 'POST', body: JSON.stringify(fixture('play', 900)) }), {
    ANALYTICS_DB: binding, ANALYTICS_RATE_LIMITER: {
        async limit({ key }) { assert.equal(key, 'unknown'); return { success: false }; },
    },
})).status, 429);
assert.equal(db.prepare('SELECT count(*) n FROM analytics_events').get().n, beforeThrottle);

assert.equal((await get('?v=2&day=20260230')).status, 400);
assert.equal((await get('?v=2&from=20261013')).status, 400);
assert.equal((await get('?v=2&from=20261014&to=20261013')).status, 400);
assert.equal((await get('?v=2&from=20260101&to=20261013')).status, 400);
assert.equal((await get('?v=2&scope=weekly')).status, 400);
assert.equal((await get('?v=2&scope=total&day=20261013')).status, 400);
assert.equal((await get('?v=3')).status, 400);
assert.deepEqual((await result('?v=2&from=' + ymd + '&to=' + ymd)).total,
    (await result('?v=2&day=' + ymd)).total);
assert.equal((await get('?v=2', { origin: 'https://games.orangely.xyz' })).headers.get('Access-Control-Allow-Origin'),
    'https://games.orangely.xyz');
assert.equal((await get('?v=2', { origin: 'https://evil.example' })).headers.get('Access-Control-Allow-Origin'),
    null);
for (const origin of ['https://2d-minecraft.orangely.xyz',
    'https://dots-and-boxes.orangely.xyz', 'https://steady-hand.orangely.xyz']) {
    assert.equal((await get('?v=2', { origin })).headers.get('Access-Control-Allow-Origin'), origin);
}
assert.equal((await worker.fetch(new Request('https://example.com/stats',
    { method: 'OPTIONS', headers: { Origin: 'https://games.orangely.xyz' } }), {})).status, 204);

// Browser client lifecycle is exercised by verify-analytics-browser.mjs.
// Hourly retention removes expired dedupe rows, never the historical rollups.
const lifetimeTotals = await result('?v=2&scope=total');
Date.now = () => Date.parse('2026-12-13T12:00:00Z');
await worker.scheduled({ scheduledTime: Date.now() }, { ANALYTICS_DB: binding });
assert.equal(db.prepare('SELECT count(*) n FROM analytics_events').get().n, 0);
assert.deepEqual((await result('?v=2&scope=total')).total, lifetimeTotals.total);
assert.deepEqual((await result('?scope=total')).total, { p: 3, f: 2 });
Date.now = now;
db.close();
console.log('Analytics V2 D1 migration, idempotency, UTC+8, legacy HTTP contract, playtime migration and cross-origin API: PASS');
