// 由 games.config.json 派生全部登记点（就地改写，产物入库，非构建期注入）。
//
//   npm run gen             就地生成 / 更新所有 registry 区域
//   npm run gen -- --check  只比对不写盘，漂移即退出码 1（接进 verify）
//
// 区域格式（幂等，可反复跑）：
//   <!-- registry:begin <name> --> …generated… <!-- registry:end <name> -->   (HTML/XML)
//   // registry:begin <name>      …generated… // registry:end <name>          (JS / README 例外用 HTML 注释)
//
// 自安装：源文件尚无哨兵时，gen 会定位旧行内 SEO 块 / 旧 meta 段并整体替换为哨兵区域；
// 已有哨兵时只重写区域内部，区域外字节零触碰。
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { registry } from '../lib/registry.mjs';
import { renderTopbar } from '../../src/platform/shell/render-topbar.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHECK = process.argv.includes('--check');
const GAMES = registry.all();
const SITE = registry.site();
const ORIGIN = SITE.origin;

let drift = 0, written = 0, clean = 0;

function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
/** 嵌进 JS 字符串字面量的 JSON 值：JSON 转义后再把 </ 收掉，防 </script> 提前闭合 */
function jstr(s) {
    return JSON.stringify(s).replace(/<\//g, '<\\/');
}

/** 在 src 中应用一个命名区域；无哨兵时用 installer 定位旧内容替换为哨兵区域。
 *  style: 'html' → 哨兵形如 <!-- registry:begin x -->；'js' → // registry:begin x */
function applyRegion(src, name, content, installer, style = 'js') {
    const cOpen = style === 'html' ? '<!-- ' : '// ';
    const cClose = style === 'html' ? ' -->' : '';
    const beginTag = `registry:begin ${name}`;
    const endTag = `registry:end ${name}`;
    const bi = src.indexOf(beginTag);
    if (bi >= 0) {
        const ei = src.indexOf(endTag, bi);
        if (ei < 0) throw new Error(`region ${name}: 有 begin 无 end（文件损坏，手工修复）`);
        const beginLineStart = src.lastIndexOf('\n', bi) + 1;
        const indent = (src.slice(beginLineStart, bi).match(/^[ \t]*/) || [''])[0];
        let after = src.slice(ei + endTag.length);
        // 剔除注释闭合符（兼容历史损伤），end 哨兵后必须紧跟换行
        after = after.replace(/^[ \t]*-->/, '');
        if (!after.startsWith('\n')) {
            const nl = after.indexOf('\n');
            if (nl < 0) throw new Error(`region ${name}: end 哨兵后无换行`);
            after = after.slice(nl);
        }
        const rebuilt = src.slice(0, beginLineStart) + indent + cOpen + beginTag + cClose + '\n'
            + content.trimEnd() + '\n' + indent + cOpen + endTag + cClose + after;
        return rebuilt === src ? { src, state: 'clean' } : { src: rebuilt, state: 'written' };
    }
    if (!installer) return { src, state: 'absent' };
    const installed = installer(src, content);
    if (installed === null) return { src, state: 'absent' };
    return { src: installed, state: 'written' };
}

// ---------- 首页卡片 + 懒加载中文 ----------
const HOME_DOM_ALIAS = { 'tank-battle': 'tank', 'tower-defense': 'td', 'gravity-slingshot': 'gravity' };
const homeDomPrefix = id => HOME_DOM_ALIAS[id] || id;
const jsq = s => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r/g, '\\r').replace(/\n/g, '\\n')}'`;

