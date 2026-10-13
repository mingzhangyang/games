// Games Analytics V2: D1 is the sole source of truth. No KV reads or writes.
// Legacy: POST /event {game,event:'play'|'finish'}; GET /stats?day=YYYYMMDD|scope=total.
// V2: POST /event {v:2,game,event,eventId,sessionId[,seconds,playingSeconds,occurredAt]}; GET /stats?v=2.

// registry:begin analytics-origins
const ALLOWED_ORIGINS = ['https://games.orangely.xyz', 'https://game.orangely.xyz', 'https://2d-minecraft.orangely.xyz', 'https://dots-and-boxes.orangely.xyz', 'https://steady-hand.orangely.xyz'];
// registry:end analytics-origins

// registry:begin games-analytics
const GAMES = ['math-rain', 'tetris', 'tank-battle', 'gomoku', 'planet-merge', 'word-daily', 'hoop-shot', 'minesweeper', 'reversi', 'tower-defense', 'gravity-slingshot', 'needle-awn', 'sword-flight', 'lumen', 'circuit', 'silk-dew', 'bond-forge', 'echo-cave', 'maxwell-demon', 'crystal-bloom', 'flame-verse', 'ripple-duet', 'carrot-pull', 'firefly-signal', 'shadow-loom', 'loop-jail', 'minecraft', 'dots', 'stack'];
// registry:end games-analytics

const MAX_BODY_BYTES = 1024;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const V2_KINDS = new Set(['open', 'active', 'play', 'finish']);
const DAY_MILLISECONDS = 86400000;
// Event IDs are retry-idempotent for 45 days. Rollups live indefinitely.
const RETRY_WINDOW_DAYS = 45;
const CLEANUP_BATCH_ROWS = 5000;

export function dayKeyUTC8(timestamp = Date.now()) {
  const d = new Date(timestamp + 8 * 3600000);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

function validCalendarDay(day) {
  if (typeof day !== 'string' || !/^\d{8}$/.test(day)) return false;
  const y = Number(day.slice(0, 4));
  const m = Number(day.slice(4, 6));
  const d = Number(day.slice(6, 8));
  const date = new Date(Date.UTC(y, m - 1, d));
  return y >= 100 && date.getUTCFullYear() === y && date.getUTCMonth() + 1 === m && date.getUTCDate() === d;
}

function calendarDayMs(day) {
  return Date.UTC(Number(day.slice(0, 4)), Number(day.slice(4, 6)) - 1, Number(day.slice(6, 8)));
}

function corsHeaders(request) {
  const origin = request.headers.get('Origin');
  return origin && ALLOWED_ORIGINS.includes(origin) ? {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  } : {};
}

function reply(body, status, cors, contentType = 'text/plain; charset=utf-8') {
  return new Response(body, { status, headers: { ...cors, 'Content-Type': contentType, 'Cache-Control': 'no-store' } });
}

function jsonReply(body, status, cors) {
  return reply(JSON.stringify(body), status, cors, 'application/json; charset=utf-8');
}

async function parseBody(request) {
  const length = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) return null;
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks = [];
  let bytes = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const buffer = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer));
    return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
  } catch { return null; }
}

