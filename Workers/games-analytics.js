// Games Analytics V2: D1 is the sole source of truth. No KV reads or writes.
// Legacy: POST /event {game,event:'play'|'finish'}; GET /stats?day=YYYYMMDD|scope=total.
// V2: POST /event {v:2,game,event,eventId,sessionId[,seconds]}; GET /stats?v=2.

const ALLOWED_ORIGINS = ['https://games.orangely.xyz', 'https://game.orangely.xyz'];

// registry:begin games-analytics
const GAMES = ['math-rain', 'tetris', 'tank-battle', 'gomoku', 'planet-merge', 'word-daily', 'hoop-shot', 'minesweeper', 'reversi', 'tower-defense', 'gravity-slingshot', 'needle-awn', 'sword-flight', 'lumen', 'circuit', 'silk-dew', 'bond-forge', 'echo-cave', 'maxwell-demon', 'crystal-bloom', 'flame-verse', 'ripple-duet', 'carrot-pull', 'firefly-signal', 'shadow-loom', 'loop-jail', 'minecraft', 'dots', 'stack'];
// registry:end games-analytics

const MAX_BODY_BYTES = 1024;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const V2_KINDS = new Set(['open', 'active', 'play', 'finish']);
const DAY_MILLISECONDS = 86400000;

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
      ? { version: 1, game: data.game, kind: data.event, seconds: 0, eventId: null, sessionId: null }
      : null;
  }
  if (data.v !== 2 || !V2_KINDS.has(data.event)) return null;
  const expected = data.event === 'active'
    ? 'event,eventId,game,seconds,sessionId,v'
    : 'event,eventId,game,sessionId,v';
  if (Object.keys(data).sort().join(',') !== expected) return null;
  if (typeof data.eventId !== 'string' || !UUID_V4.test(data.eventId)
    || typeof data.sessionId !== 'string' || !UUID_V4.test(data.sessionId)) return null;
  if (data.event === 'active' && (!Number.isInteger(data.seconds) || data.seconds < 1 || data.seconds > 60)) return null;
  return { version: 2, game: data.game, kind: data.event,
    seconds: data.event === 'active' ? data.seconds : 0,
    eventId: data.eventId, sessionId: data.sessionId };
}

function sameEvent(row, event) {
  return row && row.game === event.game && row.kind === event.kind
    && row.session_id === event.sessionId && Number(row.active_seconds) === event.seconds;
}

async function addEvent(db, event, day) {
  // The AFTER INSERT trigger updates analytics_daily in the SAME SQLite transaction.
  // D1's unique indexes serialize racing V2 retries; there is no read/modify/write step.
  const result = await db.prepare(`
    INSERT INTO analytics_events (version, event_id, session_id, day, game, kind, active_seconds)
    VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING
  `).bind(event.version, event.eventId, event.sessionId, day, event.game, event.kind, event.seconds).run();
  if (event.version === 1) return { ok: true };
  if (result.meta?.changes === 1) return { ok: true, duplicate: false };
  if (result.meta?.changes !== 0) throw new Error('Unexpected D1 write result');

  let row = await db.prepare(`
    SELECT event_id, game, kind, session_id, active_seconds FROM analytics_events WHERE event_id = ?
  `).bind(event.eventId).first();
  // A session may report one open even if a buggy client changes the event ID.
  if (!row && event.kind === 'open') {
    row = await db.prepare(`
      SELECT event_id, game, kind, session_id, active_seconds
      FROM analytics_events WHERE session_id = ? AND version = 2 AND kind = 'open'
    `).bind(event.sessionId).first();
  }
  return sameEvent(row, event) ? { ok: true, duplicate: true } : { ok: false, conflict: true };
}

const DAY_SQL = `SELECT game, plays AS p, finishes AS f, opens, active_seconds
  FROM analytics_daily WHERE day = ? ORDER BY game`;
const TOTAL_SQL = `SELECT game, SUM(plays) AS p, SUM(finishes) AS f,
  SUM(opens) AS opens, SUM(active_seconds) AS active_seconds
  FROM analytics_daily GROUP BY game ORDER BY game`;
const RANGE_SQL = `SELECT game, SUM(plays) AS p, SUM(finishes) AS f,
  SUM(opens) AS opens, SUM(active_seconds) AS active_seconds
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
  const total = v2 ? { p: 0, f: 0, opens: 0, activeSeconds: 0 } : { p: 0, f: 0 };
  for (const row of rows) {
    const pCount = Number(row.p);
    const fCount = Number(row.f);
    if (!v2 && !pCount && !fCount) continue;
    const entry = v2 ? {
      p: pCount, f: fCount, opens: Number(row.opens), activeSeconds: Number(row.active_seconds),
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
      const data = await parseBody(request);
      const event = validateEvent(data);
      if (!event) return reply('Invalid', 400, cors);
      const result = await addEvent(env.ANALYTICS_DB, event, dayKeyUTC8());
      if (result.conflict) return jsonReply({ ok: false, error: 'Event ID conflict' }, 409, cors);
      return event.version === 1 ? reply('OK', 200, cors)
        : jsonReply(result, result.duplicate ? 200 : 201, cors);
    } catch (error) {
      console.error('Analytics D1 failure', error);
      return reply('Internal Error', 500, cors);
    }
  },
};
