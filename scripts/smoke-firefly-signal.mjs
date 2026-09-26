#!/usr/bin/env node
/**
 * smoke-firefly-signal — 萤火信号的真实交互冒烟（需服务器 + Chrome）
 *
 * 几何检查测不出可玩性，这里走真实输入链（page.mouse / page.touchscreen，命中测试走页面自己的
 * 坐标映射），并把浏览器里的模拟和 Node 里的回放逐位比对：
 *   ① boot：菜单可见、3 个关卡按钮、无 pageerror
 *   ② 通关路径：L1 手动步进模式，按 Node 求解器算出的 (tick, id) 在对应 tick 真的点那只虫
 *      → 每次点击 used +1；浏览器模拟指纹 == Node replay 指纹（同 seed + 同输入 = 同结果）
 *      → 成功序列（HUD 淡出、3 次群体闪光）→ 结算浮层 + 文案（同步度 %、used / max）→ 最佳记录写入
 *   ③ 防误触：320ms 内对同一只虫的第二次点击不生效；冷却中的点击不扣次数；点空白天空不扣次数
 *   ④ 触控目标：偏离虫体 18px 的点击仍命中（≈44px 触控目标）
 *   ⑤ 触屏：touchscreen.tap 命中；在舞台上拖动不滚页（scrollY 不变）；舞台 touch-action:none
 *   ⑥ Continue → 第 2 关；Restart 把次数清零；次数用尽后不再扣
 *   ⑦ resize / 转屏：390×844 → 844×390 → 430×932，舞台高度跟随、画布后备缓冲 = CSS × min(dpr,2)、
 *      点击仍命中同一只虫
 *
 * 用法：node scripts/smoke-firefly-signal.mjs [baseUrl]（verify-all 自动传入）
 */
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { LEVELS } from '../js/firefly-signal/levels.js';
import { replay } from '../js/firefly-signal/simulation.js';
import { solve } from './lib/firefly-solver.mjs';

const BASE = process.argv.find(a => a.startsWith('http')) || 'http://127.0.0.1:8899';
const ORIGIN = new URL(BASE).origin;
const fails = [];
let passes = 0;
const check = (cond, label, extra = '') => { if (cond) passes++; else fails.push(`${label}${extra !== '' ? ' —— ' + extra : ''}`); };

const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: LAUNCH_ARGS });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const errs = [];
page.on('pageerror', e => errs.push(String(e.message || e).split('\n')[0]));
page.on('console', msg => {
    if (msg.type() !== 'error') return;
    const url = (msg.location() && msg.location().url) || '';
    // 源码树直跑的已知 404（analytics / sw-register 由构建拷进 dist）与沙箱外网请求不算
    if (/analytics\.js|sw-register\.js|manifest|apple-touch-icon/.test(url + msg.text())) return;
    if (url && !url.startsWith(ORIGIN)) return;
    if (!url && /ERR_TUNNEL|ERR_NAME|net::/.test(msg.text())) return;
    errs.push(`console: ${msg.text()} @ ${url}`);
});
await page.evaluateOnNewDocument(() => {
    try { localStorage.clear(); localStorage.setItem('site_lang', 'en'); localStorage.setItem('site_muted', '1'); } catch (e) { /* 隐私模式 */ }
});
await page.goto(`${BASE}/firefly-signal.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForFunction(() => !!window.__fireflySignal, { timeout: 10000 });
await new Promise(r => setTimeout(r, 500));

const snap = () => page.evaluate(() => window.__fireflySignal.snapshot());
const G = (fn, ...a) => page.evaluate(fn, ...a);
const flyPos = id => G(i => window.__fireflySignal.flyClientPos(i), id);
const advance = n => G(k => window.__fireflySignal.advance(k), n);
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ① boot */
const boot = await G(() => ({
    state: window.__fireflySignal.state,
    start: !document.getElementById('fs-start').classList.contains('hidden'),
    levels: document.querySelectorAll('#fs-level-list .fs-level-btn').length,
    canvas: document.getElementById('fs-canvas').width,
}));
check(boot.state === 'menu', '① 初始为菜单', boot.state);
check(boot.start, '① 开始菜单可见');
check(boot.levels === LEVELS.length, '① 关卡按钮数 = 关卡数', boot.levels);
check(boot.canvas > 0, '① 画布有后备缓冲');

/* ② 通关路径：真实点击 + 跨环境确定性 */
const L1 = LEVELS[0];
const plan = solve(L1);
check(plan.won, '② Node 求解器能通过第 1 关（前提）');
await G(() => window.__fireflySignal.startLevel(0, { manual: true }));
for (const inp of plan.inputs) {
    const s0 = await snap();
    await advance(inp.tick - s0.tick);
    const p = await flyPos(inp.id);
    const before = (await snap()).used;
    await page.mouse.click(p.x, p.y);
    const after = await snap();
    check(after.used === before + 1, `② 在 tick ${inp.tick} 点虫 #${inp.id}：used +1`, `${before} → ${after.used}`);
    await sleep(360); // 越过误触去抖（真实时间），模拟不前进
}
const tickNow = (await snap()).tick;
const fpBrowser = await G(() => window.__fireflySignal.sim.fingerprint());
const fpNode = replay(L1, L1.seed, plan.inputs, tickNow).fingerprint();
check(fpBrowser === fpNode, '② 浏览器模拟 == Node replay（同 seed + 同输入 = 同结果）',
    fpBrowser === fpNode ? '' : `tick ${tickNow} 指纹不同`);
