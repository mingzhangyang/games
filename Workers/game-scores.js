export { GameScoreBoard } from './scoreboard-durable.js';
import { validDailyDateKey } from './scoreboard-date.js';
// Cloudflare Worker — 共享游戏排行榜（全站唯一榜单 Worker）
// SQLite Durable Objects own live scores; KV holds legacy snapshots for one-time read-only migration.
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
  'math-rain-1': { order: 'desc', maxScore: 2000000, maxEntries: 50 },
  'math-rain-2': { order: 'desc', maxScore: 2000000, maxEntries: 50 },
  'math-rain-3': { order: 'desc', maxScore: 2000000, maxEntries: 50 },
  'math-rain-4': { order: 'desc', maxScore: 2000000, maxEntries: 50 },
  'math-rain-5': { order: 'desc', maxScore: 2000000, maxEntries: 50 },
  'math-rain-6': { order: 'desc', maxScore: 2000000, maxEntries: 50 },
  'tetris': { order: 'desc', maxScore: 2000000, maxEntries: 50 },
  'tank-battle': { order: 'desc', maxScore: 5000000, maxEntries: 50 },
  'planet-merge': { order: 'desc', maxScore: 10000000, maxEntries: 50 },
  'hoop-shot': { order: 'desc', maxScore: 1000000, maxEntries: 50 },
  'minesweeper-easy': { order: 'asc', maxScore: 9999, maxEntries: 50 },
  'minesweeper-medium': { order: 'asc', maxScore: 9999, maxEntries: 50 },
  'minesweeper-hard': { order: 'asc', maxScore: 9999, maxEntries: 50 },
  'reversi': { order: 'desc', maxScore: 9999, maxEntries: 50 },
  'tower-defense': { order: 'desc', maxScore: 5000000, maxEntries: 50 },
  'tower-defense-outpost': { order: 'desc', maxScore: 5000000, maxEntries: 50 },
  'tower-defense-vanguard': { order: 'desc', maxScore: 5000000, maxEntries: 50 },
  'tower-defense-citadel': { order: 'desc', maxScore: 5000000, maxEntries: 50 },
  'tower-defense-skyfall': { order: 'desc', maxScore: 5000000, maxEntries: 50 },
  'tower-defense-juggernaut': { order: 'desc', maxScore: 5000000, maxEntries: 50 },
  'tower-defense-singularity': { order: 'desc', maxScore: 5000000, maxEntries: 50 },
  'needle-awn': { order: 'desc', maxScore: 5000000, maxEntries: 50 },
  'needle-awn-endless': { order: 'desc', maxScore: 5000000, maxEntries: 50 },
  'sword-flight': { order: 'desc', maxScore: 5000000, maxEntries: 50 },
  'carrot-pull': { order: 'desc', maxScore: 1000000, maxEntries: 50 },
  'firefly-signal-first-light': { order: 'asc', maxScore: 100000, maxEntries: 50 },
  'firefly-signal-two-meadows': { order: 'asc', maxScore: 100000, maxEntries: 50 },
  'firefly-signal-midsummer': { order: 'asc', maxScore: 100000, maxEntries: 50 },
  'shadow-loom-rabbit': { order: 'asc', maxScore: 9007199254740991, maxEntries: 50 },
  'shadow-loom-bird': { order: 'asc', maxScore: 9007199254740991, maxEntries: 50 },
  'shadow-loom-whale': { order: 'asc', maxScore: 9007199254740991, maxEntries: 50 },
  'shadow-loom-deer': { order: 'asc', maxScore: 9007199254740991, maxEntries: 50 },
  'shadow-loom-pagoda': { order: 'asc', maxScore: 9007199254740991, maxEntries: 50 },
  'shadow-loom-tree': { order: 'asc', maxScore: 9007199254740991, maxEntries: 50 },
  'shadow-loom-koi': { order: 'asc', maxScore: 9007199254740991, maxEntries: 50 },
  'shadow-loom-crane': { order: 'asc', maxScore: 9007199254740991, maxEntries: 50 },
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
  { re: /^flame-verse-d\d{8}$/, config: { order: 'asc', maxScore: 999, maxEntries: 50 } },
  { re: /^ripple-duet-d\d{8}$/, config: { order: 'asc', maxScore: 999, maxEntries: 50 } },
];
// registry:end games-scores

function resolveGame(game) {
  if (typeof game !== 'string') return null;
  // Plain object prototypes are not valid game IDs (e.g. "__proto__").
  if (Object.prototype.hasOwnProperty.call(GAMES, game)) return GAMES[game];
  for (const p of DAILY_PATTERNS) {
    // Reject nonexistent or unbounded date suffixes BEFORE idFromName(),
    // on both GET and POST. The Origin header is not authentication.
    if (p.re.test(game) && validDailyDateKey(game)) return p.config;
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

function boardStub(env, game) {
  if (!env.SCORE_BOARDS) throw new Error('SCORE_BOARDS binding unavailable');
  return env.SCORE_BOARDS.get(env.SCORE_BOARDS.idFromName(game));
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
        const payload = await request.json().catch(() => null);
        if (!payload || typeof payload !== 'object') {
          return new Response('Invalid', { status: 400, headers: cors });
        }
        const { game, name, score } = payload;
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

        await boardStub(env, game).submit(game, config, cleanName, cleanScore);
        return new Response('OK', { headers: cors });
      } catch (e) {
        console.error('Leaderboard submit unavailable', e);
        return new Response('Unavailable', { status: 503, headers: cors });
      }
    }

    if (request.method === 'GET' && url.pathname === '/scores') {
      const game = url.searchParams.get('game') || '';
      const config = resolveGame(game);
      if (!config) {
        return new Response('Invalid', { status: 400, headers: cors });
      }
      try {
        const top = await boardStub(env, game).list(game, config);
        return new Response(JSON.stringify(top), {
          headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
        });
      } catch (error) {
        console.error('Leaderboard read unavailable', error);
        return new Response('Unavailable', { status: 503, headers: cors });
      }
    }

    return new Response('Not Found', { status: 404, headers: cors });
  }
};
