#!/usr/bin/env node
/**
 * smoke-crystal-bloom — 晶绽页运行时冒烟 + 教学内核真机验证。
 *
 * 几何/元素存在性证明不了「游戏能玩」。本脚本走真实交互链：
 *   menu → startLevel(0) → 图上点锚点 → 空格开长 → f 搅拌 → 通关结算
 *   → 失败面板（写明缺哪一项）→ 每日 5 皿 → 抽屉暂停冻结 → 复位
 *
 * 六条静态校验器测不到、必须真机证明的教学内核：
 *   · 曲线即命令：锚点写进 world.anchors，晶体按它降温（不是画着玩的装饰）
 *   · 生长中只能改**未来**：落一个已经过去时刻的锚点必须被拒（不许篡改历史）
 *   · 温度只许降不许升：回温的锚点放不下去
 *   · 搅拌：按一次记一次，成本 +1，且只在真的在长时有效
 *   · 判定四项独立：失败时面板要写明缺的是急冷/终温/晶形/尺寸中的哪一项
 *   · 抽屉契约：pauseQuiet 冻结 world.t（时间不前进）
 *
 * 关键：
 *   · 落锚点走真实鼠标点击（覆盖 chartFromEvent + pointerdown 两层），
 *     只有「白盒摆位」（未来/过去锚点、求解器给的解）才调 placeAnchor。
 *   · 通关解由本脚本在 node 侧现算（与 verify-crystal-bloom-levels 同一把尺子），
 *     绝不手填 —— 手填的解一旦和内核标定漂移，冒烟就成了假绿。
 *   · 一整关 90 逻辑步 / 12 步每秒 ≈ 7.5s，等待一律轮询 world.state，不用死等。
 *   · 语言态显式 setItem('site_lang','zh')（headless 默认 en-US）。
 */
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import * as R from '../js/crystal-bloom-rules.js';

const BASE = process.argv.find(a => a.startsWith('http')) || 'http://127.0.0.1:8899';
const fails = [];
const fail = m => fails.push(m);
const ok = [];
const pass = m => ok.push(m);
const wait = ms => new Promise(r => setTimeout(r, ms));

/* ── node 侧求解：给第 1 皿算一个成本 = par 的通关解 ── */
const TS = [3, 8, 14, 20, 28, 36, 45, 55, 66, 78, 90];
function solveCost1(spec) {
    let best = null;
    for (const t of TS) {
        for (let T = spec.tEndMin; T <= spec.tEndMax; T += 2) {
            const anchors = [{ t, T }];
            const w = R.simulate(spec, anchors, [], spec.id);
            if (!R.evaluate(spec, w).pass) continue;
            if (!best || w.quality > best.q) best = { t, T, q: w.quality, cells: w.cells };
        }
    }
    return best;
}
const LV1 = R.LEVELS[0];
const SOL = solveCost1(LV1);
if (!SOL) {
    console.log(`\nsmoke-crystal-bloom: 第 1 皿（${LV1.id}）算不出成本 1 的解，par=${LV1.par} 与内核标定已漂移`);
    process.exit(1);
}

