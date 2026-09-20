#!/usr/bin/env node
/**
 * smoke-lumen — lumen 页运行时冒烟 + 最小可玩性路径。
 *
 * 几何/元素存在性只能证明"页面长得对"，测不出"游戏能玩"（见 docs/traps.md 教训）。
 * 本脚本走一条真实交互链：
 *   menu → startLevel(0) → canvas 位图非空 → mouse 点击 L1 镜面 (4,6)
 *   → 光路点亮水晶 → solved → 结算面板出现 → HUD flips=1 → 星级写入 lm_stars。
 *
 * 语言态显式 setItem('site_lang', 'zh')（headless 默认 en-US 教训）。
 */
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';

const BASE = process.argv.find(a => a.startsWith('http')) || 'http://127.0.0.1:8899';
const fails = [];
const fail = m => fails.push(m);

const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_BIN || CHROME_PATH,
    headless: 'new',
    args: LAUNCH_ARGS,
});

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
const errs = [];
const consoleErrors = [];
page.on('pageerror', e => errs.push(String(e.message || e).split('\n')[0]));
page.on('console', msg => {
    if (msg.type() !== 'error') return;
    // 资源加载失败的 console 文本不带 URL，拼上 location.url 供白名单精确匹配
    const url = (msg.location() && msg.location().url) || '';
    consoleErrors.push(`${msg.text().split('\n')[0]} @ ${url}`);
});
await page.evaluateOnNewDocument(() => {
    try {
        localStorage.clear();
        localStorage.setItem('site_lang', 'zh');
    } catch (e) { /* ignore */ }
});
await page.goto(`${BASE}/lumen.html`, { waitUntil: 'networkidle0', timeout: 45000 });
await new Promise(r => setTimeout(r, 900)); // 等模块图 + 首帧渲染

/* ── 1. bootstrap：句柄 / 初始态 ── */
const boot = await page.evaluate(() => ({
    hasGame: !!window.lmGame,
    hasDrawer: !!window.lmDrawer,
    state: window.lmGame ? window.lmGame.state : null,
    startVisible: !document.getElementById('lm-start').classList.contains('hidden'),
    hudLevel: document.getElementById('lm-hud-level').textContent,
    titleZh: document.title,
    lbMoreCards: document.querySelectorAll('#lmSideMore a').length,
    canvasW: document.getElementById('lm-canvas').width,
}));
if (!boot.hasGame) fail('window.lmGame 未创建（boot 失败）');
if (!boot.hasDrawer) fail('createStatsDrawer 未初始化');
if (boot.state !== 'menu') fail(`初始 state 应为 menu，got ${boot.state}`);
if (!boot.startVisible) fail('开始覆盖层未显示');
if (!boot.hudLevel.includes('关卡')) fail(`HUD 未走中文文案: ${boot.hudLevel}`);
if (!boot.titleZh.includes('折光')) fail(`document.title 未切中文: ${boot.titleZh}`);
if (boot.lbMoreCards < 1) fail('桌面侧栏「更多游戏」未渲染');
if (!boot.canvasW || boot.canvasW < 200) fail(`canvas 后端缓冲未按 CSS 尺寸重算: ${boot.canvasW}`);

/* ── 2. canvas 位图非空（菜单背景展示 L1 光路） ── */
const pixels = await page.evaluate(() => {
    const c = document.getElementById('lm-canvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
    return n;
});
if (pixels < 5000) fail(`canvas 位图接近空白（渲染循环未跑？）: ${pixels} px`);

/* ── 3. 启动 L1 → playing ── */
await page.evaluate(() => window.lmGame.startLevel(0));
await new Promise(r => setTimeout(r, 300));
const playing = await page.evaluate(() => ({
    state: window.lmGame.state,
    startHidden: document.getElementById('lm-start').classList.contains('hidden'),
    solvedBefore: window.lmGame.trace.solved,   // 初盘必须不可解（校验器也锁了这条）
    mirrorCh: window.lmGame.grid[4][6],
}));
if (playing.state !== 'playing') fail(`startLevel 后 state=${playing.state}`);
if (!playing.startHidden) fail('startLevel 后开始覆盖层未隐藏');
if (playing.solvedBefore) fail('L1 初盘即可解（初盘翻转丢失？）');
if (playing.mirrorCh !== '\\') fail(`L1 初盘 (4,6) 应为 '\\'，got '${playing.mirrorCh}'`);

/* ── 4. 真实点击镜面 (4,6) → solved → 结算 ── */
const box = await page.evaluate(() => {
    const r = document.getElementById('lm-canvas').getBoundingClientRect();
    // (4,6) 格中心（page 坐标）；CELL = clientWidth / 9
    return { x: r.left + (6 + 0.5) / 9 * r.width, y: r.top + (4 + 0.5) / 9 * r.height };
});
await page.mouse.click(box.x, box.y);
await new Promise(r => setTimeout(r, 1100)); // 650ms solveTimer + 余量

const after = await page.evaluate(() => ({
    state: window.lmGame.state,
    flips: document.getElementById('lm-flips').textContent,
    clearVisible: !document.getElementById('lm-clear').classList.contains('hidden'),
    stars: document.getElementById('lm-clear-stars').textContent,
    starsStored: JSON.parse(localStorage.getItem('lm_stars') || '[]')[0],
}));
if (after.state !== 'won-level') fail(`点击镜面后 state=${after.state}（光路/判胜失败）`);
if (after.flips !== '1') fail(`HUD flips 应为 1，got ${after.flips}`);
if (!after.clearVisible) fail('过关面板未显示');
if (!after.stars.includes('⭐')) fail(`星级未渲染: ${after.stars}`);
if (after.starsStored !== 3) fail(`L1 翻 1 次应为 3 星，got ${after.starsStored}`);

/* ── 5. 噪声过滤后的页面错误 ──
 * 源码树直跑的已知 404：manifest / icons / analytics / sw-register 由 vite build
 * 从 public/ 与 src/ 拷入 dist 根（与既有 smoke 的噪声口径一致）。 */
const IGNORABLE = [/analytics\.js/, /sw-register\.js/, /manifest/i, /CORS/i, /game-scores/i,
    /games-analytics/, /apple-touch-icon/, /favicon/i];
const noise = m => IGNORABLE.some(re => re.test(m));
for (const e of errs) if (!noise(e)) fail(`页面错误: ${e}`);
for (const c of consoleErrors) if (!noise(c)) fail(`console 错误: ${c}`);

await browser.close();
if (fails.length) {
    console.error('✗ smoke-lumen');
    for (const f of fails) console.error(`  - ${f}`);
    process.exit(1);
}
console.log('smoke-lumen：boot / 渲染 / 启动 / 点击翻镜 / 判胜 / 结算 / 星级 全部通过 ✅');
