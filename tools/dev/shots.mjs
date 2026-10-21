// 布局截图 + 控制台错误巡检：node tools/dev/shots.mjs [outDir] [baseUrl]
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from '../lib/browser.mjs';
import { registry } from '../lib/registry.mjs';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = CHROME_PATH;
const OUT = process.argv[2] || join(tmpdir(), 'shots');
const BASE = process.argv[3] || 'http://127.0.0.1:8899';

const PAGES = (process.env.PAGES || registry.all().map(g => g.id).join(',')).split(',');

const VIEWPORTS = process.env.SHOTS_VIEWPORTS
    ? process.env.SHOTS_VIEWPORTS.split(',').map(spec => {
        const [width, height] = spec.split('x').map(Number);
        if (!width || !height) throw new Error('Invalid SHOTS_VIEWPORTS: ' + spec);
        return { tag: width <= 480 ? 'm' + width : 'd' + width, width, height };
    })
    : [{ tag: 'm', width: 390, height: 844 }, { tag: 'd', width: 1280, height: 900 }];
const LANGS = (process.env.LANGS || 'default').split(',');

await mkdir(OUT, { recursive: true });
const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: LAUNCH_ARGS,
});

for (const name of PAGES) {
    const problems = [];
    for (const lang of LANGS) for (const vp of VIEWPORTS) {
        const page = await browser.newPage();
        await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });
        if (lang !== 'default') await page.evaluateOnNewDocument(l => {
            try { localStorage.setItem('site_lang', l); } catch { /* private mode */ }
        }, lang);
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
        await page.screenshot({ path: `${OUT}/${name}-${vp.tag}${lang === 'default' ? '' : '-' + lang}.png` });
        await page.close();
    }
    const uniq = [...new Set(problems)];
    console.log(`${name.padEnd(20)} ${uniq.length ? uniq.slice(0, 6).join(' | ') : 'OK'}`);
}
await browser.close();
