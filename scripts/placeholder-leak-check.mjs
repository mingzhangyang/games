/**
 * 全站文案模板占位符泄漏扫描：加载每个游戏页，扫描可见文本/属性/输入框 placeholder，
 * 报告残留的未展开占位符（形如 {n} {g} {who} {lives}）。
 * 用法：node scripts/placeholder-leak-check.mjs [baseUrl]
 */
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.argv[2] || 'http://127.0.0.1:8899';
const ROOT = path.resolve(import.meta.dirname, '..');
const EXE = CHROME_PATH;

const pages = (await readdir(ROOT))
    .filter(f => f.endsWith('.html') && f !== 'index.html')
    .sort();

const browser = await puppeteer.launch({
    executablePath: EXE,
    headless: 'new',
    args: LAUNCH_ARGS,
});

let total = 0;
for (const file of pages) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(`${BASE}/${file}`, { waitUntil: 'networkidle2' }).catch(() => { });
    await new Promise(r => setTimeout(r, 900));

    /* 尝试触发一轮交互：点掉开始遮罩，让游戏进入进行中状态 */
    await page.evaluate(() => {
        const cand = [...document.querySelectorAll('button, [role=button]')]
            .filter(b => /start|play|开始/i.test(b.textContent || '') && b.offsetParent !== null);
        cand[0]?.click();
    }).catch(() => { });
    await new Promise(r => setTimeout(r, 600));

    const hits = await page.evaluate(() => {
        const PH = /\{[a-z][a-z0-9_]*\}/g;
        const out = [];
        const push = (src, txt) => { if (txt && PH.test(txt)) out.push({ src, txt: txt.trim().slice(0, 90) }); };

        // 可见文本（逐元素，便于定位）
        for (const el of document.querySelectorAll('body *')) {
            if (el.children.length === 0 && el.textContent) push(el.tagName.toLowerCase() + (el.id ? '#' + el.id : '.' + (el.className || '').toString().split(' ')[0]), el.textContent);
        }
        // 常见承载文案的属性
        for (const el of document.querySelectorAll('[placeholder],[title],[aria-label],[data-tip]')) {
            for (const a of ['placeholder', 'title', 'aria-label', 'data-tip']) {
                push(el.tagName.toLowerCase() + '[' + a + ']' + (el.id ? '#' + el.id : ''), el.getAttribute(a));
            }
        }
        return out;
    }).catch(() => []);

    total += hits.length;
    console.log(`${hits.length ? 'FAIL' : ' ok '}  ${file.padEnd(24)} leaks=${hits.length}`);
    for (const h of hits) console.log(`        ${h.src}  ->  ${h.txt}`);
    await page.close();
}

await browser.close();
console.log(total ? `\n发现 ${total} 处未展开占位符` : '\n全站无未展开占位符');
process.exit(total ? 1 : 0);
