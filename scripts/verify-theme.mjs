#!/usr/bin/env node
// verify-theme.mjs — 主题契约校验（docs/contracts/theme.md §4）
//
//   ① 夹具页：theme-boot.js + js/theme.js 的行为本身
//      默认深色 / 偏好浅色 / 跟随系统 / 非法值 / 同页即时切换 / 跨标签页同步 /
//      theme-color 切换 / readPalette 读到浅色覆盖值 / --tok-* 浅色层生效
//   ② 全部真实页面（注册表 22 页 + 首页），HTML 取自被测服务器（源码或 dist 都适用）：
//      theme-support meta 与 cap 一致、boot 脚本排在任何样式之前、
//      默认深色、偏好浅色时 = cap 决定的主题、color-scheme（仅深色页不改写）、无 pageerror
//   ③ 首页主题开关：可见性跟随首页是否支持浅色；三档写入 site_theme 并更新按下态；
//      「仅深色」小标只在浅色时出现，且恰好标在不支持浅色的注册表游戏上
//   ④ 支持浅色的页面：{浅色, 深色} × {390, 1280}
//      - 页面底色取自真实截图像素（四角）：浅色亮度 > 0.6、深色 < 0.3（抓「只换了外框」）
//      - 文字对比度：浅色下正文 ≥ 4.5:1、大字 ≥ 3:1，不达标即失败；深色下只统计不判红
//        （深色是既有设计，部分弱化文字本就低于 4.5，另行治理）
//      - 同页即时切换：深色加载后改偏好为浅色，不刷新即变浅
//
// 用法：node scripts/verify-theme.mjs [baseUrl]（verify-all 自动传入）
import puppeteer from 'puppeteer-core';
import { inflateSync } from 'node:zlib';
import { Buffer } from 'node:buffer';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { registry } from './lib/registry.mjs';

const BASE = process.argv.slice(2).find(a => a.startsWith('http')) || 'http://127.0.0.1:8899';
const FIXTURE = '/__theme-fixture.html';

const fails = [];
let passes = 0;
const check = (cond, label, extra = '') => {
    if (cond) { passes++; return; }
    fails.push(`${label}${extra ? ' —— ' + extra : ''}`);
};

const PAGES = [
    { id: 'index', href: 'index.html', light: true },    // 首页不在注册表里，手写（P1 起支持浅色）
    ...registry.all().map(g => ({ id: g.id, href: g.href, light: (g.caps || []).includes('theme-light') })),
];

