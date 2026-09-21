/**
 * 前景色 / 字体审计：捕获「继承链断掉」导致的不可见元素。
 *
 * 判据（精确、不猜背景——本仓库 13 页都是深色底）：
 *   1) 可见元素的 color 解析为纯黑 rgb(0,0,0) / 全透明  → 深色底上必然看不见
 *   2) 可见元素的 font-family 落到浏览器默认（Times New Roman）→ body 的字体声明丢了
 *
 * 维护背景：布局迁移曾把各页 body 的 color/font-family 当成几何属性剪掉，共享层又没有替代，
 * 结果顶栏图标变纯黑不可见、全页退回衬线默认字体。
 * 用法：node scripts/fg-audit.mjs [baseUrl]
 */
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.argv[2] || 'http://127.0.0.1:8899';
const ROOT = path.resolve(import.meta.dirname, '..');
const EXE = CHROME_PATH;

const pages = (await readdir(ROOT)).filter(f => f.endsWith('.html') && f !== 'index.html').sort();

const browser = await puppeteer.launch({
    executablePath: EXE,
    headless: 'new',
    args: LAUNCH_ARGS,
});

let bad = 0;
for (const file of pages) {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844 });
    await page.goto(`${BASE}/${file}`, { waitUntil: 'networkidle2' }).catch(() => { });
    await new Promise(r => setTimeout(r, 800));

    const res = await page.evaluate(() => {
        const isTransparent = (c) => /rgba\(0, 0, 0, 0\)/.test(c);
        const black = [];
        const serif = [];
        for (const el of document.querySelectorAll('body *')) {
            if (el.children.length) continue;
            const txt = (el.textContent || '').trim();
            const hasIcon = !!el.querySelector?.('svg') || el.tagName.toLowerCase() === 'svg' || el.tagName.toLowerCase() === 'path';
            if (!txt && !hasIcon) continue;
            /* 纯 emoji / 纯符号内容的颜色由字形自身决定，与 color 无关 → 跳过 */
            if (txt && !/[\p{L}\p{N}]/u.test(txt)) continue;
            const cs = getComputedStyle(el);
            const box = el.getBoundingClientRect();
            if (!box.width || !box.height || cs.visibility === 'hidden' || cs.opacity === '0' || cs.display === 'none') continue;
            const label = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') +
        (el.className ? '.' + el.className.toString().split(' ')[0] : '');
            if (cs.color === 'rgb(0, 0, 0)' || isTransparent(cs.color)) {
                black.push({ el: label, txt: txt.slice(0, 14) });
            }
            if (/^(Times New Roman|serif|Times)$/.test(cs.fontFamily)) {
                serif.push({ el: label, txt: txt.slice(0, 14) });
            }
        }
        return {
            black: black.slice(0, 6), blackCount: black.length,
            serif: serif.slice(0, 6), serifCount: serif.length,
            bodyColor: getComputedStyle(document.body).color,
            bodyFont: getComputedStyle(document.body).fontFamily.split(',')[0],
        };
    }).catch(e => ({ error: String(e) }));

    if (res.error) { console.log(`ERR   ${file}  ${res.error}`); await page.close(); continue; }
    const fail = res.blackCount > 0 || res.serifCount > 0;
    if (fail) bad++;
    console.log(`${fail ? 'FAIL' : ' ok '}  ${file.padEnd(24)} body=${res.bodyColor.padEnd(16)} font=${res.bodyFont.padEnd(12)} 纯黑=${res.blackCount} 衬线默认=${res.serifCount}`);
    for (const b of res.black) console.log(`        黑: ${b.el}  "${b.txt}"`);
    for (const s of res.serif) console.log(`        字体回退: ${s.el}  "${s.txt}"`);
    await page.close();
}

await browser.close();
console.log(bad ? `\n${bad} 个页面存在不可见元素或字体回退` : '\n全部页面前景色与字体正常');
process.exit(bad ? 1 : 0);
