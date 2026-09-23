#!/usr/bin/env node
/**
 * smoke-ripple-duet — 涟漪双生页运行时冒烟 + 教学内核真机验证。
 *
 * 几何/元素存在性证明不了「游戏能玩」。本脚本走真实交互链：
 *   menu → startLevel(0) → 真实鼠标拖波源（一次拖动 = 一次操作）
 *   → 真实点击 −/+ 拧相位（每档一次操作）→ 未达标定格不终局
 *   → 达标定格通关（cost = par → 3 星）→ 空转一圈再定格掉到 1 星
 *   → 每日 5 皿全程通关 → 抽屉暂停冻结动画钟 → 重开/回菜单复位
 *
 * 六条静态校验器测不到、必须真机证明的教学内核：
 *   · 拖动记 1 次操作（拖多远都一样），相位每 45° 记 1 次
 *   · 相位是环形的：绕一圈（8 档）回到原相位，但代价照记 ⇒ 冤枉路真掉星
 *   · 不达标定格只给读数反馈不终局（没有失败态，继续调就是）
 *   · 星级语义：cost = par → 3 星；超出 slack → 1 星
 *   · 一个源永远消不掉自己的波（教学核心）：单源关的「平静」点必须有风暴配合才可能达标
 *     这里用「初始摆位不达标」+ 求解器摆位达标来侧面证明判定确实在算干涉
 *   · 抽屉契约：pauseQuiet 冻结动画时钟（波面静止）
 *
 * 关键：
 *   · 通关解一律取内核 R.solvePar(spec)（下界已由 verify-ripple-duet-levels
 *     反向穷举所有 cost<par 摆位证明），绝不手填 —— 手填的解一旦和内核漂移，
 *     冒烟就成了假绿。
 *   · 拖源走真实鼠标 down/move/up（覆盖 sourceAt + pointerdown/move/up 三层）。
 *   · 语言态显式 setItem('site_lang','zh')（headless 默认 en-US）。
 */
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import * as R from '../js/ripple-duet-rules.js';
import { LEVELS } from '../js/ripple-duet-levels.js';

const BASE = process.argv.find(a => a.startsWith('http')) || 'http://127.0.0.1:8899';
const fails = [];
const fail = m => fails.push(m);
const pass = m => console.log('  ✓ ' + m);
const wait = ms => new Promise(r => setTimeout(r, ms));