function homeCardLine(g, external = false) {
    const id = g.id;
    const href = external ? g.url : g.href;
    const name = external ? g.name : g.name;
    const home = external ? g : g.home;
    const prefix = external ? id : homeDomPrefix(id);
    const darkOnly = !external && !(g.caps || []).includes('theme-light');
    const ui = SITE.home.ui;
    // 整卡一个 <a>：唯一 Tab 停靠点，可中键 / 新标签打开。状态与外站标识是可见文字胶囊，
    // 不再是只靠颜色区分、靠 hover 才出文案的图标（docs/proposal-home-layout.md §4.3）。
    // 胶囊排在简介行首（.card-chips 在 .card-desc 里，简介正文在 .card-desc-text）：标题独占一行，
    // 三枚胶囊同卡时被行数截断的是简介而不是标题（PR #147 review）。
    // 胶囊全部派生，不再手填（§3.3）：「每日」= daily cap；「新」依赖今天的日期，只把 addedAt
    // 写成 data-added，由 src/home/freshness.js 运行时判定——放在 gen 里会让 gen --check 随日期变红。
    const chips = [];
    if (!external && (g.caps || []).includes('daily')) chips.push({ kind: 'daily', text: ui.badgeDaily.en });
    if (external) chips.push({ kind: 'external', text: ui.badgeExternal.en });
    const chipHtml = chips.map(c => `<span class="card-chip card-chip--${c.kind}" id="${prefix}-chip-${c.kind}">${esc(c.text)}</span>`).join('');
    const labelledBy = [`${prefix}-name`, ...chips.map(c => `${prefix}-chip-${c.kind}`)].join(' ');
    const added = home.addedAt ? ` data-added="${home.addedAt}"` : '';
    return `<a class="game-card" href="${esc(href)}" data-game-id="${id}"${external ? ' data-external="1"' : ''}${darkOnly ? ' data-dark-only="1"' : ''}${added} aria-labelledby="${labelledBy}" aria-describedby="${prefix}-desc"><span class="card-body"><span class="card-icon card-icon--${home.iconClass}"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="/icons/home-icons.svg#${id}"></use></svg></span><span class="card-header"><span class="card-title" id="${prefix}-name">${esc(name.en)}</span></span><span class="card-desc"><span class="card-chips">${chipHtml}</span><span class="card-desc-text" id="${prefix}-desc">${esc(home.desc.en)}</span></span><span class="card-footer"><span class="tag" id="${prefix}-tag">${esc(home.tag.en)}</span></span><span class="card-go" aria-hidden="true">›</span></span></a>`;
}

/** 按 site.home.categories 分组：区内按 rank 升序，缺 rank 的排在后面并保持登记顺序（站内先、外站后）。 */
function homeCategoryGroups() {
    const entries = [
        ...GAMES.map(g => ({ g, external: false, home: g.home })),
        ...(SITE.home.externalGames || []).map(g => ({ g, external: true, home: g })),
    ].map((e, order) => ({ ...e, order }));
    const rank = e => (typeof e.home.rank === 'number' ? e.home.rank : Infinity);
    return SITE.home.categories.map(cat => ({
        cat,
        entries: entries.filter(e => e.home.category === cat.key)
            .sort((a, b) => (rank(a) - rank(b)) || (a.order - b.order)),
    }));
}

function homeCardsContent() {
    // 分区由 gen 静态输出：无 JS 时完整可用，JSON-LD 仍从卡片 DOM 派生（§4.2）。
    return homeCategoryGroups().filter(({ entries }) => entries.length).map(({ cat, entries }) => [
        `<section class="games-cat" data-cat="${cat.key}" aria-labelledby="cat-${cat.key}-title">`,
        `<h2 class="games-cat-title" id="cat-${cat.key}-title"><span class="games-cat-icon" aria-hidden="true">${esc(cat.icon)}</span><span class="games-cat-name" data-i18n="cat.${cat.key}">${esc(cat.name.en)}</span><span class="games-cat-count">${entries.length}</span></h2>`,
        '<div class="games-grid">',
        ...entries.map(e => homeCardLine(e.g, e.external)),
        '</div>',
        '</section>',
    ].join('\n')).join('\n');
}

function homeCardsTransform(src) {
    return applyRegion(src, 'home-cards', homeCardsContent(), null, 'html');
}

