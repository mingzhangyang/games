#!/usr/bin/env node
/**
 * smoke-silk-dew — silk-dew（垂丝引露）页运行时冒烟 + 最小可玩性路径。
 *
 * 几何/元素存在性只能证明「页面长得对」，测不出「游戏能玩」（见 docs/traps.md 教训）。
 * 本脚本走真实交互链：
 *   menu → startLevel(0) → canvas 位图非空 → mouse 真实拖拽锚结
 *   → 露珠被丝牵引移动 → 入壶判胜 → 结算面板 → HUD drags ≥1 → 星级写入 sd_progress。
 *
 * 关键：用 canvas 逻辑坐标 ↔ 视口坐标换算（坐标来自 window.sdGame.world 的实时锚点，
 * 不硬编码像素）。拖拽必须分多步 move（模拟真实指针），一步瞬移会让物理不收敛。
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
    const url = (msg.location() && msg.location().url) || '';
    consoleErrors.push(`${msg.text().split('\n')[0]} @ ${url}`);
});
await page.evaluateOnNewDocument(() => {
    try {
        localStorage.clear();
        localStorage.setItem('site_lang', 'zh');
    } catch (e) { /* ignore */ }
});
await page.goto(`${BASE}/silk-dew.html`, { waitUntil: 'networkidle0', timeout: 45000 });
await new Promise(r => setTimeout(r, 900));

/* ── 1. bootstrap：句柄 / 初始态 / 中文文案 ── */
const boot = await page.evaluate(() => ({
    hasGame: !!window.sdGame,
    hasDrawer: !!window.sdDrawer,
    state: window.sdGame ? window.sdGame.state : null,
    startVisible: !document.getElementById('sd-start').classList.contains('hidden'),
    hudLevel: document.getElementById('sd-hud-level').textContent,
    titleZh: document.title,
    lbMoreCards: document.querySelectorAll('#sdSideMore a').length,
    canvasW: document.getElementById('sd-canvas').width,
    canvasH: document.getElementById('sd-canvas').height,
    hasLevelGrid: document.querySelectorAll('#sd-level-grid button').length,
}));
if (!boot.hasGame) fail('window.sdGame 未创建（boot 失败）');
if (!boot.hasDrawer) fail('createStatsDrawer 未初始化');
if (boot.state !== 'menu') fail(`初始 state 应为 menu，got ${boot.state}`);
if (!boot.startVisible) fail('开始覆盖层未显示');
if (!boot.hudLevel.includes('关')) fail(`HUD 未走中文文案: ${boot.hudLevel}`);
if (!boot.titleZh.includes('垂丝') && !boot.titleZh.includes('Silk')) fail(`document.title 异常: ${boot.titleZh}`);
if (boot.lbMoreCards < 1) fail('桌面侧栏「更多游戏」未渲染');
if (!boot.canvasW || boot.canvasW < 200) fail(`canvas 后端缓冲未按 CSS 尺寸重算: ${boot.canvasW}`);
if (boot.hasLevelGrid < 20) fail(`关卡格未渲染 20 个（实际 ${boot.hasLevelGrid}）`);

