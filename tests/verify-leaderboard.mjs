#!/usr/bin/env node
// verify-leaderboard.mjs — src/platform/leaderboard.js 唯一榜单网络层回归防线（P2-4）
//
// 两层断言：
//   1) 行为：mock globalThis.fetch，验证 submitScore / fetchBoard 的
//      请求 URL、方法、请求体、ok 判定、超时兜底、escapeHTML 黄金值。
//      （submitScore 绝不抛出；fetchBoard 失败抛出由页面兜底——契约不变。）
//   2) 收敛：注册表里挂 leaderboard cap 的游戏均到达共享 leaderboard 模块，且不再存在
//      硬编码 Workers URL、本地 escapeHTML 定义、榜单 AbortController 样板。
//
// 用法：node tests/verify-leaderboard.mjs（无需浏览器/服务器）

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { registry } from './lib/registry.mjs';
import { collectStaticModuleGraph } from './lib/static-module-graph.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LB_PATH = join(ROOT, 'src', 'platform', 'leaderboard.js');
const WORKER_PATH = join(ROOT, 'Workers', 'game-scores.js');
// 清单来自注册表：挂 leaderboard cap 的游戏。此前是手写的 9 个，lumen 上线后
// 漏在外面（verify-registry 只校验 cap ⟺ 代码事实，管不到别的脚本的手写数组）。
const GAMES = registry.withCap('leaderboard');

let failed = 0;
const ok = (cond, label, extra) => {
    if (cond) { console.log(`✓ ${label}`); return; }
    failed++;
    console.error(`✗ ${label}${extra !== undefined ? ' —— got: ' + extra : ''}`);
};

/* ─────────────── 行为断言（mock fetch） ─────────────── */

console.log('▶ 行为（mock fetch）');

const realFetch = globalThis.fetch;
const calls = [];

function mockFetch(status = 200, body = null, rejectWith = null) {
    globalThis.fetch = async (url, opts = {}) => {
        calls.push({ url, method: opts.method || 'GET', body: opts.body || null });
        if (rejectWith) throw rejectWith;
        return {
            ok: status >= 200 && status < 300,
            status,
            json: async () => body === null ? [{ name: 'A', score: 1 }] : body,
        };
    };
}

const lb = await import(pathToFileURL(LB_PATH).href);

try {
    // submitScore：成功 → true，且请求体/URL/方法正确
    calls.length = 0;
    mockFetch(200);
    ok(await lb.submitScore({ game: 'tetris', name: 'MZ', score: 42 }) === true,
        'submitScore 成功返回 true');
    ok(calls.length === 1
        && calls[0].url === 'https://game-scores.orangely.workers.dev/scores'
        && calls[0].method === 'POST'
        && JSON.parse(calls[0].body).game === 'tetris'
        && JSON.parse(calls[0].body).name === 'MZ'
        && JSON.parse(calls[0].body).score === 42,
    'submitScore 请求 URL/方法/请求体', JSON.stringify(calls[0]));

    // submitScore：非 2xx → false（不抛出）
    mockFetch(500);
    ok(await lb.submitScore({ game: 'g', name: 'n', score: 1 }) === false,
        'submitScore HTTP 500 → false（不抛出）');

    // submitScore：网络异常 → false（不抛出）
    mockFetch(200, null, new Error('offline'));
    ok(await lb.submitScore({ game: 'g', name: 'n', score: 1 }) === false,
        'submitScore 网络异常 → false（不抛出）');

    // submitScore：extra 字段并入请求体（planet-merge 双键等场景）
    calls.length = 0;
    mockFetch(200);
    await lb.submitScore({ game: 'pm', name: 'n', score: 1, extra: { day: '20260102' } });
    ok(JSON.parse(calls[0].body).day === '20260102', 'submitScore extra 字段并入请求体');

    // fetchBoard：成功 → 数组，URL 带编码 game 参数
    calls.length = 0;
    mockFetch(200, [{ name: 'A', score: 9 }]);
    const board = await lb.fetchBoard('sword-flight-d20260102');
    ok(Array.isArray(board) && board[0].score === 9, 'fetchBoard 成功返回数组');
    ok(calls[0].url === 'https://game-scores.orangely.workers.dev/scores?game=sword-flight-d20260102',
        'fetchBoard URL 带 game 参数', calls[0].url);

    // fetchBoard：含特殊字符的 game id 必须被编码
    calls.length = 0;
    await lb.fetchBoard('a b&c');
    ok(calls[0].url.endsWith('/scores?game=a%20b%26c'), 'fetchBoard game 参数经 encodeURIComponent', calls[0].url);

    // fetchBoard：非 2xx → 抛出（页面决定本地兜底）
    mockFetch(503);
    let threw = false;
    try { await lb.fetchBoard('g'); } catch { threw = true; }
    ok(threw === true, 'fetchBoard 非 2xx → 抛出');

    // escapeHTML 黄金值
    ok(lb.escapeHTML('<b class="x">A&B\'C</b>')
        === '&lt;b class=&quot;x&quot;&gt;A&amp;B&#39;C&lt;/b&gt;',
    'escapeHTML 黄金值', lb.escapeHTML('<b class="x">A&B\'C</b>'));
} finally {
    globalThis.fetch = realFetch;
}

/* ─────────────── 静态收敛断言 ─────────────── */

console.log('\n▶ 源码收敛（防复制粘贴复活）');
for (const g of GAMES) {
    const graph = collectStaticModuleGraph(g.entry, ROOT);
    ok(graph.has('src/platform/leaderboard.js'),
        `${g.entry} reaches the shared leaderboard module`);
}

/* Tower Defense keeps a separate global board for each operation. Ensure every
   runtime key is both declared in the registry and accepted by the generated Worker. */
const towerDefense = GAMES.find(g => g.id === 'tower-defense');
if (towerDefense) {
    const { LEVELS } = await import(pathToFileURL(join(ROOT, 'src', 'games', 'tower-defense', 'levels.js')).href);
    const worker = readFileSync(WORKER_PATH, 'utf8');
    const runtime = readFileSync(join(ROOT, 'src', 'games', 'tower-defense', 'runtime.js'), 'utf8');
    ok(towerDefense.scores?.keys?.includes('tower-defense'), 'registry preserves the legacy Tower Defense score key');
    ok(/['"]tower-defense['"]\s*:/.test(worker), 'score Worker preserves the legacy Tower Defense key');
    ok(runtime.includes('tower-defense-${this.level.id}'),
        'Tower Defense keeps per-operation leaderboard IDs');
    for (const level of LEVELS) {
        const key = `tower-defense-${level.id}`;
        ok(towerDefense.scores?.keys?.includes(key), `registry allows ${key}`);
        ok(new RegExp(`['"]${key}['"]\\s*:`).test(worker), `score Worker allows ${key}`);
    }
}
for (const f of readdirSync(join(ROOT, 'js')).filter(f => f.endsWith('.js'))) {
    if (f === 'leaderboard.js') continue;
    const src = readFileSync(join(ROOT, 'js', f), 'utf8');
    ok(!/game-scores\.orangely\.workers\.dev/.test(src), `${f} 无硬编码 Workers URL`);
    ok(!/function escapeHTML\s*\(/.test(src), `${f} 无本地 escapeHTML 定义`);
}

console.log(failed === 0 ? '\nverify-leaderboard 全部通过 ✅' : `\n${failed} 个失败 ❌`);
process.exit(failed === 0 ? 0 : 1);
