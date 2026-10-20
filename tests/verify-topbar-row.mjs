// 窄屏顶栏单行校验：node tests/verify-topbar-row.mjs [baseUrl]
//
// 断言（topbar cap 的每页 × 320×568 / 375×553 × zh / en，首屏）：
//   ① 顶栏所有控件（含 visibility:hidden 的 —— 它们照样占位）垂直中心落在同一行。
//      minesweeper 的「Home · 雷数 · 笑脸 · 计时 · 暂停 · 声音」在 320px 差 4px，
//      计时器被挤到第二行、顶栏高 92px，把开始界面压得很挤（PR #169 截图复盘）。
//      tower-defense 的两行顶栏是设计（见 src/platform/game-frame.js 头注），列入 TWO_ROW。
//   ② 顶栏里的文字不得被省略号截断：reversi 的「AI · Medium」曾被 max-width: 52px 截成「AI · Me…」。
//   ③ START_HUD 表里的页：开始界面打开时，局内 HUD（计数器 / 比分卡 / 暂停）不可见；
//      点开始后必须恢复可见 —— 防止「藏了就再也不出来」。
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { keepPage, exitIfNoPages } from './lib/page-filter.mjs';
import { registry } from './lib/registry.mjs';

const BASE = process.argv.slice(2).find(a => a.startsWith('http')) || 'http://127.0.0.1:8899';
const PAGES = registry.withCap('topbar').map(g => g.id).filter(keepPage);
exitIfNoPages(PAGES, 'verify-topbar-row');

const TWO_ROW = new Set(['tower-defense']);
const START_HUD = {
    reversi: { start: '#rv-start', play: '#rv-btn-play', hud: ['.rv-topbar-center'] },
    minesweeper: { start: '#ms-start', play: '#ms-btn-play', hud: ['.ms-topbar-center', '#ms-btn-pause'] },
};
const VIEWPORTS = [[320, 568], [375, 553]];

const fails = [];
let checks = 0;
const check = (ok, msg) => { checks++; if (!ok) fails.push(msg); };

const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: LAUNCH_ARGS });

for (const id of PAGES) {
    for (const [w, h] of VIEWPORTS) {
        for (const lang of ['zh', 'en']) {
            const tag = `${id}@${w}x${h}/${lang}`;
            const page = await browser.newPage();
            await page.setViewport({ width: w, height: h });
            await page.evaluateOnNewDocument(l => {
                try { localStorage.setItem('site_lang', l); } catch (e) { /* 隐私模式 */ }
            }, lang);
            try {
                await page.goto(`${BASE}/${id}.html`, { waitUntil: 'load', timeout: 25000 });
            } catch {
                check(false, `${tag}: 页面加载超时`);
                await page.close();
                continue;
            }
            await page.waitForFunction(() => document.fonts.status === 'loaded', { timeout: 5000 }).catch(() => {});
            await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

            const snap = await page.evaluate(() => {
                const tb = document.querySelector('.game-topbar');
                if (!tb) return null;
                const laidOut = e => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0;
                const items = [...tb.querySelectorAll('button, .game-topbar-center > *')].filter(laidOut);
                const mids = items.map(e => { const r = e.getBoundingClientRect(); return r.top + r.height / 2; });
                const truncated = [...tb.querySelectorAll('*')]
                    .filter(e => laidOut(e) && e.children.length === 0 && e.textContent.trim()
                        && getComputedStyle(e).textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth + 1)
                    .map(e => `${e.id || e.className}「${e.textContent.trim()}」`);
                return {
                    height: Math.round(tb.getBoundingClientRect().height),
                    spread: mids.length ? Math.round(Math.max(...mids) - Math.min(...mids)) : 0,
                    truncated,
                };
            });
            if (!snap) {
                check(false, `${tag}: 没有 .game-topbar`);
                await page.close();
                continue;
            }
            if (!TWO_ROW.has(id))
                check(snap.spread <= 12, `${tag}: 顶栏折成多行（控件中心高差 ${snap.spread}px，顶栏高 ${snap.height}px）`);
            check(snap.truncated.length === 0, `${tag}: 顶栏文字被截断：${snap.truncated.join(', ')}`);

            const spec = START_HUD[id];
            if (spec) {
                const visible = () => page.evaluate((s) => s.hud.map(sel => [...document.querySelectorAll(sel)]
                    .every(e => getComputedStyle(e).visibility === 'visible' && getComputedStyle(e).display !== 'none')), spec);
                const startOpen = await page.evaluate(s => !document.querySelector(s.start)?.classList.contains('hidden'), spec);
                check(startOpen, `${tag}: 首屏应是开始界面`);
                const before = await visible();
                spec.hud.forEach((sel, i) => check(!before[i], `${tag}: 开始界面打开时 ${sel} 仍可见（局内状态不该出现在开局前）`));
                await page.click(spec.play);
                await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
                const after = await visible();
                spec.hud.forEach((sel, i) => check(after[i], `${tag}: 开局后 ${sel} 没有恢复可见`));
            }
            await page.close();
        }
    }
}

await browser.close();

if (fails.length) {
    console.log(`\n✗ verify-topbar-row：${fails.length} 项失败（${checks} 项断言）`);
    fails.forEach(f => console.log('  ✗ ' + f));
    process.exit(1);
}
console.log(`✓ verify-topbar-row：${checks} 项断言通过（${PAGES.length} 页 × ${VIEWPORTS.length} 视口 × 2 语言）`);
