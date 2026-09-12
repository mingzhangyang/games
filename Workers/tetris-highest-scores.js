// Cloudflare Worker for Tetris Top 5 High Scores with CORS restriction
// KV Namespace binding: HIGH_SCORES

const ALLOWED_ORIGINS = [
  'https://games.orangely.xyz',
  'https://game.orangely.xyz',
];

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
  // 拒绝其他来源
  return {};
}

// 清理用户名：去除控制字符和不可打印字符，防止存储脏数据
function sanitizeName(value) {
  return String(value)
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
    .trim()
    .slice(0, 50);
}

export default {
  async fetch(request, env) {
    const origin = getOrigin(request);

    if (request.method === 'OPTIONS') {
      return new Response('', {
        headers: corsHeaders(origin)
      });
    }

    if (!ALLOWED_ORIGINS.includes(origin)) {
      return new Response('Forbidden', { status: 403 });
    }

    if (request.method === 'POST') {
      try {
        // 只接受 JSON 请求体
        const contentType = (request.headers.get('Content-Type') || '').split(';')[0].trim();
        if (contentType !== 'application/json') {
          return new Response('Invalid', { status: 400, headers: corsHeaders(origin) });
        }
        const { name, score } = await request.json();
        const cleanName = sanitizeName(name);
        if (!cleanName || typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 2000000) {
          return new Response('Invalid', { status: 400, headers: corsHeaders(origin) });
        }
        let top = await env.TETRIS_SCORES.get('top5');
        top = top ? JSON.parse(top) : [];
        if (!Array.isArray(top)) top = [];
        const idx = top.findIndex(item => item.name === cleanName);
        if (idx >= 0) {
          if (score > top[idx].score) {
            top[idx].score = score;
          }
        } else {
          top.push({ name: cleanName, score });
        }
        top.sort((a, b) => b.score - a.score);
        top = top.slice(0, 5);
        await env.TETRIS_SCORES.put('top5', JSON.stringify(top));
        return new Response('OK', { headers: corsHeaders(origin) });
      } catch (e) {
        return new Response('Error', { status: 400, headers: corsHeaders(origin) });
      }
    }

    // GET: 返回前五名排行榜
    let top;
    try {
      top = await env.TETRIS_SCORES.get('top5');
      top = top ? JSON.parse(top) : [];
    } catch (e) {
      top = [];
    }
    if (!Array.isArray(top)) top = [];
    return new Response(JSON.stringify(top), {
      headers: {
        ...corsHeaders(origin),
        'Content-Type': 'application/json'
      }
    });
  }
};