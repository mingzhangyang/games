#!/usr/bin/env node
/**
 * smoke-echo-cave — echo-cave（回声洞窟）页运行时冒烟 + 最小可玩性路径。
 *
 * 几何/元素存在性只能证明「页面长得对」，测不出「游戏能玩」。本脚本走真实交互链：
 *   menu → startLevel(0) → 键盘走位（BFS 现算路线，不硬编码像素）+ 空格发脉冲
 *   → 拾晶 → 走进洞口 → 通关结算 → 星级写入 ec_progress
 *
 * 另外三条是这作的教学内核，必须由真机证明（静态校验器测不到运行时）：
 *   · 荆棘：踩上去扣护心 + 被击退
 *   · 苔藓：回波照亮但不留记忆残光（与岩壁相反）
 *   · 每日：5 洞赛程、HUD 显示 1/5
 *
 * 关键：
 *   · 路线一律由页面实时状态（world.grid / world.thorns / player）现算 BFS ——
 *     硬编码地图坐标会在任何关卡调整后静默失准。
 *   · 移动用真实键盘事件（不是直接改坐标），否则测不到输入层与碰撞层。
 *   · 语言态显式 setItem('site_lang','zh')（headless 默认 en-US）。
 */
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';

const BASE = process.argv.find(a => a.startsWith('http')) || 'http://127.0.0.1:8899';
const fails = [];
const fail = m => fails.push(m);
const ok = [];
const pass = m => ok.push(m);
const wait = ms => new Promise(r => setTimeout(r, ms));

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
await page.goto(`${BASE}/echo-cave.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await wait(1200);

/* ── 1. bootstrap ── */
const boot = await page.evaluate(() => ({
    hasGame: !!window.ecGame,
    hasDrawer: !!window.ecDrawer,
    state: window.ecGame ? window.ecGame.state : null,
    startVisible: !document.getElementById('ec-start').classList.contains('hidden'),
    levelChips: document.querySelectorAll('#ec-level-grid button').length,
    legendRows: document.querySelectorAll('#ec-side-legend .ec-legend-row').length,
    moreCards: document.querySelectorAll('#ecSideMore a').length,
    canvasW: document.getElementById('ec-canvas').width,
    hudLevel: document.getElementById('ec-hud-level').textContent,
}));
if (!boot.hasGame) fail('window.ecGame 未创建（boot 失败）');
if (!boot.hasDrawer) fail('createStatsDrawer 未初始化');
if (boot.state !== 'menu') fail(`初始 state 应为 menu，got ${boot.state}`);
if (!boot.startVisible) fail('开始覆盖层未显示');
if (boot.levelChips !== 20) fail(`关卡格应渲染 20 个（实际 ${boot.levelChips}）`);
// 图例 = 岩壁/苔藓/声晶/出口/荆棘/法则，允许日后加行，但不能掉到 5 行以下
if (boot.legendRows < 5) fail(`声学图例至少应有 5 行（实际 ${boot.legendRows}）`);
if (boot.moreCards < 1) fail('桌面侧栏「更多游戏」未渲染');
if (!boot.canvasW || boot.canvasW < 200) fail(`canvas 后端缓冲未按 CSS 尺寸重算：${boot.canvasW}`);
if (errs.length) fail(`首屏 JS 运行时错误: ${errs.slice(0, 2).join(' | ')}`);
else pass('bootstrap：句柄/初始态/20 关格/图例/更多游戏');

/* ── 走位工具：现算 BFS 路线 + 真键盘驱动 ── */
const playerPos = () => page.evaluate(() => {
    const w = window.ecGame.world;
    return { x: w.player.x, y: w.player.y };
});
let CELL = 20;

const pathTo = (tx, ty) => page.evaluate(([gx, gy]) => {
    const w = window.ecGame.world;
    const cols = w.cols, rows = w.rows, cell = w.cell;
    const pcx = Math.floor(w.player.x / cell), pcy = Math.floor(w.player.y / cell);
    // 荆棘 + 曼哈顿 1 圈都算不可走（真实判定 19px vs 格距 20px，贴着走必擦血）
    const blocked = new Set();
    for (const t of w.thorns) {
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (Math.abs(dx) + Math.abs(dy) > 1) continue;
                blocked.add((t.cy + dy) * cols + (t.cx + dx));
            }
        }
    }
    const start = pcy * cols + pcx;
    const prev = new Int32Array(cols * rows).fill(-1);
    prev[start] = start;
    const q = [start];
    for (let h = 0; h < q.length; h++) {
        const cur = q[h];
        const cx = cur % cols, cy = (cur - cx) / cols;
        if (cx === gx && cy === gy) {
            const out = [];
            let k = cur;
            while (prev[k] !== k) { out.push([k % cols, (k - (k % cols)) / cols]); k = prev[k]; }
            return out.reverse();
        }
        const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (const [dx, dy] of nb) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
            const ni = ny * cols + nx;
            if (prev[ni] !== -1 || w.grid[ni] > 0 || blocked.has(ni)) continue;
            prev[ni] = cur;
            q.push(ni);
        }
    }
    return null;
}, [tx, ty]);

/**
 * 走到 (cx,cy) 的**格心**并停在那里，而不是"刚踏进这一格"就松手。
 *
 * 为什么必须对准格心：玩家半径 7px、格宽 20px，贴着格子边缘走时圆会伸进隔壁格；
 * 隔壁若是墙（尤其拐角），下一脚就被卡住 —— 表现是"走到了却过不去"。
 * 每一站都归位到格心，后续的正交移动才不会擦到墙角。
 */
async function walkToCell(cx, cy, timeout = 6000) {
    const t0 = Date.now();
    let held = null;
    let last = null;
    while (Date.now() - t0 < timeout) {
        const pos = await playerPos();
        last = pos;
        const tx = cx * CELL + CELL / 2, ty = cy * CELL + CELL / 2;
        const ex = tx - pos.x, ey = ty - pos.y;
        if (Math.abs(ex) < 3.5 && Math.abs(ey) < 3.5) { if (held) await page.keyboard.up(held); return true; }
        // 两轴都偏 → 先纠纵向（每一步都是单轴位移，此时纵向偏差来自上一站的残留）
        let want;
        if (Math.abs(ey) > 3.5 && Math.abs(ex) > 3.5) want = ey > 0 ? 'ArrowDown' : 'ArrowUp';
        else if (Math.abs(ex) > 3.5) want = ex > 0 ? 'ArrowRight' : 'ArrowLeft';
        else want = ey > 0 ? 'ArrowDown' : 'ArrowUp';
        if (want !== held) {
            if (held) await page.keyboard.up(held);
            await page.keyboard.down(want);
            held = want;
        }
        await wait(45);
    }
    if (held) await page.keyboard.up(held);
    return last ? { stuckAt: `${last.x.toFixed(1)},${last.y.toFixed(1)}` } : false;
}

/** 沿 BFS 路线走到目标格；每 stepEvery 步发一次脉冲（模拟"边走边唱"） */
async function walkRouteTo(tx, ty, stepEvery = 6) {
    const path = await pathTo(tx, ty);
    if (!path) return { okStep: false, reason: 'BFS 无路' };
    for (let i = 0; i < path.length; i++) {
        const reached = await walkToCell(path[i][0], path[i][1]);
        if (reached !== true) {
            const at = reached && reached.stuckAt ? `（停在 ${reached.stuckAt}，目标格心 ${path[i][0] * CELL + CELL / 2},${path[i][1] * CELL + CELL / 2}）` : '';
            return { okStep: false, reason: `卡在 ${path[i].join(',')}${at}` };
        }
        if (stepEvery > 0 && i > 0 && i % stepEvery === 0) await page.keyboard.press('Space');
        const st = await page.evaluate(() => window.ecGame.state);
        if (st !== 'playing') return { okStep: true, ended: st };
    }
    return { okStep: true, ended: null };
}

/* ── 3. E1 真玩：发脉冲 → 拾晶 → 进洞口 → 通关 ── */
await page.evaluate(() => { window.ecGame.startLevel(0); });
await wait(400);
CELL = await page.evaluate(() => window.ecGame.world.cell);

/* ── 2. canvas 位图非空（真画了东西）—— 开局后再量：菜单态只有背景与浮尘，
       采样阈值会把"正常但很暗"误判成空画布 ── */
const ink = await page.evaluate(() => {
    const c = document.getElementById('ec-canvas');
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

const l1 = await page.evaluate(() => {
    const g = window.ecGame, w = g.world;
    return {
        state: g.state, par: g.par, total: w.total, hearts: w.hearts,
        pulseCount: w.pulseCount,
        startHidden: document.getElementById('ec-start').classList.contains('hidden'),
        hudPar: document.getElementById('ec-par').textContent,
    };
});
if (l1.state !== 'playing') fail(`开局 state 应为 playing，got ${l1.state}`);
if (l1.total < 1) fail(`E1 应至少有 1 颗声晶，got ${l1.total}`);
if (l1.hearts !== 3) fail(`开局护心应为 3，got ${l1.hearts}`);
if (!l1.startHidden) fail('开局后开始覆盖层未隐藏');
else pass('E1 开局：state=playing、护心 3、覆盖层已隐藏');

await page.keyboard.press('Space');
await wait(250);
const afterPulse = await page.evaluate(() => {
    const w = window.ecGame.world;
    let glowCells = 0;
    for (let i = 0; i < w.glow.length; i++) if (w.glow[i] > 0.02) glowCells++;
    return { pulseCount: w.pulseCount, active: w.pulses.length, glowCells, hud: document.getElementById('ec-pulses').textContent };
});
if (afterPulse.pulseCount !== 1) fail(`按一次空格应只记 1 次脉冲，got ${afterPulse.pulseCount}`);
if (afterPulse.glowCells < 5) fail(`脉冲应照亮一片区域（glow 格数 ${afterPulse.glowCells}）`);
if (afterPulse.hud !== '1') fail(`HUD 脉冲数应为 1，got "${afterPulse.hud}"`);
else pass(`脉冲：pulseCount=1、照亮 ${afterPulse.glowCells} 格、HUD 同步`);

// 依次走到每颗声晶，最后走进洞口
const targets = await page.evaluate(() => {
    const w = window.ecGame.world;
    return [...w.crystals.map(c => [c.cx, c.cy]), [w.exit.cx, w.exit.cy]];
});
let walkErr = null;
let winState = null;
for (const [tx, ty] of targets) {
    const r = await walkRouteTo(tx, ty);
    if (!r.okStep) { walkErr = r.reason; break; }
    if (r.ended) { winState = r.ended; break; }
}
if (!winState) {
    for (let i = 0; i < 30 && !winState; i++) {
        winState = await page.evaluate(() => (window.ecGame.state !== 'playing' ? window.ecGame.state : null));
        if (!winState) await wait(200);
    }
}
const won = await page.evaluate(() => {
    const g = window.ecGame;
    return {
        state: g.state,
        got: g.world ? g.world.got : -1,
        total: g.world ? g.world.total : -1,
        hearts: g.world ? g.world.hearts : -1,
        pulseUsed: g.pulseUsed,
        par: g.par,
        clearVisible: !document.getElementById('ec-clear').classList.contains('hidden'),
        stars: document.getElementById('ec-clear-stars').textContent,
        progress: (() => { try { return JSON.parse(localStorage.getItem('ec_progress') || '{}'); } catch (e) { return null; } })(),
    };
});
const before = fails.length;
if (walkErr) fail(`E1 走位失败：${walkErr}`);
if (won.state !== 'won-level') fail(`走进洞口后 state 应为 won-level，got ${won.state}`);
if (!won.clearVisible) fail('通关后未弹出结算面板');
if (won.got !== won.total) fail(`应拾齐 ${won.total} 颗声晶，got ${won.got}`);
if (won.hearts !== 3) fail(`par 路线不应掉护心，got ${won.hearts}`);
if (!won.progress || !won.progress.E1) fail('星级未写入 ec_progress');
else if (!won.progress.E1.stars || won.progress.E1.stars < 2) fail(`存档星级应 ≥2，got ${won.progress.E1.stars}`);
if (errs.length) fail(`对局中 JS 运行时错误: ${errs.slice(0, 2).join(' | ')}`);
if (fails.length === before) {
    pass(`E1 通关：${won.got}/${won.total} 晶 · ${won.pulseUsed} 脉冲（par ${won.par}）· 护心 3 · ${won.stars} 写入存档`);
}

/* ── 4. 荆棘：踩上去扣护心 + 击退 ── */
const thornPick = await page.evaluate(() => {
    const g = window.ecGame;
    for (let i = 0; i < 20; i++) {
        g.startLevel(i);
        if (g.world.thorns.length > 0) return { idx: i, thorns: g.world.thorns.length };
    }
    return null;
});
if (!thornPick) fail('20 关里找不到带荆棘的洞窟（关卡数据异常）');
else {
    await wait(150);
    const hit = await page.evaluate(() => {
        const g = window.ecGame, w = g.world;
        const t = w.thorns[0];
        const before = w.hearts;
        // 白盒：把玩家贴到刺边（不能正好落在刺心 —— dx=dy=0 时击退方向无定义、位移为 0）。
        // 判定仍走真实循环的 stepWorld，不是测试自己算的。
        w.player.x = t.x + 6; w.player.y = t.y;
        w.invulnT = 0;
        return { before, tx: t.x, ty: t.y };
    });
    await wait(120);
    const after = await page.evaluate(() => {
        const w = window.ecGame.world;
        return { hearts: w.hearts, knock: Math.abs(w.knockX) + Math.abs(w.knockY), invulnT: w.invulnT };
    });
    if (after.hearts !== hit.before - 1) fail(`踩荆棘应扣 1 点护心（${hit.before} → ${after.hearts}）`);
    else if (after.knock <= 0) fail('踩荆棘应被击退（knock 位移为 0）');
    else if (after.invulnT <= 0) fail('受击后应进入无敌帧（invulnT 未设置）');
    else pass(`荆棘：护心 ${hit.before}→${after.hearts}、击退位移 ${after.knock.toFixed(1)}px、无敌帧 ${after.invulnT.toFixed(2)}s`);
}

/* ── 5. 苔藓：回波照亮但不留记忆残光（与岩壁相反） ── */
const mossPick = await page.evaluate(() => {
    const g = window.ecGame;
    for (let i = 0; i < 20; i++) {
        g.startLevel(i);
        const w = g.world;
        let moss = -1, stand = -1;
        for (let k = 0; k < w.grid.length; k++) {
            if (w.grid[k] !== 2) continue;                 // 2 = MOSS
            const cx = k % w.cols, cy = (k - cx) / w.cols;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const ni = (cy + dy) * w.cols + (cx + dx);
                if (w.grid[ni] === 0) { moss = k; stand = ni; break; }
            }
            if (moss >= 0) break;
        }
        if (moss >= 0) return { idx: i, moss, stand };
    }
    return null;
});
if (!mossPick) fail('20 关里找不到带苔藓且能贴邻站立的洞窟');
else {
    await wait(150);
    await page.evaluate(([moss, stand]) => {
        const g = window.ecGame, w = g.world;
        const cx = stand % w.cols, cy = (stand - cx) / w.cols;
        w.player.x = cx * w.cell + w.cell / 2;
        w.player.y = cy * w.cell + w.cell / 2;
        w.memory.fill(0);
        w.glow.fill(0);
        g.wantPulse = true;
    }, [mossPick.moss, mossPick.stand]);
    await wait(300);
    const lit = await page.evaluate(([moss]) => ({
        glow: window.ecGame.world.glow[moss],
    }), [mossPick.moss]);
    await wait(3400);   // ringLife 3.1s：等回波散尽，memory 才是"残光"
    const mem = await page.evaluate(([moss]) => {
        const w = window.ecGame.world;
        let wallMem = 0;
        for (let k = 0; k < w.grid.length; k++) if (w.grid[k] === 1 && w.memory[k] > 0) wallMem++;
        return { mossMem: w.memory[moss], wallMem };
    }, [mossPick.moss]);
    if (lit.glow <= 0) fail(`苔藓应被回波照亮（glow=${lit.glow}）`);
    else if (mem.mossMem > 0) fail(`苔藓不该留记忆残光（memory=${mem.mossMem}）`);
    else if (mem.wallMem === 0) fail('岩壁应留下记忆残光（找到 0 格）');
    else pass(`苔藓：回波 glow=${lit.glow.toFixed(2)}、残光 0（同期岩壁残光 ${mem.wallMem} 格）`);
}

/* ── 6. 每日：5 洞赛程 + HUD 1/5 ── */
const daily = await page.evaluate(() => {
    const g = window.ecGame;
    g.startDaily();
    return {
        mode: g.mode,
        course: g.daily ? g.daily.course.length : -1,
        cursor: g.daily ? g.daily.cursor : -1,
        hud: document.getElementById('ec-hud-level').textContent,
        state: g.state,
    };
});
await wait(200);
if (daily.mode !== 'daily') fail(`startDaily 后 mode 应为 daily，got ${daily.mode}`);
else if (daily.course !== 5) fail(`每日应有 5 洞，got ${daily.course}`);
else if (!/1\s*\/\s*5/.test(daily.hud)) fail(`每日 HUD 应显示 1/5，got "${daily.hud}"`);
else if (daily.state !== 'playing') fail(`每日应立即开局，got ${daily.state}`);
else pass(`每日赛程：5 洞、HUD "${daily.hud}"、立即开局`);

/* ── 7. 重开 / 回菜单必须复位（含每日态） ── */
const reset = await page.evaluate(() => {
    const g = window.ecGame;
    g.world.pulseCount = 4;
    g.world.hearts = 1;
    g.restartLevel();
    const afterRestart = {
        pulses: g.world.pulseCount, hearts: g.world.hearts, state: g.state,
        mode: g.mode, hud: document.getElementById('ec-hud-level').textContent,
    };
    g.toMenu();
    return {
        afterRestart,
        menu: {
            state: g.state,
            world: g.world,
            startVisible: !document.getElementById('ec-start').classList.contains('hidden'),
            clearHidden: document.getElementById('ec-clear').classList.contains('hidden'),
        },
    };
});
if (reset.afterRestart.pulses !== 0) fail(`重开应清空脉冲计数，got ${reset.afterRestart.pulses}`);
else if (reset.afterRestart.hearts !== 3) fail(`重开应恢复 3 点护心，got ${reset.afterRestart.hearts}`);
else if (!/1\s*\/\s*5/.test(reset.afterRestart.hud)) fail(`重开后仍应在每日第 1 洞，got "${reset.afterRestart.hud}"`);
if (reset.menu.state !== 'menu') fail(`toMenu 后 state 应为 menu，got ${reset.menu.state}`);
else if (reset.menu.world !== null) fail('toMenu 后 world 应被清空（否则后台仍在跑物理）');
else if (!reset.menu.startVisible) fail('toMenu 后开始覆盖层未显示');
else if (!reset.menu.clearHidden) fail('toMenu 后结算面板未隐藏');
if (!fails.length) pass('重开/回菜单：脉冲归零、护心复位、菜单态清空 world');

await browser.close();

console.log('');
ok.forEach(m => console.log('  ✓ ' + m));
if (fails.length) {
    console.log('');
    fails.forEach(m => console.log('  ✗ ' + m));
    console.log(`\nsmoke-echo-cave: 失败 ${fails.length} 项`);
    process.exit(1);
}
console.log('\nsmoke-echo-cave: 全部通过');
