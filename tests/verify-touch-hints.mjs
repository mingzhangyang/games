#!/usr/bin/env node
/**
 * verify-touch-hints — 触屏设备上的页脚提示不再出现键盘 / 鼠标说明（docs/backlog.md 移动端 QA 缺口）。
 *
 * 粗指针（isMobile + hasTouch 让 Chromium 的 (pointer: coarse) 成立）下，每个有 .game-footer-hint 的
 * 注册表页面 × zh/en：
 *   ① 提示非空，且不含「Click / Right-click / Space / Enter / 方向键 / 空格 / 回车 / P 暂停」这类
 *      键鼠字样——新页面自动纳入，忘了写 hintTouch 就红；
 *   ② TOUCH_PAGES 里的页面在细指针（桌面）下的提示与触屏不同——桌面照旧显示快捷键，
 *      而不是把键鼠说明一并删掉。
 * 文案由 src/platform/i18n/touch-copy.js 选择：声明式 data-i18n-touch，命令式 touchCopy()。
 *
 * 用法：node tests/verify-touch-hints.mjs [baseUrl]（verify-all 自动传入）
 */
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { registry } from './lib/registry.mjs';
import { keepPage, exitIfNoPages } from './lib/page-filter.mjs';

const BASE = process.argv.find(a => a.startsWith('http')) || 'http://127.0.0.1:8899';
const ORIGIN = new URL(BASE).origin;
// 桌面提示里本来就列键鼠操作、触屏另有 hintTouch 的页面（其余页面的提示本身与输入方式无关）
const TOUCH_PAGES = new Set([
    'gomoku', 'hoop-shot', 'minesweeper', 'needle-awn', 'planet-merge', 'sword-flight',
    'tetris', 'tower-defense', 'word-daily', 'firefly-signal', 'carrot-pull', 'loop-jail',
]);
const KEY_MOUSE = [
    /\b(?:click|right-click|mouse|keyboard|keys?:|space|enter|esc|arrows?|wasd)\b/i,
    /(?:^|·\s*)[A-Z](?:\s*\/\s*Esc)?\s+(?:pause|mute|restart|switch|ultimate|dash)\b/, // 「P pause」「Q switch stance」「P / Esc pause」
    /鼠标|键盘|右键|左键|空格|回车|方向键|(?:^|·\s*)[A-Z]\s*(?:\/\s*Esc\s*)?[一-龥]/,
];

const pages = registry.all().filter(g => keepPage(g.id));
exitIfNoPages(pages, 'verify-touch-hints');

const fails = [];
let passes = 0;
const check = (cond, label, extra = '') => {
    if (cond) passes++;
    else fails.push(`${label}${extra !== '' ? ' —— ' + extra : ''}`);
};

const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: LAUNCH_ARGS });

async function readHint(g, lang, touch) {
    const page = await browser.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e.message || e).split('\n')[0]));
    await page.setViewport(touch
        ? { width: 390, height: 664, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
        : { width: 1280, height: 800, deviceScaleFactor: 1 });
    await page.setBypassServiceWorker(true);
    await page.setRequestInterception(true);
    page.on('request', r => (r.url().startsWith(ORIGIN) ? r.continue() : r.abort()));
    await page.evaluateOnNewDocument(l => {
        try { localStorage.setItem('site_lang', l); } catch { /* private mode */ }
    }, lang);
    await page.goto(`${BASE}/${g.href}`, { waitUntil: 'load', timeout: 30000 });
    const coarse = await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches);
    const present = await page.$('.game-footer-hint');
    let text = null;
    if (present) {
        await page.waitForFunction(() => document.querySelector('.game-footer-hint').textContent.trim().length > 0, { timeout: 15000 })
            .catch(() => {});
        text = await page.$eval('.game-footer-hint', el => el.textContent.trim());
    }
    await page.close();
    return { coarse, text, errs };
}

for (const g of pages) {
    for (const lang of ['zh', 'en']) {
        const touch = await readHint(g, lang, true);
        check(touch.coarse, `${g.id}/${lang}: 触屏视口下 (pointer: coarse) 成立（否则本校验器测不到触屏文案）`);
        if (touch.text === null) continue;   // 没有页脚提示的页（math-rain / tank-battle）
        check(touch.errs.length === 0, `${g.id}/${lang}: 无 pageerror`, touch.errs.join(' | '));
        check(touch.text.length > 0, `${g.id}/${lang}: 触屏页脚提示非空`);
        const hit = KEY_MOUSE.find(re => re.test(touch.text));
        check(!hit, `${g.id}/${lang}: 触屏页脚提示不含键鼠说明`, `"${touch.text}"`);
        if (!TOUCH_PAGES.has(g.id)) continue;
        const desk = await readHint(g, lang, false);
        check(!desk.coarse, `${g.id}/${lang}: 桌面视口下 (pointer: coarse) 不成立`);
        check(desk.text && desk.text !== touch.text, `${g.id}/${lang}: 桌面仍显示键鼠版提示（与触屏不同）`, `desktop="${desk.text}" touch="${touch.text}"`);
    }
}

const covered = new Set(registry.all().map(g => g.id));
const stale = [...TOUCH_PAGES].filter(id => !covered.has(id));
check(stale.length === 0, 'TOUCH_PAGES 里没有已删除 / 拼错的页面', stale.join(', '));

await browser.close();
if (fails.length) {
    console.error(`✗ verify-touch-hints (${passes} passed, ${fails.length} failed)`);
    for (const f of fails) console.error(`  - ${f}`);
    process.exit(1);
}
console.log(`✓ verify-touch-hints (${passes} checks)`);