/* ── 2. canvas 位图非空 ── */
const pixels = await page.evaluate(() => {
    const c = document.getElementById('sd-canvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
    return n;
});
if (pixels < 5000) fail(`canvas 位图接近空白（渲染循环未跑？）: ${pixels} px`);

/* ── 3. 启动 L1 → playing ── */
await page.evaluate(() => window.sdGame.startLevel(0));
await new Promise(r => setTimeout(r, 400));
const started = await page.evaluate(() => {
    const g = window.sdGame;
    return {
        state: g.state,
        overlayHidden: document.getElementById('sd-start').classList.contains('hidden'),
        drags: document.getElementById('sd-drags').textContent,
        hasWorld: !!g.world,
        ropeCount: g.world ? g.world.ropes.length : 0,
        vessel: g.world && g.world.vessel ? { x: g.world.vessel.x, y: g.world.vessel.y, w: g.world.vessel.w } : null,
        anchor: g.world ? { x: g.world.ropes[0].particles[0].x, y: g.world.ropes[0].particles[0].y } : null,
        pearl: g.world ? { x: g.world.pearl.x, y: g.world.pearl.y } : null,
        starCount: (g.spec.stars || []).length,
    };
});
if (started.state !== 'playing') fail(`startLevel(0) 后 state=${started.state}`);
if (!started.overlayHidden) fail('开始覆盖层未隐藏');
if (started.drags !== '0') fail(`初盘 drags 应为 0，got ${started.drags}`);
if (!started.hasWorld || started.ropeCount < 1) fail('world / ropes 未创建');
if (!started.vessel || !started.anchor) fail('world.vessel / anchor 缺失');

/* ── 4. 真实拖拽：按住锚结 → 分多步拖到玉壶正上方 → 露珠入壶判胜 ──
 * 目标位取「玉壶口正上方 40px」处，即把锚结拖到壶口 x 对齐、y 到壶口上沿，
 * 让丝末端（露珠）自然落入壶中。坐标全部从 world 实时读取，不硬编码。 */
const box = await page.evaluate(() => {
    const r = document.getElementById('sd-canvas').getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
});
const logical = await page.evaluate(() => ({
    w: window.sdGame.world ? 480 : 480,
    h: 640,
    anchor: { x: window.sdGame.world.ropes[0].particles[0].x, y: window.sdGame.world.ropes[0].particles[0].y },
    vessel: { x: window.sdGame.world.vessel.x, y: window.sdGame.world.vessel.y },
}));
const toView = (lx, ly) => ({
    x: box.left + (lx / 480) * box.width,
    y: box.top + (ly / 640) * box.height,
});

// 拖拽目标：锚点横移到壶口正上方，纵向下压到壶口上方
const targetX = logical.vessel.x;
const targetY = Math.max(120, logical.vessel.y - 150);
const from = toView(logical.anchor.x, logical.anchor.y);
const to = toView(targetX, targetY);

await page.mouse.move(from.x, from.y);
await page.mouse.down();
// 分 30 步走完，每步 ~16ms（模拟真实指针拖拽，一步瞬移物理不收敛）
const STEPS = 30;
for (let i = 1; i <= STEPS; i++) {
    const k = i / STEPS;
    await page.mouse.move(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k);
    await new Promise(r => setTimeout(r, 16));
}
// 保持一会儿让露珠稳定落壶
await new Promise(r => setTimeout(r, 700));
await page.mouse.up();
await new Promise(r => setTimeout(r, 900));

const after = await page.evaluate(() => {
    const g = window.sdGame;
    return {
        state: g.state,
        drags: document.getElementById('sd-drags').textContent,
        pearl: g.world ? { x: Math.round(g.world.pearl.x), y: Math.round(g.world.pearl.y) } : null,
        starsTaken: g.world ? g.world.starsTaken : -1,
        clearVisible: !document.getElementById('sd-clear').classList.contains('hidden'),
        clearStars: document.getElementById('sd-clear-stars').textContent,
        progress: (() => { try { return JSON.parse(localStorage.getItem('sd_progress') || '{}'); } catch (e) { return {}; } })(),
    };
});
// 拖拽确实计数了（机制在跑）
if (after.drags === '0') fail('拖拽后 HUD drags 仍为 0（指针事件未绑定 / 命中失败）');
// 露珠位置相对初态发生了明显位移（丝真的被牵引）
const moved = Math.hypot(after.pearl.x - started.pearl.x, after.pearl.y - started.pearl.y);
if (moved < 20) fail(`拖拽后露珠几乎没动（位移 ${moved.toFixed(1)}px）⇒ 牵引机制未生效`);
// L1 是教学关：壶口宽、路径直，该拖法应判胜
if (after.state !== 'won-level') {
    fail(`拖拽后 state=${after.state}（期望 won-level；露珠在 ${after.pearl.x},${after.pearl.y}，壶口 ${started.vessel.x},${started.vessel.y}）`);
} else {
    if (!after.clearVisible) fail('过关面板未显示');
    if (!after.clearStars.includes('★') && !after.clearStars.includes('⭐')) fail(`星级未渲染: ${after.clearStars}`);
    if (after.starsTaken < 1) fail(`应收满 L1 星芒，实际 ${after.starsTaken}/${started.starCount}`);
    const p = after.progress['S1'];
    if (!p || !(p.stars >= 1)) fail(`sd_progress 未写入 S1 星级: ${JSON.stringify(after.progress)}`);
}

/* ── 5. 全关卡渲染回归：逐关 startLevel + 强制 draw，捕获绘制期异常 ──
 * 教训（circuit）：新元素类型（spdt）首次出现在中后段关卡，冒烟若只测前 5 关，
 * 该崩溃 100% 漏网。这里遍历全部 20 关，逐关强制同步 draw() 若干帧。
 * 统计「气泡/风/荆棘」出现次数做自检：若遍历中一个都没遇到，说明该回归形同虚设。 */
const levelCount = await page.evaluate(async () => {
    try { const m = await import('/js/silk-dew-levels.js'); return m.LEVELS.length; } catch (e) { return 0; }
});
if (!levelCount) fail('无法取得 LEVELS.length（回归遍历无法进行）');
const levelErrors = [];
let bubblesSeen = 0, windsSeen = 0, thornsSeen = 0, multiRopeSeen = 0;
for (let lv = 0; lv < levelCount; lv++) {
    const before = errs.length;
    const meta = await page.evaluate((i) => {
        const g = window.sdGame;
        g.startLevel(i);
        const drawErrs = [];
        try { g.draw(); } catch (e) { drawErrs.push('draw#1: ' + e.message); }
        try { g.draw(); } catch (e) { drawErrs.push('draw#2: ' + e.message); }
        return {
            state: g.state,
            bubbles: (g.spec.bubbles || []).length,
            winds: (g.spec.winds || []).length,
            thorns: (g.spec.thorns || []).length,
            ropes: g.spec.ropes.length,
            drawErrs,
        };
    }, lv);
    bubblesSeen += meta.bubbles;
    windsSeen += meta.winds;
    thornsSeen += meta.thorns;
    if (meta.ropes > 1) multiRopeSeen++;
    for (const de of meta.drawErrs) errs.push(`idx=${lv} ${de}`);
    await new Promise(r => setTimeout(r, 240));
    if (errs.length > before) levelErrors.push(`idx=${lv}: ${errs.slice(before).join(' | ')}`);
    const shapes = await page.evaluate(() => {
        const c = document.getElementById('sd-canvas');
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
        return n;
    });
    if (shapes < 5000) levelErrors.push(`idx=${lv}: canvas 接近空白 (${shapes} px)`);
}
if (bubblesSeen === 0) levelErrors.push('遍历中未遇到任何气泡 ⇒ drawBubbles 未被真正覆盖');
if (windsSeen === 0) levelErrors.push('遍历中未遇到任何气旋 ⇒ drawWinds 未被真正覆盖');
if (thornsSeen === 0) levelErrors.push('遍历中未遇到任何荆棘 ⇒ drawThorns 未被真正覆盖');
if (multiRopeSeen === 0) levelErrors.push('遍历中未遇到多丝关卡 ⇒ 多丝绘制路径未覆盖');
for (const e of levelErrors) fail(`关卡渲染回归 — ${e}`);

/* ── 6. 每日模式可用 ── */
await page.evaluate(() => window.sdGame.toMenu());
await new Promise(r => setTimeout(r, 200));
const dailyOk = await page.evaluate(async () => {
    try {
        window.sdGame.startDaily();
        return {
            state: window.sdGame.state,
            mode: window.sdGame.mode,
            course: (window.sdGame.daily && window.sdGame.daily.course || []).length,
        };
    } catch (e) { return { error: String(e.message) }; }
});
if (dailyOk.error) fail(`每日模式启动抛错: ${dailyOk.error}`);
else {
    if (dailyOk.state !== 'playing') fail(`每日模式 state=${dailyOk.state}`);
    if (dailyOk.mode !== 'daily') fail(`每日模式 mode=${dailyOk.mode}`);
    if (dailyOk.course !== 5) fail(`每日课程应为 5 关，实际 ${dailyOk.course}`);
}

/* ── 7. 抽屉开关（mobile 契约已由 verify-stats-drawer 覆盖，这里只验可用性） ── */
await page.evaluate(() => window.sdGame.toMenu());
await new Promise(r => setTimeout(r, 200));
const drawerOk = await page.evaluate(() => {
    const t = document.getElementById('sdStatsToggle');
    if (!t) return { ok: false, why: 'sdStatsToggle 缺失' };
    t.click();
    const d = document.getElementById('sdStatsDrawer');
    return { ok: !!d, open: d ? !d.classList.contains('hidden') : false };
});
if (!drawerOk.ok) fail(`抽屉不可用: ${drawerOk.why}`);
else if (!drawerOk.open) fail('点击 Stats 后抽屉未打开');

/* ── 8. 噪声过滤后的页面错误 ──
 * 源码树直跑的已知 404（与既有 smoke 口径一致）。 */
const IGNORABLE = [/analytics\.js/, /sw-register\.js/, /manifest/i, /CORS/i, /game-scores/i,
    /games-analytics/, /apple-touch-icon/, /favicon/i];
const noise = m => IGNORABLE.some(re => re.test(m));
for (const e of errs) if (!noise(e)) fail(`页面错误: ${e}`);
for (const c of consoleErrors) if (!noise(c)) fail(`console 错误: ${c}`);

await browser.close();
if (fails.length) {
    console.error('✗ smoke-silk-dew');
    for (const f of fails) console.error(`  - ${f}`);
    process.exit(1);
}
console.log(`smoke-silk-dew：boot / 渲染 / 启动 / 真实拖拽牵引 / 判胜 / 结算 / 星级 / 全 ${levelCount} 关渲染回归(泡${bubblesSeen} 风${windsSeen} 棘${thornsSeen} 多丝${multiRopeSeen}) / 每日 / 抽屉 全部通过 ✅`);