/** 筛选条：渐进增强，静态 hidden，由 src/home/filter.js 绑定后显现；状态只存 location.hash（§4.2）。 */
function homeFilterContent() {
    const ui = SITE.home.ui;
    const btn = (filter, key, text, pressed = false) =>
        `<button type="button" class="filter-btn" data-filter="${filter}" aria-pressed="${pressed}" aria-controls="games-cats" data-i18n="${key}">${esc(text)}</button>`;
    return [
        `<div class="games-filter" id="games-filter" role="group" aria-label="${esc(ui.filterLabel.en)}" data-i18n-label="filterLabel" hidden>`,
        btn('all', 'filterAll', ui.filterAll.en, true),
        btn('daily', 'filterDaily', ui.filterDaily.en),
        ...SITE.home.categories.filter(c => c.filter !== false).map(c => btn(c.key, `cat.${c.key}`, c.name.en)),
        '</div>',
    ].join('\n');
}

function homeFilterTransform(src) {
    return applyRegion(src, 'home-filter', homeFilterContent(), null, 'html');
}

/** 新上线横排（proposal §4.4）：写出全部带 addedAt 的游戏（新者在前），45 天窗口由 src/home/new-row.js
 *  运行时裁剪——放在 gen 里会让 gen --check 随日期变红。图片必须是构建可见的字面 URL，只用会原样复制进
 *  dist 的 public/：优先用游戏自己美术做的封面 public/assets/home-covers/<id>.webp（由
 *  tools/generators/game-covers.mjs 生成），没有才退回 OG 图，都没有就不输出 <img>（只留渐变 + 图标兜底）；
 *  绝不运行时拼路径。铺放全由 home-cards.css 负责，不生成内联 style。 */
const HOME_COVER_DIR = 'assets/home-covers';
/** 分享图：优先 tools/generators/game-covers.mjs 用游戏美术生成的 og-<id>.jpg（多数社交平台不渲染
 *  SVG og:image），没有美术的游戏才用 og-<id>.svg。路径相对站点根，og:image / twitter:image 共用。 */
function ogImageFile(id) {
    const jpg = `${SITE.ogImageDir}/og-${id}.jpg`;
    return existsSync(join(ROOT, 'public', jpg)) ? jpg : `${SITE.ogImageDir}/og-${id}.svg`;
}
function homeNewArt(id) {
    if (existsSync(join(ROOT, 'public', HOME_COVER_DIR, `${id}.webp`))) return { src: `/${HOME_COVER_DIR}/${id}.webp`, w: 640, h: 360, og: false };
    const og = ogImageFile(id);
    // 退回 SVG 时图里自带标题，卡片要压深底部（og: true → new-card--og）
    if (existsSync(join(ROOT, 'public', og))) return { src: `/${og}`, w: 1200, h: 630, og: og.endsWith('.svg') };
    return null;
}
function homeNewContent() {
    const entries = GAMES.filter(g => g.home.addedAt)
        .sort((a, b) => (a.home.addedAt < b.home.addedAt ? 1 : a.home.addedAt > b.home.addedAt ? -1 : 0));
    const card = g => {
        const a = homeNewArt(g.id);
        const art = a ? `<img class="new-game-art" src="${a.src}" alt="" width="${a.w}" height="${a.h}" loading="lazy" decoding="async">` : '';
        // OG 图自带大标题和标语，用 new-card--og 压深底部；美术封面只压一条浅渐变，让画面露出来
        return `<a class="new-card${a?.og ? ' new-card--og' : ''}" href="${esc(g.href)}" data-game-id="${g.id}" data-added="${g.home.addedAt}">${art}<span class="new-card-body"><span class="new-icon card-icon--${g.home.iconClass}"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><use href="/icons/home-icons.svg#${g.id}"></use></svg></span><span class="new-card-text"><span class="new-card-name" data-i18n="${g.id}.name">${esc(g.name.en)}</span><span class="new-card-tag" data-i18n="${g.id}.tag">${esc(g.home.tag.en)}</span></span></span></a>`;
    };
    return [
        `<section class="home-row home-new" id="home-new" aria-labelledby="new-title" hidden>`,
        `<h2 class="home-row-title" id="new-title" data-i18n="newTitle">${esc(SITE.home.ui.newTitle.en)}</h2>`,
        '<div class="home-row-list">',
        ...entries.map(card),
        '</div>',
        '</section>',
    ].join('\n');
}

