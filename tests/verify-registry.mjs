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
//   2b) layout 字段（standard | immersive）合法，且与 HTML 骨架 / 入口 bindFrame 双向一致。
//
// 用法：node tests/verify-registry.mjs（无需浏览器/服务器）

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { registry } from './lib/registry.mjs';
import { collectStaticModuleGraph } from './lib/static-module-graph.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), 'utf8') : '');

let failed = 0;
const ok = (cond, label, extra) => {
    if (cond) { console.log(`✓ ${label}`); return; }
    failed++;
    console.error(`✗ ${label}${extra !== undefined ? ' —— ' + extra : ''}`);
};

const games = registry.all();
const graphFor = g => collectStaticModuleGraph(g.entry, ROOT);
ok(registry.config.$schema === './games.schema.json', 'registry 指向 ./games.schema.json', registry.config.$schema);
ok(existsSync(join(ROOT, 'games.schema.json')), 'games.schema.json 存在');

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

const DAILY_DATE_HELPERS = new Set(['todayKey', 'todayKeyDisplay', 'dailyKey', 'msUntilNextDay']);
const DAILY_MODULE = join(ROOT, 'src', 'platform', 'daily.js');

function importsDailyDateContract(graph) {
    for (const [modulePath, source] of graph) {
        const imports = /\bimport\s*\{([^}]+)\}\s*from\s*(['"])([^'"]+)\2/g;
        for (const match of source.matchAll(imports)) {
            const specifier = match[3];
            if (!specifier.startsWith('.')) continue;
            const target = resolve(dirname(join(ROOT, modulePath)), specifier);
            if (target !== DAILY_MODULE) continue;
            const bindings = match[1].split(',')
                .map(binding => binding.trim().split(/\s+as\s+/)[0].trim());
            if (bindings.some(binding => DAILY_DATE_HELPERS.has(binding))) return true;
        }
    }
    return false;
}

const seededRandomOnly = new Map([[
    'src/games/fixture/index.js',
    "import { mulberry32, hashStringFNV } from '../../platform/daily.js';",
]]);
const dateHelperImport = new Map([[
    'src/games/fixture/index.js',
    "import { todayKey as dateKey } from '../../platform/daily.js';",
]]);
ok(!importsDailyDateContract(seededRandomOnly),
    'seeded randomness alone does not imply a daily challenge');
ok(importsDailyDateContract(dateHelperImport),
    'UTC+8 date helpers imply daily-challenge support');

const PROBES = {
    // Follow each entry's local static-import graph: entries may be nested or may
    // delegate platform wiring to package modules (as Tower Defense now does).
    leaderboard: g => {
        const graph = graphFor(g);
        return graph.has('src/platform/leaderboard.js');
    },
    analytics: g => {
        const graph = graphFor(g);
        return graph.has('src/platform/analytics.js');
    },
    daily: g => importsDailyDateContract(graphFor(g)),
    drawer: g => /game-drawer-panel/.test(read(g.href)),
    sidebar: g => /game-sidebar/.test(read(g.href)),
    topbar: g => /game-topbar-center/.test(read(g.href)),
    'frame-budget': g => /--frame-shell-max/.test(read(`css/${g.id === 'gravity-slingshot' ? 'gravity' : g.id}.css`)),
    // 支持浅色 = 页面 CSS 真写了浅色覆盖（docs/contracts/theme.md §3）。
    // 不要求 import theme.js：只有画布颜色随主题变的页面才需要它（gomoku 的木棋盘两套主题一致）
    'theme-light': g => /\[data-theme="light"\]/.test(pageCss(g)),
};

for (const [cap, probe] of Object.entries(PROBES)) {
    const declared = new Set(registry.withCap(cap).map(g => g.id));
    const actual = new Set(games.filter(probe).map(g => g.id));
    const missing = [...actual].filter(id => !declared.has(id));   // 代码有、caps 没写
    const stale = [...declared].filter(id => !actual.has(id));     // caps 写了、代码没有
    ok(missing.length === 0, `cap "${cap}"：代码里有的都已声明`, '漏声明 → ' + missing.join(', '));
    ok(stale.length === 0, `cap "${cap}"：声明了的代码里都有`, '空声明 → ' + stale.join(', '));
}

/* ── 2b) layout 字段 ⟺ 页面骨架 ──
   layout 是互斥的布局类型（缺省 standard），不是 cap。取值必须合法，且与页面事实双向一致：
   声明 immersive ⟺ HTML 带 game-shell--immersive ⟺ HTML 带 game-stage--immersive ⟺ 入口 bindFrame({ layout: 'immersive' })（逐项双向）；
   immersive 页不得同时挂只对标准骨架有意义的 cap（sidebar / drawer / frame-budget）。 */
console.log('\n▶ layout ⟺ 页面骨架');
const LAYOUTS = ['standard', 'immersive'];
const STANDARD_ONLY_CAPS = ['sidebar', 'drawer', 'frame-budget'];
for (const g of games) {
    const layout = registry.layoutOf(g);
    ok(LAYOUTS.includes(layout), `${g.id}: layout "${layout}" 合法`, `允许 ${LAYOUTS.join(' / ')}`);
    const html = read(g.href);
    const isImmersive = layout === 'immersive';
    // 两个类分开判：只带其中一个的页面是残缺骨架，无论注册表怎么写都要红（PR #20 评审）
    const hasShell = /game-shell--immersive/.test(html);
    const hasStage = /game-stage--immersive/.test(html);
    ok(hasShell === hasStage, `${g.id}: game-shell--immersive 与 game-stage--immersive 成对出现`,
        `shell=${hasShell} stage=${hasStage}`);
    ok(hasShell === isImmersive, `${g.id}: layout=${layout} 与 HTML shell 骨架一致`,
        hasShell ? 'HTML 带 game-shell--immersive 但注册表没声明 immersive' : '注册表声明 immersive 但 HTML 缺 game-shell--immersive');
    ok(hasStage === isImmersive, `${g.id}: layout=${layout} 与 HTML stage 骨架一致`,
        hasStage ? 'HTML 带 game-stage--immersive 但注册表没声明 immersive' : '注册表声明 immersive 但 HTML 缺 game-stage--immersive');
    // bindFrame 的 immersive 模式同样双向：标准页误用它也要红（会漏测页脚、改 body 标记）
    const entrySrc = read(g.entry);
    const bindsImmersive = /bindFrame\(\{[^}]*layout:\s*'immersive'/.test(entrySrc)
        || /mountGameRuntime\([\s\S]*?frame:\s*\{[^}]*layout:\s*'immersive'/.test(entrySrc);
    ok(bindsImmersive === isImmersive, `${g.id}: frame runtime 与 layout=${layout} 一致`,
        bindsImmersive ? '标准页启用了 immersive frame' : 'immersive 页没有声明 immersive frame');
    if (isImmersive) {
        const bad = (g.caps || []).filter(c => STANDARD_ONLY_CAPS.includes(c));
        ok(bad.length === 0, `${g.id}: immersive 页不挂标准骨架专属 cap`, bad.join(', '));
    }
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
