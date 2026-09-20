// 命中栈探针：确认 .theme-toggle::after（position: absolute，但 .theme-toggle 是 static）
// 是否把热区外扩解析成了整个 .game-container，从而盖住同排更早出现的 Home 钮。
// 用法：node scripts/probe-hit-stack.mjs http://127.0.0.1:8921
import puppeteer from 'puppeteer-core';
import { CHROME_PATH } from './lib/browser.mjs';
import { existsSync } from 'node:fs';

const EXE = [CHROME_PATH].find(existsSync);
const BASE = process.argv[2] || 'http://127.0.0.1:8921';

const browser = await puppeteer.launch({ executablePath: EXE, headless: 'new', args: ['--no-sandbox'] });

for (const vp of [
    { name: '移动端 390×844', width: 390, height: 844, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
    { name: '桌面端 1280×900', width: 1280, height: 900, deviceScaleFactor: 1 },
]) {
    console.log('\n=== ' + vp.name + ' ===');
    const page = await browser.newPage();
    await page.setViewport(vp);
    await page.goto(BASE + '/tetris.html', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 700));

    const out = await page.evaluate(() => {
        const tag = el => (el.id || el.className || el.tagName);
        const stack = (x, y) => document.elementsFromPoint(x, y).slice(0, 4).map(tag);
        const home = document.getElementById('homeBtn').getBoundingClientRect();
        const tt = document.getElementById('themeToggle').getBoundingClientRect();
        const c = document.getElementById('tetris').getBoundingClientRect();
        const score = document.getElementById('score').getBoundingClientRect();
        return {
            themeTogglePositioned: getComputedStyle(document.getElementById('themeToggle')).position,
            containerBox: (() => { const r = document.querySelector('.game-container').getBoundingClientRect(); return `${r.width.toFixed(0)}×${r.height.toFixed(0)}@${r.x.toFixed(0)},${r.y.toFixed(0)}`; })(),
            homeBtnCenter: stack(home.x + home.width / 2, home.y + home.height / 2),
            homeBtnCenterTopElement: tag(document.elementFromPoint(home.x + home.width / 2, home.y + home.height / 2)),
            themeToggleCenter: stack(tt.x + tt.width / 2, tt.y + tt.height / 2),
            belowToggle40: stack(tt.x + tt.width / 2, tt.y + tt.height / 2 + 40),
            leftOfToggle120: stack(tt.x - 120, tt.y + tt.height / 2),
            boardCenter: stack(c.x + c.width / 2, c.y + c.height / 2),
            scoreCenter: stack(score.x + score.width / 2, score.y + score.height / 2),
        };
    });
    console.log(JSON.stringify(out, null, 2));

    // 功能性验证：真的点 Home 钮，看是否跳转
    if (vp.width < 500) {
        const before = page.url();
        await page.click('#homeBtn').catch(e => console.log('click 异常: ' + e.message));
        await new Promise(r => setTimeout(r, 900));
        console.log('点击 Home 钮: ' + before + '  →  ' + page.url() + (page.url() !== before ? '  ✅ 跳转了' : '  ❌ 没跳转'));
    }
    await page.close();
}

await browser.close();