function homeNewTransform(src) {
    return applyRegion(src, 'home-new', homeNewContent(), null, 'html');
}

function homeZhMap() {
    const out = new Map();
    for (const [key, value] of Object.entries(SITE.home.ui)) out.set(key, value.zh);
    for (const cat of SITE.home.categories) out.set(`cat.${cat.key}`, cat.name.zh);
    for (const g of GAMES) {
        out.set(`${g.id}.name`, g.name.zh);
        out.set(`${g.id}.desc`, g.home.desc.zh);
        out.set(`${g.id}.tag`, g.home.tag.zh);
    }
    for (const g of SITE.home.externalGames || []) {
        out.set(`${g.id}.name`, g.name.zh);
        out.set(`${g.id}.desc`, g.desc.zh);
        out.set(`${g.id}.tag`, g.tag.zh);
    }
    return out;
}

function homeZhContent() {
    // Two compact Map entries per lint-compliant 4-space row. Keep generation
    // readable without duplicating indentation in the lazy-loaded locale.
    const entries = [...homeZhMap()].map(([k, v]) => `[${jsq(k)},${jsq(v)}]`);
    const rows = [];
    for (let i = 0; i < entries.length; i += 2) {
        rows.push(`    ${entries.slice(i, i + 2).join(',')},`);
    }
    return `export default new Map([\n${rows.join('\n')}\n]);`;
}

function homeZhTransform(src) {
    return applyRegion(src, 'home-i18n-zh', homeZhContent(), null);
}

// ---------- 每页 <head> 生成 ----------
function headBlock(g) {
    const u = `${ORIGIN}/${g.href}`;
    const img = ogImageFile(g.id);
    const L = [];
    L.push(`    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">`);
    L.push(`    <meta name="apple-mobile-web-app-capable" content="yes">`);
    L.push(`    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`);
    L.push(`    <meta name="mobile-web-app-capable" content="yes">`);
    // 主题三行，顺序固定：support meta → theme-color（浅色值挂 data-light）→ 同步 boot 脚本。
    // boot 必须在任何样式表之前执行，所以放在 head 区域里（区域位于页面 <link> 之前）。
    // 见 docs/contracts/theme.md §2.2 / §3
    const light = (g.caps || []).includes('theme-light');
    L.push(`    <meta name="theme-support" content="${light ? 'light dark' : 'dark'}">`);
    L.push(`    <meta name="theme-color" content="${g.themeColor}"${light ? ` data-light="${g.themeColorLight}"` : ''}>`);
    L.push(`    <script src="/theme-boot.js"></script>`);
    L.push(`    <meta name="description" content="${esc(g.desc.meta)}">`);
    // keywords 为可选字段：缺省时直接跳过该行（否则输出字面 "undefined"）
    if (g.keywords) {
        L.push(`    <meta name="keywords" content="${esc(g.keywords)}">`);
    }
    L.push(`    <meta name="robots" content="index, follow">`);
    L.push(`    <meta name="author" content="${SITE.publisher}">`);
    L.push(`    <link rel="canonical" id="canonical-link" href="${u}">`);
    L.push(`    <meta property="og:title" content="${esc(g.title.seo)}">`);
    L.push(`    <meta property="og:description" content="${esc(g.desc.og || g.desc.meta)}">`);
    L.push(`    <meta property="og:site_name" content="${SITE.siteName}">`);
    L.push(`    <meta property="og:type" content="website">`);
    L.push(`    <meta property="og:image" content="${img}">`);
    L.push(`    <meta property="og:url" content="${u}">`);
    L.push(`    <meta name="twitter:card" content="summary_large_image">`);
    L.push(`    <meta name="twitter:title" content="${esc(g.title.seo)}">`);
    L.push(`    <meta name="twitter:description" content="${esc(g.desc.twitter || g.desc.og || g.desc.meta)}">`);
    L.push(`    <meta name="twitter:image" content="${img}">`);
    const titleI18n = g.title.i18nKey ? ` data-i18n="${esc(g.title.i18nKey)}"` : '';
    L.push(`    <title${g.title.titleId ? ` id="${g.title.titleId}"` : ''}${titleI18n}>${esc(g.title.doc)}</title>`);
    return L.join('\n');
}

