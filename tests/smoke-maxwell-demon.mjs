#!/usr/bin/env node
/**
 * smoke-maxwell-demon — 麦克斯韦妖页运行时冒烟 + 教学内核真机验证。
 *
 * 几何/元素存在性证明不了「游戏能玩」。本脚本走真实交互链：
 *   menu → startLevel(0) → 键盘 f 观测 / 空格武装 → 真放行一个分子
 *   → 拉出温差 → 通关结算 → 星级写入 canonical GameStorage slot → 破产宽限 → 每日赛程 → 复位
 *
 * 六条静态校验器测不到、必须真机证明的教学内核：
 *   · 观测：花钱才看得见快慢（revealT 计时，分子常态不可辨）
 *   · 武装：只放**第一个**抵达门洞的分子，门随即合上（pass 事件 + 换腔）
 *   · 武装超时作废：钱照花（gateExpire 事件）
 *   · 温差：达标后还要 holdTime 1.6s 才算赢
 *   · 破产：预算见底进入 graceTime 宽限，期内没达标才判负
 *   · 暂停租约（切后台）：pauseQuiet 冻住物理（时间不前进）
 *
 * 关键：
 *   · 动作一律走真实键盘事件（不是直接调内核函数），否则测不到输入层。
 *   · 事件用 hook 收集 —— 页面 consumeEvents() 每帧把 world.events 清空，
 *     事后读 events 永远是空数组（这是本作最容易误判的地方）。
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
await page.goto(`${BASE}/maxwell-demon.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await wait(1200);

/** 事件收集 hook：包住 consumeEvents，把真实内核事件抄一份出来 */
await page.evaluate(() => {
    const g = window.mdGame;
    window.__ev = [];
    const orig = g.consumeEvents.bind(g);
    g.consumeEvents = function () {
        const w = this.world;
        if (w && w.events.length) window.__ev.push(...w.events.map(e => e.type));
        return orig();
    };
    window.__evClear = () => { window.__ev.length = 0; };
});

/* ── 1. bootstrap ── */
const boot = await page.evaluate(() => ({
    hasGame: !!window.mdGame,
    hasPauseOwnership: !!(window.mdGame && window.mdGame.pauseOwnership),
    state: window.mdGame ? window.mdGame.state : null,
    startVisible: !document.getElementById('md-start').classList.contains('hidden'),
    levelChips: document.querySelectorAll('#md-level-grid button').length,
    legendRows: document.querySelectorAll('#md-legend > *').length,
    moreCards: document.querySelectorAll('#mdStartMore a').length,
    records: document.getElementById('md-records').textContent.trim(),
    immersive: document.body.classList.contains('has-immersive-stage'),
    drawerGone: !document.getElementById('mdStatsDrawer') && !document.querySelector('.game-sidebar'),
    // 声音开关只有顶栏一个写入者：开始界面里曾有第二颗（图标与顶栏不同步）
    soundSwitches: document.querySelectorAll('[data-chrome="sound"], #md-start button[aria-label="Sound"], #md-start-mute').length,
    canvasW: document.getElementById('md-canvas').width,
    hudLevel: document.getElementById('md-hud-level').textContent,
}));
if (!boot.hasGame) fail('window.mdGame 未创建（boot 失败）');
if (!boot.hasPauseOwnership) fail('切后台暂停租约（pauseOwnership）未接线');
if (!boot.immersive) fail('页面未进入 Immersive Stage（body 缺 has-immersive-stage）');
if (!boot.drawerGone) fail('沉浸布局不应再有侧栏 / 统计抽屉');
if (boot.soundSwitches !== 1) fail(`声音开关应只有顶栏一个，实际 ${boot.soundSwitches}`);
if (!/0\s*\/\s*20/.test(boot.records)) fail(`开始界面战绩行应显示 0/20，got "${boot.records}"`);
if (boot.state !== 'menu') fail(`初始 state 应为 menu，got ${boot.state}`);
if (!boot.startVisible) fail('开始覆盖层未显示');
if (boot.levelChips !== 20) fail(`容器格应渲染 20 个（实际 ${boot.levelChips}）`);
if (boot.legendRows < 4) fail(`热力学图例至少应有 4 行（实际 ${boot.legendRows}）`);
if (boot.moreCards < 1) fail('开始界面「更多游戏」未渲染');
if (!boot.canvasW || boot.canvasW < 200) fail(`canvas 后端缓冲未按 CSS 尺寸重算：${boot.canvasW}`);
if (errs.length) fail(`首屏 JS 运行时错误: ${errs.slice(0, 2).join(' | ')}`);
else pass('bootstrap：句柄/沉浸舞台/初始态/20 容器格/战绩/图例/更多游戏');