function validateEvent(data) {
  if (!data || !GAMES.includes(data.game)) return null;
  if (!Object.hasOwn(data, 'v')) {
    return data.event === 'play' || data.event === 'finish'
      ? { version: 1, game: data.game, kind: data.event, seconds: 0, playingSeconds: 0, eventId: null, sessionId: null }
      : null;
  }
  if (data.v !== 2 || !V2_KINDS.has(data.event)) return null;
  const keys = Object.keys(data).sort().join(',');
  const expected = data.event === 'active'
    ? 'event,eventId,game,seconds,sessionId,v'
    : 'event,eventId,game,sessionId,v';
  // Additive active-only gameplay duration; all Phase 1 V2 payloads still pass.
  if (![expected,
    ...(data.event === 'active'
      ? ['event,eventId,game,playingSeconds,seconds,sessionId,v',
        'event,eventId,game,occurredAt,seconds,sessionId,v',
        'event,eventId,game,occurredAt,playingSeconds,seconds,sessionId,v']
      : ['event,eventId,game,occurredAt,sessionId,v'])].includes(keys)) return null;
  // Clock skew / delayed traffic is bounded; an event cannot target arbitrary
  // historical D1 days. Retries keep their immutable original event time.
  if (Object.hasOwn(data, 'occurredAt') &&
    (!Number.isSafeInteger(data.occurredAt) || Math.abs(Date.now() - data.occurredAt) > 86400000))
    return null;
  if (typeof data.eventId !== 'string' || !UUID_V4.test(data.eventId)
    || typeof data.sessionId !== 'string' || !UUID_V4.test(data.sessionId)) return null;
  if (data.event === 'active' && (!Number.isInteger(data.seconds) || data.seconds < 1 || data.seconds > 60
    || (Object.hasOwn(data, 'playingSeconds') && (!Number.isInteger(data.playingSeconds)
      || data.playingSeconds < 0 || data.playingSeconds > data.seconds)))) return null;
  return { version: 2, game: data.game, kind: data.event,
    seconds: data.event === 'active' ? data.seconds : 0,
    playingSeconds: data.event === 'active' ? data.playingSeconds ?? 0 : 0,
    occurredAt: data.occurredAt ?? null,
    eventId: data.eventId, sessionId: data.sessionId };
}

function sameEvent(row, event) {
  return row && row.game === event.game && row.kind === event.kind
    && row.session_id === event.sessionId && Number(row.active_seconds) === event.seconds
    && Number(row.playing_seconds) === event.playingSeconds
    && (row.occurred_at === null ? null : Number(row.occurred_at)) === event.occurredAt
    && row.day === dayKeyUTC8(event.occurredAt ?? Date.now());
}

async function addEvent(db, event, day) {
  // The AFTER INSERT trigger updates analytics_daily in the SAME SQLite transaction.
  // D1's unique indexes serialize racing V2 retries; there is no read/modify/write step.
  const result = await db.prepare(`
    INSERT INTO analytics_events (version, event_id, session_id, day, game, kind, active_seconds, playing_seconds, occurred_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING
  `).bind(event.version, event.eventId, event.sessionId, day, event.game, event.kind, event.seconds, event.playingSeconds, event.occurredAt ?? null).run();
  if (event.version === 1) return { ok: true };
  if (result.meta?.changes === 1) return { ok: true, duplicate: false };
  if (result.meta?.changes !== 0) throw new Error('Unexpected D1 write result');

  let row = await db.prepare(`
    SELECT event_id, game, kind, session_id, active_seconds, playing_seconds, occurred_at, day FROM analytics_events WHERE event_id = ?
  `).bind(event.eventId).first();
  // A session may report one open even if a buggy client changes the event ID.
  if (!row && event.kind === 'open') {
    row = await db.prepare(`
      SELECT event_id, game, kind, session_id, active_seconds, playing_seconds, occurred_at, day
      FROM analytics_events WHERE session_id = ? AND version = 2 AND kind = 'open'
    `).bind(event.sessionId).first();
  }
  return sameEvent(row, event) ? { ok: true, duplicate: true } : { ok: false, conflict: true };
}

// Process at most one bounded batch per hourly cron. The day/game rollup is not deleted.
async function pruneEvents(db, timestamp = Date.now()) {
  const oldestKeptDay = dayKeyUTC8(timestamp - RETRY_WINDOW_DAYS * DAY_MILLISECONDS);
  const result = await db.prepare(`
    DELETE FROM analytics_events
    WHERE id IN (
      SELECT id FROM analytics_events WHERE day < ?
      ORDER BY day, id LIMIT ?
    )
  `).bind(oldestKeptDay, CLEANUP_BATCH_ROWS).run();
  return Number(result.meta?.changes ?? 0);
}

const DAY_SQL = `SELECT game, plays AS p, finishes AS f, opens, active_seconds, playing_seconds
  FROM analytics_daily WHERE day = ? ORDER BY game`;
const TOTAL_SQL = `SELECT game, SUM(plays) AS p, SUM(finishes) AS f,
  SUM(opens) AS opens, SUM(active_seconds) AS active_seconds, SUM(playing_seconds) AS playing_seconds
  FROM analytics_daily GROUP BY game ORDER BY game`;
const RANGE_SQL = `SELECT game, SUM(plays) AS p, SUM(finishes) AS f,
  SUM(opens) AS opens, SUM(active_seconds) AS active_seconds, SUM(playing_seconds) AS playing_seconds
  FROM analytics_daily WHERE day BETWEEN ? AND ? GROUP BY game ORDER BY game`;