/* 控制台命中区（与 js/ripple-duet.js 的 BTN/CHIP 常量同源） */
const BTN = {
    minus: { x: 330, y: 552, w: 64, h: 64 },
    plus: { x: 400, y: 552, w: 64, h: 64 },
    freeze: { x: 470, y: 552, w: 70, h: 64 },
};
const CHIP = { x: 20, y: 552, w: 62, h: 64, gap: 6 };
const center = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const chipCenter = (i) => center({ x: CHIP.x + i * (CHIP.w + CHIP.gap), y: CHIP.y, w: CHIP.w, h: CHIP.h });

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
await page.goto(`${BASE}/ripple-duet.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await wait(1200);

/* ── 舞台逻辑坐标 ── */
async function toPage(sx, sy) {
    const r = await page.evaluate(() => {
        const b = document.getElementById('rd-canvas').getBoundingClientRect();
        return { x: b.x, y: b.y, w: b.width, h: b.height };
    });
    return { x: r.x + (sx / R.STAGE.w) * r.w, y: r.y + (sy / R.STAGE.h) * r.h };
}
async function clickStage(sx, sy) {
    const p = await toPage(sx, sy);
    await page.mouse.click(p.x, p.y);
    await wait(140);
}
/** 真实鼠标拖动：按住源 → 移到目标格 → 松开（记 1 次操作） */
async function dragSource(idx, i, j) {
    const from = await page.evaluate((n) => {
        const g = window.rdGame;
        return { x: R.gridX(g.place[n].i), y: R.gridY(g.place[n].j) };
    }, idx).catch(() => null);
    const cur = await page.evaluate((n) => {
        const g = window.rdGame;
        const s = g.place[n];
        return { i: s.i, j: s.j };
    }, idx);
    const a = await toPage(R.gridX(cur.i), R.gridY(cur.j));
    const b = await toPage(R.gridX(i), R.gridY(j));
    void from;
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await wait(60);
    await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2);
    await page.mouse.move(b.x, b.y, { steps: 3 });
    await wait(60);
    await page.mouse.up();
    await wait(140);
}

/** 把求解器给的摆位用**真实操作**摆出来（先拖位，再按最短方向拧相位） */
async function applySolved(spec) {
    const solved = R.solvePar(spec);
    if (!solved.place) return solved;
    for (let idx = 0; idx < solved.place.length; idx++) {
        const want = solved.place[idx];
        await clickStage(chipCenter(idx).x, chipCenter(idx).y);   // 选中该源
        const cur = await page.evaluate((n) => ({ ...window.rdGame.place[n] }), idx);
        if (cur.i !== want.i || cur.j !== want.j) await dragSource(idx, want.i, want.j);
        const ph0 = await page.evaluate((n) => window.rdGame.place[n].ph, idx);
        const d = (((want.ph - ph0) % R.PHASES) + R.PHASES) % R.PHASES;
        const forward = d <= R.PHASES - d;
        const steps = forward ? d : R.PHASES - d;
        const btn = forward ? BTN.plus : BTN.minus;
        const c = center(btn);
        for (let n = 0; n < steps; n++) await clickStage(c.x, c.y);
    }
    return solved;
}

/* ── 1. bootstrap ── */
console.log('\n▶ 1. bootstrap');
{
    const boot = await page.evaluate(() => ({
        hasGame: !!window.rdGame,
        hasDrawer: !!window.rdDrawer,
        state: window.rdGame ? window.rdGame.state : null,
        startVisible: !document.getElementById('rd-start').classList.contains('hidden'),
        levelCells: document.querySelectorAll('#rd-level-grid button').length,
        // 5 条色例 + 1 条注记 <p>
        legendRows: document.querySelectorAll('#rd-side-legend > *').length,
        legendSwatches: document.querySelectorAll('#rd-side-legend .rd-legend-row').length,
        moreCards: document.querySelectorAll('#rdSideMore a').length,
        canvasW: document.getElementById('rd-canvas').width,
        title: document.getElementById('rd-title').textContent.trim(),
        hud: document.getElementById('rd-hud-level').textContent.trim(),
    }));
    if (!boot.hasGame) fail('window.rdGame 未创建（boot 失败）');
    if (!boot.hasDrawer) fail('createStatsDrawer 未初始化（window.rdDrawer 缺失）');
    if (boot.state !== 'menu') fail(`初始 state 应为 menu，got ${boot.state}`);
    if (!boot.startVisible) fail('开始覆盖层未显示');
    if (boot.levelCells !== 20) fail(`海面格应渲染 20 个（实际 ${boot.levelCells}）`);
    if (boot.legendSwatches !== 5) fail(`读水图例应有 5 条色例（实际 ${boot.legendSwatches}）`);
    if (boot.legendRows !== 6) fail(`读水图例应有 5 色例 + 1 注记 = 6 个子节点（实际 ${boot.legendRows}）`);
    if (boot.moreCards < 1) fail('桌面侧栏「更多游戏」未渲染');
    if (!boot.canvasW || boot.canvasW < 200) fail(`canvas 后端缓冲未按 CSS 尺寸重算：${boot.canvasW}`);
    if (boot.title !== '涟漪双生') fail(`zh 语言下标题应为「涟漪双生」，got "${boot.title}"（i18n 未接线？）`);
    if (errs.length) fail(`首屏 JS 运行时错误: ${errs.slice(0, 2).join(' | ')}`);
    else pass(`bootstrap：句柄/抽屉/menu 态/20 海面格/图例 ${boot.legendSwatches} 色例+注记/更多游戏 ${boot.moreCards} 条/标题「${boot.title}」`);
}

/* ── 2. 开局 ── */
console.log('\n▶ 2. 开局');
{
    await page.evaluate(() => window.rdGame.startLevel(0));
    await wait(400);
    const l1 = await page.evaluate(() => {
        const g = window.rdGame;
        return {
            state: g.state, cost: g.cost, par: g.spec.par,
            place: JSON.stringify(g.place),
            init: JSON.stringify(g.spec.ctrl.map((c) => ({ i: c.i, j: c.j, ph: c.ph }))),
            satisfied: g.allSatisfied(),
            startHidden: document.getElementById('rd-start').classList.contains('hidden'),
            hud: document.getElementById('rd-hud-level').textContent.trim(),
            budget: document.getElementById('rd-budget').textContent.trim(),
            parHud: document.getElementById('rd-par').textContent.trim(),
        };
    });
    if (l1.state !== 'playing') fail(`开局 state 应为 playing，got ${l1.state}`);
    else if (l1.cost !== 0) fail(`开局应零操作，got ${l1.cost}`);
    else if (l1.place !== l1.init) fail(`开局摆位应等于关卡初始摆位（${l1.place} ≠ ${l1.init}）`);
    else if (l1.satisfied) fail('初始摆位就已达标（白送）—— 关卡设计失守');
    else if (!l1.startHidden) fail('开局后开始覆盖层未隐藏');
    else if (!/海面\s*1\s*\/\s*20/.test(l1.hud)) fail(`HUD 应显示 海面 1/20，got "${l1.hud}"`);
    else if (l1.budget !== '0') fail(`开局操作数应 0，got "${l1.budget}"`);
    else if (l1.parHud !== `目标 ${l1.par}`) fail(`par HUD 应为「目标 ${l1.par}」，got "${l1.parHud}"`);
    else pass(`开局：state=playing、零操作、初始摆位不达标、HUD "${l1.hud}"、${l1.parHud}`);
}

/* ── 3. canvas 位图非空 ── */
console.log('\n▶ 3. canvas 位图');
{
    const ink = await page.evaluate(() => {
        const c = document.getElementById('rd-canvas');
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
}

/* ── 4. 真实鼠标拖波源：一次拖动 = 一次操作 ── */
console.log('\n▶ 4. 拖源（真实鼠标）');
{
    const spec = LEVELS[0];
    const solved = R.solvePar(spec);
    if (!solved.place) fail('rd1 求解器无解');
    else {
        const want = solved.place[0];
        // 找一个和初始格不同的落点（rd1 是单源，par ≥1 说明解摆位必然动过）
        const before = await page.evaluate(() => ({ ...window.rdGame.place[0], cost: window.rdGame.cost }));
        if (want.i === before.i && want.j === before.j) {
            // 解摆位只拧了相位：随便拖一格验证拖动本身
            await dragSource(0, (want.i + 1) % R.GRID.cols, (want.j + 1) % R.GRID.rows);
        } else {
            await dragSource(0, want.i, want.j);
        }
        const after = await page.evaluate(() => ({ ...window.rdGame.place[0], cost: window.rdGame.cost }));
        const moved = after.i !== before.i || after.j !== before.j;
        if (!moved) fail(`真实拖动没挪动波源（dragFrom ${JSON.stringify(before)} → ${JSON.stringify(after)}）：sourceAt/pointermove 未接通？`);
        else if (after.cost !== before.cost + 1) fail(`一次拖动应只记 1 次操作，got ${before.cost} → ${after.cost}`);
        else pass(`真实拖动：(${before.i},${before.j}) → (${after.i},${after.j})、操作 ${before.cost} → ${after.cost}（拖多远都只记 1）`);

        // 原地拖（按下→松开没换格）不该记操作
        const c0 = await page.evaluate(() => window.rdGame.cost);
        await dragSource(0, after.i, after.j);
        const c1 = await page.evaluate(() => window.rdGame.cost);
        if (c1 !== c0) fail(`原地拖不该记操作，got ${c0} → ${c1}`);
        else pass(`原地拖不计费：操作仍为 ${c1}`);
    }
}

/* ── 5. −/+ 拧相位：每档一次操作，8 档一圈 ── */
console.log('\n▶ 5. 拧相位（真实点击）');
{
    const p0 = await page.evaluate(() => ({ ph: window.rdGame.place[0].ph, cost: window.rdGame.cost }));
    await clickStage(center(BTN.plus).x, center(BTN.plus).y);
    const p1 = await page.evaluate(() => ({ ph: window.rdGame.place[0].ph, cost: window.rdGame.cost }));
    if (p1.ph !== (p0.ph + 1) % R.PHASES) fail(`点 + 应进一档，got ${p0.ph} → ${p1.ph}`);
    else if (p1.cost !== p0.cost + 1) fail(`拧一档应记 1 次操作，got ${p0.cost} → ${p1.cost}`);
    else pass(`点 + 进一档（${p0.ph}→${p1.ph}）、操作 ${p1.cost}`);

    // 再拧 7 档 = 绕满一圈回到原相位，代价 +7（环形语义）
    for (let n = 0; n < R.PHASES - 1; n++) await clickStage(center(BTN.plus).x, center(BTN.plus).y);
    const p2 = await page.evaluate(() => ({ ph: window.rdGame.place[0].ph, cost: window.rdGame.cost }));
    if (p2.ph !== p0.ph) fail(`拧满 ${R.PHASES} 档应回到原相位，got ${p2.ph} ≠ ${p0.ph}`);
    else if (p2.cost !== p1.cost + (R.PHASES - 1)) fail(`绕圈代价照记，got ${p1.cost} → ${p2.cost}`);
    else pass(`相位环形：拧满 ${R.PHASES} 档回到 ${p2.ph}，代价照记 ${p2.cost}`);

    await clickStage(center(BTN.minus).x, center(BTN.minus).y);
    const p3 = await page.evaluate(() => window.rdGame.place[0].ph);
    if (p3 !== (p2.ph - 1 + R.PHASES) % R.PHASES) fail(`点 − 应退一档，got ${p2.ph} → ${p3}`);
    else pass(`点 − 退一档：${p2.ph} → ${p3}`);
}

/* ── 6. 未达标定格：只给读数反馈，不终局 ── */
console.log('\n▶ 6. 未达标定格');
{
    await page.evaluate(() => window.rdGame.restartLevel());
    await wait(250);
    const before = await page.evaluate(() => ({
        state: window.rdGame.state, satisfied: window.rdGame.allSatisfied(),
    }));
    if (before.satisfied) fail('rd1 初始摆位就达标（不该发生）');
    await clickStage(center(BTN.freeze).x, center(BTN.freeze).y);
    await wait(250);
    const after = await page.evaluate(() => ({
        state: window.rdGame.state,
        clearHidden: document.getElementById('rd-clear').classList.contains('hidden'),
        toast: document.getElementById('rd-toast').textContent,
        toastOn: !document.getElementById('rd-toast').classList.contains('hidden'),
    }));
    if (after.state !== 'playing') fail(`未达标定格不该终局，state 应仍是 playing，got ${after.state}`);
    else if (!after.clearHidden) fail('未达标时结算面板不应出现');
    else if (!after.toastOn || !after.toast) fail('未达标定格应弹一条读数提示');
    else pass(`未达标定格：state 仍 playing、不弹结算、提示「${after.toast.slice(0, 10)}…」`);
}

/* ── 7. 达标定格 → 通关（cost = par → 3 星） ── */
console.log('\n▶ 7. 达标定格');
{
    await page.evaluate(() => window.rdGame.restartLevel());
    await wait(250);
    const solved = await applySolved(LEVELS[0]);
    const pre = await page.evaluate(() => ({
        cost: window.rdGame.cost, par: window.rdGame.spec.par, satisfied: window.rdGame.allSatisfied(),
    }));
    if (!pre.satisfied) fail(`按求解器摆位后应达标（cost ${pre.cost}），allSatisfied 仍 false`);
    else if (pre.cost !== pre.par) fail(`摆位代价 ${pre.cost} 应等于 par ${pre.par}（求解器给出的是最小代价）`);
    await clickStage(center(BTN.freeze).x, center(BTN.freeze).y);
    await wait(400);
    const w = await page.evaluate(() => ({
        state: window.rdGame.state,
        stars: document.getElementById('rd-clear-stars').textContent.trim(),
        line: document.getElementById('rd-clear-line').textContent.trim(),
        clearVisible: !document.getElementById('rd-clear').classList.contains('hidden'),
        progress: localStorage.getItem('rd_progress'),
    }));
    if (w.state !== 'won-level') fail(`达标后应进入 won-level，got ${w.state}`);
    else if (w.stars !== '★★★') fail(`cost = par 应 3 星，got "${w.stars}"`);
    else if (!w.clearVisible) fail('结算面板未显示');
    else if (!new RegExp(`操作\\s*${pre.par}`).test(w.line)) fail(`结算应写操作 ${pre.par}，got "${w.line}"`);
    else if (!/"rd1":\{"stars":3/.test(w.progress || '')) fail(`rd_progress 未写入 3 星：${w.progress}`);
    else pass(`达标定格：★★★、${w.line}、rd_progress 已写入（par ${solved.par}）`);
}

/* ── 8. 冤枉路真掉星：拧满一圈回到同一摆位，仍达标但 1 星 ── */
console.log('\n▶ 8. 冤枉路掉星');
{
    await page.evaluate(() => window.rdGame.restartLevel());
    await wait(250);
    await applySolved(LEVELS[0]);
    const c0 = await page.evaluate(() => ({ cost: window.rdGame.cost, par: window.rdGame.spec.par }));
    for (let n = 0; n < R.PHASES; n++) await clickStage(center(BTN.plus).x, center(BTN.plus).y); // 整圈，相位回到原处
    const c1 = await page.evaluate(() => ({ cost: window.rdGame.cost, satisfied: window.rdGame.allSatisfied() }));
    if (!c1.satisfied) fail('拧满整圈后相位回到原处，应仍达标');
    else if (c1.cost !== c0.cost + R.PHASES) fail(`整圈应记 ${R.PHASES} 次操作，got ${c0.cost} → ${c1.cost}`);
    await clickStage(center(BTN.freeze).x, center(BTN.freeze).y);
    await wait(400);
    const s = await page.evaluate(() => ({
        state: window.rdGame.state,
        stars: document.getElementById('rd-clear-stars').textContent.trim(),
        cost: window.rdGame.cost,
    }));
    const wantStars = R.starsForLevel(c0.par + R.PHASES, c0.par);
    if (s.state !== 'won-level') fail(`拧满整圈后仍应能通关，got ${s.state}`);
    else if (s.stars !== '★☆☆') fail(`超出 slack(${R.RULES.slack}) 的冤枉路应掉到 1 星，got "${s.stars}"（wantStars 计算值 ${wantStars}）`);
    else pass(`冤枉路掉星：操作 ${s.cost}（par ${c0.par} + 空转 ${R.PHASES}）→ ${s.stars}`);
}

/* ── 9. 每日 5 皿全程通关 ── */
console.log('\n▶ 9. 每日赛程');
{
    await page.evaluate(() => window.rdGame.toMenu());
    await wait(200);
    await page.evaluate(() => window.rdGame.startDaily());
    await wait(300);
    const d0 = await page.evaluate(() => {
        const g = window.rdGame;
        return {
            mode: g.mode, n: g.daily ? g.daily.course.length : 0,
            hud: document.getElementById('rd-hud-level').textContent.trim(),
            keys: g.daily ? g.daily.course.map(s => `${s.lambda}:${s.par}`).join(',') : '',
        };
    });
    if (d0.mode !== 'daily') fail(`每日 mode 应 daily，got ${d0.mode}`);
    else if (d0.n !== R.DAILY_COUNT) fail(`每日应 ${R.DAILY_COUNT} 皿，got ${d0.n}`);
    else if (!/每日\s*1\s*\/\s*5/.test(d0.hud)) fail(`HUD 应显示 每日 1/5，got "${d0.hud}"`);
    else pass(`每日开场：${R.DAILY_COUNT} 皿、HUD "${d0.hud}"、赛程 ${d0.keys}`);

    let total = 0;
    let bad = 0;
    for (let w = 0; w < R.DAILY_COUNT; w++) {
        const spec = await page.evaluate(() => window.rdGame.spec);
        const solved = await applySolved(spec);
        const st = await page.evaluate(() => ({
            cost: window.rdGame.cost, par: window.rdGame.spec.par, satisfied: window.rdGame.allSatisfied(),
            hud: document.getElementById('rd-hud-level').textContent.trim(),
        }));
        if (!st.satisfied || st.cost !== st.par || !Number.isFinite(solved.par)) {
            bad++;
            fail(`每日第 ${w + 1} 皿按求解器摆位未达标/代价不符（cost ${st.cost} / par ${st.par}）`);
            break;
        }
        total += st.cost;
        await clickStage(center(BTN.freeze).x, center(BTN.freeze).y);
        await wait(300);
        await page.click('#rd-btn-next');
        await wait(300);
    }
    const fin = await page.evaluate(() => ({
        state: window.rdGame.state,
        hud: document.getElementById('rd-hud-level').textContent.trim(),
        overVisible: !document.getElementById('rd-over').classList.contains('hidden'),
        title: document.getElementById('rd-over-title').textContent.trim(),
        score: document.getElementById('rd-over-score').textContent.trim(),
    }));
    if (bad) { /* 已 fail */ }
    else if (fin.state !== 'won-daily') fail(`5 皿走完应进入 won-daily，got ${fin.state}`);
    else if (!fin.overVisible) fail('每日结算面板未显示');
    else if (fin.title !== '每日完成！') fail(`zh 下每日标题应为「每日完成！」，got "${fin.title}"`);
    else if (!fin.score.includes(String(total))) fail(`每日总分应为 ${total}，got "${fin.score}"`);
    else pass(`每日通关：5 皿全 3 星路径、总操作 ${total}、${fin.title} ${fin.score}`);
}

/* ── 10. 抽屉契约：暂停冻结动画钟 ── */
console.log('\n▶ 10. 抽屉暂停');
{
    await page.evaluate(() => window.rdGame.toMenu());
    await wait(200);
    await page.evaluate(() => window.rdGame.startLevel(0));
    await wait(300);
    const t0 = await page.evaluate(() => { window.rdGame.pauseQuiet(); return { paused: window.rdGame.isPaused, running: window.rdGame.isRunning(), time: window.rdGame.time }; });
    await wait(500);
    const t1 = await page.evaluate(() => ({ time: window.rdGame.time, running: window.rdGame.isRunning() }));
    await page.evaluate(() => window.rdGame.resumeQuiet());
    await wait(300);
    const t2 = await page.evaluate(() => ({ paused: window.rdGame.isPaused, running: window.rdGame.isRunning(), time: window.rdGame.time }));
    if (!t0.paused || t0.running) fail('pauseQuiet 后 isPaused 应 true / isRunning 应 false');
    else if (Math.abs(t1.time - t0.time) > 0.02) fail(`暂停时动画钟仍在走（波面会继续起伏）：${t0.time.toFixed(2)} → ${t1.time.toFixed(2)}`);
    else if (t2.paused || !t2.running) fail('resumeQuiet 后应恢复 running');
    else if (Math.abs(t2.time - t1.time) < 0.05) fail(`resumeQuiet 后动画钟应继续走（${t1.time.toFixed(2)} → ${t2.time.toFixed(2)}）`);
    else pass(`抽屉契约：暂停冻结波面时钟（${t0.time.toFixed(2)}→${t1.time.toFixed(2)}）、恢复后继续（→${t2.time.toFixed(2)}）`);
}

/* ── 11. 复位：重开 / 回菜单 ── */
console.log('\n▶ 11. 复位');
{
    const r1 = await page.evaluate(() => {
        const g = window.rdGame;
        g.turnPhase(1);
        g.turnPhase(1);
        g.restartLevel();
        return {
            state: g.state, cost: g.cost, sel: g.sel,
            place: JSON.stringify(g.place), init: JSON.stringify(g.spec.ctrl.map(c => ({ i: c.i, j: c.j, ph: c.ph }))),
            budget: document.getElementById('rd-budget').textContent.trim(),
        };
    });
    if (r1.state !== 'playing' || r1.cost !== 0 || r1.place !== r1.init || r1.budget !== '0') {
        fail(`重开应复位（state ${r1.state} / 操作 ${r1.cost} / HUD "${r1.budget}" / 摆位 ${r1.place}）`);
    } else pass('重开复位：摆位回初始、操作清零、HUD 归零');

    const r2 = await page.evaluate(() => {
        const g = window.rdGame;
        g.toMenu();
        return {
            state: g.state,
            startVisible: !document.getElementById('rd-start').classList.contains('hidden'),
            clearHidden: document.getElementById('rd-clear').classList.contains('hidden'),
            hud: document.getElementById('rd-hud-level').textContent.trim(),
        };
    });
    if (r2.state !== 'menu' || !r2.startVisible || !r2.clearHidden) fail(`回菜单应复位（${JSON.stringify(r2)}）`);
    else pass(`回菜单复位：menu、开始层出现、结算层隐藏、HUD "${r2.hud}"`);
}

if (errs.length) fail(`页面 JS 运行时错误 ${errs.length} 条：${errs.slice(0, 3).join(' | ')}`);

await browser.close();

console.log(`\nsmoke-ripple-duet ${fails.length ? `失败 ❌（${fails.length}）` : '全部通过 ✅'}`);
if (fails.length) {
    console.log(fails.map(m => '  ✗ ' + m).join('\n'));
    process.exit(1);
}