// head 自安装：从 <meta name="viewport" 行到 </title> 行整段替换
function installHead(src, content) {
    const lines = src.split('\n');
    let start = -1, end = -1;
    for (let i = 0; i < lines.length; i++) {
        if (start < 0 && /<meta name="viewport"/.test(lines[i])) start = i;
        if (start >= 0 && /<\/title>/.test(lines[i])) { end = i; break; }
    }
    if (start < 0 || end < 0) return null;
    lines.splice(start, end - start + 1,
        `    <!-- registry:begin head -->`, ...content.split('\n'), `    <!-- registry:end head -->`);
    return lines.join('\n');
}

// ---------- 内联 SEO 脚本生成 ----------
function seoScriptBlock(g) {
    return `    <script>
        // Generated by \`npm run gen\` from games.config.json — do not edit by hand.
        document.addEventListener('DOMContentLoaded', () => {
            const currentUrl = window.location.href.split('#')[0];
            const canonical = document.getElementById('canonical-link');
            if (canonical) canonical.setAttribute('href', currentUrl);
            const baseUrl = new URL('.', currentUrl).href;
            const socialImage = new URL('${ogImageFile(g.id)}', baseUrl).href;
            const ogUrl = document.querySelector('meta[property="og:url"]');
            if (ogUrl) ogUrl.setAttribute('content', currentUrl);
            const ogImage = document.querySelector('meta[property="og:image"]');
            if (ogImage) ogImage.setAttribute('content', socialImage);
            const twitterImage = document.querySelector('meta[name="twitter:image"]');
            if (twitterImage) twitterImage.setAttribute('content', socialImage);
            const gameData = {"@context":"https://schema.org","@type":"VideoGame","name":${jstr(g.title.seo)},"url":currentUrl,"description":${jstr(g.desc.meta)},"applicationCategory":"GameApplication","operatingSystem":"Web","genre":${JSON.stringify(g.genre).replace(/<\//g, '<\\/')},"playMode":"SinglePlayer","image":socialImage,"inLanguage":document.documentElement.lang||"en","publisher":{"@type":"Organization","name":${jstr(SITE.publisher)}}};
            const breadcrumb = {"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":${jstr(SITE.siteName)},"item":baseUrl},{"@type":"ListItem","position":2,"name":${jstr(g.title.seo)},"item":currentUrl}]};
            [gameData, breadcrumb].forEach(data => {
                const script = document.createElement('script');
                script.type = 'application/ld+json';
                script.textContent = JSON.stringify(data);
                document.head.appendChild(script);
            });
        });
    </script>`;
}

// seo-script 自安装：定位「无 src 的内联 <script> 且含 ld+json」的块
function installSeoScript(src, content, game) {
    const re = /<script>[\s\S]*?<\/script>/g;
    for (const m of src.matchAll(re)) {
        if (m[0].includes('ld+json') && !m[0].includes('registry:begin')) {
            return src.slice(0, m.index)
                + `    <!-- registry:begin seo-script -->\n${content}\n    <!-- registry:end seo-script -->`
                + src.slice(m.index + m[0].length);
        }
    }
    // New pages have no legacy JSON-LD block. Locate the registered entry
    // and install the SEO sentinel instead of silently skipping new games.
    const entry = `<script type="module" src="${game.entry}"></script>`;
    const at = src.indexOf(entry);
    if (at < 0) throw new Error(`seo-script: cannot find registered module entry for ${game.id}`);
    return src.slice(0, at)
        + `<!-- registry:begin seo-script -->\n${content}\n<!-- registry:end seo-script -->\n`
        + src.slice(at);
}

