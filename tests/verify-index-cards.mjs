#!/usr/bin/env node
// 首页卡片 / i18n / 图标资源全部由 registry 驱动；同时守住首页源码体积预算。
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
const home = registry.site().home;
const html = read('index.html');
const pageJs = read('js/index-page.js');
const zh = read('js/index-i18n-zh.js');
const sprite = read('public/icons/home-icons.svg');
const css = read('css/index.css');
const DOM_ALIAS = { 'tank-battle': 'tank', 'tower-defense': 'td', 'gravity-slingshot': 'gravity' };
const prefix = id => DOM_ALIAS[id] || id;

console.log('▶ registry 首页元数据');
ok(home && home.ui && Array.isArray(home.externalGames), 'site.home 配置存在');
for (const g of games) {
    ok(g.home?.desc?.en && g.home?.desc?.zh, `${g.id}: home.desc 双语齐全`);
    ok(g.home?.tag?.en && g.home?.tag?.zh, `${g.id}: home.tag 双语齐全`);
    ok(Boolean(g.home?.iconClass), `${g.id}: home.iconClass 存在`);
}

console.log('\n▶ index.html 由 registry 派生');
ok(html.includes('registry:begin home-cards') && html.includes('registry:end home-cards'), 'home-cards 生成区存在');
const expectedCards = games.length + home.externalGames.length;
ok((html.match(/class="game-card"/g) || []).length === expectedCards, '卡片数与 registry + 外链一致', (html.match(/class="game-card"/g) || []).length);
for (const g of games) {
    const p = prefix(g.id);
    ok(html.includes(`data-game-id="${g.id}"`), `${g.id}: 首页卡片存在`);
    ok(html.includes(`href="${g.href}" id="${p}-name"`), `${g.id}: 标题链接正确`);
    ok(html.includes(`id="${p}-desc"`), `${g.id}: 描述存在`);
    ok(html.includes(`id="${p}-tag"`), `${g.id}: 标签存在`);
    ok(html.includes(`href="${g.href}" id="${p}-play"`), `${g.id}: Play 链接正确`);
    ok(html.includes(`/icons/home-icons.svg#${g.id}`), `${g.id}: 使用外部 sprite`);
    ok(sprite.includes(`<symbol id="${g.id}"`), `${g.id}: sprite symbol 存在`);
    ok(new RegExp(`\\.card-icon--${g.home.iconClass}\\s*\\{`).test(css), `${g.id}: icon 配色类存在`);
    const shouldDark = !(g.caps || []).includes('theme-light');
    const cardStart = html.indexOf(`data-game-id="${g.id}"`);
    const cardEnd = html.indexOf('</article>', cardStart);
    const card = html.slice(cardStart, cardEnd);
    ok(card.includes('data-dark-only') === shouldDark, `${g.id}: 仅深色标记与 theme-light cap 一致`);
    for (const suffix of ['name', 'desc', 'tag']) ok(zh.includes(`['${g.id}.${suffix}',`), `${g.id}: 中文懒加载含 ${suffix}`);
}
for (const g of home.externalGames) {
    ok(html.includes(`data-game-id="${g.id}" data-external="1"`), `外链 ${g.id}: 卡片存在`);
    ok(html.includes(`href="${g.url}"`), `外链 ${g.id}: URL 正确`);
    ok(sprite.includes(`<symbol id="${g.id}"`), `外链 ${g.id}: sprite symbol 存在`);
    for (const suffix of ['name', 'desc', 'tag']) ok(zh.includes(`['${g.id}.${suffix}',`), `外链 ${g.id}: 中文懒加载含 ${suffix}`);
}
ok(sprite.includes('<symbol id="bookmark"'), '状态书签 sprite symbol 存在');

console.log('\n▶ 运行时代码去重');
ok(pageJs.includes("import('./index-i18n-zh.js')"), '中文使用动态 import');
ok(!pageJs.includes('const i18n ='), '不再内置双语大对象');
ok(!pageJs.includes('const games = ['), '不再内置 JSON-LD 游戏数组');
ok(!pageJs.includes('MORE_GAMES'), '首页不再加载 more-games 数据');
ok(pageJs.includes("querySelectorAll('.game-card[data-game-id]')"), 'JSON-LD 与 i18n 从生成卡片 DOM 派生');

console.log('\n▶ 首页源码体积预算');
const sizes = {
    'index.html': Buffer.byteLength(html),
    'js/index-page.js': Buffer.byteLength(pageJs),
    'js/index-i18n-zh.js': Buffer.byteLength(zh),
    'public/icons/home-icons.svg': Buffer.byteLength(sprite),
};
ok(sizes['index.html'] <= 38 * 1024, 'index.html ≤ 38 KiB', sizes['index.html']);
ok(sizes['js/index-page.js'] <= 12 * 1024, 'index-page.js ≤ 12 KiB', sizes['js/index-page.js']);
ok(sizes['js/index-i18n-zh.js'] <= 8 * 1024, '中文懒加载块 ≤ 8 KiB', sizes['js/index-i18n-zh.js']);
ok(sizes['public/icons/home-icons.svg'] <= 12 * 1024, '首页 SVG sprite ≤ 12 KiB', sizes['public/icons/home-icons.svg']);

console.log(failed === 0 ? '\n首页 registry / 资源体积检查全部通过 ✅' : `\n${failed} 处失败 ❌`);
process.exit(failed === 0 ? 0 : 1);