const FIXTURE_HTML = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8">
<meta name="theme-support" content="light dark">
<meta name="theme-color" content="#101010" data-light="#fafafa">
<script src="/theme-boot.js"></script>
<link rel="stylesheet" href="/css/tokens.css">
<style>
#probe { --fx-ink: #111111; }
:root[data-theme="light"] #probe { --fx-ink: #eeeeee; }
</style>
</head><body><div id="probe"></div>
<script type="module">
import * as T from '/js/theme.js';
window.__events = [];
T.onThemeChange(t => window.__events.push(t));
window.__T = T;
</script>
</body></html>`;

const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: LAUNCH_ARGS });

async function openPage(ctx) {
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.setRequestInterception(true);
    page.on('request', req => {
        if (new URL(req.url()).pathname === FIXTURE) {
            req.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: FIXTURE_HTML });
        } else {
            req.continue();
        }
    });
    return { page, errors };
}

const state = page => page.evaluate(() => {
    const root = document.documentElement;
    const meta = document.querySelector('meta[name="theme-color"]');
    return {
        theme: root.getAttribute('data-theme'),
        scheme: getComputedStyle(root).colorScheme,
        themeColor: meta ? meta.getAttribute('content') : null,
        tokBg: getComputedStyle(root).getPropertyValue('--tok-bg').trim(),
    };
});

// 在 origin 上写好偏好后再导航（localStorage 需要同源页面才能写）
async function gotoWithPref(page, path, pref) {
    await page.goto(`${BASE}${FIXTURE}`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(p => {
        localStorage.clear();
        if (p !== null) localStorage.setItem('site_theme', p);
    }, pref);
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
}

/* ── ① 夹具：theme-boot + theme.js ── */
{
    const ctx = await browser.createBrowserContext();
    const { page, errors } = await openPage(ctx);
    const waitT = () => page.waitForFunction(() => !!window.__T, { timeout: 5000 });

    await gotoWithPref(page, FIXTURE, null);
    let s = await state(page);
    check(s.theme === 'dark' && s.scheme === 'dark', '夹具：未设偏好 → 深色', JSON.stringify(s));
    check(s.themeColor === '#101010', '夹具：深色 theme-color 保持原值', s.themeColor);
    check(s.tokBg === '#05060f', '夹具：深色 --tok-bg', s.tokBg);

    await gotoWithPref(page, FIXTURE, 'blue');
    s = await state(page);
    check(s.theme === 'dark', '夹具：非法偏好值 → 深色', s.theme);

    await gotoWithPref(page, FIXTURE, 'light');
    await waitT();
    s = await state(page);
    check(s.theme === 'light' && s.scheme === 'light', '夹具：偏好浅色 → 浅色', JSON.stringify(s));
    check(s.themeColor === '#fafafa', '夹具：浅色 theme-color 取 data-light', s.themeColor);
    check(s.tokBg === '#f3f5fa', '夹具：tokens.css 浅色层生效', s.tokBg);
    const pal = await page.evaluate(() => ({
        theme: window.__T.getTheme(),
        supports: window.__T.supportsLight(),
        pal: window.__T.readPalette(document.getElementById('probe'), { ink: '--fx-ink', none: '--fx-missing' }, { none: 'fb' }),
    }));
    check(pal.theme === 'light' && pal.supports === true, 'theme.js：getTheme / supportsLight', JSON.stringify(pal));
    check(pal.pal.ink === '#eeeeee', 'theme.js：readPalette 读到浅色覆盖值', pal.pal.ink);
    check(pal.pal.none === 'fb', 'theme.js：readPalette 缺失变量回退 fallback', pal.pal.none);

    // 同页即时切换：写偏好 + site-settings:changed（= setThemePref 的行为）
    await page.evaluate(() => {
        localStorage.setItem('site_theme', 'dark');
        window.dispatchEvent(new CustomEvent('site-settings:changed'));
    });
    s = await state(page);
    const ev1 = await page.evaluate(() => window.__events.slice());
    check(s.theme === 'dark' && s.themeColor === '#101010', '夹具：同页切回深色即时生效', JSON.stringify(s));
    check(ev1.join() === 'dark', '夹具：theme:changed 派发一次（detail=dark）', ev1.join());
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('site-settings:changed')));
    const ev2 = await page.evaluate(() => window.__events.length);
    check(ev2 === 1, '夹具：主题未变时不重复派发 theme:changed', String(ev2));

    // 跟随系统：初始解析 + 系统切换即时生效
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
    await gotoWithPref(page, FIXTURE, 'system');
    await waitT();
    check((await state(page)).theme === 'dark', '夹具：跟随系统（系统深色）→ 深色');
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
    await page.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'light', { timeout: 3000 })
        .catch(() => {});
    check((await state(page)).theme === 'light', '夹具：跟随系统时系统切到浅色即时生效');

    // 跨标签页：另一页改偏好，本页经 storage 事件同步
    const other = await ctx.newPage();
    await other.goto(`${BASE}${FIXTURE}`, { waitUntil: 'domcontentloaded' });
    await other.evaluate(() => localStorage.setItem('site_theme', 'dark'));
    await page.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'dark', { timeout: 3000 })
        .catch(() => {});
    check((await state(page)).theme === 'dark', '夹具：跨标签页改偏好经 storage 事件同步');

    check(errors.length === 0, '夹具：无 pageerror', errors.join(' | '));
    await ctx.close();
}

/* ── ② 真实页面 ── */
for (const p of PAGES) {
    const html = await fetch(`${BASE}/${p.href}`).then(r => r.text()).catch(() => '');
    const support = (html.match(/<meta name="theme-support" content="([^"]*)">/) || [])[1];
    check(support === (p.light ? 'light dark' : 'dark'), `${p.id}：theme-support meta 与 cap 一致`, `got ${support}`);
    const boot = html.indexOf('/theme-boot.js');
    const firstStyle = html.search(/<link rel="stylesheet"|<style[\s>]/);
    check(boot > 0 && (firstStyle < 0 || boot < firstStyle), `${p.id}：theme-boot.js 在任何样式之前`, `boot@${boot} style@${firstStyle}`);
    check(!/<script[^>]*theme-boot\.js[^>]*\b(defer|async|type="module")/.test(html), `${p.id}：theme-boot.js 为同步经典脚本`);
    const tc = html.match(/<meta name="theme-color" content="[^"]*"( data-light="[^"]*")?>/);
    check(!!tc && !!tc[1] === p.light, `${p.id}：theme-color 的 data-light 与 cap 一致`);

    const ctx = await browser.createBrowserContext();
    const { page, errors } = await openPage(ctx);
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);

    await gotoWithPref(page, `/${p.href}`, null);
    // 仅深色页面不碰 color-scheme（保持原生控件观感），支持浅色的页面跟随主题
    const schemeFor = t => (p.light ? t : 'normal');
    let s = await state(page);
    check(s.theme === 'dark' && s.scheme === schemeFor('dark'), `${p.id}：未设偏好 → 深色（默认深色）`, JSON.stringify(s));

    for (const pref of ['light', 'system']) {
        await gotoWithPref(page, `/${p.href}`, pref);
        s = await state(page);
        const want = p.light ? 'light' : 'dark';
        check(s.theme === want && s.scheme === schemeFor(want), `${p.id}：偏好 ${pref}（系统浅色）→ ${want}`, JSON.stringify(s));
    }
    await new Promise(r => setTimeout(r, 300));
    check(errors.length === 0, `${p.id}：无 pageerror`, errors.join(' | '));
    await ctx.close();
}

/* ── 截图像素：最小 PNG 解码（Chrome 截图为 8 位 RGB/RGBA、非隔行）── */
function decodePng(buf) {
    let off = 8, w = 0, h = 0, ct = 0;
    const idat = [];
    while (off < buf.length) {
        const len = buf.readUInt32BE(off);
        const type = buf.toString('ascii', off + 4, off + 8);
        const data = buf.subarray(off + 8, off + 8 + len);
        if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; }
        if (type === 'IDAT') idat.push(data);
        off += 12 + len;
    }
    const bpp = ct === 6 ? 4 : 3;
    const raw = inflateSync(Buffer.concat(idat));
    const stride = w * bpp;
    const px = Buffer.alloc(h * stride);
    for (let y = 0; y < h; y++) {
        const f = raw[y * (stride + 1)];
        for (let x = 0; x < stride; x++) {
            const cur = raw[y * (stride + 1) + 1 + x];
            const a = x >= bpp ? px[y * stride + x - bpp] : 0;
            const b = y > 0 ? px[(y - 1) * stride + x] : 0;
            const c = x >= bpp && y > 0 ? px[(y - 1) * stride + x - bpp] : 0;
            const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
            const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
            px[y * stride + x] = (cur + pred) & 255;
        }
    }
    return { w, h, bpp, px };
}
const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
/** 视口四角 6×6 色块的平均相对亮度 */
async function cornerLuminance(page) {
    const vp = page.viewport();
    const img = decodePng(await page.screenshot({ type: 'png' }));
    const sx = img.w / vp.width;
    let sum = 0, n = 0;
    for (const [cx, cy] of [[4, 4], [vp.width - 10, 4], [4, vp.height - 10], [vp.width - 10, vp.height - 10]]) {
        for (let dy = 0; dy < 6; dy++) for (let dx = 0; dx < 6; dx++) {
            const i = (Math.round((cy + dy) * sx) * img.w + Math.round((cx + dx) * sx)) * img.bpp;
            sum += 0.2126 * lin(img.px[i]) + 0.7152 * lin(img.px[i + 1]) + 0.0722 * lin(img.px[i + 2]);
            n++;
        }
    }
    return sum / n;
}

/** 页面内的文字对比度审计：返回不达标的文字（背景按祖先链合成；渐变层取色标平均值近似） */
const contrastAudit = page => page.evaluate(() => {
    const parse = (s) => {
        const m = s && s.match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
        return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    };
    const lum = (c) => {
        const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
        return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    const over = (t, b) => {
        const a = t.a + b.a * (1 - t.a);
        if (!a) return { r: 0, g: 0, b: 0, a: 0 };
        const mix = k => (t[k] * t.a + b[k] * b.a * (1 - t.a)) / a;
        return { r: mix('r'), g: mix('g'), b: mix('b'), a };
    };
    // background-image 按顶层逗号拆成图层；每层取色标的 alpha 加权平均（transparent 计为 a=0，
    // 不能直接平均 rgb —— 那会把背景往黑拉）；再自下而上合成为一个近似颜色
    const splitTop = (s) => {
        const out = [];
        let depth = 0, cur = '';
        for (const ch of s) {
            if (ch === '(') depth++;
            if (ch === ')') depth--;
            if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
        }
        return cur ? [...out, cur] : out;
    };
    const layerAvg = (layer) => {
        const cols = [...layer.matchAll(/rgba?\([^)]+\)/g)].map(m => parse(m[0])).filter(Boolean);
        if (!cols.length) return null;
        const sa = cols.reduce((s, c) => s + c.a, 0);
        if (!sa) return { r: 0, g: 0, b: 0, a: 0 };
        const w = k => cols.reduce((s, c) => s + c[k] * c.a, 0) / sa;
        return { r: w('r'), g: w('g'), b: w('b'), a: sa / cols.length };
    };
    const gradAvg = (img) => {
        const layers = splitTop(img).map(layerAvg).filter(Boolean);
        if (!layers.length) return null;
        return layers.reverse().reduce((acc, l) => over(l, acc), { r: 0, g: 0, b: 0, a: 0 });
    };
    const base = getComputedStyle(document.documentElement).colorScheme === 'dark'
        ? { r: 18, g: 18, b: 18, a: 1 } : { r: 255, g: 255, b: 255, a: 1 };
    const bgOf = (el) => {
        const layers = [];
        for (let e = el; e; e = e.parentElement) {
            const cs = getComputedStyle(e);
            const img = cs.backgroundImage !== 'none' && !/url\(/.test(cs.backgroundImage) ? gradAvg(cs.backgroundImage) : null;
            const col = parse(cs.backgroundColor);
            if (img && img.a > 0) layers.push(img);
            if (col && col.a > 0) layers.push(col);
            if ((col && col.a >= 1) || (img && img.a >= 1)) break;
        }
        return layers.reverse().reduce((acc, l) => over(l, acc), base);
    };
    const bad = [];
    let total = 0;
    const walker = document.createTreeWalker(document.body, 4 /* NodeFilter.SHOW_TEXT */);
    const seen = new Set();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const el = n.parentElement;
        if (!el || seen.has(el) || !/[\p{L}\p{N}]/u.test(n.textContent)) continue;
        seen.add(el);
        if (el.closest('script, style, [aria-hidden="true"], button:disabled, [aria-disabled="true"], select, option')) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1 || rect.bottom < 0 || rect.top > innerHeight) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility !== 'visible' || /transparent|rgba\(0, 0, 0, 0\)/.test(cs.webkitTextFillColor)) continue;
        let op = 1;
        for (let e = el; e; e = e.parentElement) op *= Number(getComputedStyle(e).opacity);
        if (op < 0.2) continue;
        // 被别的层（遮罩、浮层）盖住的文字不算：取中心点命中测试
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) continue;
        const fg0 = parse(cs.color);
        if (!fg0) continue;
        const bg = bgOf(el);
        const fg = over({ ...fg0, a: fg0.a * op }, bg);
        const [L1, L2] = [lum(fg), lum(bg)].sort((a, b) => b - a);
        const ratio = (L1 + 0.05) / (L2 + 0.05);
        const size = parseFloat(cs.fontSize);
        const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
        total++;
        if (ratio < (large ? 3 : 4.5)) {
            const id = el.id ? '#' + el.id : el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : el.tagName.toLowerCase();
            bad.push(`${id} "${n.textContent.trim().slice(0, 16)}" ${ratio.toFixed(2)}:1`);
        }
    }
    return { total, bad };
});

/* ── ③ 首页主题开关 ── */
{
    const ctx = await browser.createBrowserContext();
    const { page, errors } = await openPage(ctx);
    await gotoWithPref(page, '/index.html', null);
    await page.waitForFunction(() => !!document.querySelector('#theme-switch [aria-pressed="true"]'), { timeout: 5000 })
        .catch(() => {});
    const indexLight = PAGES[0].light;
    // 「仅深色」小标：深色下全隐藏；切到浅色后恰好标在不支持浅色的注册表游戏卡片上
    const badges = () => page.evaluate(() => [...document.querySelectorAll('.tag--dark-only')]
        .filter(el => getComputedStyle(el).display !== 'none')
        .map(el => el.closest('.game-card').querySelector('.card-title').getAttribute('href')).sort());
    check((await badges()).length === 0, '首页：深色下不显示「仅深色」小标');
    const vis = await page.evaluate(() => {
        const el = document.getElementById('theme-switch');
        return el ? { exists: true, hidden: el.hidden, shown: getComputedStyle(el).display !== 'none' } : { exists: false };
    });
    check(vis.exists, '首页：存在 #theme-switch');
    check(vis.hidden === !indexLight && vis.shown === indexLight, `首页：开关${indexLight ? '可见' : '隐藏'}（首页${indexLight ? '' : '不'}支持浅色）`, JSON.stringify(vis));

    // 行为：临时显现后逐档点击（隐藏态下同样必须能正确写偏好，P1 一翻开关就能用）
    await page.evaluate(() => { document.getElementById('theme-switch').hidden = false; });
    for (const pref of ['light', 'system', 'dark']) {
        await page.click(`#theme-switch [data-theme-pref="${pref}"]`);
        const r = await page.evaluate(() => ({
            stored: localStorage.getItem('site_theme'),
            pressed: [...document.querySelectorAll('#theme-switch [aria-pressed="true"]')].map(b => b.dataset.themePref),
        }));
        check(r.stored === pref && r.pressed.join() === pref, `首页：点击「${pref}」写入 site_theme 并独占按下态`, JSON.stringify(r));
    }
    if (indexLight) {
        await page.click('#theme-switch [data-theme-pref="light"]');
        const want = registry.all().filter(g => !(g.caps || []).includes('theme-light')).map(g => g.href);
        const got = await badges();
        const cards = await page.evaluate(() => [...document.querySelectorAll('.game-card .card-title')].map(a => a.getAttribute('href')));
        const expect = want.filter(h => cards.includes(h)).sort();
        check((await state(page)).theme === 'light', '首页：点「浅色」后首页即时变浅');
        check(got.join() === expect.join(), '首页：浅色下「仅深色」小标恰好标在不支持浅色的游戏上', `got ${got.length} / want ${expect.length}`);
        await page.click('#theme-switch [data-theme-pref="dark"]');
        check((await badges()).length === 0, '首页：切回深色后小标隐藏');
    }
    const labels = await page.evaluate(() => [...document.querySelectorAll('#theme-switch [data-theme-pref]')].map(b => b.textContent.trim()));
    check(labels.every(Boolean), '首页：开关文案非空', labels.join('/'));
    check(errors.length === 0, '首页开关：无 pageerror', errors.join(' | '));
    await ctx.close();
}

