#!/usr/bin/env node
// 首页卡片 / i18n / 图标资源全部由 registry 驱动；同时守住首页源码体积预算。
import { readFileSync, existsSync, readdirSync } from 'node:fs';
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
// 首页实现在 src/home/（组合根 index.js），js/index-page.js 只是注入中文加载器的入口
const HOME_DIR = 'src/home';
const homeFiles = existsSync(join(ROOT, HOME_DIR)) ? readdirSync(join(ROOT, HOME_DIR)).filter(f => f.endsWith('.js')).sort() : [];
const homeJs = homeFiles.map(f => read(`${HOME_DIR}/${f}`)).join('\n');
const zh = read('js/index-i18n-zh.js');
const sprite = read('public/icons/home-icons.svg');
const css = read('css/index.css');
const DOM_ALIAS = { 'tank-battle': 'tank', 'tower-defense': 'td', 'gravity-slingshot': 'gravity' };
const prefix = id => DOM_ALIAS[id] || id;
const schema = JSON.parse(read('games.schema.json'));
const cats = home.categories || [];
const catKeys = cats.map(c => c.key);
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);

console.log('▶ registry 首页元数据');
ok(home && home.ui && Array.isArray(home.externalGames), 'site.home 配置存在');
// 分类（docs/proposal-home-layout.md P2）：site.home 不受 schema 约束，categories 与
// externalGames[].category 的合法性只能在这里守住，拼错会让卡片掉出分区。
ok(cats.length > 0 && new Set(catKeys).size === catKeys.length, 'site.home.categories 非空且 key 唯一', catKeys.join(','));
for (const c of cats) ok(c.icon && c.name?.en && c.name?.zh, `分类 ${c.key}: icon + 双语名称齐全`);
ok(JSON.stringify(schema.$defs.home.properties.category.enum) === JSON.stringify(catKeys),
    'schema $defs.home.category 枚举 = site.home.categories[].key（同序）', JSON.stringify(schema.$defs.home.properties.category.enum));