const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: LAUNCH_ARGS,
});

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
const errs = [];
page.on('pageerror', e => errs.push(String(e.message || e).split('\n')[0]));
await page.evaluateOnNewDocument(() => {
    try {
        localStorage.clear();
        localStorage.setItem('site_lang', 'zh');
    } catch (e) { /* ignore */ }
});
await page.goto(`${BASE}/crystal-bloom.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await wait(1200);

/** 等到晶体长完（或已判负）；返回 null = 超时 */
async function waitGrow(timeout = 25000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
        const s = await page.evaluate(() => {
            const g = window.cbGame;
            return { state: g.state, wstate: g.world ? g.world.state : null, t: g.world ? g.world.t : -1 };
        });
        if (s.wstate === 'done' || s.state !== 'playing') return s;
        await wait(200);
    }
    return null;
}

/* ── 1. bootstrap ── */
const boot = await page.evaluate(() => ({
    hasGame: !!window.cbGame,
    hasDrawer: !!window.cbDrawer,
    state: window.cbGame ? window.cbGame.state : null,
    startVisible: !document.getElementById('cb-start').classList.contains('hidden'),
    levelChips: document.querySelectorAll('#cb-level-grid button').length,
    legendRows: document.querySelectorAll('#cb-side-legend > *').length,
    moreCards: document.querySelectorAll('#cbSideMore a').length,
    canvasW: document.getElementById('cb-canvas').width,
    title: document.getElementById('cb-title').textContent.trim(),
    hud: document.getElementById('cb-hud-level').textContent.trim(),
    runDimmed: document.getElementById('cb-run-btn').classList.contains('is-dimmed'),
}));
if (!boot.hasGame) fail('window.cbGame 未创建（boot 失败）');
if (!boot.hasDrawer) fail('createStatsDrawer 未初始化（window.cbDrawer 缺失）');
if (boot.state !== 'menu') fail(`初始 state 应为 menu，got ${boot.state}`);
if (!boot.startVisible) fail('开始覆盖层未显示');
if (boot.levelChips !== 20) fail(`皿格应渲染 20 个（实际 ${boot.levelChips}）`);
if (boot.legendRows < 4) fail(`晶形图例至少应有 4 行（实际 ${boot.legendRows}）`);
if (boot.moreCards < 1) fail('桌面侧栏「更多游戏」未渲染');
if (!boot.canvasW || boot.canvasW < 200) fail(`canvas 后端缓冲未按 CSS 尺寸重算：${boot.canvasW}`);
if (boot.title !== '晶绽') fail(`zh 语言下标题应为「晶绽」，got "${boot.title}"（i18n 未接线？）`);
if (!boot.runDimmed) fail('菜单态 Grow 钮应隐藏（is-dimmed），否则会挡住皿格');
if (errs.length) fail(`首屏 JS 运行时错误: ${errs.slice(0, 2).join(' | ')}`);
else pass(`bootstrap：句柄/初始态/20 皿格/图例/更多游戏/标题「${boot.title}」`);

/* ── 2. 开局 ── */
await page.evaluate(() => window.cbGame.startLevel(0));
await wait(400);
const l1 = await page.evaluate(() => {
    const g = window.cbGame, w = g.world;
    return {
        state: g.state, phase: g.phase, t: w.t, cells: w.cells,
        anchors: g.anchors.length, stirs: g.stirs.length,
        target: g.spec.target, par: g.spec.par, minCells: g.spec.minCells,
        startHidden: document.getElementById('cb-start').classList.contains('hidden'),
        hud: document.getElementById('cb-hud-level').textContent.trim(),
        parHud: document.getElementById('cb-par').textContent.trim(),
        budget: document.getElementById('cb-budget').textContent.trim(),
        runDimmed: document.getElementById('cb-run-btn').classList.contains('is-dimmed'),
        stirDimmed: document.getElementById('cb-stir-btn').classList.contains('is-dimmed'),
    };
});
if (l1.state !== 'playing') fail(`开局 state 应为 playing，got ${l1.state}`);
else if (l1.phase !== 'draw') fail(`开局应是 draw 阶段（先画曲线），got ${l1.phase}`);
else if (l1.t !== 0) fail(`开局逻辑时刻应为 0，got ${l1.t}`);
else if (l1.anchors !== 0 || l1.stirs !== 0) fail(`开局应零代价（锚点 ${l1.anchors} / 搅拌 ${l1.stirs}）`);
else if (!l1.startHidden) fail('开局后开始覆盖层未隐藏');
else if (!/皿\s*1\s*\/\s*20/.test(l1.hud)) fail(`HUD 应显示 皿 1/20，got "${l1.hud}"`);
else if (l1.runDimmed) fail('对局中 Grow 钮不应被隐藏');
else if (!l1.stirDimmed) fail('draw 阶段搅拌钮应隐藏（此时按下去是白花一点代价）');
else pass(`开局：state=playing、phase=draw、t=0、零代价、HUD "${l1.hud}"、目标 ${l1.target}/par ${l1.par}`);

/* ── 3. canvas 位图非空 ── */
const ink = await page.evaluate(() => {
    const c = document.getElementById('cb-canvas');
    const g = c.getContext('2d');
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 40) {
        if (d[i] > 40 || d[i + 1] > 40 || d[i + 2] > 60) n++;
    }
    return n;
});
if (ink < 10) fail(`canvas 位图近乎全空（ink=${ink}）`);
else pass(`canvas 位图非空（ink=${ink}）`);

/* ── 4. 真实鼠标落锚点 + 两条放置禁令 ── */
await page.evaluate(() => document.getElementById('cb-canvas').scrollIntoView({ block: 'center' }));
await wait(200);
const rect = await page.evaluate(() => {
    const r = document.getElementById('cb-canvas').getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
});
const wantT = 45, wantTemp = 60;
const px = rect.x + (R.CHART.x + (wantT / LV1.tMax) * R.CHART.w) / R.STAGE.w * rect.w;
const py = rect.y + (R.CHART.y + (1 - (wantTemp - 10) / 80) * R.CHART.h) / R.STAGE.h * rect.h;
await page.mouse.click(px, py);
await wait(250);
const clicked = await page.evaluate(() => {
    const g = window.cbGame;
    return {
        n: g.anchors.length,
        a: g.anchors[0] ? { t: g.anchors[0].t, T: g.anchors[0].T } : null,
        budget: document.getElementById('cb-budget').textContent.trim(),
    };
});
if (clicked.n !== 1) fail(`图上点一下应落 1 个锚点，got ${clicked.n}（chartFromEvent/pointerdown 未接通？）`);
else if (Math.abs(clicked.a.t - wantT) > 2) fail(`锚点时刻应落在点击处（期望 ≈${wantT}，got ${clicked.a.t}）`);
else if (Math.abs(clicked.a.T - wantTemp) > 2) fail(`锚点温度应落在点击处（期望 ≈${wantTemp}，got ${clicked.a.T}）`);
else if (clicked.budget !== '1') fail(`落锚后代价应为 1，got "${clicked.budget}"`);
else pass(`真实点击落锚：(${clicked.a.t}, ${clicked.a.T}℃)、代价 ${clicked.budget}`);

const illegal = await page.evaluate(() => {
    const g = window.cbGame;
    // 回温：上一点 60℃，再放 75℃ —— 溶解度只许单向走，回温会溶解晶体
    const warmer = g.placeAnchor(70, 75);
    // 时间倒流：上一点 t=45，再放 t=20
    const back = g.placeAnchor(20, 40);
    return { warmer, back, n: g.anchors.length };
});
if (illegal.warmer !== false) fail('回温的锚点应被拒绝（温度只许降不许升）');
else if (illegal.back !== false) fail('时刻早于上一个锚点的锚点应被拒绝（时间只许前进）');
else if (illegal.n !== 1) fail(`两个非法锚点都不该写进去，anchors=${illegal.n}`);
else pass('放置禁令：回温 / 时间倒流都被拒（曲线是命令，但不能篡改物理）');

/* ── 5. 开长 + 只能改未来 ── */
await page.keyboard.press(' ');
await wait(1500);
const growing = await page.evaluate(() => {
    const g = window.cbGame;
    return { phase: g.phase, t: g.world.t, cells: g.world.cells, stirDimmed: document.getElementById('cb-stir-btn').classList.contains('is-dimmed') };
});
if (growing.phase !== 'grow') fail(`空格后应进入 grow 阶段，got ${growing.phase}`);
else if (growing.t <= 0) fail(`grow 后逻辑时刻应前进，got ${growing.t}`);
else if (growing.stirDimmed) fail('grow 阶段搅拌钮应可用');
else pass(`开长：phase=grow、t=${growing.t}、已长 ${growing.cells} 格`);

const future = await page.evaluate(() => {
    const g = window.cbGame;
    const now = g.world.t;
    const past = g.placeAnchor(now - 8, 30);      // 已经过去的时刻
    const fut = g.placeAnchor(now + 30, 30);      // 还没到的时刻
    return { now, past, fut, n: g.anchors.length };
});
if (future.past !== false) fail(`生长中不应允许落一个已经过去时刻的锚点（now=${future.now}），got true`);
else if (future.fut !== true) fail('生长中应允许改**未来**（落一个还没到的锚点）');
else pass(`只能改未来：过去被拒 / 未来可落（now=${future.now}、anchors=${future.n}）`);

/* ── 6. 搅拌：按一次记一次，成本 +1 ── */
await page.evaluate(() => { window.cbGame.restartLevel(); });
await wait(200);
await page.keyboard.press(' ');
await wait(600);
const beforeStir = await page.evaluate(() => {
    const g = window.cbGame;
    return { stirs: g.stirs.length, budget: document.getElementById('cb-budget').textContent.trim(), stirsRef: g.world.stirs.length };
});
await page.keyboard.press('f');
await wait(250);
const afterStir = await page.evaluate(() => {
    const g = window.cbGame;
    return {
        stirs: g.stirs.length, flash: g.stirFlash,
        budget: document.getElementById('cb-budget').textContent.trim(),
        at: g.world.stirs.slice(),
    };
});
if (afterStir.stirs !== beforeStir.stirs + 1) fail(`按 f 应记 1 次搅拌，got ${afterStir.stirs}`);
else if (afterStir.budget !== String(Number(beforeStir.budget) + 1)) fail(`搅拌应让代价 +1（${beforeStir.budget} → ${afterStir.budget}）`);
else if (!(afterStir.flash > 0)) fail('搅拌后 stirFlash 应 >0（画面上要看得见涟漪）');
else if (afterStir.at.length !== 1) fail(`搅拌时刻应写进 world.stirs，got ${JSON.stringify(afterStir.at)}`);
else pass(`搅拌：stirs=${afterStir.stirs}、代价 ${afterStir.budget}、记在 t=${afterStir.at[0]}、涟漪已触发`);
await page.evaluate(() => window.cbGame.toMenu());
await wait(200);

/* ── 7. 通关：求解器现算的解 + 结算 + 存档 ── */
await page.evaluate((t, T) => {
    const g = window.cbGame;
    g.startLevel(0);
    g.placeAnchor(t, T);
    g.pressGrow();
}, SOL.t, SOL.T);
const grew = await waitGrow();
if (!grew) fail('晶体长完超时（25s 内 world.state 未到 done）');
const won = await page.evaluate(() => {
    const g = window.cbGame;
    return {
        state: g.state,
        habit: g.world ? g.world.habit : null,
        cells: g.world ? g.world.cells : -1,
        quality: g.world ? +g.world.quality.toFixed(3) : -1,
        cost: g.world ? g.world.cost : -1,
        clearVisible: !document.getElementById('cb-clear').classList.contains('hidden'),
        starsText: document.getElementById('cb-clear-stars').textContent.trim(),
        progress: (() => { try { return JSON.parse(localStorage.getItem('cb_progress') || '{}'); } catch (e) { return null; } })(),
    };
});
if (won.state !== 'won-level') fail(`通关后 state 应为 won-level，got ${won.state}（habit=${won.habit} cells=${won.cells}）`);
else if (!won.clearVisible) fail('通关后未弹出结算面板');
else if (won.habit !== LV1.target) fail(`长出的晶形应为 ${LV1.target}，got ${won.habit}`);
else if (won.cells < LV1.minCells) fail(`尺寸应 ≥${LV1.minCells}，got ${won.cells}`);
else if (!won.progress || !won.progress.cb1) fail('星级未写入 cb_progress');
else if (!won.progress.cb1.stars || won.progress.cb1.stars < 1) fail(`存档星级应 ≥1，got ${won.progress.cb1.stars}`);
else if (won.cost === LV1.par && won.progress.cb1.stars < 2) fail(`代价 ${won.cost} = par ${LV1.par} 应至少 2 星，got ${won.progress.cb1.stars}`);
else pass(`通关：${won.habit} ${won.cells} 格（≥${LV1.minCells}）、q=${won.quality}、代价 ${won.cost}、${won.starsText} 写入 cb_progress`);

/* ── 8. 失败：面板要写明缺哪一项 ── */
// 全程不降温 ⇒ tChill(90) 处还是 88℃，chilled 不过关，判负原因 =「起步太慢」
await page.evaluate(() => {
    const g = window.cbGame;
    g.toMenu();
    g.startLevel(0);
    g.placeAnchor(45, 88);
    g.pressGrow();
});
const died = await waitGrow();
if (!died) fail('失败局跑完超时');
const failed = await page.evaluate(() => {
    const g = window.cbGame;
    return {
        state: g.state,
        overVisible: !document.getElementById('cb-clear').classList.contains('hidden'),
        stars: document.getElementById('cb-clear-stars').textContent.trim(),
        line: document.getElementById('cb-clear-line').textContent.trim(),
        nextHidden: document.getElementById('cb-btn-next').style.display === 'none',
    };
});
if (failed.state !== 'failed') fail(`不降温应判负，got ${failed.state}`);
else if (!failed.overVisible) fail('判负后未弹出面板');
else if (!failed.line.includes('起步太慢')) fail(`判负原因应写明「起步太慢」（急冷未达标），got "${failed.line}"`);
else if (failed.stars !== '还差一点') fail(`判负面板标题应为「还差一点」，got "${failed.stars}"`);
else if (!failed.nextHidden) fail('判负后不应显示「下一皿」');
else pass(`失败面板：state=failed、写明「${failed.line.split(' · ')[0]}」、下一皿已隐藏`);

/* ── 9. 每日：5 皿赛程 ── */
const daily = await page.evaluate(() => {
    const g = window.cbGame;
    g.startDaily();
    return {
        mode: g.mode,
        course: g.daily ? g.daily.course.length : -1,
        cursor: g.daily ? g.daily.cursor : -1,
        hud: document.getElementById('cb-hud-level').textContent.trim(),
        state: g.state,
        keys: g.daily ? g.daily.course.map(s => s.id) : [],
    };
});
if (daily.mode !== 'daily') fail(`startDaily 后 mode 应为 daily，got ${daily.mode}`);
else if (daily.course !== 5) fail(`每日应有 5 皿，got ${daily.course}`);
else if (!/每日\s*1\s*\/\s*5/.test(daily.hud)) fail(`每日 HUD 应显示 每日 1/5，got "${daily.hud}"`);
else if (daily.state !== 'playing') fail(`每日应立即开局，got ${daily.state}`);
else if (new Set(daily.keys).size !== daily.keys.length) fail(`每日 5 皿不应重复，got ${daily.keys.join(',')}`);
else pass(`每日赛程：${daily.course} 皿（${daily.keys.join(' → ')}）、HUD "${daily.hud}"、立即开局`);

/* ── 10. 抽屉契约：pauseQuiet 必须冻住物理 ── */
const pauseTest = await page.evaluate(async () => {
    const g = window.cbGame;
    g.startLevel(0);
    g.pressGrow();
    await new Promise(r => setTimeout(r, 300));
    g.pauseQuiet();
    const t0 = g.world.t;
    const busy = g.isRunning();
    await new Promise(r => setTimeout(r, 500));
    const t1 = g.world.t;
    g.resumeQuiet();
    await new Promise(r => setTimeout(r, 500));
    const t2 = g.world.t;
    return { t0, t1, t2, busy };
});
if (pauseTest.busy) fail('pauseQuiet 后 isRunning() 应为 false');
else if (pauseTest.t1 !== pauseTest.t0) fail(`暂停期间逻辑时刻不应前进（${pauseTest.t0} → ${pauseTest.t1}）`);
else if (pauseTest.t2 - pauseTest.t1 <= 0) fail(`resumeQuiet 后晶体应继续长（${pauseTest.t1} → ${pauseTest.t2}）`);
else pass(`抽屉契约：暂停 0.5s 时刻冻结在 t=${pauseTest.t1}、恢复后推进到 t=${pauseTest.t2}`);

/* ── 11. 重开 / 回菜单必须复位 ── */
const reset = await page.evaluate(async () => {
    const g = window.cbGame;
    g.mode = 'levels';
    g.daily = null;
    g.startLevel(3);
    g.placeAnchor(45, 60);
    g.pressGrow();
    // ⚠️ 必须让出几帧：pressGrow 只是把 phase 切成 grow，真正推进在 rAF 循环里，
    //    同步读 world.t 永远还是 0（复位前「晶体在长」这个前提就白摆了）。
    await new Promise(r => setTimeout(r, 400));
    const before = { t: g.world.t, cells: g.world.cells };
    g.restartLevel();
    const afterRestart = {
        t: g.world.t, cells: g.world.cells, phase: g.phase,
        anchors: g.anchors.length, stirs: g.stirs.length,
        budget: document.getElementById('cb-budget').textContent.trim(),
        hud: document.getElementById('cb-hud-level').textContent.trim(),
        state: g.state,
    };
    g.toMenu();
    return {
        before, afterRestart,
        menu: {
            state: g.state, world: g.world, phase: g.phase,
            startVisible: !document.getElementById('cb-start').classList.contains('hidden'),
            clearHidden: document.getElementById('cb-clear').classList.contains('hidden'),
            runDimmed: document.getElementById('cb-run-btn').classList.contains('is-dimmed'),
        },
    };
});
if (reset.before.t <= 0) fail('复位前晶体应已在长（摆位失败，后面的断言无意义）');
if (reset.afterRestart.t !== 0) fail(`重开应把时刻归零，got ${reset.afterRestart.t}`);
else if (reset.afterRestart.phase !== 'draw') fail(`重开应回到 draw 阶段，got ${reset.afterRestart.phase}`);
else if (reset.afterRestart.anchors !== 0 || reset.afterRestart.stirs !== 0) fail('重开应清空锚点与搅拌');
else if (reset.afterRestart.budget !== '0') fail(`重开后代价应为 0，got "${reset.afterRestart.budget}"`);
else if (!/皿\s*4\s*\/\s*20/.test(reset.afterRestart.hud)) fail(`重开后仍应在第 4 皿，got "${reset.afterRestart.hud}"`);
if (reset.menu.state !== 'menu') fail(`toMenu 后 state 应为 menu，got ${reset.menu.state}`);
else if (reset.menu.world !== null) fail('toMenu 后 world 应被清空（否则后台仍在长晶体）');
else if (!reset.menu.startVisible) fail('toMenu 后开始覆盖层未显示');
else if (!reset.menu.clearHidden) fail('toMenu 后结算面板未隐藏');
else if (!reset.menu.runDimmed) fail('菜单态动作钮应隐藏（is-dimmed）');
if (!fails.length) pass(`重开/回菜单：时刻/锚点/代价归零、仍在第 4 皿、world 清空、动作钮隐藏（重开前已长到 t=${reset.before.t}）`);

if (errs.length) fail(`对局中 JS 运行时错误: ${errs.slice(0, 3).join(' | ')}`);

await browser.close();

console.log('');
ok.forEach(m => console.log('  ✓ ' + m));
if (fails.length) {
    console.log('');
    fails.forEach(m => console.log('  ✗ ' + m));
    console.log(`\nsmoke-crystal-bloom: 失败 ${fails.length} 项`);
    process.exit(1);
}
console.log(`\nsmoke-crystal-bloom: 全部通过（第 1 皿现算解 t=${SOL.t} T=${SOL.T}℃ q=${SOL.q.toFixed(3)}）`);