// 推进到结算（成功序列按 tick 计时）
let st = await snap();
let guard = 0;
let sawFade = false;
while (st.state !== 'result' && guard < 60 * 40) {
    await advance(30);
    guard += 30;
    st = await snap();
    if (st.state === 'ending') sawFade = sawFade || await G(() => document.getElementById('fs-hud').classList.contains('is-faded'));
}
check(st.state === 'result', '② 进入结算', st.state);
check(sawFade, '② 成功序列中 HUD 淡出');
check(st.result && st.result.won, '② 结算为胜利');
const res = await G(() => ({
    visible: !document.getElementById('fs-result').classList.contains('hidden'),
    title: document.getElementById('fs-result-title').textContent,
    harmony: document.getElementById('fs-result-harmony').textContent,
    used: document.getElementById('fs-result-used').textContent,
    next: !document.getElementById('fs-btn-next').classList.contains('hidden'),
    best: localStorage.getItem('fs_best_first-light'),
}));
check(res.visible, '② 结算浮层可见');
check(/Resonance/.test(res.title), '② 结算标题', res.title);
check(/^Harmony \d{2,3}%$/.test(res.harmony), '② 同步度文案（无占位符泄漏）', res.harmony);
check(res.used === `${plan.used} / ${L1.maxInterventions} signals`, '② 次数文案', res.used);
check(res.next, '② 胜利时有 Continue');
check(!!res.best && JSON.parse(res.best).used === plan.used, '② 最佳记录写入 fs_best_first-light', res.best);

/* ⑥ Continue → 第 2 关 */
await page.click('#fs-btn-next');
await sleep(100);
st = await snap();
check(st.state === 'playing' && st.level === 'two-meadows', '⑥ Continue 进入第 2 关', `${st.state}/${st.level}`);

/* ③ 防误触 / 冷却 / 空白 */
await G(() => window.__fireflySignal.startLevel(1, { manual: true }));
await advance(60);
const sky = await G(() => { const r = document.getElementById('fs-canvas').getBoundingClientRect(); return { x: r.left + r.width * 0.1, y: r.top + r.height * 0.12 }; });
await page.mouse.click(sky.x, sky.y);
check((await snap()).used === 0, '③ 点空白天空不扣次数');
const pA = await flyPos(0);
await page.mouse.click(pA.x, pA.y);
await page.mouse.click(pA.x, pA.y);           // 误触双击：立即第二下
check((await snap()).used === 1, '③ 误触双击只算一次', (await snap()).used);
await sleep(360);
await page.mouse.click(pA.x, pA.y);           // 已过去抖但模拟未前进 → 仍在冷却
check((await snap()).used === 1, '③ 冷却中（信号还在扩散）点击不扣次数');

