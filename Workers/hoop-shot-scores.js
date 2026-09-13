// Cloudflare Worker for Hoop Shot — global all-time top scores
// KV Namespace binding: HOOP_SCORES
// Deploy separately: npx wrangler deploy -c Workers/wrangler-hoop-shot.jsonc

const ALLOWED_ORIGINS = [
  'https://games.orangely.xyz',
  'https://game.orangely.xyz',
];

const MAX_ENTRIES = 50;
const MAX_SCORE = 1000000;

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
    .slice(0, 20);
}

async function readList(env) {
  try {
    const raw = await env.HOOP_SCORES.get('top');
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

export default {
  async fetch(request, env) {
    const origin = getOrigin(request);
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response('', { headers: cors });
    }

    if (!ALLOWED_ORIGINS.includes(origin)) {
      return new Response('Forbidden', { status: 403 });
    }

    if (request.method === 'POST' && new URL(request.url).pathname === '/scores') {
      try {
        const contentType = (request.headers.get('Content-Type') || '').split(';')[0].trim();
        if (contentType !== 'application/json') {
          return new Response('Invalid', { status: 400, headers: cors });
        }
        const { name, score } = await request.json();
        const cleanName = sanitizeName(name);
        const cleanScore = Number(score);
        if (!cleanName ||
            typeof cleanScore !== 'number' || !Number.isFinite(cleanScore) ||
            cleanScore < 0 || cleanScore > MAX_SCORE) {
          return new Response('Invalid', { status: 400, headers: cors });
        }

        const list = await readList(env);
        const idx = list.findIndex(item => item.name === cleanName);
        if (idx >= 0) {
          if (cleanScore > list[idx].score) {
            list[idx].score = cleanScore;
          }
        } else {
          list.push({ name: cleanName, score: cleanScore });
        }
        list.sort((a, b) => b.score - a.score);
        await env.HOOP_SCORES.put('top', JSON.stringify(list.slice(0, MAX_ENTRIES)));
        return new Response('OK', { headers: cors });
      } catch (e) {
        return new Response('Error', { status: 400, headers: cors });
      }
    }

    if (request.method === 'GET' && new URL(request.url).pathname === '/scores') {
      const list = await readList(env);
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