async function stats(requestUrl, db, cors) {
  const p = requestUrl.searchParams;
  const v = p.get('v');
  if (v !== null && v !== '2') return reply('Invalid version', 400, cors);
  const v2 = v === '2';
  const scope = p.get('scope');
  const isTotal = scope === 'total';
  const from = p.get('from');
  const to = p.get('to');
  const range = from !== null || to !== null;

  if (v2 && (scope !== null && scope !== 'total'
    || (range && (isTotal || p.has('day') || !validCalendarDay(from) || !validCalendarDay(to)
      || calendarDayMs(from) > calendarDayMs(to)
      || calendarDayMs(to) - calendarDayMs(from) > 30 * DAY_MILLISECONDS))
    || (isTotal && p.has('day')))) return reply('Invalid range or scope', 400, cors);

  let day = p.get('day') || dayKeyUTC8();
  // Legacy dates keep the old lenient fallback for 8-digit strings.
  if (!/^\d{8}$/.test(day)) day = dayKeyUTC8();
  if (v2 && !range && !isTotal && !validCalendarDay(day)) return reply('Invalid day', 400, cors);

  const query = isTotal ? db.prepare(TOTAL_SQL)
    : range && v2 ? db.prepare(RANGE_SQL).bind(from, to)
      : db.prepare(DAY_SQL).bind(day);
  const rows = (await query.all()).results || [];
  const games = {};
  const total = v2 ? { p: 0, f: 0, opens: 0, activeSeconds: 0, playingSeconds: 0 } : { p: 0, f: 0 };
  for (const row of rows) {
    const pCount = Number(row.p);
    const fCount = Number(row.f);
    if (!v2 && !pCount && !fCount) continue;
    const entry = v2 ? {
      p: pCount, f: fCount, opens: Number(row.opens), activeSeconds: Number(row.active_seconds),
      playingSeconds: Number(row.playing_seconds),
    } : { p: pCount, f: fCount };
    games[row.game] = entry;
    for (const key of Object.keys(total)) total[key] += entry[key];
  }
  if (!v2) {
    // Exact legacy shape, including {} when no play or finish has been recorded.
    if (Object.keys(games).length) games.total = total;
    return jsonReply(games, 200, cors);
  }
  return jsonReply({ scope: isTotal ? 'total' : range ? 'range' : 'day',
    ...(isTotal ? {} : range ? { from, to } : { day }), games, total }, 200, cors);
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request);
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!((request.method === 'POST' && url.pathname === '/event')
      || (request.method === 'GET' && url.pathname === '/stats'))) return reply('Not Found', 404, cors);
    if (!env?.ANALYTICS_DB) return reply('Database unavailable', 503, cors);
    try {
      if (request.method === 'GET') return await stats(url, env.ANALYTICS_DB, cors);
      // Native Cloudflare rate limiter runs before parsing or database writes.
      // Use the platform-assigned address only as an ephemeral limiter key;
      // never persist IPs, cookies, user agents, or user identifiers in D1.
      if (!env.ANALYTICS_RATE_LIMITER) return reply('Rate limiter unavailable', 503, cors);
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const { success } = await env.ANALYTICS_RATE_LIMITER.limit({ key: ip });
      if (!success) return reply('Too Many Requests', 429, cors);
      const data = await parseBody(request);
      const event = validateEvent(data);
      if (!event) return reply('Invalid', 400, cors);
      const result = await addEvent(env.ANALYTICS_DB, event, dayKeyUTC8(event.occurredAt ?? Date.now()));
      if (result.conflict) return jsonReply({ ok: false, error: 'Event ID conflict' }, 409, cors);
      return event.version === 1 ? reply('OK', 200, cors)
        : jsonReply(result, result.duplicate ? 200 : 201, cors);
    } catch (error) {
      console.error('Analytics D1 failure', error);
      return reply('Internal Error', 500, cors);
    }
  },
  async scheduled(_controller, env) {
    if (!env?.ANALYTICS_DB) throw new Error('Analytics D1 binding unavailable');
    const removed = await pruneEvents(env.ANALYTICS_DB);
    console.log('Analytics dedupe retention: removed', removed);
  },
};
