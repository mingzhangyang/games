// 各机型：移动端棋盘几何 vs 固定底栏，量「棋盘有多少被底栏遮住」
// 以及「底栏上方还有多少横向空隙可以起手滚动」（棋盘自身 touch-action:none，起手在棋盘上滚不动）。
import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';
const EXE = ['C:/Users/mingz/.cache/puppeteer/chrome/win64-119.0.6045.105/chrome-win64/chrome.exe'].find(existsSync);
const BASE = process.argv[2] || 'http://127.0.0.1:8923';
const browser = await puppeteer.launch({ executablePath: EXE, headless: 'new', args: ['--no-sandbox'] });

for (const [w, h] of [[320, 568], [360, 640], [360, 740], [375, 667], [390, 844], [412, 915]]) {
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    await page.goto(BASE + '/tetris.html', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 500));
    const m = await page.evaluate(() => {
        const b = document.getElementById('tetris').getBoundingClientRect();
        const bar = document.querySelector('.mobile-controls').getBoundingClientRect();
        const g = (x, y) => { const el = document.elementFromPoint(x, y); return el ? (el.id || el.className || el.tagName) : null; };
        const y = bar.y - 10;
        const free = [];
        for (let x = 1; x < window.innerWidth; x += 4) {
            const t = String(g(x, y) || '');
            if (!/tetris|board|stage/.test(t)) free.push(x);
        }
        return {
            boardTop: +b.y.toFixed(0),
            boardBottom: +b.bottom.toFixed(0),
            boardH: +(b.bottom - b.y).toFixed(0),
            boardW: +b.width.toFixed(0),
            barTop: +bar.y.toFixed(0),
            hidden: +Math.max(0, b.bottom - bar.y).toFixed(0),
            freeCount: free.length,
            freeRange: free.length ? [free[0], free[free.length - 1]] : null,
            scrollable: document.scrollingElement.scrollHeight > window.innerHeight + 1,
        };
    });
    console.log(`${w}×${h}: 棋盘 ${m.boardW}×${m.boardH} (y ${m.boardTop}..${m.boardBottom}) | 底栏顶边 ${m.barTop} | 棋盘被遮 ${m.hidden}px | 底栏上方非棋盘横向位 ${m.freeCount} (x ${JSON.stringify(m.freeRange)}) | 可滚=${m.scrollable}`);
    await page.close();
}
await browser.close();
