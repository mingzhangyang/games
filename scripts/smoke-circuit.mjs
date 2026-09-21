#!/usr/bin/env node
/**
 * smoke-circuit — circuit 页运行时冒烟 + 最小可玩性路径。
 *
 * 几何/元素存在性只能证明"页面长得对"，测不出"游戏能玩"（见 docs/traps.md 教训）。
 * 本脚本走一条真实交互链：
 *   menu → startLevel(0) → canvas 位图非空 → mouse 点击 L1 开关格心
 *   → 电流接通 → solved → 结算面板出现 → HUD moves=1 → 星级写入 cc_stars。
 *
 * L1 par=1 且校验器锁定「初盘未解」⇒ 翻 1 次必然判胜（与 lumen smoke 同策略，
 * 但开关格坐标从 window.ccGame.spec 动态推导，不硬编码）。
 *
 * 语言态显式 setItem('site_lang', 'zh')（headless 默认 en-US 教训）。
 */
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';

const BASE = process.argv.find(a => a.startsWith('http')) || 'http://127.0.0.1:8899';
const fails = [];
const fail = m => fails.push(m);

const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
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
    const url = (msg.location() && msg.location().url) || '';
    consoleErrors.push(`${msg.text().split('\n')[0]} @ ${url}`);
});
await page.evaluateOnNewDocument(() => {
    try {
        localStorage.clear();
        localStorage.setItem('site_lang', 'zh');
    } catch (e) { /* ignore */ }
});
await page.goto(`${BASE}/circuit.html`, { waitUntil: 'networkidle0', timeout: 45000 });
await new Promise(r => setTimeout(r, 900)); // 等模块图 + 首帧渲染

/* ── 1. bootstrap：句柄 / 初始态 ── */
const boot = await page.evaluate(() => ({
    hasGame: !!window.ccGame,
    hasDrawer: !!window.ccDrawer,
    state: window.ccGame ? window.ccGame.state : null,
    startVisible: !document.getElementById('cc-start').classList.contains('hidden'),
    hudLevel: document.getElementById('cc-hud-level').textContent,
    titleZh: document.title,
    lbMoreCards: document.querySelectorAll('#ccSideMore a').length,
    canvasW: document.getElementById('cc-canvas').width,
    canvasH: document.getElementById('cc-canvas').height,
}));
if (!boot.hasGame) fail('window.ccGame 未创建（boot 失败）');
if (!boot.hasDrawer) fail('createStatsDrawer 未初始化');
if (boot.state !== 'menu') fail(`初始 state 应为 menu，got ${boot.state}`);
if (!boot.startVisible) fail('开始覆盖层未显示');
if (!boot.hudLevel.includes('关卡')) fail(`HUD 未走中文文案: ${boot.hudLevel}`);
if (!boot.titleZh.includes('电路')) fail(`document.title 未切中文: ${boot.titleZh}`);
if (boot.lbMoreCards < 1) fail('桌面侧栏「更多游戏」未渲染');
if (!boot.canvasW || boot.canvasW < 200) fail(`canvas 后端缓冲未按 CSS 尺寸重算: ${boot.canvasW}`);