// ---------- Header/topbar: registry owns DOM, never the per-page HTML ----------
function topbarTransform(g) {
    return src => {
        const marker = /^([ \t]*)<!-- registry:begin topbar -->/m.exec(src);
        const legacy = /^([ \t]*)<header\b[^\n]*\bgame-topbar\b[^\n]*>/m.exec(src);
        if (!marker && !legacy) throw new Error('topbar header missing for ' + g.id);
        const indent = (marker || legacy)[1];
        return applyRegion(src, 'topbar', renderTopbar(g, indent), (source, content) => {
            const matches = [...source.matchAll(/<header\b[^>]*class="[^"]*\bgame-topbar\b[^"]*"[^>]*>/g)];
            if (matches.length !== 1) throw new Error('expected exactly one topbar: ' + g.id);
            const start = matches[0].index;
            const end = source.indexOf('</header>', start);
            if (end < 0) throw new Error('unclosed topbar: ' + g.id);
            const lineStart = source.lastIndexOf('\n', start) + 1;
            if (source.slice(lineStart, start).trim()) throw new Error('topbar must start on own line: ' + g.id);
            return source.slice(0, lineStart)
                + indent + '<!-- registry:begin topbar -->\n' + content + '\n'
                + indent + '<!-- registry:end topbar -->'
                + source.slice(end + '</header>'.length);
        }, 'html');
    };
}

// ---------- sitemap ----------
function sitemapContent() {
    return GAMES.map(g =>
        `  <url>\n    <loc>${ORIGIN}/${g.href}</loc>\n    <changefreq>${g.sitemap.changefreq}</changefreq>\n    <priority>${g.sitemap.priority}</priority>\n  </url>`
    ).join('\n');
}
function sitemapTransform(src) {
    const body = sitemapContent();
    return applyRegion(src, 'games', body, (s) => {
        // 自安装：第一个游戏 <url>（loc 以游戏 href 结尾）到 </urlset> 之间整体替换
        const re = /  <url>\n    <loc>[^<]*\.html<\/loc>[\s\S]*?<\/urlset>/;
        const m = s.match(re);
        if (!m) return null;
        return s.slice(0, m.index)
            + `  <!-- registry:begin games -->\n${body}\n  <!-- registry:end games -->\n</urlset>`
            + s.slice(m.index + m[0].length);
    });
}

// ---------- manifest.json（JSON 感知，非哨兵区域） ----------
function manifestTransform(src) {
    const obj = JSON.parse(src);
    const shortcuts = GAMES.filter(g => g.manifest?.shortcut).map(g => ({
        name: `${g.name.en} ${g.name.zh}`,
        url: `/${g.href}`,
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
    }));
    const before = JSON.stringify(obj.shortcuts);
    obj.shortcuts = shortcuts;
    const out = JSON.stringify(obj, null, 2) + '\n';
    return { src: out, state: JSON.stringify(shortcuts) === before ? 'clean' : 'written' };
}

// ---------- more-games.js ----------
const moreGamesRank = g => (typeof g.home.rank === 'number' ? g.home.rank : Infinity);
const moreGamesContent = () =>
    `export const MORE_GAMES = [\n` +
    // light: true = 支持浅色（theme-light cap）；首页据此给其余卡片标「仅深色」（docs/contracts/theme.md §5）
    // cat = home.category（推荐条按同类优先挑选；与首页分区同源，区内顺序 = home.rank 再登记序）
    [...GAMES].sort((a, b) => moreGamesRank(a) - moreGamesRank(b) || GAMES.indexOf(a) - GAMES.indexOf(b))
        .map(g => `    { href: '${g.href}', emoji: '${g.emoji}', en: ${JSON.stringify(g.name.en)}, zh: ${JSON.stringify(g.name.zh)}, cat: '${g.home.category}'${(g.caps || []).includes('theme-light') ? ', light: true' : ''} },`).join('\n') +
    `\n];`;
function moreGamesTransform(src) {
    return applyRegion(src, 'more-games', moreGamesContent(), (s, body) => {
        const m = s.match(/export const MORE_GAMES = \[[\s\S]*?\];/);
        if (!m) return null;
        return s.slice(0, m.index)
            + `// registry:begin more-games\n${body}\n// registry:end more-games`
            + s.slice(m.index + m[0].length);
    });
}