/* ④ 触控目标 ≈ 44px：偏离虫体约 18px 的点击仍算命中（命中最近的虫，不要求像素级点中虫体） */
await advance(60);
const p8 = await flyPos(8);
await page.mouse.click(p8.x + 13, p8.y + 12);  // ≈17.7px
check((await snap()).used === 2, '④ 偏离虫体约 18px 的点击仍命中');

/* ⑥ Restart 清零 */
await page.click('#fs-btn-restart');
await sleep(50);
st = await snap();
check(st.used === 0 && st.state === 'playing', '⑥ Restart 次数清零', JSON.stringify({ used: st.used, state: st.state }));
// 用尽后不再扣
await G(() => window.__fireflySignal.startLevel(0, { manual: true }));
for (let i = 0; i < 5; i++) {
    await advance(45);
    const p = await flyPos(i % 8);
    await page.mouse.click(p.x, p.y);
    await sleep(340);
}
st = await snap();
check(st.used === L1.maxInterventions && st.remaining === 0, '⑥ 次数用尽后不再扣', `${st.used}/${st.max}`);

/* ⑤ 触屏 */
await G(() => window.__fireflySignal.startLevel(1, { manual: true }));
await advance(60);
const t8 = await flyPos(8);
await page.touchscreen.tap(t8.x, t8.y);
check((await snap()).used === 1, '⑤ touchscreen.tap 命中');
const scrollBefore = await G(() => window.scrollY);
const cdp = await page.createCDPSession();
const touch = (type, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: 195, y }] });
await touch('touchStart', 700);
for (let y = 690; y >= 300; y -= 30) await touch('touchMove', y);
await touch('touchEnd');
await sleep(200);
check(await G(() => window.scrollY) === scrollBefore, '⑤ 在舞台上拖动不滚页');
check(await G(() => getComputedStyle(document.getElementById('fs-stage')).touchAction) === 'none', '⑤ 舞台 touch-action:none');
check(await G(() => getComputedStyle(document.getElementById('fs-stage')).userSelect) === 'none', '⑤ 舞台 user-select:none');

/* ⑦ resize / 转屏 */
for (const [w, h] of [[844, 390], [430, 932], [390, 844]]) {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    await sleep(350);
    const g = await G(() => {
        const st = document.getElementById('fs-stage').getBoundingClientRect();
        const tb = document.querySelector('.game-topbar').getBoundingClientRect();
        const c = document.getElementById('fs-canvas');
        return { top: st.top, bottom: st.bottom, tbBottom: tb.bottom, cw: c.width, ch: c.height, cssW: c.clientWidth, cssH: c.clientHeight, dpr: window.devicePixelRatio, vh: innerHeight };
    });
    const exp = Math.min(2, g.dpr);
    check(Math.abs(g.top - g.tbBottom) <= 1 && Math.abs(g.bottom - g.vh) <= 1, `⑦ ${w}×${h}：舞台填满顶栏以下`, JSON.stringify(g));
    check(Math.abs(g.cw - g.cssW * exp) <= 1 && Math.abs(g.ch - g.cssH * exp) <= 1, `⑦ ${w}×${h}：画布后备缓冲 = CSS × min(dpr,2)`, `${g.cw}×${g.ch} vs ${g.cssW}×${g.cssH}`);
    await advance(40);
    const before = (await snap()).used;
    const q = await flyPos(9);
    await page.mouse.click(q.x, q.y);
    check((await snap()).used === before + 1, `⑦ ${w}×${h}：resize 后点击仍命中`);
    await sleep(340);
}

check(errs.length === 0, '无 pageerror / console error', errs.join(' | '));
await browser.close();

if (fails.length) {
    console.error(fails.map(f => `✗ ${f}`).join('\n'));
    console.error(`\nsmoke-firefly-signal：${fails.length} 项失败（${passes} 项通过）❌`);
    process.exit(1);
}
console.log(`smoke-firefly-signal 全部通过 ✅（${passes} 项断言）`);