ok(!('badge' in schema.$defs.home.properties), 'schema 已删除 home.badge');
const homeOf = [...games.map(g => [g.id, g.home]), ...home.externalGames.map(g => [g.id, g])];
for (const [id, h] of homeOf) {
    ok(catKeys.includes(h.category), `${id}: category ∈ categories[].key`, h.category);
    ok(!('badge' in h), `${id}: 不再手填 home.badge（daily 由 cap、new 由 addedAt 派生）`);
    if ('addedAt' in h) ok(isDate(h.addedAt), `${id}: addedAt 是合法 YYYY-MM-DD`, h.addedAt);
    if ('rank' in h) ok(Number.isFinite(h.rank), `${id}: rank 是数字`, h.rank);
}
for (const key of catKeys) ok(homeOf.some(([, h]) => h.category === key), `分类 ${key}: 至少一款游戏（无空分区）`);
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
    ok(html.includes(`<a class="game-card" href="${g.href}" data-game-id="${g.id}"`), `${g.id}: 整卡链接正确`);
    ok(html.includes(`id="${p}-name"`), `${g.id}: 标题存在`);
    ok(html.includes(`id="${p}-desc"`), `${g.id}: 描述存在`);
    ok(html.includes(`id="${p}-tag"`), `${g.id}: 标签存在`);
    ok(html.includes(`/icons/home-icons.svg#${g.id}`), `${g.id}: 使用外部 sprite`);
    ok(sprite.includes(`<symbol id="${g.id}"`), `${g.id}: sprite symbol 存在`);
    ok(new RegExp(`\\.card-icon--${g.home.iconClass}\\s*\\{`).test(css), `${g.id}: icon 配色类存在`);
    const shouldDark = !(g.caps || []).includes('theme-light');
    // 从分区卡片切（新上线横排里的 .new-card 也带 data-game-id，且排在前面）
    const cardStart = html.indexOf(`<a class="game-card" href="${g.href}" data-game-id="${g.id}"`);
    const cardEnd = html.indexOf('</a>', cardStart);
    const card = html.slice(cardStart, cardEnd);
    ok(card.includes('data-dark-only') === shouldDark, `${g.id}: 仅深色标记与 theme-light cap 一致`);
    const daily = (g.caps || []).includes('daily');
    const chips = card.match(/class="card-chip card-chip--[a-z]+"/g) || [];
    ok(daily ? chips.length === 1 && card.includes('card-chip--daily"') : chips.length === 0,
        `${g.id}: 静态胶囊只有「每日」且 ⟺ caps 含 daily`, chips.join(','));
    // 「新」随日期变化，不能进 gen 产物：只写 data-added，由 src/home/freshness.js 运行时判定
    ok(g.home.addedAt ? card.includes(` data-added="${g.home.addedAt}"`) : !card.includes('data-added'),
        `${g.id}: data-added ⟺ home.addedAt`);
    ok(card.includes(`aria-describedby="${p}-desc"`) && card.includes(`aria-labelledby="${p}-name${daily ? ` ${p}-chip-daily` : ''}"`),
        `${g.id}: 整卡可访问名 = 标题 + 胶囊，描述 = 简介`);
    ok(card.includes('class="card-go" aria-hidden="true"'), `${g.id}: 卡片箭头存在且对读屏隐藏`);
    // 胶囊在简介行首、标题独占标题行：三枚胶囊同卡时被截断的只能是简介（PR #147 review）
    ok(card.includes(`<span class="card-header"><span class="card-title" id="${p}-name">${g.name.en.replace(/&/g, '&amp;')}</span></span>`),
        `${g.id}: 标题行只有标题`);
    ok(/<span class="card-desc"><span class="card-chips">(?:<span class="card-chip [^"]+" id="[^"]+">[^<]*<\/span>)*<\/span><span class="card-desc-text" id="/.test(card)
        && card.includes(`<span class="card-desc-text" id="${p}-desc">`), `${g.id}: 胶囊组在简介行首，aria-describedby 指向简介正文`);
    for (const suffix of ['name', 'desc', 'tag']) ok(zh.includes(`['${g.id}.${suffix}',`), `${g.id}: 中文懒加载含 ${suffix}`);
}
for (const g of home.externalGames) {
    ok(html.includes(`data-game-id="${g.id}" data-external="1"`), `外链 ${g.id}: 卡片存在`);
    ok(html.includes(`<a class="game-card" href="${g.url}" data-game-id="${g.id}"`), `外链 ${g.id}: 整卡 URL 正确`);
    ok(html.includes(`id="${g.id}-chip-external"`), `外链 ${g.id}: 站外胶囊存在`);
    ok(sprite.includes(`<symbol id="${g.id}"`), `外链 ${g.id}: sprite symbol 存在`);
    for (const suffix of ['name', 'desc', 'tag']) ok(zh.includes(`['${g.id}.${suffix}',`), `外链 ${g.id}: 中文懒加载含 ${suffix}`);
}
const region = html.slice(html.indexOf('registry:begin home-cards'), html.indexOf('registry:end home-cards'));

