// tank-battle P4-2 冒烟：main/h1 语义 + 横屏布局未被 layout.css 破坏 + canvas 渲染
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';

const BASE = process.argv[2] || 'http://127.0.0.1:8895';
const fails = [];
const fail = m => fails.push(m);

const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_BIN || CHROME_PATH,
    headless: 'new',
    args: [...LAUNCH_ARGS, '--auto-accept-this-tab-capture'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 }); // 桌面横屏
const errs = [];
page.on('pageerror', e => errs.push(String(e.message || e).split('\n')[0]));
await page.evaluateOnNewDocument(() => {
    try { localStorage.setItem('site_lang', 'zh'); } catch (e) { /* ignore */ }
});
await page.goto(`${BASE}/tank-battle.html`, { waitUntil: 'networkidle0', timeout: 30000 });
await new Promise(r => setTimeout(r, 800)); // 等游戏初始化

const snap = await page.evaluate(() => {
    const cv = document.getElementById('gameCanvas');
    const r = cv ? cv.getBoundingClientRect() : null;
    const container = document.getElementById('gameContainer');
    const cr = container ? container.getBoundingClientRect() : null;
    return {
        mainTag: !!document.querySelector('main.tb-main'),
        h1: document.querySelector('h1.sr-only')?.textContent || '',
        h1Hidden: (() => {
            const el = document.querySelector('h1.sr-only');
            if (!el) return false;
            const rect = el.getBoundingClientRect();
            return rect.width <= 2 && rect.height <= 2;
        })(),
        canvasSize: cv ? `${cv.width}x${cv.height}` : 'missing',
        canvasVisible: r ? (r.width > 100 && r.height > 100) : false,
        containerCentered: cr ? Math.abs((window.innerWidth - cr.width) / 2 - cr.left) < 60 : false,
        hud: !!document.getElementById('gameInfo'),
        virtualControllerHidden: (() => {
            const vc = document.getElementById('virtualController');
            return vc ? getComputedStyle(vc).display === 'none' : false;
        })(),
        layoutVarApplied: (() => {
            // layout.css 引入生效证据：页面能读到共享 token
            return getComputedStyle(document.documentElement).getPropertyValue('--tok-bg').trim() !== '';
        })(),
        bodyFlex: getComputedStyle(document.body).display === 'flex',
    };
});

if (errs.length) fail(`页面错误: ${errs.join(' | ')}`);
if (!snap.mainTag) fail('缺 <main class="tb-main">');
if (!snap.h1) fail('缺 h1.sr-only');
if (!snap.h1Hidden) fail('h1 未被视觉隐藏');
if (snap.canvasSize !== '800x600') fail(`canvas 尺寸异常: ${snap.canvasSize}`);
if (!snap.canvasVisible) fail('canvas 不可见（布局被破坏？）');
if (!snap.containerCentered) fail('游戏容器未居中（body flex 被破坏？）');
if (!snap.hud) fail('缺 HUD (#gameInfo)');
if (!snap.virtualControllerHidden) fail('桌面端虚拟手柄应为 display:none');
if (!snap.layoutVarApplied) fail('--tok-bg 未定义（layout/tokens 未生效）');
if (!snap.bodyFlex) fail('body flex 居中被 layout.css 破坏');

await browser.close();
if (fails.length) {
    console.error('✗ smoke-tank-battle');
    for (const f of fails) console.error(`  - ${f}`);
    process.exit(1);
}
console.log('smoke-tank-battle：main/h1 语义 + 横屏布局 + canvas/HUD 全部通过 ✅');