/* ── ④ 支持浅色的页面：像素底色 / 画布底色 / 对比度 / 即时切换 ── */
// 画布底色随主题的例外：画布四角画的是「实物」、两套主题本就一致
// （gomoku 的木棋盘、crystal-bloom 的结晶皿、ripple-duet 的海面）
const CANVAS_KEEP = new Set(['gomoku', 'crystal-bloom', 'ripple-duet']);
// 最大画布（≥ 200×200）四个内角的平均亮度 —— 直接读画布位图（getImageData），
// 不看截图：开始菜单等 DOM 浮层会盖住画布，截图取样会把浮层当成画布（实测漏判过）。
// 角上像素近乎透明（底色由 CSS 画）时返回 null，不做断言。
const canvasLuminance = page => page.evaluate(() => {
    const c = [...document.querySelectorAll('canvas')]
        .filter(el => el.width >= 200 && el.height >= 200)
        .sort((a, b) => b.width * b.height - a.width * a.height)[0];
    if (!c) return null;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const m = Math.round(Math.min(c.width, c.height) * 0.03) + 2;
    let sum = 0, n = 0, alpha = 0;
    for (const [x, y] of [[m, m], [c.width - m - 6, m], [m, c.height - m - 6], [c.width - m - 6, c.height - m - 6]]) {
        const d = ctx.getImageData(x, y, 6, 6).data;
        for (let i = 0; i < d.length; i += 4) {
            sum += 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]);
            alpha += d[i + 3] / 255;
            n++;
        }
    }
    return alpha / n < 0.5 ? null : sum / n;
});
const darkContrast = [];
for (const p of PAGES.filter(x => x.light)) {
    for (const [w, h] of [[390, 844], [1280, 900]]) {
        const ctx = await browser.createBrowserContext();
        const { page, errors } = await openPage(ctx);
        await page.setViewport({ width: w, height: h });
        for (const theme of ['light', 'dark']) {
            await gotoWithPref(page, `/${p.href}`, theme);
            await page.waitForNetworkIdle({ idleTime: 300, timeout: 8000 }).catch(() => {});
            await new Promise(r => setTimeout(r, 400));
            const L = await cornerLuminance(page);
            check(theme === 'light' ? L > 0.6 : L < 0.3, `${p.id}@${w}：${theme} 页面底色（四角亮度 ${L.toFixed(2)}）`);
            const CL = CANVAS_KEEP.has(p.id) ? null : await canvasLuminance(page);
            if (CL !== null) {
                check(theme === 'light' ? CL > 0.55 : CL < 0.3, `${p.id}@${w}：${theme} 画布底色（位图四角亮度 ${CL.toFixed(2)}）`);
            }
            const audit = await contrastAudit(page);
            if (theme === 'light') {
                check(audit.bad.length === 0, `${p.id}@${w}：浅色文字对比度（${audit.total} 处）`, audit.bad.slice(0, 6).join(' | '));
            } else if (audit.bad.length) {
                darkContrast.push(`${p.id}@${w}: ${audit.bad.length}/${audit.total}`);
            }
        }
        // 同页即时切换：当前为深色，改偏好为浅色（= 首页开关的写入方式），不刷新
        await page.evaluate(() => {
            localStorage.setItem('site_theme', 'light');
            window.dispatchEvent(new CustomEvent('site-settings:changed'));
        });
        await new Promise(r => setTimeout(r, 400));
        const L = await cornerLuminance(page);
        check((await state(page)).theme === 'light' && L > 0.6, `${p.id}@${w}：同页切到浅色即时生效（亮度 ${L.toFixed(2)}）`);
        check(errors.length === 0, `${p.id}@${w}：无 pageerror`, errors.join(' | '));
        await ctx.close();
    }
}
if (darkContrast.length) console.log(`ℹ 深色对比度（只统计，不判红）：${darkContrast.join('；')}`);

await browser.close();

if (fails.length) {
    console.error(fails.map(f => `✗ ${f}`).join('\n'));
    console.error(`\nverify-theme：${fails.length} 项失败（${passes} 项通过）❌`);
    process.exit(1);
}
console.log(`verify-theme 全部通过 ✅（${passes} 项断言，${PAGES.length} 页 + 夹具）`);