console.log('\n▶ 分区与筛选条');
const sections = [...region.matchAll(/<section class="games-cat" data-cat="([a-z]+)"[^>]*>([\s\S]*?)<\/section>/g)]
    .map(m => ({ key: m[1], body: m[2], ids: [...m[2].matchAll(/data-game-id="([^"]+)"/g)].map(x => x[1]) }));
ok(JSON.stringify(sections.map(s => s.key)) === JSON.stringify(catKeys), '分区按 categories 顺序输出、一个不少', sections.map(s => s.key).join(','));
const order = new Map(homeOf.map(([id], i) => [id, i]));
const rankOf = id => (Number.isFinite(homeOf[order.get(id)][1].rank) ? homeOf[order.get(id)][1].rank : Infinity);
for (const sec of sections) {
    const want = homeOf.filter(([, h]) => h.category === sec.key).map(([id]) => id)
        .sort((a, b) => (rankOf(a) - rankOf(b)) || (order.get(a) - order.get(b)));
    ok(JSON.stringify(sec.ids) === JSON.stringify(want), `分区 ${sec.key}: 成员与顺序 = category + rank（缺省登记顺序）`, sec.ids.join(','));
    ok(sec.body.includes(`id="cat-${sec.key}-title"`) && sec.body.includes(`data-i18n="cat.${sec.key}"`)
        && sec.body.includes(`<span class="games-cat-count">${want.length}</span>`), `分区 ${sec.key}: 标题 / i18n 键 / 数量`);
    ok((sec.body.match(/class="games-grid"/g) || []).length === 1, `分区 ${sec.key}: 自带一个 .games-grid`);
}
const filter = html.slice(html.indexOf('registry:begin home-filter'), html.indexOf('registry:end home-filter'));
ok(filter.includes('id="games-filter"') && /id="games-filter"[^>]*\shidden>/.test(filter), '筛选条由 gen 输出且静态 hidden（渐进增强）');
ok(html.includes('<div class="games-cats" id="games-cats">'), '分区容器 #games-cats 存在（筛选按钮 aria-controls 目标）');
const filters = [...filter.matchAll(/data-filter="([a-z]+)" aria-pressed="(true|false)" aria-controls="games-cats" data-i18n="([^"]+)"/g)];
const wantFilters = ['all', 'daily', ...cats.filter(c => c.filter !== false).map(c => c.key)];
ok(JSON.stringify(filters.map(m => m[1])) === JSON.stringify(wantFilters), '筛选按钮 = 全部 · 每日 · 可筛选分类', filters.map(m => m[1]).join(','));
ok(filters.filter(m => m[2] === 'true').map(m => m[1]).join() === 'all', '默认只有「全部」aria-pressed=true');
for (const c of cats) ok(zh.includes(`['cat.${c.key}',`), `中文懒加载含分类名 cat.${c.key}`);
for (const key of ['filterLabel', 'filterAll', 'filterDaily']) ok(zh.includes(`['${key}',`), `中文懒加载含筛选文案 ${key}`);
ok(!/<article|onclick=|card-badge|play-btn/.test(region), '卡片区不再有 article+onclick、书签图标或 Play 按钮');
ok(!/<a class="game-card"[^>]*>(?:(?!<\/a>).)*<a\b/s.test(region), '卡片内部不再嵌套链接（每卡只有一个 Tab 停靠点）');
ok(!sprite.includes('<symbol id="bookmark"'), '已删除不再使用的书签 sprite symbol');
for (const key of ['badgeDaily', 'badgeNew', 'badgeExternal']) ok(zh.includes(`['${key}',`), `中文懒加载含胶囊文案 ${key}`);

console.log('\n▶ P3：新上线横排 / OG 图 / 最近玩过 / 更多每日 / Perks');
// OG 图单一来源 public/<ogImageDir>/（原样复制进 dist）：og:image 与新上线横排都指向它，缺一张就是生产 404
const ogDir = registry.site().ogImageDir;
for (const id of [...games.map(g => g.id), 'collection']) {
    ok(existsSync(join(ROOT, 'public', ogDir, `og-${id}.svg`)), `public/${ogDir}/og-${id}.svg 存在（不 404）`);
}
ok(!existsSync(join(ROOT, ogDir)), `根目录 ${ogDir}/ 已删除（OG 图只在 public/ 一处，不再双份漂移）`);
const newRegion = html.slice(html.indexOf('registry:begin home-new'), html.indexOf('registry:end home-new'));
ok(newRegion.includes('id="home-new"') && /id="home-new"[^>]*\shidden>/.test(newRegion), '新上线横排由 gen 输出且静态 hidden（运行时按 45 天显现）');
const wantNew = games.filter(g => g.home.addedAt)
    .sort((a, b) => (a.home.addedAt < b.home.addedAt ? 1 : a.home.addedAt > b.home.addedAt ? -1 : 0)).map(g => g.id);
const gotNew = [...newRegion.matchAll(/<a class="new-card" href="[^"]+" data-game-id="([^"]+)" data-added="([^"]+)">/g)].map(m => m[1]);
ok(JSON.stringify(gotNew) === JSON.stringify(wantNew), '新上线 = 全部带 addedAt 的游戏，新者在前', gotNew.join(','));
for (const id of wantNew) {
    const g = games.find(x => x.id === id);
    const start = newRegion.indexOf(`data-game-id="${id}"`);
    const card = newRegion.slice(start, newRegion.indexOf('</a>', start));
    const img = `<img class="new-game-art" src="/${ogDir}/og-${id}.svg" alt="" width="1200" height="630" loading="lazy" decoding="async">`;
    ok(card.includes(img) === existsSync(join(ROOT, 'public', ogDir, `og-${id}.svg`)), `新上线 ${id}: <img> 为字面 URL，且有图 ⟺ 文件存在`);
    ok(card.includes(`data-i18n="${id}.name">`) && card.includes(`data-i18n="${id}.tag">`) && card.includes(`card-icon--${g.home.iconClass}`),
        `新上线 ${id}: 名称 / 副标签走 i18n，图标配色复用 card-icon--*`);
}
ok(!/\sstyle=/.test(newRegion), '新上线横排没有内联 style（图片铺放由 home-cards.css 负责）');
ok(!/og-\$\{|og-' \+/.test(pageJs + homeJs), '首页运行时不拼 OG 图路径');
ok(html.includes('id="home-recent"') && html.includes('id="home-recent-list"'), '最近玩过容器存在');
ok(/<a class="hub-more-daily" id="hub-more-daily" href="#cat=daily" hidden>/.test(html), 'Daily Hub「更多每日」链接 → #cat=daily，静态 hidden');
ok(!html.includes('class="perks"') && !html.includes('class="hero-logo"'), 'Perks 三卡与 hero 大 emoji 已移除（D-6）');
ok(html.includes('class="perks-line"') && html.includes('data-i18n="perksLine"'), 'Perks 压成页脚一行');
for (const key of ['recentTitle', 'newTitle', 'moreDaily', 'perksLine']) ok(zh.includes(`['${key}',`), `中文懒加载含 ${key}`);
ok(!/\['perk\d(Title|Body)',/.test(zh), '已删除旧 Perks 文案');

console.log('\n▶ 运行时代码去重');
ok(pageJs.includes("import('./index-i18n-zh.js')"), '中文使用动态 import（入口注入加载器）');
ok(pageJs.includes("from '../src/home/index.js'") && !/document\.|querySelector|localStorage/.test(pageJs), 'js/index-page.js 只是入口：不碰 DOM / 存储');
ok(homeFiles.includes('index.js') && homeJs.includes('export function startHome'), 'src/home/index.js 是组合根');
ok(!homeJs.includes('const i18n ='), '不再内置双语大对象');
ok(!homeJs.includes('const games = ['), '不再内置 JSON-LD 游戏数组');
ok(!homeJs.includes('MORE_GAMES'), '首页不再加载 more-games 数据');
ok(homeJs.includes("querySelectorAll('.game-card[data-game-id]')"), 'JSON-LD 与 i18n 从生成卡片 DOM 派生');
ok(!/\blocalStorage\b/.test(homeJs), 'src/home 只经 safe-storage 读写存储');
ok(!/getTimezoneOffset|8 \* 3600/.test(homeJs), 'src/home 的 UTC+8 日期只来自 platform/daily.js');
ok(homeFiles.filter(f => /\bonReady\(/.test(read(`${HOME_DIR}/${f}`))).join() === 'index.js', '只有组合根接 onReady');

console.log('\n▶ 首页源码体积预算');
const sizes = {
    'index.html': Buffer.byteLength(html),
    'js/index-page.js': Buffer.byteLength(pageJs),
    [`${HOME_DIR}/*.js`]: Buffer.byteLength(homeJs),
    'js/index-i18n-zh.js': Buffer.byteLength(zh),
    'public/icons/home-icons.svg': Buffer.byteLength(sprite),
};
// P3 加了新上线横排（每卡一张 OG 图 + sprite 图标），预算从 38 KiB 放到 44 KiB
ok(sizes['index.html'] <= 44 * 1024, 'index.html ≤ 44 KiB', sizes['index.html']);
// P3 拆成 src/home/ 包：入口只剩注入；整包预算 = 原单文件 14 KiB + P3（最近玩过 / 更多每日 / 新上线裁剪），
// 单模块再各自封顶，防止又长回一个大文件
ok(sizes['js/index-page.js'] <= 1024, 'js/index-page.js 入口 ≤ 1 KiB', sizes['js/index-page.js']);
ok(sizes[`${HOME_DIR}/*.js`] <= 24 * 1024, 'src/home 整包 ≤ 24 KiB', sizes[`${HOME_DIR}/*.js`]);
for (const f of homeFiles) {
    const n = Buffer.byteLength(read(`${HOME_DIR}/${f}`));
    ok(n <= 5 * 1024, `${HOME_DIR}/${f} ≤ 5 KiB`, n);
}
ok(sizes['js/index-i18n-zh.js'] <= 8 * 1024, '中文懒加载块 ≤ 8 KiB', sizes['js/index-i18n-zh.js']);
ok(sizes['public/icons/home-icons.svg'] <= 12 * 1024, '首页 SVG sprite ≤ 12 KiB', sizes['public/icons/home-icons.svg']);

console.log(failed === 0 ? '\n首页 registry / 资源体积检查全部通过 ✅' : `\n${failed} 处失败 ❌`);
process.exit(failed === 0 ? 0 : 1);