/* ── 2. 开局 ── */
await page.evaluate(() => { window.__evClear(); window.mdGame.startLevel(0); });
await wait(400);
const l1 = await page.evaluate(() => {
    const g = window.mdGame, w = g.world;
    return {
        state: g.state,
        n: w.molecules.length,
        specN: g.spec.molecules,
        budget: w.total,
        left: w.total - w.spent,
        startHidden: document.getElementById('md-start').classList.contains('hidden'),
        hud: document.getElementById('md-hud-level').textContent,
        parHud: document.getElementById('md-par').textContent,
        budgetHud: document.getElementById('md-budget').textContent,
        scanDimmed: document.getElementById('md-scan-btn').classList.contains('is-dimmed'),
        gap: w.gap,
    };
});
if (l1.state !== 'playing') fail(`开局 state 应为 playing，got ${l1.state}`);
if (l1.n !== l1.specN) fail(`分子数应为 ${l1.specN}，got ${l1.n}`);
if (l1.left !== l1.budget) fail(`开局预算应满额 ${l1.budget}，got ${l1.left}`);
if (!l1.startHidden) fail('开局后开始覆盖层未隐藏');
if (!/1\s*\/\s*20/.test(l1.hud)) fail(`HUD 应显示容器 1/20，got "${l1.hud}"`);
if (l1.scanDimmed) fail('对局中观测钮不应被隐藏（is-dimmed）');
// 开局公平性：成对交替分配速率 ⇒ 初始 ΔT 应当接近 0
if (Math.abs(l1.gap) > 0.12) fail(`开局 ΔT 应接近 0（成对交替分配），got ${l1.gap.toFixed(3)}`);
else pass(`开局：state=playing、${l1.n} 分子、预算 ${l1.budget}、ΔT ${l1.gap.toFixed(3)}、HUD "${l1.hud}"`);

