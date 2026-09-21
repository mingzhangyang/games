// 探测各页移动端「内容超出视口但仍不可滚」的情况（body 脱流 / html 无滚动盒）
// 用法: node scripts/probe-reach.mjs <baseUrl>
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';

const EXE = CHROME_PATH;
const BASE = process.argv[2] || 'http://127.0.0.1:8900';

const PAGES = [
    'gravity-slingshot', 'hoop-shot', 'planet-merge', 'sword-flight', 'needle-awn',
    'tower-defense', 'reversi', 'minesweeper', 'word-daily', 'gomoku', 'tetris',
];

const browser = await puppeteer.launch({
    executablePath: EXE,
    headless: 'new',
    args: LAUNCH_ARGS,
});

console.log('\n页面                  视口  内容底边  可滚高  能滚?  滚动后真位移?  body position   结论');
console.log('─'.repeat(126));

for (const name of PAGES) {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    try {
        await page.goto(`${BASE}/${name}.html`, { waitUntil: 'networkidle2', timeout: 20000 });
    } catch (e) { console.log(`${name.padEnd(20)} goto failed`); await page.close(); continue; }
    await new Promise(r => setTimeout(r, 400));

    const m = await page.evaluate(() => {
        const sc = document.scrollingElement;
        const bcs = getComputedStyle(document.body);
        // 页面上所有可见元素的最大底边
        let maxBottom = 0, deepest = '';
        for (const el of document.querySelectorAll('body *')) {
            const r = el.getBoundingClientRect();
            if (r.width < 2 || r.height < 2) continue;
            const s = getComputedStyle(el);
            if (s.position === 'fixed' || s.visibility === 'hidden' || s.display === 'none') continue;
            const abs = r.bottom + window.scrollY;
            if (abs > maxBottom) { maxBottom = abs; deepest = el.id || el.className || el.tagName; }
        }
        return {
            viewH: window.innerHeight,
            contentBottom: Math.round(maxBottom),
            deepest: String(deepest).slice(0, 30),
            scrollH: sc.scrollHeight,
            canScroll: sc.scrollHeight > window.innerHeight + 1,
            bodyPos: bcs.position,
            bodyOverflowY: bcs.overflowY,
        };
    });

    // 真正调用滚动 API，确认能不能动
    await page.evaluate(() => {
        const sc = document.scrollingElement;
        sc.scrollTop = 500;
        return sc.scrollTop;
    });
    await new Promise(r => setTimeout(r, 120));
    const after = await page.evaluate(() => document.scrollingElement.scrollTop);

    const clipped = Math.max(0, m.contentBottom - m.viewH);
    let verdict = '正常';
    if (clipped > 4 && after === 0) verdict = `❌ 内容超出 ${clipped}px 但滚不动（${m.deepest}）`;
    else if (clipped > 4 && !m.canScroll) verdict = `❌ 内容超出 ${clipped}px，canScroll=false`;
    else if (clipped > 4) verdict = `内容超出 ${clipped}px，可滚 ✓`;

    console.log(
        `${name.padEnd(20)} ${String(m.viewH).padEnd(5)} ${String(m.contentBottom).padEnd(9)} ${String(m.scrollH).padEnd(7)} ${String(m.canScroll).padEnd(6)} ${String(after > 0).padEnd(13)} ${m.bodyPos.padEnd(15)} ${verdict}`
    );
    await page.close();
}

await browser.close();
