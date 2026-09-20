// 盘点各游戏页「移动端顶栏 + 信息面板去向」
// 用法: node scripts/probe-headers.mjs <baseUrl>
import puppeteer from 'puppeteer-core';
import { CHROME_PATH } from './lib/browser.mjs';
import { existsSync } from 'node:fs';

const EXE = process.env.CHROME_BIN ||
    CHROME_PATH;
const BASE = process.argv[2] || 'http://127.0.0.1:8900';

const PAGES = [
    'gravity-slingshot', 'hoop-shot', 'planet-merge', 'sword-flight', 'needle-awn',
    'tower-defense', 'reversi', 'minesweeper', 'word-daily', 'gomoku', 'tetris',
];

const browser = await puppeteer.launch({
    executablePath: EXE,
    headless: 'new',
    args: ['--no-first-run', '--disable-gpu', '--hide-scrollbars', '--mute-audio'],
});

const rows = [];
for (const name of PAGES) {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e).slice(0, 60)));
    try {
        await page.goto(`${BASE}/${name}.html`, { waitUntil: 'networkidle2', timeout: 20000 });
    } catch (e) {
        await page.close();
        rows.push({ name, err: 'goto failed' });
        continue;
    }
    await new Promise(r => setTimeout(r, 400));

    const m = await page.evaluate(() => {
        const vis = el => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
        };
        const label = el => {
            const t = el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent.trim().slice(0, 14);
            return t || el.className.split(' ')[0];
        };
        const topbar = document.querySelector('.game-topbar');
        const buttons = topbar ? [...topbar.querySelectorAll('button, a')]. map(label) : [];
        // 顶栏有几个「图标钮」（视觉上是纯图标方钮）
        const iconBtns = topbar ? [...topbar.querySelectorAll('.game-icon-btn')].length : 0;
        const side = document.querySelector('.game-sidebar');
        const sideFlag = side
            ? (vis(side) ? 'visible' : 'hidden')
            : 'none';
        // 侧栏在移动端的实际位置（是否被推到首屏之外）
        let sideTop = null, sideBelowFold = null;
        if (side && vis(side)) {
            const r = side.getBoundingClientRect();
            sideTop = Math.round(r.top);
            sideBelowFold = r.top > window.innerHeight;
        }
        const cs = side ? getComputedStyle(side) : null;
        // 页面可滚高度 vs 视口
        const sc = document.scrollingElement;
        return {
            buttons,
            iconBtns,
            sideFlag,
            sideDisplay: cs ? cs.display : null,
            sideTop,
            sideBelowFold,
            scrollH: sc.scrollHeight,
            viewH: window.innerHeight,
            canScroll: sc.scrollHeight > window.innerHeight + 1,
        };
    });
    rows.push({ name, ...m, errs: errs.slice(0, 2) });
    await page.close();
}

console.log('\n页面                  顶栏按钮                                                     侧栏(移动端)      可滚高/视口');
console.log('─'.repeat(140));
for (const r of rows) {
    if (r.err) { console.log(`${r.name.padEnd(20)} ${r.err}`); continue; }
    const btns = r.buttons.join(' | ').slice(0, 58);
    const side = r.sideFlag === 'none' ? '无侧栏' :
        `${r.sideFlag}${r.sideBelowFold ? '(首屏外 y' + r.sideTop + ')' : '(y' + r.sideTop + ')'}`;
    console.log(
        `${r.name.padEnd(20)} ${btns.padEnd(60)} ${(side + ' ' + (r.sideDisplay || '')).padEnd(26)} ${r.scrollH}/${r.viewH}${r.canScroll ? ' ✓可滚' : ''}`
    );
    if (r.errs.length) console.log(`   ⚠ ${r.errs.join('; ')}`);
}

await browser.close();
