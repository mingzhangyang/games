#!/usr/bin/env node
/**
 * smoke-shadow-loom — 影织页运行时冒烟 + 玩法内核真机验证。
 *
 * 几何/元素存在性证明不了「游戏能玩」。本脚本全程走真实鼠标（down → move → up），
 * 覆盖 pieceAt / 拖动 / 灯 / 旋转铜钮 / 判定 / 完成动画 / 结果层 整条链：
 *   ① 菜单：6 个场景芯片，点第一个进入兔（灯固定、无旋转）
 *   ② 拖动响应 = 1/z：同一段鼠标位移，近灯纸片的影子移动更远（渲染与判定同源）
 *   ③ 兔：把每块纸片拖到解 → 相似度过阈值并持续 → solving → 结果层；
 *      移动次数 = 真实拖动次数；进度写入 sl_progress；一次完成 = 是
 *   ④ 鹿（灯行）：钉住的纸片拖不动；拖灯到解灯位 → 钉住纸片的影子归位 → 其余纸片拖到解 → 完成
 *   ⑤ 树（回旋）：点选纸片出现铜钮，拖铜钮转到解角，再拖到位 → 完成
 *   ⑥ 重置：纸片回到初始、「一次完成」变否；键盘 1 + → 移动选中纸片 4px 且记 1 次移动
 *   ⑦ 抽屉契约：pauseQuiet 冻结场景钟与计时，resumeQuiet 恢复
 *   ⑧ 无 pageerror
 *
 * 解一律取内核 compileLevel().solution —— 与 verify-shadow-loom-levels 同源，绝不手填。
 */
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import * as R from '../js/shadow-loom-rules.js';
import { LEVELS } from '../js/shadow-loom-levels.js';

