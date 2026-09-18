// 布局截图 + 控制台错误巡检：node scripts/shots.mjs [outDir] [baseUrl]
import puppeteer from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';

const CHROME = process.env.CHROME_BIN ||
    'C:\\Users\\mingz\\.cache\\puppeteer\\chrome\\win64-119.0.6045.105\\chrome-win64\\chrome.exe';
const OUT = process.argv[2] || 'C:/Users/mingz/AppData/Local/Temp/shots';
const BASE = process.argv[3] || 'http://127.0.0.1:8899';

const PAGES = (process.env.PAGES || [
    'gravity-slingshot', 'hoop-shot', 'planet-merge', 'sword-flight', 'needle-awn',
    'tower-defense', 'reversi', 'minesweeper', 'word-daily', 'gomoku', 'tetris',
    'tank-battle', 'math-rain',
].join(',')).split(',');

const VIEWPORTS = [
    { tag: 'm', width: 390, height: 844 },
    { tag: 'd', width: 1280, height: 900 },
];

await mkdir(OUT, { recursive: true });
const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-first-run', '--disable-gpu', '--hide-scrollbars', '--mute-audio'],
});

for (const name of PAGES) {
    const problems = [];
    for (const vp of VIEWPORTS) {
        const page = await browser.newPage();
        await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });
        page.on('console', m => {
            if (m.type() === 'error') problems.push(`[console] ${m.text()}`);
        });
        page.on('pageerror', e => problems.push(`[pageerror] ${e.message}`));
        page.on('requestfailed', r => problems.push(`[404?] ${r.url()} ${r.failure()?.errorText}`));
        try {
            await page.goto(`${BASE}/${name}.html`, { waitUntil: 'networkidle2', timeout: 20000 });
        } catch (e) {
            problems.push(`[goto] ${e.message}`);
        }
        await new Promise(r => setTimeout(r, 900));
        await page.screenshot({ path: `${OUT}/${name}-${vp.tag}.png` });
        await page.close();
    }
    const uniq = [...new Set(problems)];
    console.log(`${name.padEnd(20)} ${uniq.length ? uniq.slice(0, 6).join(' | ') : 'OK'}`);
}
await browser.close();
