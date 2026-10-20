#!/usr/bin/env node
/**
 * smoke-lumen — lumen 页运行时冒烟 + 最小可玩性路径。
 *
 * 几何/元素存在性只能证明"页面长得对"，测不出"游戏能玩"（见 docs/traps.md 教训）。
 * 本脚本走一条真实交互链：
 *   menu → startLevel(0) → canvas 位图非空 → mouse 点击 1-1 镜面 (4,6)
 *   → 光路点亮水晶 → solved → 结算面板出现 → HUD flips=1 → 星级按 id 写入 game:lumen:v2:stars；
 *   2-1 初盘暗晶被照到 → 画布该格像素偏红、未判胜；
 *   3-1 真实点击一面联动镜 → 整组一起翻转、flips 只 +1；
 *   5-5（终章末关）按最优解真实点击 par 次 → 三星通关。
 *
 * 语言态显式 setItem('site_lang', 'zh')（headless 默认 en-US 教训）。
 */
import { launchGame } from './lib/game-test.mjs';

const BASE = process.argv.find(a => a.startsWith('http')) || 'http://127.0.0.1:8899';
const fails = [];
const fail = m => fails.push(m);

const session = await launchGame('lumen.html', {
    base: BASE,
    lang: 'zh',
    viewport: { width: 1280, height: 900 },
});
const { page, errors: errs, consoleErrors } = session;
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
if (!boot.hudLevel.includes('关卡 1-1')) fail(`HUD 未走中文文案: ${boot.hudLevel}`);
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
    starsStored: JSON.parse(localStorage.getItem('game:lumen:v2:stars') || '{}')['refract-1'],
}));
if (after.state !== 'won-level') fail(`点击镜面后 state=${after.state}（光路/判胜失败）`);
if (after.flips !== '1') fail(`HUD flips 应为 1，got ${after.flips}`);
if (!after.clearVisible) fail('过关面板未显示');
if (!after.stars.includes('⭐')) fail(`星级未渲染: ${after.stars}`);
if (after.starsStored !== 3) fail(`L1 翻 1 次应为 3 星，got ${after.starsStored}`);

/** 格中心的 page 坐标 */
const cellPoint = (r, c) => page.evaluate((r, c) => {
    const rect = document.getElementById('lm-canvas').getBoundingClientRect();
    return { x: rect.left + (c + 0.5) / 9 * rect.width, y: rect.top + (r + 0.5) / 9 * rect.height };
}, r, c);

/* ── 5. 2-1 暗晶：初盘被照到 → 画布像素偏红、未判胜 ── */
await page.evaluate(() => window.lmGame.startLevel(5));
await new Promise(r => setTimeout(r, 400));
const shadow = await page.evaluate(() => {
    const g = window.lmGame;
    const idx = g.trace.shadowLit[0];
    if (idx === undefined) return { idx: null };
    const r = Math.floor(idx / 9), c = idx % 9;
    const cv = document.getElementById('lm-canvas');
    const px = cv.getContext('2d').getImageData(Math.round((c + 0.5) / 9 * cv.width), Math.round((r + 0.5) / 9 * cv.height), 1, 1).data;
    return { idx, solved: g.trace.solved, rgb: [px[0], px[1], px[2]] };
});
if (shadow.idx === null) fail('2-1 初盘应有暗晶被照到（教学：先看到红色暗晶）');
else {
    if (shadow.solved) fail('暗晶被照到时不应判胜');
    if (!(shadow.rgb[0] > shadow.rgb[1] + 30)) fail(`被照到的暗晶应画成红色，像素 ${shadow.rgb}`);
}

