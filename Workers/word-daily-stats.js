// Cloudflare Worker for Word Daily — global daily battle report (aggregate only)
// KV Namespace binding: WORD_STATS
// POST /stats {day, mode, win, rows}  -> increments counters
// GET  /stats?day=YYYY-MM-DD&mode=en|zh -> { p, w, d: [n1..n6] }
// Deploy separately: npx wrangler deploy -c Workers/wrangler-word-daily.jsonc

const ALLOWED_ORIGINS = [
  'https://games.orangely.xyz',
  'https://game.orangely.xyz',
];

const MAX_GUESSES = 6;

function getOrigin(request) {
  return request.headers.get('Origin') || '';
}

function corsHeaders(origin) {
  if (ALLOWED_ORIGINS.includes(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    };
  }
  return {};
}

function isValidDay(day) {
  return /^\d{4}-\d{2}-\d{2}$/.test(day);
}

function isValidMode(mode) {
  return mode === 'en' || mode === 'zh';
}

async function readStats(env, key) {
  try {
    const raw = await env.WORD_STATS.get(key);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.d)) {
      return {
        p: Number(parsed.p) || 0,
        w: Number(parsed.w) || 0,
        d: parsed.d.map(n => Number(n) || 0).slice(0, MAX_GUESSES).concat([0, 0, 0, 0, 0, 0]).slice(0, MAX_GUESSES)
      };
    }
  } catch (e) {
    // 数据损坏时从零开始
  }
  return { p: 0, w: 0, d: [0, 0, 0, 0, 0, 0] };
}

export default {
  async fetch(request, env) {
    const origin = getOrigin(request);
    const cors = corsHeaders(origin);
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response('', { headers: cors });
    }

    if (!ALLOWED_ORIGINS.includes(origin)) {
      return new Response('Forbidden', { status: 403 });
    }

    if (request.method === 'POST' && url.pathname === '/stats') {
      try {
        const contentType = (request.headers.get('Content-Type') || '').split(';')[0].trim();
        if (contentType !== 'application/json') {
          return new Response('Invalid', { status: 400, headers: cors });
        }
        const { day, mode, win, rows } = await request.json();
        if (!isValidDay(day) || !isValidMode(mode)) {
          return new Response('Invalid', { status: 400, headers: cors });
        }
        const isWin = win === true;
        const rowsUsed = Number(rows);
        if (!Number.isFinite(rowsUsed) || rowsUsed < 1 || rowsUsed > MAX_GUESSES) {
          return new Response('Invalid', { status: 400, headers: cors });
        }

        const key = `d-${day}-${mode}`;
        const stats = await readStats(env, key);
        stats.p += 1;
        if (isWin) {
          stats.w += 1;
          stats.d[rowsUsed - 1] += 1;
        }
        // 每日战报天然只需保留当天，7 天后自动过期
        await env.WORD_STATS.put(key, JSON.stringify(stats), { expirationTtl: 7 * 24 * 3600 });

        return new Response('OK', { headers: cors });
      } catch (e) {
        return new Response('Error', { status: 400, headers: cors });
      }
    }

    if (request.method === 'GET' && url.pathname === '/stats') {
      let day = url.searchParams.get('day') || '';
      const mode = url.searchParams.get('mode') || 'en';
      if (!isValidDay(day)) day = '';
      if (!isValidMode(mode)) {
        return new Response('Invalid', { status: 400, headers: cors });
      }
      const key = `d-${day}-${mode}`;
      const stats = await readStats(env, key);
      return new Response(JSON.stringify(stats), {
        headers: {
          ...cors,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store'
        }
      });
    }

    return new Response('Not Found', { status: 404, headers: cors });
  }
};