/* ── 3. canvas 位图非空 ── */
const ink = await page.evaluate(() => {
    const c = document.getElementById('md-canvas');
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

/* ── 4. 观测：花钱才看得见快慢 ── */
const beforeScan = await page.evaluate(() => {
    const w = window.mdGame.world;
    return { spent: w.spent, left: w.total - w.spent, revealT: w.revealT, scans: w.scanCount };
});
await page.keyboard.press('f');
await wait(300);
const afterScan = await page.evaluate(() => {
    const w = window.mdGame.world;
    return { spent: w.spent, left: w.total - w.spent, revealT: w.revealT, scans: w.scanCount, ev: window.__ev.slice() };
});
if (afterScan.spent !== beforeScan.spent + 2) fail(`观测应扣 2 预算（${beforeScan.spent} → ${afterScan.spent}）`);
else if (afterScan.scans !== beforeScan.scans + 1) fail(`观测计数应 +1，got ${afterScan.scans}`);
else if (afterScan.revealT <= 0) fail('观测后 revealT 应 >0（否则画面上看不到红蓝）');
else if (!afterScan.ev.includes('scan')) fail(`观测事件未派发，events=${afterScan.ev.join(',')}`);
else pass(`观测：扣 2 预算、revealT=${afterScan.revealT.toFixed(2)}s、scan 事件已派发`);

// 观测有时效：等 scanTime(1.6s) 过后 revealT 必须归零
await wait(1700);
const revealGone = await page.evaluate(() => window.mdGame.world.revealT);
if (revealGone !== 0) fail(`观测时效过后 revealT 应归零，got ${revealGone}`);
else pass('观测时效：1.6s 后显影归零（信息不免费，也不永久）');

/* ── 5. 武装：只放第一个抵达门洞的分子，门随即合上 ── */
// 白盒摆位：把一个分子放到隔板右侧、正对门洞、朝左飞；其余分子撵离门区。
// 判定仍走真实 stepWorld —— 测试只负责「让它有机会撞门」。
//
// ⚠️ 摆位点到门必须留 ~50px 距离：从 evaluate 返回到 keydown 之间要过 100ms 左右，
//    贴着隔板摆的话分子会在按下空格**之前**就撞板弹回（实测：贴近摆位 ⇒ 只收到 gate
//    事件、永远等不到 pass）。同时其他分子必须撵离门区 —— 门只放**第一个**抵达的分子，
//    别人先到就轮不到它。
const armed = await page.evaluate(() => {
    const g = window.mdGame, w = g.world;
    window.__evClear();
    for (let i = 1; i < w.molecules.length; i++) {
        const m = w.molecules[i];
        if (m.x < 280) { m.x = 60; m.vx = -Math.abs(m.vx); }
        else { m.x = 500; m.vx = Math.abs(m.vx); }
        m.vy = 0;
        m.y = 320 + (i % 2 ? 200 : -200);
    }
    const m = w.molecules[0];
    m.x = 340;          // 距隔板带右缘（291）约 49px
    m.y = 320;          // 门中心
    m.vx = -200;        // 0.24s 后抵达门洞，赶得及武装窗口（0.6s）
    m.vy = 0;
    return { side: m.x < 280 ? -1 : 1, spent: w.spent, x: m.x };
});
await page.keyboard.press(' ');
await wait(120);
const gateOn = await page.evaluate(() => {
    const w = window.mdGame.world;
    return { armed: w.gateArmed, open: w.gateOpen, gateT: w.gateT, spent: w.spent, count: w.gateCount, ev: window.__ev.slice() };
});
if (!gateOn.armed) fail('按空格后门应处于武装态（gateArmed）');
else if (gateOn.spent !== armed.spent + 2) fail(`武装应扣 2 预算（${armed.spent} → ${gateOn.spent}）`);
else if (!gateOn.ev.includes('gate')) fail(`武装事件未派发，events=${gateOn.ev.join(',')}`);
else pass(`武装：扣 2 预算、gateT=${gateOn.gateT.toFixed(2)}s、gate 事件已派发`);

await wait(400);
const passed = await page.evaluate(() => {
    const w = window.mdGame.world;
    const m = w.molecules[0];
    return {
        armed: w.gateArmed, open: w.gateOpen, side: m.x < 280 ? -1 : 1,
        ev: window.__ev.slice(), x: m.x,
    };
});
if (!passed.ev.includes('pass')) fail(`分子应被放行（pass 事件缺失，events=${passed.ev.join(',')}）`);
else if (passed.side !== -armed.side) fail(`放行后分子应换腔（${armed.side} → ${passed.side}）`);
else if (passed.armed) fail('放行后门应立刻合上（gateArmed 仍为 true）');
else pass(`放行：分子换腔 ${armed.side}→${passed.side}（x=${passed.x.toFixed(1)}）、门随即合上`);

/* ── 6. 武装超时作废：没人来，钱照花 ── */
// ⚠️ 先等上一轮的武装窗口彻底过期：还在武装态时按空格 = 撤回（gateCancel），
//    测到的就不是「超时作废」而是「主动撤回」了。
await wait(900);
const expireTest = await page.evaluate(() => {
    const g = window.mdGame, w = g.world;
    window.__evClear();
    // 把门洞附近的分子全部挪走，保证这次武装必然无人抵达
    for (const m of w.molecules) {
        if (Math.abs(m.x - 280) < 150 && Math.abs(m.y - 320) < 140) {
            m.x = m.x < 280 ? 60 : 500;
            m.vx = m.x < 280 ? -Math.abs(m.vx) : Math.abs(m.vx);
        }
    }
    return { spent: w.spent };
});
await page.keyboard.press(' ');
await wait(900);   // gateWindow 0.6s + 余量
const expired = await page.evaluate(() => {
    const w = window.mdGame.world;
    return { armed: w.gateArmed, spent: w.spent, ev: window.__ev.slice() };
});
if (!expired.ev.includes('gateExpire')) fail(`无人抵达应派发 gateExpire，events=${expired.ev.join(',')}`);
else if (expired.armed) fail('超时后武装态应解除');
else if (expired.spent !== expireTest.spent + 2) fail(`作废的武装也要扣 2 预算（${expireTest.spent} → ${expired.spent}）`);
else pass('武装超时：gateExpire 事件、门已关、2 预算照扣（代价教学）');

/* ── 7. 通关：温差达标并保持 holdTime 才判胜 ── */
await page.evaluate(() => {
    const g = window.mdGame;
    window.__evClear();
    g.startLevel(0);
    const w = g.world;
    const v0 = 185;
    for (const m of w.molecules) {
        const sp = Math.hypot(m.vx, m.vy) || 1;
        const want = (m.x > 280 ? 0.45 : 1.9) * v0;   // 左热右冷
        m.vx = m.vx / sp * want;
        m.vy = m.vy / sp * want;
    }
});
await wait(600);
const midHold = await page.evaluate(() => ({
    gap: window.mdGame.world.gap,
    holding: window.mdGame.world.holding,
    state: window.mdGame.state,
}));
if (midHold.gap < 0.3) fail(`强制加热后 ΔT 应 ≥0.30，got ${midHold.gap.toFixed(3)}`);
else if (midHold.state !== 'playing') fail(`holdTime 未走满前不应判胜，got ${midHold.state}`);
else pass(`保持计时：ΔT=${midHold.gap.toFixed(3)} 已达标但 holding=${midHold.holding.toFixed(2)}s < 1.6s，仍 playing`);

await wait(2400);
const won = await page.evaluate(() => {
    const g = window.mdGame;
    return {
        state: g.state,
        clearVisible: !document.getElementById('md-clear').classList.contains('hidden'),
        stars: document.getElementById('md-clear-stars').textContent,
        progress: (() => { try { return JSON.parse(localStorage.getItem('game:maxwell-demon:v1:progress') || '{}'); } catch (e) { return null; } })(),
        dlg: g.mode,
    };
});
if (won.state !== 'won-level') fail(`保持满 holdTime 后 state 应为 won-level，got ${won.state}`);
else if (!won.clearVisible) fail('通关后未弹出结算面板');
else if (!won.progress || !won.progress.md1) fail('星级未写入 game:maxwell-demon:v1:progress');
else if (!won.progress.md1.stars || won.progress.md1.stars < 1) fail(`存档星级应 ≥1，got ${won.progress.md1.stars}`);
else pass(`通关：won-level、结算面板弹出、${won.stars} 写入 canonical progress（spent=${won.progress.md1.bestSpent}）`);

/* ── 8. 破产：预算见底 → 宽限 → 判负 ── */
await page.evaluate(() => {
    const g = window.mdGame;
    window.__evClear();
    g.startLevel(0);
    g.world.spent = g.world.total;      // 掏空预算
});
await wait(300);
const brokeNow = await page.evaluate(() => {
    const g = window.mdGame;
    g.wantGate = true;                  // 真实输入路径：按钮此时买不动
    return { state: g.state, grace: g.world.grace };
});
await wait(600);
const brokeEv = await page.evaluate(() => ({ ev: window.__ev.slice(), state: window.mdGame.state }));
if (!brokeEv.ev.includes('broke')) fail(`预算不足时应派发 broke 事件，events=${brokeEv.ev.join(',')}`);
else pass('破产：broke 事件已派发（买不动的动作不会静默失效）');

await wait(3200);   // graceTime 3.0s
const dead = await page.evaluate(() => ({ state: window.mdGame.state, failReason: window.mdGame.failReason }));
if (dead.state !== 'failed') fail(`宽限结束后 state 应为 failed，got ${dead.state}（grace=${brokeNow.grace}）`);
else pass('宽限：graceTime 3s 后判负（state=failed）');

/* ── 9. 每日：5 容器赛程 + HUD 1/5 ── */
const daily = await page.evaluate(() => {
    const g = window.mdGame;
    g.startDaily();
    return {
        mode: g.mode,
        course: g.daily ? g.daily.course.length : -1,
        cursor: g.daily ? g.daily.cursor : -1,
        hud: document.getElementById('md-hud-level').textContent,
        state: g.state,
    };
});
await wait(200);
if (daily.mode !== 'daily') fail(`startDaily 后 mode 应为 daily，got ${daily.mode}`);
else if (daily.course !== 5) fail(`每日应有 5 个容器，got ${daily.course}`);
else if (!/1\s*\/\s*5/.test(daily.hud)) fail(`每日 HUD 应显示 1/5，got "${daily.hud}"`);
else if (daily.state !== 'playing') fail(`每日应立即开局，got ${daily.state}`);
else pass(`每日赛程：${daily.course} 容器、HUD "${daily.hud}"、立即开局`);

/* ── 10. 暂停租约（切后台）：pauseQuiet 必须冻住物理 ── */
const pauseTest = await page.evaluate(async () => {
    const g = window.mdGame;
    g.startLevel(0);
    await new Promise(r => setTimeout(r, 200));
    g.pauseQuiet();
    const t0 = g.world.time;
    const busy = g.isRunning();
    await new Promise(r => setTimeout(r, 400));
    const t1 = g.world.time;
    g.resumeQuiet();
    await new Promise(r => setTimeout(r, 300));
    const t2 = g.world.time;
    return { t0, t1, t2, busy };
});
if (pauseTest.busy) fail('pauseQuiet 后 isRunning() 应为 false');
else if (Math.abs(pauseTest.t1 - pauseTest.t0) > 0.02) fail(`暂停期间世界时间不应前进（${pauseTest.t0.toFixed(3)} → ${pauseTest.t1.toFixed(3)}）`);
else if (pauseTest.t2 - pauseTest.t1 <= 0.05) fail(`resumeQuiet 后世界应继续推进（${pauseTest.t1.toFixed(3)} → ${pauseTest.t2.toFixed(3)}）`);
else pass(`暂停租约：暂停 0.4s 时间冻结、恢复后继续推进（${pauseTest.t1.toFixed(2)}→${pauseTest.t2.toFixed(2)}s）`);

/* ── 11. 重开 / 回菜单必须复位 ── */
const reset = await page.evaluate(() => {
    const g = window.mdGame;
    g.mode = 'levels';      // 上一段已切到每日模式，不复位 HUD 走的还是「每日 x/5」
    g.daily = null;
    g.startLevel(3);
    g.world.spent = 20;
    g.world.scanCount = 5;
    g.restartLevel();
    const afterRestart = {
        spent: g.world.spent, scans: g.world.scanCount, state: g.state,
        n: g.world.molecules.length, hud: document.getElementById('md-hud-level').textContent,
    };
    g.toMenu();
    return {
        afterRestart,
        menu: {
            state: g.state,
            world: g.world,
            startVisible: !document.getElementById('md-start').classList.contains('hidden'),
            clearHidden: document.getElementById('md-clear').classList.contains('hidden'),
            scanDimmed: document.getElementById('md-scan-btn').classList.contains('is-dimmed'),
        },
    };
});
if (reset.afterRestart.spent !== 0) fail(`重开应清零花费，got ${reset.afterRestart.spent}`);
else if (reset.afterRestart.scans !== 0) fail(`重开应清零观测计数，got ${reset.afterRestart.scans}`);
else if (!/4\s*\/\s*20/.test(reset.afterRestart.hud)) fail(`重开后仍应在第 4 容器，got "${reset.afterRestart.hud}"`);
if (reset.menu.state !== 'menu') fail(`toMenu 后 state 应为 menu，got ${reset.menu.state}`);
else if (reset.menu.world !== null) fail('toMenu 后 world 应被清空（否则后台仍在跑物理）');
else if (!reset.menu.startVisible) fail('toMenu 后开始覆盖层未显示');
else if (!reset.menu.clearHidden) fail('toMenu 后结算面板未隐藏');
else if (!reset.menu.scanDimmed) fail('菜单态动作钮应隐藏（is-dimmed），否则会挡住关卡格');
if (!fails.length) pass('重开/回菜单：花费归零、world 清空、动作钮隐藏');

/* ── 读数条带不重叠（手机实测回归：ΔT 压住温度条、T 读数撞角螺栓、预算文字压条并被舞台底边裁掉；
      桌面动作钮浮在画布底角盖住分子与预算条）──
   重放一帧 draw()：记下每个 fillText 的实际像素盒与每根读数条（roundRect 高 ≤ 12），
   要求文字与条两两不相交、文字不进容器（分子活动区）、不出画布；动作钮与画布不相交。 */
const STRIP_VIEWPORTS = [[320, 568], [430, 932], [844, 390], [1280, 800]];
for (const [vw, vh] of STRIP_VIEWPORTS) {
    for (const lang of ['zh', 'en']) {
        await page.setViewport({ width: vw, height: vh });
        await page.evaluate((l) => { localStorage.setItem('site_lang', l); window.dispatchEvent(new Event('site-settings:changed')); }, lang);
        await wait(250);
        const strip = await page.evaluate(() => {
            const g = window.mdGame;
            g.startLevel(0);
            g.world.spent = g.world.total - 2;   // 最长的「已花 · 目标」文案
            g.resize();
            const ctx = g.ctx;
            const texts = [];
            const bars = [];
            const origText = ctx.fillText;
            const origRect = g.roundRect;
            ctx.fillText = function (t, x, y) {
                const m = this.measureText(t);
                const a = this.textAlign;
                const x0 = a === 'center' ? x - m.width / 2 : (a === 'right' || a === 'end') ? x - m.width : x;
                texts.push({ t, x0, x1: x0 + m.width, y0: y - m.actualBoundingBoxAscent, y1: y + m.actualBoundingBoxDescent });
                return origText.call(this, t, x, y);
            };
            g.roundRect = function (c, x, y, w, h, r) {
                if (h <= 12) bars.push({ x0: x, x1: x + w, y0: y, y1: y + h });
                return origRect.call(this, c, x, y, w, h, r);
            };
            try { g.draw(); } finally { ctx.fillText = origText; g.roundRect = origRect; }
            const W = 560, H = 640, pad = 34;
            const hit = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
            const bad = [];
            for (const t of texts) {
                for (const b of bars) if (hit(t, b)) bad.push(`"${t.t}" 压住读数条`);
                if (hit(t, { x0: pad, x1: W - pad, y0: pad, y1: H - pad })) bad.push(`"${t.t}" 画进了容器`);
                if (t.x0 < 0 || t.x1 > W || t.y0 < 0 || t.y1 > H) bad.push(`"${t.t}" 超出画布`);
            }
            const cv = document.getElementById('md-canvas').getBoundingClientRect();
            const st = document.getElementById('md-stage').getBoundingClientRect();
            const inside = r => r.left >= st.left - 1 && r.right <= st.right + 1 && r.top >= st.top - 1 && r.bottom <= st.bottom + 1;
            for (const id of ['md-scan-btn', 'md-gate-btn']) {
                const r = document.getElementById(id).getBoundingClientRect();
                if (r.left < cv.right && cv.left < r.right && r.top < cv.bottom && cv.top < r.bottom) bad.push(`#${id} 盖在画布上`);
                if (!inside(r)) bad.push(`#${id} 超出沉浸舞台`);
                if (r.width < 44) bad.push(`#${id} 触摸目标 ${r.width}px < 44`);
            }
            // 沉浸舞台：容器等比放进舞台（不变形、不出界），且至少用满舞台宽或高的一边
            if (!inside(cv)) bad.push('画布超出沉浸舞台');
            if (Math.abs(cv.width / cv.height - W / H) > 0.01) bad.push(`画布比例 ${(cv.width / cv.height).toFixed(3)} ≠ ${(W / H).toFixed(3)}`);
            if (cv.width < st.width * 0.6 && cv.height < st.height * 0.6) bad.push(`画布 ${Math.round(cv.width)}×${Math.round(cv.height)} 没用上舞台 ${Math.round(st.width)}×${Math.round(st.height)}`);
            g.toMenu();
            return { bad, nText: texts.length, nBars: bars.length };
        });
        if (strip.nText < 5 || strip.nBars < 4) fail(`${vw}×${vh} ${lang}: 读数条带未绘制完整（文字 ${strip.nText}、条 ${strip.nBars}）`);
        else if (strip.bad.length) fail(`${vw}×${vh} ${lang}: ${strip.bad.slice(0, 3).join(' | ')}`);
    }
}
if (!fails.length) pass('读数条带 + 沉浸舞台：320/430/844 横屏/1280 × 中英文，文字不压条、不进容器、不出画布；画布等比放满舞台，动作钮不盖画布、不出舞台');

if (errs.length) fail(`对局中 JS 运行时错误: ${errs.slice(0, 3).join(' | ')}`);

await browser.close();

console.log('');
ok.forEach(m => console.log('  ✓ ' + m));
if (fails.length) {
    console.log('');
    fails.forEach(m => console.log('  ✗ ' + m));
    console.log(`\nsmoke-maxwell-demon: 失败 ${fails.length} 项`);
    process.exit(1);
}
console.log('\nsmoke-maxwell-demon: 全部通过');
