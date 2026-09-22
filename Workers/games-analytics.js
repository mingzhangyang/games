// Cloudflare Worker for Games Analytics — aggregate play counters (no PII)
// KV Namespace binding: GAMES_ANALYTICS
// POST /event  {game, event: 'play'|'finish'}   (sendBeacon text/plain 兼容)
// GET  /stats?day=YYYYMMDD  -> { "<game>": {p, f}, ..., total: {p, f} }
// 部署：npx wrangler deploy -c Workers/wrangler-games-analytics.jsonc

const ALLOWED_ORIGINS = [
  'https://games.orangely.xyz',
  'https://game.orangely.xyz',
];

// registry:begin games-analytics
const GAMES = ['math-rain', 'tetris', 'tank-battle', 'gomoku', 'planet-merge', 'word-daily', 'hoop-shot', 'minesweeper', 'reversi', 'tower-defense', 'gravity-slingshot', 'needle-awn', 'sword-flight', 'lumen', 'circuit', 'silk-dew', 'bond-forge', 'echo-cave', 'maxwell-demon', 'crystal-bloom', 'flame-verse'];
// registry:end games-analytics
const DAILY_TTL_SECONDS = 90 * 24 * 3600;

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

// 与全站一致的 UTC+8 日期键
function currentDay() {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

function isValidDay(day) {
  return /^\d{8}$/.test(day);
}

async function readStats(env, key) {
  try {
    const raw = await env.GAMES_ANALYTICS.get(key);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch (e) {
    // 数据损坏从零开始
  }
  return {};
}

export default {
  async fetch(request, env) {
    const origin = getOrigin(request);
    const cors = corsHeaders(origin);
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response('', { headers: cors });
    }

    // 统计上报用 sendBeacon（无 Origin 头也可能出现），来源不锁死但校验载荷
    if (request.method === 'POST' && url.pathname === '/event') {
      try {
        const text = await request.text();
        const { game, event } = JSON.parse(text);
        if (!GAMES.includes(game) || (event !== 'play' && event !== 'finish')) {
          return new Response('Invalid', { status: 400 });
        }
        const day = currentDay();
        const field = event === 'play' ? 'p' : 'f';

        const dayKey = `d-${day}`;
        const dayStats = await readStats(env, dayKey);
        const dayEntry = dayStats[game] || { p: 0, f: 0 };
        dayEntry[field] += 1;
        dayStats[game] = dayEntry;
        dayStats.total = dayStats.total || { p: 0, f: 0 };
        dayStats.total[field] += 1;
        await env.GAMES_ANALYTICS.put(dayKey, JSON.stringify(dayStats), { expirationTtl: DAILY_TTL_SECONDS });

        const totalStats = await readStats(env, 'total');
        const totalEntry = totalStats[game] || { p: 0, f: 0 };
        totalEntry[field] += 1;
        totalStats[game] = totalEntry;
        totalStats.total = totalStats.total || { p: 0, f: 0 };
        totalStats.total[field] += 1;
        await env.GAMES_ANALYTICS.put('total', JSON.stringify(totalStats));

        return new Response('OK');
      } catch (e) {
        return new Response('Error', { status: 400 });
      }
    }

    if (request.method === 'GET' && url.pathname === '/stats') {
      let day = url.searchParams.get('day') || currentDay();
      if (!isValidDay(day)) day = currentDay();
      const scope = url.searchParams.get('scope') === 'total' ? 'total' : `d-${day}`;
      const stats = await readStats(env, scope);
      return new Response(JSON.stringify(stats), {
        headers: {
          ...cors,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store'
        }
      });
    }

    return new Response('Not Found', { status: 404 });
  }
};
