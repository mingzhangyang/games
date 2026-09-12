// Cloudflare Worker for Planet Merge leaderboards (daily + all-time)
// KV Namespace binding: PLANET_SCORES
// Deploy separately from the main site worker; the game degrades to
// local-only scores when this Worker is unreachable.

const ALLOWED_ORIGINS = [
  'https://games.orangely.xyz',
  'https://game.orangely.xyz',
];

const MAX_ENTRIES = 50;
const MAX_SCORE = 10000000;
const DAILY_TTL_SECONDS = 14 * 24 * 3600; // 每日榜保留 14 天

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

// UTC+8 的当日键，与客户端 todayKey() 保持一致
function currentDay() {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

function sanitizeName(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
    .trim()
    .slice(0, 20);
}

function isValidDay(day) {
  return /^\d{8}$/.test(day);
}

async function readList(env, key) {
  try {
    const raw = await env.PLANET_SCORES.get(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

async function writeList(env, key, list, ttl) {
  const options = ttl ? { expirationTtl: ttl } : {};
  await env.PLANET_SCORES.put(key, JSON.stringify(list), options);
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
      try {
        const contentType = (request.headers.get('Content-Type') || '').split(';')[0].trim();
        if (contentType !== 'application/json') {
          return new Response('Invalid', { status: 400, headers: cors });
        }
        const { name, score, mode, day } = await request.json();

        const cleanName = sanitizeName(name);
        const cleanScore = Number(score);
        const cleanMode = mode === 'daily' ? 'daily' : 'alltime';
        const cleanDay = isValidDay(day) ? day : currentDay();

        if (!cleanName ||
            typeof cleanScore !== 'number' || !Number.isFinite(cleanScore) ||
            cleanScore < 0 || cleanScore > MAX_SCORE ||
            (cleanMode === 'daily' && !isValidDay(cleanDay))) {
          return new Response('Invalid', { status: 400, headers: cors });
        }

        // 每日提交同时进总榜；总榜提交若带有效日期也同步进当日榜
        const keys = cleanMode === 'daily'
          ? [`daily-${cleanDay}`, 'alltime']
          : ['alltime'];
        if (cleanMode === 'alltime' && isValidDay(day)) {
          keys.push(`daily-${cleanDay}`);
        }

        for (const key of [...new Set(keys)]) {
          const list = await readList(env, key);
          const idx = list.findIndex(item => item.name === cleanName);
          if (idx >= 0) {
            if (cleanScore > list[idx].score) {
              list[idx].score = cleanScore;
            }
          } else {
            list.push({ name: cleanName, score: cleanScore });
          }
          list.sort((a, b) => b.score - a.score);
          const trimmed = list.slice(0, MAX_ENTRIES);
          await writeList(env, key, trimmed, key.startsWith('daily-') ? DAILY_TTL_SECONDS : 0);
        }

        return new Response('OK', { headers: cors });
      } catch (e) {
        return new Response('Error', { status: 400, headers: cors });
      }
    }

    if (request.method === 'GET' && url.pathname === '/scores') {
      const mode = url.searchParams.get('mode') === 'daily' ? 'daily' : 'alltime';
      let day = url.searchParams.get('day') || currentDay();
      if (!isValidDay(day)) day = currentDay();
      const key = mode === 'daily' ? `daily-${day}` : 'alltime';
      const list = await readList(env, key);
      const top = list.sort((a, b) => b.score - a.score).slice(0, MAX_ENTRIES);
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