const BASE = process.argv.find(a => a.startsWith('http')) || 'http://127.0.0.1:8899';
const fails = [];
const check = (cond, label, extra = '') => {
    if (cond) console.log(`  ✓ ${label}`);
    else { fails.push(label); console.log(`  ✗ ${label}${extra ? ' —— ' + extra : ''}`); }
};
const wait = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: LAUNCH_ARGS });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
const errs = [];
page.on('pageerror', e => errs.push(String(e.message || e).split('\n')[0]));
await page.evaluateOnNewDocument(() => {
    try {
        localStorage.clear();
        localStorage.setItem('site_lang', 'zh');
        localStorage.setItem('site_muted', '1');
    } catch (e) { /* ignore */ }
});
await page.goto(`${BASE}/shadow-loom.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForFunction(() => window.slGame && window.slGame.state === 'menu', { timeout: 15000 });
await wait(300);

const rect = await page.evaluate(() => {
    const b = document.getElementById('sl-canvas').getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
});
const toPage = (x, y) => ({ x: rect.x + (x / R.STAGE.w) * rect.w, y: rect.y + (y / R.STAGE.h) * rect.h });
const game = fn => page.evaluate(fn);

/** 真实鼠标拖：逻辑坐标 a → b */
async function drag(a, b, steps = 8) {
    const p = toPage(a.x, a.y);
    const q = toPage(b.x, b.y);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await wait(30);
    for (let k = 1; k <= steps; k++) {
        await page.mouse.move(p.x + ((q.x - p.x) * k) / steps, p.y + ((q.y - p.y) * k) / steps);
        await wait(12);
    }
    await wait(30);
    await page.mouse.up();
    await wait(60);
}

async function click(x, y) {
    const p = toPage(x, y);
    await page.mouse.click(p.x, p.y);
    await wait(80);
}

/** 把第 i 块纸片从当前位置拖到解（抓纸片内部一点，平移同样的位移） */
async function dragPieceToSolution(li, i) {
    const sol = R.compileLevel(LEVELS[li]).solution.pieces[i];
    const cur = await page.evaluate(n => ({ ...window.slGame.st.pieces[n], grab: window.slGame.grabPoint(n) }), i);
    await drag(cur.grab, { x: cur.grab.x + sol.x - cur.x, y: cur.grab.y + sol.y - cur.y });
}

const waitState = (s, ms) => page.waitForFunction(v => window.slGame.state === v, { timeout: ms }, s).then(() => true, () => false);

/* ① 菜单 */
console.log('▶ 菜单');
const chips = await page.$$('#sl-level-grid .sl-chip');
check(chips.length === LEVELS.length, `场景芯片 = ${LEVELS.length}`, `实到 ${chips.length}`);
await chips[0].click();
await wait(250);
check(await game(() => window.slGame.state === 'playing' && window.slGame.level.id === 'rabbit'), '点第一个芯片进入「兔」');
check(await game(() => document.getElementById('sl-start').classList.contains('hidden')), '开始菜单隐藏');

/* ② 拖动响应 = 1/z */
console.log('▶ 深度响应');
{
    const L0 = LEVELS[0];
    const near = L0.pieces.findIndex(p => p.z === Math.min(...L0.pieces.map(q => q.z)));
    const far = L0.pieces.findIndex(p => p.z === Math.max(...L0.pieces.map(q => q.z)));
    const measure = async (i) => {
        const before = await page.evaluate(n => ({ ...window.slGame.st.pieces[n], grab: window.slGame.grabPoint(n), lamp: { ...window.slGame.st.lamp } }), i);
        await drag(before.grab, { x: before.grab.x + 20, y: before.grab.y });
        const after = await page.evaluate(n => ({ ...window.slGame.st.pieces[n] }), i);
        const z = L0.pieces[i].z;
        const s0 = R.shadowCenter(before.lamp, before, z);
        const s1 = R.shadowCenter(before.lamp, after, z);
        const back = await page.evaluate(n => window.slGame.grabPoint(n), i);
        await drag(back, { x: back.x - 20, y: back.y });
        return { piece: after.x - before.x, shadow: s1.x - s0.x };
    };
    const a = await measure(near);
    const b = await measure(far);
    check(Math.abs(a.piece - 20) < 1.5 && Math.abs(b.piece - 20) < 1.5, '纸片跟随鼠标 20px', `near=${a.piece.toFixed(1)} far=${b.piece.toFixed(1)}`);
    check(a.shadow > b.shadow + 4, '近灯纸片的影子走得更远（1/z）', `near=${a.shadow.toFixed(1)} far=${b.shadow.toFixed(1)}`);
    check(await game(() => window.slGame.moves === 4), '四次拖动记 4 次移动', String(await game(() => window.slGame.moves)));
}

/* ③ 兔：真实拖动到解 */
console.log('▶ 兔：拖到解');
await game(() => window.slGame.startLevel(0));
await wait(200);
check(await page.evaluate(w => window.slGame.ev.sim < w, R.THRESHOLDS.win), '初始未达阈值');
for (let i = 0; i < LEVELS[0].pieces.length; i++) await dragPieceToSolution(0, i);
const solvedRabbit = await waitState('solving', 4000) || await waitState('done', 100);
check(solvedRabbit, '兔：拖到解后进入完成动画');
check(await waitState('done', 6000), '结果层出现（活影之后）');
check(await game(() => !document.getElementById('sl-result').classList.contains('hidden')), '结果层可见');
{
    const res = await game(() => ({ ...window.slGame.lastResult }));
    check(res.moves === LEVELS[0].pieces.length, `移动次数 = ${LEVELS[0].pieces.length}`, String(res.moves));
    check(res.first === true, '一次完成 = 是');
    check(res.best >= R.THRESHOLDS.win, '最高匹配 ≥ 阈值', res.best.toFixed(3));
    const saved = await game(() => JSON.parse(localStorage.getItem('sl_progress') || '{}'));
    check(!!saved.rabbit, '进度写入 sl_progress.rabbit');
    const ddText = await game(() => [...document.querySelectorAll('#sl-result-stats dd')].map(d => d.textContent));
    check(ddText.length === 4 && ddText[1] === String(res.moves), '结果层四项数据', ddText.join(' | '));
}

/* ④ 鹿：钉住的纸片 + 拖灯 */
console.log('▶ 鹿：拖灯');
{
    const li = LEVELS.findIndex(l => l.id === 'deer');
    await game(() => window.slGame.startLevel(3));
    await wait(200);
    check(await game(() => window.slGame.level.id === 'deer'), '进入鹿');
    const pin = LEVELS[li].pieces.findIndex(p => p.pinned);
    const before = await page.evaluate(n => ({ ...window.slGame.st.pieces[n], grab: window.slGame.grabPoint(n) }), pin);
    await drag(before.grab, { x: before.grab.x + 40, y: before.grab.y + 20 });
    const after = await page.evaluate(n => ({ ...window.slGame.st.pieces[n] }), pin);
    check(after.x === before.x && after.y === before.y, '钉住的纸片拖不动');
    const sol = R.compileLevel(LEVELS[li]).solution;
    const lamp = await game(() => ({ ...window.slGame.st.lamp }));
    await drag({ x: lamp.x, y: lamp.y - 12 }, { x: sol.lamp.x, y: sol.lamp.y - 12 });
    const lamp2 = await game(() => ({ ...window.slGame.st.lamp }));
    check(Math.hypot(lamp2.x - sol.lamp.x, lamp2.y - sol.lamp.y) < 1.5, '灯被拖到解灯位', `${lamp2.x.toFixed(1)},${lamp2.y.toFixed(1)}`);
    const S = R.shadowCenter(lamp2, after, LEVELS[li].pieces[pin].z);
    check(Math.hypot(S.x - LEVELS[li].pieces[pin].sol.x, S.y - LEVELS[li].pieces[pin].sol.y) < 3, '钉住纸片的影子随灯归位');
    for (let i = 0; i < LEVELS[li].pieces.length; i++) if (i !== pin) await dragPieceToSolution(li, i);
    check(await waitState('solving', 4000) || await waitState('done', 100), '鹿：完成');
}

/* ⑤ 树：旋转铜钮 */
console.log('▶ 树：旋转');
{
    const li = LEVELS.findIndex(l => l.id === 'tree');
    await game(() => window.slGame.startLevel(4));
    await wait(200);
    const sol = R.compileLevel(LEVELS[li]).solution;
    const lamp = await game(() => ({ ...window.slGame.st.lamp }));
    await drag({ x: lamp.x, y: lamp.y - 12 }, { x: sol.lamp.x, y: sol.lamp.y - 12 });
    let rotated = 0;
    for (let i = 0; i < LEVELS[li].pieces.length; i++) {
        if (LEVELS[li].pieces[i].pinned) continue;
        const g = await page.evaluate(n => window.slGame.grabPoint(n), i);
        await click(g.x, g.y);   // 点选：出现铜钮
        const cur = await page.evaluate(n => ({ ...window.slGame.st.pieces[n], knob: window.slGame.knobPos(n), sel: window.slGame.sel }), i);
        if (cur.sel !== i) continue;
        const target = sol.pieces[i].rot;
        const r = cur.knob.r;
        const pts = [];
        const steps = 10;
        for (let k = 1; k <= steps; k++) {
            const a = ((cur.rot + ((target - cur.rot) * k) / steps) - 90) * Math.PI / 180;
            pts.push({ x: cur.x + Math.cos(a) * r, y: cur.y + Math.sin(a) * r });
        }
        const p0 = toPage(cur.knob.x, cur.knob.y);
        await page.mouse.move(p0.x, p0.y);
        await page.mouse.down();
        for (const pt of pts) {
            const q = toPage(pt.x, pt.y);
            await page.mouse.move(q.x, q.y);
            await wait(10);
        }
        await page.mouse.up();
        await wait(60);
        const rot = await page.evaluate(n => window.slGame.st.pieces[n].rot, i);
        if (Math.abs(rot - target) < 2) rotated++;
        await dragPieceToSolution(li, i);
    }
    const movable = LEVELS[li].pieces.filter(p => !p.pinned).length;
    check(rotated === movable, `铜钮把 ${movable} 块纸片转到解角`, `${rotated}`);
    check(await waitState('solving', 4000) || await waitState('done', 100), '树：完成');
}

/* ⑥ 重置 + 键盘 */
console.log('▶ 重置与键盘');
{
    await game(() => window.slGame.startLevel(1));
    await wait(150);
    const g = await page.evaluate(() => window.slGame.grabPoint(0));
    await drag(g, { x: g.x + 30, y: g.y });
    await page.click('#sl-reset-btn');
    await wait(150);
    const st = await game(() => ({ p: { ...window.slGame.st.pieces[0] }, resets: window.slGame.resets, moves: window.slGame.moves }));
    const init = R.initialState(LEVELS[1]).pieces[0];
    check(Math.abs(st.p.x - init.x) < 0.01 && Math.abs(st.p.y - init.y) < 0.01, '重置：纸片回到初始位置');
    check(st.resets === 1 && st.moves === 0, '重置：记一次重置、移动清零', JSON.stringify(st));
    await page.keyboard.press('1');
    await page.keyboard.press('ArrowRight');
    await wait(60);
    const k = await game(() => ({ x: window.slGame.st.pieces[0].x, moves: window.slGame.moves }));
    check(Math.abs(k.x - (init.x + 4)) < 0.01 && k.moves === 1, '键盘 1 + → 移动 4px 并记 1 次');
}

/* ⑦ 抽屉契约：静默暂停冻结时钟 */
console.log('▶ 暂停');
{
    await game(() => window.slGame.pauseQuiet());
    const c0 = await game(() => ({ clock: window.slGame.clock, el: window.slGame.elapsed }));
    await wait(350);
    const c1 = await game(() => ({ clock: window.slGame.clock, el: window.slGame.elapsed, run: window.slGame.isRunning() }));
    check(c1.clock === c0.clock && c1.el === c0.el && !c1.run, 'pauseQuiet 冻结场景钟与计时');
    await game(() => window.slGame.resumeQuiet());
    await wait(200);
    check(await game(() => window.slGame.isRunning()), 'resumeQuiet 恢复');
}

check(errs.length === 0, '无 pageerror', errs.join(' | '));
await browser.close();
console.log(fails.length ? `\n✗ smoke-shadow-loom：${fails.length} 项失败` : '\n✓ smoke-shadow-loom 全部通过');
process.exit(fails.length ? 1 : 0);