/* ── 2. canvas 位图非空（菜单背景展示 L1 电路） ── */
const pixels = await page.evaluate(() => {
    const c = document.getElementById('cc-canvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
    return n;
});
if (pixels < 5000) fail(`canvas 位图接近空白（渲染循环未跑？）: ${pixels} px`);

/* ── 3. 启动 L1 → playing；动态找 L1 的可操作开关格坐标 ── */
await page.evaluate(() => window.ccGame.startLevel(0));
await new Promise(r => setTimeout(r, 300));
const target = await page.evaluate(() => {
    const g = window.ccGame;
    if (g.state !== 'playing') return null;
    if (!document.getElementById('cc-start').classList.contains('hidden')) return null;
    const i = g.spec.elements.findIndex(el => el.t === 'sw' || el.t === 'spdt');
    if (i < 0) return null;
    const el = g.spec.elements[i];
    return { r: el.r, c: el.c };
});
if (!target) fail('L1 启动失败（state/覆盖层/开关缺失）');
const preMoves = await page.evaluate(() => document.getElementById('cc-moves').textContent);
if (preMoves !== '0') fail(`初盘 moves 应为 0，got ${preMoves}`);

/* ── 4. 真实点击开关格心 → 电流接通 → solved → 结算 ──
 * L1 par=1 且初盘未解（verify-circuit-levels 锁定）⇒ 翻 1 次必然判胜。 */
const box = await page.evaluate(() => {
    const r = document.getElementById('cc-canvas').getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
});
await page.mouse.click(
    box.left + (target.c + 0.5) / 14 * box.width,
    box.top + (target.r + 0.5) / 10 * box.height,
);
await new Promise(r => setTimeout(r, 1100)); // 650ms solveTimer + 余量

const after = await page.evaluate(() => ({
    state: window.ccGame.state,
    moves: document.getElementById('cc-moves').textContent,
    clearVisible: !document.getElementById('cc-clear').classList.contains('hidden'),
    stars: document.getElementById('cc-clear-stars').textContent,
    starsStored: JSON.parse(localStorage.getItem('cc_stars') || '[]')[0],
}));
if (after.state !== 'won-level') fail(`点击开关后 state=${after.state}（电路/判胜失败）`);
if (after.moves !== '1') fail(`HUD moves 应为 1，got ${after.moves}`);
if (!after.clearVisible) fail('过关面板未显示');
if (!after.stars.includes('⭐')) fail(`星级未渲染: ${after.stars}`);
if (after.starsStored !== 3) fail(`L1 翻 1 次应为 3 星，got ${after.starsStored}`);

/* ── 5. 全关卡渲染回归：逐关 loadLevel + 强制 draw，捕获绘制期异常 ──
 * 教训：drawSwitch 的 spdt 分支曾把 {x,y} 对象直接塞进 forEach 解构
 * （`[o1,o2].forEach(([px,py]) => …)`）⇒ "object is not iterable"。
 * spdt 首次出现在 idx=6 (M2)，而 smoke 原先停在 L1 就结束 ⇒ 该崩溃 100% 漏网。
 * 注意：不能只抽前几关——前 6 关 (S1-S5/M1) 均无 spdt，只测前 5 关等于没测。
 * 这里遍历全部 20 关，逐关强制同步 draw() 若干帧并收集页面异常。 */
const levelErrors = [];
const levelCount = await page.evaluate(async () => {
    // LEVELS 未挂到 window，直接动态 import 数据层（与页面同一模块实例）
    try {
        const m = await import('/js/circuit-levels.js');
        return m.LEVELS.length;
    } catch (e) {
        return 0;
    }
});
if (!levelCount) fail('无法取得 LEVELS.length（回归遍历无法进行）');
let spdtSeen = 0;
for (let lv = 0; lv < levelCount; lv++) {
    const before = errs.length;
    const meta = await page.evaluate((i) => {
        const g = window.ccGame;
        g.startLevel(i);
        const spdt = g.spec.elements.filter(e => e.t === 'spdt').length;
        // 强制同步渲染（render 走 rAF；直接调 draw 立即触发开关绘制路径）。
        // 必须 try/catch：draw 抛错会直接终止 evaluate 并把异常冒泡出脚本，
        // 那样后续关卡不会被执行，也拿不到完整的失败清单。
        const drawErrs = [];
        try { g.draw(); } catch (e) { drawErrs.push('draw#1: ' + e.message); }
        try { g.draw(); } catch (e) { drawErrs.push('draw#2: ' + e.message); }
        return { spdt, state: g.state, drawErrs };
    }, lv);
    spdtSeen += meta.spdt;
    for (const de of meta.drawErrs) errs.push(`idx=${lv} ${de}`);
    await new Promise(r => setTimeout(r, 350));
    if (errs.length > before) {
        levelErrors.push(`idx=${lv}: ${errs.slice(before).join(' | ')}`);
    }
    const shapes = await page.evaluate(() => {
        const c = document.getElementById('cc-canvas');
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
        return n;
    });
    if (shapes < 5000) levelErrors.push(`idx=${lv}: canvas 接近空白 (${shapes} px)`);
}
/* 自检：本轮必须真的渲染过 spdt 元件，否则断言形同虚设（防假绿） */
if (spdtSeen === 0) levelErrors.push('遍历中未遇到任何 spdt 元件 ⇒ 该回归未真正覆盖 drawSwitch 的 spdt 分支');
for (const e of levelErrors) fail(`关卡渲染回归 — ${e}`);

/* ── 6. 噪声过滤后的页面错误 ──
 * 源码树直跑的已知 404：manifest / icons / analytics / sw-register 由 vite build
 * 从 public/ 与 src/ 拷入 dist 根（与既有 smoke 的噪声口径一致）。 */
const IGNORABLE = [/analytics\.js/, /sw-register\.js/, /manifest/i, /CORS/i, /game-scores/i,
    /games-analytics/, /apple-touch-icon/, /favicon/i];
const noise = m => IGNORABLE.some(re => re.test(m));
for (const e of errs) if (!noise(e)) fail(`页面错误: ${e}`);
for (const c of consoleErrors) if (!noise(c)) fail(`console 错误: ${c}`);

await browser.close();
if (fails.length) {
    console.error('✗ smoke-circuit');
    for (const f of fails) console.error(`  - ${f}`);
    process.exit(1);
}
console.log(`smoke-circuit：boot / 渲染 / 启动 / 点击开关 / 判胜 / 结算 / 星级 / 全 ${levelCount} 关渲染回归(含 ${spdtSeen} 个 spdt) 全部通过 ✅`);
