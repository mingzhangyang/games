// Cloudflare Worker — 共享游戏排行榜（全站唯一榜单 Worker）
// 一个 KV 命名空间承载所有游戏：键 `top:<game>`；每日榜按天一个键（TTL 自然滚动）
// 承载游戏：tetris / hoop-shot / planet-merge(+每日) / reversi / tower-defense /
//           minesweeper-easy|medium|hard / gravity-d<日期>
// GET  /scores?game=<id>   -> [{ name, score }, ...]（按游戏配置的升降序排好）
// POST /scores {game, name, score} -> 写入并保留每人最好成绩
// 部署：npx wrangler deploy -c Workers/wrangler-game-scores.jsonc
// 部署后地址：https://game-scores.orangely.workers.dev

const ALLOWED_ORIGINS = [
  'https://games.orangely.xyz',
  'https://game.orangely.xyz',
];

// 每个游戏一份配置：order=asc 表示分数越小越好（如扫雷用时秒数）；
// ttl 为可选的 KV 过期秒数（用于每日榜的自然滚动）
// registry:begin games-scores
const GAMES = {
  'tetris': { order: 'desc', maxScore: 2000000, maxEntries: 50 },
  'planet-merge': { order: 'desc', maxScore: 10000000, maxEntries: 50 },
  'hoop-shot': { order: 'desc', maxScore: 1000000, maxEntries: 50 },
  'minesweeper-easy': { order: 'asc', maxScore: 9999, maxEntries: 50 },
  'minesweeper-medium': { order: 'asc', maxScore: 9999, maxEntries: 50 },
  'minesweeper-hard': { order: 'asc', maxScore: 9999, maxEntries: 50 },
  'reversi': { order: 'desc', maxScore: 9999, maxEntries: 50 },
  'tower-defense': { order: 'desc', maxScore: 5000000, maxEntries: 50 },
  'needle-awn': { order: 'desc', maxScore: 5000000, maxEntries: 50 },
  'sword-flight': { order: 'desc', maxScore: 5000000, maxEntries: 50 },
};

// 每日赛程 / 每日挑战榜：按天一个键，正则白名单 + TTL 自然滚动
const DAILY_PATTERNS = [
  { re: /^planet-merge-d\d{8}$/, config: { order: 'desc', maxScore: 10000000, maxEntries: 50, ttl: 14 * 24 * 3600 } },
  { re: /^gravity-d\d{8}$/, config: { order: 'asc', maxScore: 99, maxEntries: 50 } },
  { re: /^needle-awn-d\d{8}$/, config: { order: 'desc', maxScore: 5000000, maxEntries: 50, ttl: 14 * 24 * 3600 } },
  { re: /^sword-flight-d\d{8}$/, config: { order: 'desc', maxScore: 5000000, maxEntries: 50, ttl: 14 * 24 * 3600 } },
  { re: /^lumen-d\d{8}$/, config: { order: 'asc', maxScore: 99, maxEntries: 50 } },
  { re: /^circuit-d\d{8}$/, config: { order: 'asc', maxScore: 99, maxEntries: 50, ttl: 14 * 24 * 3600 } },
  { re: /^silk-dew-d\d{8}$/, config: { order: 'asc', maxScore: 999, maxEntries: 50 } },
  { re: /^bond-forge-d\d{8}$/, config: { order: 'asc', maxScore: 999, maxEntries: 50 } },
  { re: /^echo-cave-d\d{8}$/, config: { order: 'asc', maxScore: 999, maxEntries: 50 } },
  { re: /^maxwell-demon-d\d{8}$/, config: { order: 'asc', maxScore: 999, maxEntries: 50 } },
  { re: /^crystal-bloom-d\d{8}$/, config: { order: 'asc', maxScore: 999, maxEntries: 50 } },
];
// registry:end games-scores

function resolveGame(game) {
  if (GAMES[game]) return GAMES[game];
  for (const p of DAILY_PATTERNS) {
    if (p.re.test(game)) return p.config;
  }
  return null;
}

const MAX_NAME_LEN = 20;
const MAX_BODY_BYTES = 1024;

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

function sanitizeName(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
    .trim()
    .slice(0, MAX_NAME_LEN);
}

function gameKey(game) {
  return `top:${game}`;
}

async function readList(env, game) {
  try {
    const raw = await env.GAME_SCORES.get(gameKey(game));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function betterThan(a, b, order) {
  return order === 'asc' ? a < b : a > b;
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

    if (request.method === 'POST' && url.pathname === '/scores') {
      // 榜单 payload 很小，超长请求直接拒绝，避免白耗 KV 读
      const length = Number(request.headers.get('Content-Length') || 0);
      if (length > MAX_BODY_BYTES) {
        return new Response('Invalid', { status: 413, headers: cors });
      }
      const contentType = (request.headers.get('Content-Type') || '').split(';')[0].trim();
      if (contentType !== 'application/json') {
        return new Response('Invalid', { status: 400, headers: cors });
      }
      try {
        const { game, name, score } = await request.json();
        const config = resolveGame(game);
        if (!config) {
          return new Response('Invalid', { status: 400, headers: cors });
        }
        const cleanName = sanitizeName(name);
        const cleanScore = Number(score);
        if (!cleanName ||
            typeof cleanScore !== 'number' || !Number.isFinite(cleanScore) ||
            cleanScore < 0 || cleanScore > config.maxScore) {
          return new Response('Invalid', { status: 400, headers: cors });
        }

        const list = await readList(env, game);
        const idx = list.findIndex(item => item.name === cleanName);
        if (idx >= 0) {
          if (betterThan(cleanScore, list[idx].score, config.order)) {
            list[idx].score = cleanScore;
          }
        } else {
          list.push({ name: cleanName, score: cleanScore });
        }
        list.sort((a, b) => config.order === 'asc' ? a.score - b.score : b.score - a.score);
        const putOptions = config.ttl ? { expirationTtl: config.ttl } : {};
        await env.GAME_SCORES.put(gameKey(game), JSON.stringify(list.slice(0, config.maxEntries)), putOptions);
        return new Response('OK', { headers: cors });
      } catch (e) {
        return new Response('Error', { status: 400, headers: cors });
      }
    }

    if (request.method === 'GET' && url.pathname === '/scores') {
      const game = url.searchParams.get('game') || '';
      const config = resolveGame(game);
      if (!config) {
        return new Response('Invalid', { status: 400, headers: cors });
      }
      const list = await readList(env, game);
      const top = list
        .sort((a, b) => config.order === 'asc' ? a.score - b.score : b.score - a.score)
        .slice(0, config.maxEntries);
      return new Response(JSON.stringify(top), {
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
