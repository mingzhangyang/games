#!/usr/bin/env node
// verify-index-cards.mjs — 首页卡片登记点 ⟺ games.config.json 的一致性防线。
//
// 背景：games.config.json 自称「全站游戏元数据唯一真源」，gen-from-registry 也确实
// 派生了 vite 入口 / more-games / sitemap / manifest / Workers 白名单 / README ——
// 但 index.html 的卡片块**不在派生范围内**（它是手写的 16 段 <article>），
// 而 index-page.js 的 i18n 表与 JSON-LD ItemList 同样是手写的。
// 结果：lumen 与 circuit 上线后，more-games 页脚有它们、vite 有入口、
// 首页却看不见 —— 没有任何东西会报错，只是静默漏掉。
//
// 本脚本把「首页三处登记点」也纳入防线：
//   1) index.html 每个游戏有 <article class="game-card"> + 对应 id 前缀的四个元素
//      （-name / -desc / -tag / -play），href 指向该游戏的 href。
//   2) js/index-page.js 的 en / zh 两张 i18n 表都有该游戏的四条键。
//   3) js/index-page.js 的 injectStructuredData() ItemList 含该游戏
//      （站内游戏用 slug，外链游戏用 url）。
//
// 已知豁免（写死在此，防止"为了让它绿"而乱改产品）：
//   - 2D Minecraft / Dots and Boxes / The Stack 是**外链站外游戏**，
//     它们不在 games.config.json 里，只在 index.html 有卡片；本脚本不校验它们，
//     但会断言它们仍然存在（避免被误删后没人发现）。
//
// 用法：node scripts/verify-index-cards.mjs（无需浏览器/服务器）

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
const html = read('index.html');
const pageJs = read('js/index-page.js');

// 卡片 id 前缀：取 href 去扩展名（math-rain.html → math-rain），
// 与 index.html / index-page.js 既有约定一致（tetris/tank/gomoku/gravity 用的是
// 自己那套短前缀，下面用 ALIAS 兜住，不强行重命名既有 DOM id）。
const ALIAS = {
    'tank-battle': 'tank',
    'gomoku': 'gomoku',
    'tower-defense': 'td',
    'gravity-slingshot': 'gravity',
    'planet-merge': 'planet-merge',
    'word-daily': 'word-daily',
    'hoop-shot': 'hoop-shot',
    'needle-awn': 'needle-awn',
    'sword-flight': 'sword-flight',
};
const cardPrefix = g => ALIAS[g.id] || g.id;

// 图标配色类名是**另一套短名**（历史遗留，与 DOM id 前缀不同）：
//   math-rain→math、planet-merge→planet、minesweeper→mines、needle-awn→needle …
// 只有 lumen/circuit 等新页与 id 同名。
const ICON_ALIAS = {
    'math-rain': 'math',
    'planet-merge': 'planet',
    'word-daily': 'word',
    'hoop-shot': 'hoop',
    'minesweeper': 'mines',
    'needle-awn': 'needle',
    'sword-flight': 'sword',
    'tank-battle': 'tank',
    'tower-defense': 'td',
    'gravity-slingshot': 'gravity',
};
const iconClass = g => ICON_ALIAS[g.id] || g.id;

/* ── 0) 外链卡片仍在（防误删，不参与 registry 比对） ── */
console.log('▶ 站外卡片仍在');
for (const [label, needle] of [
    ['2D Minecraft', 'https://2d-minecraft.orangely.xyz'],
    ['Dots and Boxes', 'https://dots-and-boxes.orangely.xyz'],
    ['The Stack', 'https://steady-hand.orangely.xyz'],
]) {
    ok(html.includes(needle), `站外卡片 ${label} 仍存在`);
}

/* ── 1) index.html 卡片 ── */
console.log('\n▶ index.html 卡片');
for (const g of games) {
    const p = cardPrefix(g);
    const articleRe = new RegExp(
        `<article class="game-card" onclick="location\\.href='${g.href.replace(/\./g, '\\.')}'">`
    );
    const hasCard = articleRe.test(html)
        // 站外/派生卡片可能走别的 onclick 形式，退而求其次认 id
        || new RegExp(`id="${p}-name"`).test(html);
    ok(hasCard, `${g.id}: 首页有卡片`);

    for (const suffix of ['name', 'desc', 'tag', 'play']) {
        ok(new RegExp(`id="${p}-${suffix}"`).test(html), `${g.id}: 卡片含 #${p}-${suffix}`);
    }
    // play 链接必须指向本游戏页（外链游戏走绝对 URL，但其不在 registry 里）
    const playHref = new RegExp(`id="${p}-play"[^>]*>`).test(html)
        ? (html.match(new RegExp(`class="play-btn" href="([^"]+)" id="${p}-play"`)) || [])[1]
        : (html.match(new RegExp(`href="([^"]+)"[^>]*id="${p}-play"`)) || [])[1];
    ok(playHref === g.href, `${g.id}: play 链接指向 ${g.href}`, playHref);

    // 有自定义配色的卡片图标类也应存在（否则图标会掉成默认灰）
    ok(new RegExp(`\\.card-icon--${iconClass(g)}\\s*\\{`).test(read('css/index.css')),
        `${g.id}: css 有 .card-icon--${iconClass(g)} 配色`);
}

/* ── 2) i18n 键（en + zh 各四条） ── */
console.log('\n▶ js/index-page.js i18n');
const camel = s => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
for (const g of games) {
    const base = camel(g.id);
    const keyBase = /^tank-battle/.test(g.id) ? 'tank'
        : /^tower-defense/.test(g.id) ? 'td'
            : /^gravity-slingshot/.test(g.id) ? 'gravity'
                : base;
    for (const suffix of ['Name', 'Desc', 'Tag', 'Play']) {
        const key = keyBase + suffix;
        // 该键必须在 en 与 zh 两张表里各出现一次（en 段在前、zh 段在后）
        const occurrences = [...pageJs.matchAll(new RegExp(`^\\s{8}${key}:`, 'gm'))].length;
        ok(occurrences === 2, `${g.id}: i18n 键 ${key} 在 en/zh 各一条`, `实到 ${occurrences}`);
        // applyLanguage 里必须有赋值点，否则键写了也不生效
        ok(new RegExp(`getElementById\\('${cardPrefix(g)}-${suffix.toLowerCase()}'\\).textContent = t\\.${key}`).test(pageJs),
            `${g.id}: applyLanguage 赋值 #${cardPrefix(g)}-${suffix.toLowerCase()}`);
    }
}

/* ── 3) JSON-LD ItemList ── */
console.log('\n▶ js/index-page.js ItemList');
const listBlock = (pageJs.match(/const games = \[[\s\S]*?\n    \];/) || [''])[0];
ok(listBlock.length > 0, 'ItemList 数组可定位');
for (const g of games) {
    const isExternal = /^https?:\/\//.test(g.href);
    const needle = isExternal ? `{ url: '${g.href}'` : `{ slug: '${g.id}'`;
    ok(listBlock.includes(needle), `${g.id}: ItemList 含 ${needle}…`);
}
// 位置序号必须与 ItemList 顺序自洽（position = i+1 由 map 生成，这里只查数组非空项）
ok((listBlock.match(/\{ (slug|url):/g) || []).length >= games.length + 3,
    'ItemList 条目数 ≥ registry 游戏数 + 3 个站外游戏',
    `实到 ${(listBlock.match(/\{ (slug|url):/g) || []).length}`);

console.log(failed === 0 ? '\n首页卡片登记点全部同步 ✅' : `\n${failed} 处未同步 ❌`);
process.exit(failed === 0 ? 0 : 1);
