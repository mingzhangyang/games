#!/usr/bin/env node
// verify-theme.mjs — 主题契约校验（docs/contracts/theme.md §4）
//
//   ① 夹具页：theme-boot.js + js/theme.js 的行为本身
//      默认深色 / 偏好浅色 / 跟随系统 / 非法值 / 同页即时切换 / 跨标签页同步 /
//      theme-color 切换 / readPalette 读到浅色覆盖值 / --tok-* 浅色层生效
//   ② 全部真实页面（注册表 22 页 + 首页），HTML 取自被测服务器（源码或 dist 都适用）：
//      theme-support meta 与 cap 一致、boot 脚本排在任何样式之前、
//      默认深色、偏好浅色时 = cap 决定的主题、color-scheme（仅深色页不改写）、无 pageerror
//   ③ 首页主题开关：可见性跟随首页是否支持浅色；三档写入 site_theme 并更新按下态
//
// 用法：node scripts/verify-theme.mjs [baseUrl]（verify-all 自动传入）
import puppeteer from 'puppeteer-core';
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
    { id: 'index', href: 'index.html', light: false },   // 首页不在注册表里：P1 支持浅色时把这里改成 true
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

/* ── ③ 首页主题开关 ── */
{
    const ctx = await browser.createBrowserContext();
    const { page, errors } = await openPage(ctx);
    await gotoWithPref(page, '/index.html', null);
    await page.waitForFunction(() => !!document.querySelector('#theme-switch [aria-pressed="true"]'), { timeout: 5000 })
        .catch(() => {});
    const indexLight = PAGES[0].light;
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
    const labels = await page.evaluate(() => [...document.querySelectorAll('#theme-switch [data-theme-pref]')].map(b => b.textContent.trim()));
    check(labels.every(Boolean), '首页：开关文案非空', labels.join('/'));
    check(errors.length === 0, '首页开关：无 pageerror', errors.join(' | '));
    await ctx.close();
}

await browser.close();

if (fails.length) {
    console.error(fails.map(f => `✗ ${f}`).join('\n'));
    console.error(`\nverify-theme：${fails.length} 项失败（${passes} 项通过）❌`);
    process.exit(1);
}
console.log(`verify-theme 全部通过 ✅（${passes} 项断言，${PAGES.length} 页 + 夹具）`);
