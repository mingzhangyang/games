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
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { registry } from './lib/registry.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
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

// ---------- 每页 <head> 生成 ----------
function headBlock(g) {
    const u = `${ORIGIN}/${g.href}`;
    const img = `${SITE.ogImageDir}/og-${g.id}.svg`;
    const L = [];
    L.push(`    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">`);
    L.push(`    <meta name="apple-mobile-web-app-capable" content="yes">`);
    L.push(`    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`);
    L.push(`    <meta name="mobile-web-app-capable" content="yes">`);
    L.push(`    <meta name="theme-color" content="${g.themeColor}">`);
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
    L.push(`    <title${g.title.titleId ? ` id="${g.title.titleId}"` : ''}>${esc(g.title.doc)}</title>`);
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
            const socialImage = new URL('${SITE.ogImageDir}/og-${g.id}.svg', baseUrl).href;
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
function installSeoScript(src, content) {
    const re = /<script>[\s\S]*?<\/script>/g;
    for (const m of src.matchAll(re)) {
        if (m[0].includes('ld+json') && !m[0].includes('registry:begin')) {
            return src.slice(0, m.index)
                + `    <!-- registry:begin seo-script -->\n${content}\n    <!-- registry:end seo-script -->`
                + src.slice(m.index + m[0].length);
        }
    }
    return null;
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
const moreGamesContent = () =>
    `export const MORE_GAMES = [\n` +
    GAMES.map(g => `    { href: '${g.href}', emoji: '${g.emoji}', en: ${JSON.stringify(g.name.en)}, zh: ${JSON.stringify(g.name.zh)} },`).join('\n') +
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

// ---------- Workers/games-analytics.js ----------
function analyticsContent() {
    return `const GAMES = [${GAMES.map(g => `'${g.id}'`).join(', ')}];`;
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
        s => applyRegion(s, 'seo-script', seoScriptBlock(g), (s, c) => installSeoScript(s, c), 'html'),
    ]);
}
processFile('public/sitemap.xml', [sitemapTransform]);
processFile('public/manifest.json', [manifestTransform]);
processFile('js/more-games.js', [moreGamesTransform]);
processFile('vite.config.js', [viteTransform]);
processFile('Workers/game-scores.js', [scoresTransform]);
processFile('Workers/games-analytics.js', [analyticsTransform]);
processFile('README.md', [readmeTransform]);

if (CHECK) {
    console.log(drift ? `\ngen --check：${drift} 个文件漂移（跑 npm run gen 修复）` : `\ngen --check：全部一致 ✅`);
    process.exit(drift ? 1 : 0);
}
console.log(`\ngen 完成：${written} 个文件更新，${clean} 个无变化`);