// ---------- vite.config.js ----------
function viteInputsContent() {
    return [
        `main: resolve(__dirname, 'index.html'),`,
        ...GAMES.map(g => `${JSON.stringify(g.id)}: resolve(__dirname, '${g.href}'),`),
    ].join('\n            ');
}
function viteTransform(src) {
    return applyRegion(src, 'inputs', viteInputsContent(), (s, body) => {
        const m = s.match(/input: \{\n[\s\S]*?\n(\s*)\},/);
        if (!m) return null;
        return s.slice(0, m.index)
            + `input: {\n            // registry:begin inputs\n            ${body}\n            // registry:end inputs\n${m[1]}},`
            + s.slice(m.index + m[0].length);
    });
}

// ---------- Workers/game-scores.js ----------
function scoresContent() {
    const L = [];
    L.push(`const GAMES = {`);
    for (const g of GAMES) {
        const s = g.scores;
        if (!s) continue;
        if (s.keys) {
            for (const k of s.keys) L.push(`  '${k}': { order: '${s.order}', maxScore: ${s.maxScore}, maxEntries: ${s.maxEntries} },`);
        } else if (s.key) {
            L.push(`  '${s.key}': { order: '${s.order}', maxScore: ${s.maxScore}, maxEntries: ${s.maxEntries} },`);
        }
        // 无 key（每日-only，如 gravity）只进 DAILY_PATTERNS
    }
    L.push(`};`);
    L.push('');
    L.push(`// 每日赛程 / 每日挑战榜：按天一个键，正则白名单 + TTL 自然滚动`);
    L.push(`const DAILY_PATTERNS = [`);
    for (const g of GAMES) {
        const s = g.scores;
        if (!s?.daily) continue;
        const ttl = s.dailyTtlDays ? `, ttl: ${s.dailyTtlDays} * 24 * 3600` : '';
        L.push(`  { re: /^${s.dailyKeyPrefix}-d\\d{8}$/, config: { order: '${s.order}', maxScore: ${s.maxScore}, maxEntries: ${s.maxEntries}${ttl} } },`);
    }
    L.push(`];`);
    return L.join('\n');
}
function scoresTransform(src) {
    return applyRegion(src, 'games-scores', scoresContent(), (s, body) => {
        const m = s.match(/const GAMES = \{[\s\S]*?const DAILY_PATTERNS = \[[\s\S]*?\];/);
        if (!m) return null;
        return s.slice(0, m.index)
            + `// registry:begin games-scores\n${body}\n// registry:end games-scores`
            + s.slice(m.index + m[0].length);
    });
}

// Only games.config.json owns client game IDs and cross-origin allowlisting.
function analyticsOriginsContent() {
    const urls = [ORIGIN, 'https://game.orangely.xyz',
        ...(SITE.home.externalGames || []).map(g => new URL(g.url).origin)];
    return 'const ALLOWED_ORIGINS = [' + [...new Set(urls)].map(jsq).join(', ') + '];';
}
function analyticsOriginsTransform(src) {
    return applyRegion(src, 'analytics-origins', analyticsOriginsContent());
}
function analyticsClientContent() {
    const external = SITE.home.externalGames || [];
    return [
        '    var VALID_GAMES = new Set(' + JSON.stringify([...GAMES.map(g => g.id), ...external.map(g => g.id)]) + ');',
        '    var EXTERNAL_ORIGINS = ' + JSON.stringify(Object.fromEntries(external.map(g => [g.id, new URL(g.url).origin]))) + ';',
    ].join('\n');
}
function analyticsClientTransform(src) {
    return applyRegion(src, 'analytics-client-games', analyticsClientContent());
}

// ---------- Workers/games-analytics.js ----------
// 站外游戏（site.home.externalGames：2d-minecraft / dots-and-boxes / the-stack）
// 也通过同一 hubTrack 协议上报，用的是它们在登记表里的 id。
function analyticsContent() {
    const ids = [...GAMES.map(g => g.id), ...(SITE.home.externalGames || []).map(g => g.id)];
    return `const GAMES = [${ids.map(id => `'${id}'`).join(', ')}];`;
}
function analyticsTransform(src) {
    return applyRegion(src, 'games-analytics', analyticsContent(), (s, body) => {
        const m = s.match(/const GAMES = \[[\s\S]*?\];/);
        if (!m) return null;
        return s.slice(0, m.index)
            + `// registry:begin games-analytics\n${body}\n// registry:end games-analytics`
            + s.slice(m.index + m[0].length);
    });
}

// Canonical report labels are registry-generated, including standalone games.
function analyticsReportNamesContent() {
    const all = [...GAMES, ...(SITE.home.externalGames || [])];
    const names = Object.fromEntries(all.map(g => [g.id, g.name.en]));
    const standalone = (SITE.home.externalGames || []).map(g => g.id);
    return `const GAME_NAMES = ${JSON.stringify(names)};\nconst STANDALONE_GAMES = ${JSON.stringify(standalone)};`;
}
function analyticsReportNamesTransform(src) {
    return applyRegion(src, 'analytics-report-names', analyticsReportNamesContent(), (s, body) => {
        const end = '// registry:end games-analytics';
        const index = s.indexOf(end);
        if (index < 0) return null;
        const after = index + end.length;
        return s.slice(0, after) + `\n\n// registry:begin analytics-report-names\n${body}\n// registry:end analytics-report-names\n`
            + s.slice(after);
    });
}

// ---------- README.md ----------
function readmeContent() {
    return GAMES.map(g => `- ${g.name.en}（${g.name.zh}）`).join('\n');
}
function readmeTransform(src) {
    return applyRegion(src, 'game-list', readmeContent(), (s, body) => {
        const m = s.match(/^- .+（.+）$(\n- .+（.+）$)*/m);
        if (!m) return null;
        return s.slice(0, m.index)
            + `<!-- registry:begin game-list -->\n${body}\n<!-- registry:end game-list -->`
            + s.slice(m.index + m[0].length);
    }, 'html');
}

// ---------- 执行 ----------
function processFile(rel, transforms) {
    const file = join(ROOT, rel);
    let src = readFileSync(file, 'utf8');
    let dirty = false;
    const notes = [];
    for (const t of transforms) {
        const r = t(src);
        if (r.state === 'absent') { notes.push('区域缺失且无法自安装'); continue; }
        if (r.state === 'written') { dirty = true; notes.push('已更新'); }
        src = r.src;
    }
    if (CHECK) {
        if (dirty) { drift++; console.log(`DRIFT  ${rel}`); }
        else { clean++; console.log(`OK     ${rel}`); }
    } else if (dirty) {
        writeFileSync(file, src);
        written++;
        console.log(`WRITE  ${rel}`);
    } else {
        clean++;
        console.log(`OK     ${rel}`);
    }
}

for (const g of GAMES) {
    processFile(g.href, [
        s => applyRegion(s, 'head', headBlock(g), (s, c) => installHead(s, c), 'html'),
        s => applyRegion(s, 'seo-script', seoScriptBlock(g), (s, c) => installSeoScript(s, c, g), 'html'),
        ...((g.caps || []).includes('topbar') ? [topbarTransform(g)] : []),
    ]);
}
processFile('index.html', [homeNewTransform, homeFilterTransform, homeCardsTransform]);
processFile('js/index-i18n-zh.js', [homeZhTransform]);
processFile('public/sitemap.xml', [sitemapTransform]);
processFile('public/manifest.json', [manifestTransform]);
processFile('src/platform/more-games.js', [moreGamesTransform]);
processFile('vite.config.js', [viteTransform]);
processFile('Workers/game-scores.js', [scoresTransform]);
processFile('Workers/games-analytics.js', [analyticsOriginsTransform, analyticsTransform, analyticsReportNamesTransform]);
processFile('public/analytics.js', [analyticsClientTransform]);
processFile('README.md', [readmeTransform]);

if (CHECK) {
    console.log(drift ? `\ngen --check：${drift} 个文件漂移（跑 npm run gen 修复）` : `\ngen --check：全部一致 ✅`);
    process.exit(drift ? 1 : 0);
}
console.log(`\ngen 完成：${written} 个文件更新，${clean} 个无变化`);