/* ── 6. 3-1 联动镜：真实点击一面 → 整组翻转、flips +1 ── */
await page.evaluate(() => window.lmGame.startLevel(10));
await new Promise(r => setTimeout(r, 300));
const group = await page.evaluate(() => {
    const g = window.lmGame;
    const cells = g.level.links[0];
    return { cells, before: cells.map(idx => g.grid[Math.floor(idx / 9)][idx % 9]) };
});
if (!group.cells || group.cells.length < 2) fail('3-1 应有联动组');
else {
    const p = await cellPoint(Math.floor(group.cells[1] / 9), group.cells[1] % 9);
    await page.mouse.click(p.x, p.y);
    await new Promise(r => setTimeout(r, 250));
    const linked = await page.evaluate(cells => ({
        after: cells.map(idx => window.lmGame.grid[Math.floor(idx / 9)][idx % 9]),
        flips: window.lmGame.flips,
    }), group.cells);
    if (linked.flips !== 1) fail(`点一面联动镜 flips 应 +1，got ${linked.flips}`);
    if (linked.after.some((ch, i) => ch === group.before[i])) {
        fail(`联动组未整组翻转：${group.before.join('')} → ${linked.after.join('')}`);
    }
}

/* ── 7. 5-5 终章末关：按最优解真实点击 par 次 → 三星 ── */
await page.evaluate(() => window.lmGame.startLevel(24));
await new Promise(r => setTimeout(r, 300));
const plan = await page.evaluate(() => {
    const g = window.lmGame;
    const taps = [];
    const done = new Set();
    for (let idx = 0; idx < 81; idx++) {
        const r = Math.floor(idx / 9), c = idx % 9;
        if (done.has(idx) || g.grid[r][c] === g.level.sol[r][c]) continue;
        const group = g.level.links.find(gr => gr.includes(idx)) || [idx];
        group.forEach(i => done.add(i));
        taps.push([r, c]);
    }
    return { taps, par: g.par, hud: document.getElementById('lm-hud-level').textContent };
});
if (plan.taps.length !== plan.par) fail(`5-5 初盘与解态的单元差 ${plan.taps.length} ≠ par ${plan.par}`);
if (!plan.hud.includes('5-5')) fail(`HUD 应显示 5-5，got ${plan.hud}`);
for (const [r, c] of plan.taps) {
    const p = await cellPoint(r, c);
    await page.mouse.click(p.x, p.y);
    await new Promise(r2 => setTimeout(r2, 120));
}
await new Promise(r => setTimeout(r, 1100));
const finale = await page.evaluate(() => ({
    state: window.lmGame.state,
    stars: document.getElementById('lm-clear-stars').textContent,
    stored: JSON.parse(localStorage.getItem('game:lumen:v2:stars') || '{}'),
}));
if (finale.state !== 'won-level') fail(`5-5 按最优解点完 state=${finale.state}`);
if (finale.stars !== '⭐⭐⭐') fail(`5-5 par 步通关应三星，got ${finale.stars}`);
if (finale.stored['converge-5'] !== 3 || finale.stored['refract-1'] !== 3) {
    fail(`星级应按 id 累积存储，got ${JSON.stringify(finale.stored)}`);
}

/* ── 8. 噪声过滤后的页面错误 ──
 * 源码树直跑的已知 404：manifest / icons / analytics / sw-register 由 vite build
 * 从 public/ 与 src/ 拷入 dist 根（与既有 smoke 的噪声口径一致）。 */
const IGNORABLE = [/analytics\.js/, /sw-register\.js/, /manifest/i, /CORS/i, /game-scores/i,
    /games-analytics/, /apple-touch-icon/, /favicon/i];
const noise = m => IGNORABLE.some(re => re.test(m));
for (const e of errs) if (!noise(e)) fail(`页面错误: ${e}`);
for (const c of consoleErrors) if (!noise(c)) fail(`console 错误: ${c}`);

await session.close();
if (fails.length) {
    console.error('✗ smoke-lumen');
    for (const f of fails) console.error(`  - ${f}`);
    process.exit(1);
}
console.log('smoke-lumen：boot / 渲染 / 启动 / 点击翻镜 / 判胜 / 结算 / 星级 / 暗晶 / 联动 / 终章 全部通过 ✅');
