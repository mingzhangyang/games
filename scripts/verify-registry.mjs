#!/usr/bin/env node
// verify-registry.mjs — games.config.json 与真实代码的一致性防线。
//
// 背景：caps 被 docs / CLAUDE.md 定义为「校验器与迁移脚本的唯一判据」，
// 但它此前没有任何东西校验。验收时实测到两处漂移：tetris 明明 import 了
// leaderboard.js 却没有 leaderboard cap，word-daily 明明在 track() 却没有
// analytics cap。两处当时都碰巧无害（gen 走的是 scores 字段而非 caps），
// 但只要哪天有校验器改用 withCap('leaderboard')，就会静默漏掉一整页 ——
// 正是 games-analytics 白名单漏掉 sword-flight 的同一类事故。
//
// 断言：
//   1) 结构：id / prefix / href 唯一，href 与 entry 在磁盘上真实存在。
//   2) caps ⟺ 代码事实（双向）：声明了必须真有，真有了必须声明。
//   3) scores 块 ⟺ leaderboard cap（两者必须同进同出）。
//   4) themeColorLight ⟺ theme-light cap（同上）。
//
// 用法：node scripts/verify-registry.mjs（无需浏览器/服务器）

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { registry } from './lib/registry.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), 'utf8') : '');

let failed = 0;
const ok = (cond, label, extra) => {
    if (cond) { console.log(`✓ ${label}`); return; }
    failed++;
    console.error(`✗ ${label}${extra !== undefined ? ' —— ' + extra : ''}`);
};

const games = registry.all();

/* ── 1) 结构 ── */
console.log('▶ 结构');
for (const field of ['id', 'prefix', 'href']) {
    const vals = games.map(g => g[field]);
    const dup = vals.filter((v, i) => vals.indexOf(v) !== i);
    ok(dup.length === 0, `${field} 全局唯一`, dup.join(', '));
}
for (const g of games) {
    ok(existsSync(join(ROOT, g.href)), `${g.id}: href ${g.href} 存在`);
    ok(existsSync(join(ROOT, g.entry)), `${g.id}: entry ${g.entry} 存在`);
}

/* ── 2) caps ⟺ 代码事实 ──
   每条探针回答「这一页在代码里到底有没有这个能力」，与 caps 双向比对。
   math-rain / tank-battle 不在骨架契约内，topbar/sidebar 类探针对它们天然为 false，
   而它们也确实没声明这些 cap，因此无需特例。 */
console.log('\n▶ caps ⟺ 代码事实');
// 页面自己的样式表（排除共享层），供需要看页面 CSS 的探针用 —— 从 HTML 的 <link> 现读，
// 不硬编码文件名（gravity-slingshot → gravity.css、math-rain → css/math-rain/ 这类例外自然覆盖）
const SHARED_CSS = /(^|\/)(tokens|layout|more-games|science-showcase)\.css$/;
const pageCss = g => [...read(g.href).matchAll(/<link rel="stylesheet" href="([^"]+\.css)"/g)]
    .map(m => m[1]).filter(h => !SHARED_CSS.test(h)).map(read).join('\n');

const PROBES = {
    // ⚠ 入口不都在 js/ 顶层：math-rain 是 js/math-rain/main.js，import 写成 '../analytics.js'。
    //   只认 './' 会把它误判成「声明了却没有」。
    leaderboard: g => /from '\.{1,2}\/leaderboard\.js'/.test(read(g.entry)),
    analytics: g => /from '\.{1,2}\/analytics\.js'/.test(read(g.entry)),
    daily: g => /from '\.{1,2}\/daily\.js'/.test(read(g.entry)),
    drawer: g => /game-drawer-panel/.test(read(g.href)),
    sidebar: g => /game-sidebar/.test(read(g.href)),
    topbar: g => /game-topbar-center/.test(read(g.href)),
    'frame-budget': g => /--frame-shell-max/.test(read(`css/${g.id === 'gravity-slingshot' ? 'gravity' : g.id}.css`)),
    // 支持浅色 = 运行时读主题（import theme.js）且页面 CSS 真写了浅色覆盖（docs/contracts/theme.md §3）
    'theme-light': g => /from '\.{1,2}\/theme\.js'/.test(read(g.entry))
        && /\[data-theme="light"\]/.test(pageCss(g)),
};

for (const [cap, probe] of Object.entries(PROBES)) {
    const declared = new Set(registry.withCap(cap).map(g => g.id));
    const actual = new Set(games.filter(probe).map(g => g.id));
    const missing = [...actual].filter(id => !declared.has(id));   // 代码有、caps 没写
    const stale = [...declared].filter(id => !actual.has(id));     // caps 写了、代码没有
    ok(missing.length === 0, `cap "${cap}"：代码里有的都已声明`, '漏声明 → ' + missing.join(', '));
    ok(stale.length === 0, `cap "${cap}"：声明了的代码里都有`, '空声明 → ' + stale.join(', '));
}

/* ── 3) scores ⟺ leaderboard cap ── */
console.log('\n▶ scores 块与 leaderboard cap 同进同出');
for (const g of games) {
    const hasScores = !!g.scores;
    const hasCap = (g.caps || []).includes('leaderboard');
    ok(hasScores === hasCap, `${g.id}: scores=${hasScores} / cap=${hasCap}`);
}

/* ── 4) themeColorLight ⟺ theme-light cap ── */
console.log('\n▶ themeColorLight 与 theme-light cap 同进同出');
for (const g of games) {
    const hasField = typeof g.themeColorLight === 'string' && /^#[0-9a-f]{6}$/i.test(g.themeColorLight);
    const hasCap = (g.caps || []).includes('theme-light');
    ok(hasField === hasCap, `${g.id}: themeColorLight=${hasField} / cap=${hasCap}`);
}

console.log(failed === 0 ? '\nverify-registry 全部通过 ✅' : `\n${failed} 个失败 ❌`);
process.exit(failed === 0 ? 0 : 1);
