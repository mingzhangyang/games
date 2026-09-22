#!/usr/bin/env node
/**
 * smoke-flame-verse — 焰语页运行时冒烟 + 教学内核真机验证。
 *
 * 几何/元素存在性证明不了「游戏能玩」。本脚本走真实交互链：
 *   menu → startLevel(0) → 真实鼠标点盐架投盐 → 键盘投盐 → 满档禁令
 *   → 倒掉重撒（罚金 + 空炉不罚）→ 送检吻合通关 → 送检不吻合只给谱差不终局
 *   → 谱差反馈后补投仍能通关（cost = par → 3 星）→ 误投倒掉必罚（1 星路径）
 *   → 每日 5 皿 → 抽屉暂停冻结 → 复位
 *
 * 六条静态校验器测不到、必须真机证明的教学内核：
 *   · 盐只能加不能减：想减只能倒掉（罚金 2）—— 读数才是技能
 *   · 满档禁令：一种盐最多 3 把，第 4 把必须被拒
 *   · 谱差反馈不打断：送检不吻合只是读数反馈，state 仍是 playing，补投即可
 *   · 星级语义：一把不浪费 = 3 星；误投 + 倒掉必掉星
 *   · 抽屉契约：pauseQuiet 冻结动画时钟
 *
 * 关键：
 *   · 通关解直接取内核 R.LEVELS[n].recipe（下界已由 verify-flame-verse-levels
 *     穷举 4^8 证明），绝不手填 —— 手填的解一旦和内核漂移，冒烟就成了假绿。
 *   · 盐架投盐走真实鼠标点击（覆盖 jarAt + pointerdown 两层）。
 *   · 语言态显式 setItem('site_lang','zh')（headless 默认 en-US）。
 */
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import * as R from '../js/flame-verse-rules.js';

const BASE = process.argv.find(a => a.startsWith('http')) || 'http://127.0.0.1:8899';
const fails = [];
const fail = m => fails.push(m);
const pass = m => console.log('  ✓ ' + m);
const wait = ms => new Promise(r => setTimeout(r, ms));

/** 盐罐中心的舞台坐标（几何与页面 jarRect 同源：RACK.x + i*65, RACK.y, h 88） */
const jarCenter = (i) => ({ x: R.RACK.x + i * 65 + 30.5, y: R.RACK.y + 44 });

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
await page.goto(`${BASE}/flame-verse.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await wait(1200);

/** 舞台逻辑坐标 → 页面像素，真实鼠标点一下 */
async function clickStage(sx, sy) {
    const r = await page.evaluate(() => {
        const b = document.getElementById('fv-canvas').getBoundingClientRect();
        return { x: b.x, y: b.y, w: b.width, h: b.height };
    });
    await page.mouse.click(r.x + (sx / R.STAGE.w) * r.w, r.y + (sy / R.STAGE.h) * r.h);
    await wait(220);
}

/** 按内核配方把盐依次「真实点击」投进火焰（i = EL_ORDER 序） */
async function throwRecipe(recipe) {
    for (const k of R.EL_ORDER) {
        const d = recipe[k] | 0;
        for (let n = 0; n < d; n++) {
            const c = jarCenter(R.EL_ORDER.indexOf(k));
            await clickStage(c.x, c.y);
        }
    }
}

/* ── 1. bootstrap ── */
console.log('\n▶ 1. bootstrap');
{
    const boot = await page.evaluate(() => ({
        hasGame: !!window.fvGame,
        hasDrawer: !!window.fvDrawer,
        state: window.fvGame ? window.fvGame.state : null,
        startVisible: !document.getElementById('fv-start').classList.contains('hidden'),
        levelChips: document.querySelectorAll('#fv-level-grid button').length,
        legendRows: document.querySelectorAll('#fv-side-legend > *').length,
        moreCards: document.querySelectorAll('#fvSideMore a').length,
        canvasW: document.getElementById('fv-canvas').width,
        title: document.getElementById('fv-title').textContent.trim(),
        hud: document.getElementById('fv-hud-level').textContent.trim(),
        runDimmed: document.getElementById('fv-run-btn').classList.contains('is-dimmed'),
        clearDimmed: document.getElementById('fv-clear-btn').classList.contains('is-dimmed'),
    }));
    if (!boot.hasGame) fail('window.fvGame 未创建（boot 失败）');
    if (!boot.hasDrawer) fail('createStatsDrawer 未初始化（window.fvDrawer 缺失）');
    if (boot.state !== 'menu') fail(`初始 state 应为 menu，got ${boot.state}`);
    if (!boot.startVisible) fail('开始覆盖层未显示');
    if (boot.levelChips !== 20) fail(`样品格应渲染 20 个（实际 ${boot.levelChips}）`);
    if (boot.legendRows !== 9) fail(`盐架图谱应有 8 元素 + 1 注记 = 9 行（实际 ${boot.legendRows}）`);
    if (boot.moreCards < 1) fail('桌面侧栏「更多游戏」未渲染');
    if (!boot.canvasW || boot.canvasW < 200) fail(`canvas 后端缓冲未按 CSS 尺寸重算：${boot.canvasW}`);
    if (boot.title !== '焰语') fail(`zh 语言下标题应为「焰语」，got "${boot.title}"（i18n 未接线？）`);
    if (!boot.runDimmed) fail('菜单态送检钮应隐藏（is-dimmed），否则会挡住样品格');
    if (!boot.clearDimmed) fail('菜单态倒掉钮应隐藏');
    if (errs.length) fail(`首屏 JS 运行时错误: ${errs.slice(0, 2).join(' | ')}`);
    else pass(`bootstrap：句柄/初始态/20 样品格/图谱 9 行/更多游戏/标题「${boot.title}」`);
}

/* ── 2. 开局 ── */
console.log('\n▶ 2. 开局');
{
    await page.evaluate(() => window.fvGame.startLevel(0));
    await wait(400);
    const l1 = await page.evaluate(() => {
        const g = window.fvGame;
        let n = 0;
        for (const k of ['li', 'sr', 'ca', 'na', 'ba', 'cu', 'k', 'cs']) n += g.recipe[k] | 0;
        return {
            state: g.state, par: g.spec.par, throws: g.throws, refills: g.refills,
            inFlame: n, startHidden: document.getElementById('fv-start').classList.contains('hidden'),
            hud: document.getElementById('fv-hud-level').textContent.trim(),
            budget: document.getElementById('fv-budget').textContent.trim(),
            parHud: document.getElementById('fv-par').textContent.trim(),
            runDimmed: document.getElementById('fv-run-btn').classList.contains('is-dimmed'),
            toast: document.getElementById('fv-toast').classList.contains('is-on'),
        };
    });
    if (l1.state !== 'playing') fail(`开局 state 应为 playing，got ${l1.state}`);
    else if (l1.inFlame !== 0) fail(`开局炉里应是空的，got ${l1.inFlame} 把`);
    else if (l1.throws !== 0 || l1.refills !== 0) fail(`开局应零代价（投 ${l1.throws} / 倒 ${l1.refills}）`);
    else if (!l1.startHidden) fail('开局后开始覆盖层未隐藏');
    else if (!/样品\s*1\s*\/\s*20/.test(l1.hud)) fail(`HUD 应显示 样品 1/20，got "${l1.hud}"`);
    else if (l1.runDimmed) fail('对局中送检钮不应被隐藏');
    else if (l1.budget !== '0') fail(`开局代价应 0，got "${l1.budget}"`);
    else if (!/目标\s*1/.test(l1.parHud)) fail(`zh 下 par HUD 应「目标 1」（fv1 = na:1），got "${l1.parHud}"`);
    else if (!l1.toast) fail('开局应弹一条玩法提示');
    else pass(`开局：state=playing、空炉、零代价、HUD "${l1.hud}"、${l1.parHud}、提示已弹`);
}

/* ── 3. canvas 位图非空 ── */
console.log('\n▶ 3. canvas 位图');
{
    const ink = await page.evaluate(() => {
        const c = document.getElementById('fv-canvas');
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

/* ── 4. 真实鼠标点盐架投盐 ── */
console.log('\n▶ 4. 盐架投盐（真实点击）');
{
    // fv1 = {na:1}，na 是 EL_ORDER[3]；先错投一把 Li（index 0）制造谱差
    await clickStage(jarCenter(0).x, jarCenter(0).y);
    const s1 = await page.evaluate(() => {
        const g = window.fvGame;
        return { li: g.recipe.li, throws: g.throws, budget: document.getElementById('fv-budget').textContent.trim() };
    });
    if (s1.li !== 1) fail(`点盐架第 1 罐应给 Li +1，got ${s1.li}（jarAt/pointerdown 未接通？）`);
    else if (s1.throws !== 1 || s1.budget !== '1') fail(`投盐后应 throws=1 / 代价 1，got ${s1.throws} / "${s1.budget}"`);
    else pass(`真实点击投盐：Li=1、throws=${s1.throws}、代价 ${s1.budget}`);

    // 满档禁令：连点 3 次到满，第 4 次必须被拒
    for (let n = 0; n < 3; n++) await clickStage(jarCenter(0).x, jarCenter(0).y);
    const s2 = await page.evaluate(() => {
        const g = window.fvGame;
        return { li: g.recipe.li, throws: g.throws, toast: document.getElementById('fv-toast').textContent };
    });
    if (s2.li !== R.RULES.maxDose) fail(`Li 应在 ${R.RULES.maxDose} 把封顶，got ${s2.li}`);
    else if (s2.throws !== 3) fail(`封顶前只该记 3 把（第 1/2/3 下），got ${s2.throws} —— 第 4 下不该被收`);
    else pass(`满档禁令：Li ${s2.li}/3 封顶、throws=${s2.throws}，第 4 把被拒（toast "${s2.toast.slice(0, 14)}…"）`);

    // 键盘 1 → Li 已满应被拒；键盘 4 → Na
    await page.keyboard.press('1');
    await page.keyboard.press('4');
    await wait(150);
    const s3 = await page.evaluate(() => {
        const g = window.fvGame;
        return { li: g.recipe.li, na: g.recipe.na, throws: g.throws };
    });
    if (s3.li !== 3) fail(`键盘 1 在 Li 满档时应被拒，got ${s3.li}`);
    else if (s3.na !== 1) fail(`键盘 4 应投 Na 一把，got ${s3.na}`);
    else pass(`键盘投盐：Li 满 3 不再收、Na=${s3.na}、throws=${s3.throws}`);
}

/* ── 5. 倒掉重撒：罚金 + 空炉不罚 ── */
console.log('\n▶ 5. 倒掉重撒');
{
    await page.evaluate(() => window.fvGame.pressDump());
    await wait(150);
    const d1 = await page.evaluate(() => {
        const g = window.fvGame;
        let n = 0;
        for (const k of ['li', 'sr', 'ca', 'na', 'ba', 'cu', 'k', 'cs']) n += g.recipe[k] | 0;
        return { inFlame: n, refills: g.refills, throws: g.throws, cost: g.cost() };
    });
    if (d1.inFlame !== 0) fail(`倒掉后炉里应是空的，got ${d1.inFlame} 把`);
    else if (d1.refills !== 1) fail(`倒掉应记 1 次，got ${d1.refills}`);
    else if (d1.cost !== d1.throws + R.RULES.refillCost) fail(`代价应 = 投盐 ${d1.throws} + 罚金 ${R.RULES.refillCost}，got ${d1.cost}`);
    else pass(`倒掉重撒：炉清空、罚金入账（投 ${d1.throws} + 罚 ${R.RULES.refillCost} = ${d1.cost}）`);

    const d2 = await page.evaluate(() => {
        const g = window.fvGame;
        const before = g.refills;
        g.pressDump();                    // 空炉再倒：不该收费
        return { charged: g.refills - before, state: g.state };
    });
    if (d2.charged !== 0) fail('空炉倒掉不应收罚金');
    else pass('空炉不罚：倒掉空炉不收罚金');
}

/* ── 6. 送检吻合 → 通关（内核给的解，cost = par → 3 星） ── */
console.log('\n▶ 6. 送检吻合');
{
    await page.evaluate(() => window.fvGame.restartLevel());
    await wait(250);
    await throwRecipe(R.LEVELS[0].recipe);
    await page.evaluate(() => window.fvGame.pressAssay());
    await wait(400);
    const w1 = await page.evaluate(() => {
        const g = window.fvGame;
        return {
            state: g.state,
            stars: document.getElementById('fv-clear-stars').textContent.trim(),
            line: document.getElementById('fv-clear-line').textContent.trim(),
            nextShown: document.getElementById('fv-btn-next').style.display !== 'none',
            progress: localStorage.getItem('fv_progress'),
        };
    });
    if (w1.state !== 'won-level') fail(`吻合后应进入 won-level，got ${w1.state}`);
    else if (w1.stars !== '★★★') fail(`一把不浪费应 3 星，got "${w1.stars}"`);
    else if (!/代价\s*1/.test(w1.line)) fail(`结算应写代价 1，got "${w1.line}"`);
    else if (!w1.nextShown) fail('关卡模式下一份按钮应显示');
    else if (!/"fv1":\{"stars":3/.test(w1.progress || '')) fail(`fv_progress 未写入 3 星：${w1.progress}`);
    else pass(`送检吻合：★★★、${w1.line}、fv_progress 已写入`);
}

/* ── 7. 送检不吻合：谱差反馈，不终局 ── */
console.log('\n▶ 7. 谱差反馈');
{
    await page.evaluate(() => window.fvGame.startLevel(1));
    await wait(250);
    // fv2 = {cu:2}：投 cu1 + na1 → 两条谱差
    await clickStage(jarCenter(R.EL_ORDER.indexOf('cu')).x, jarCenter(R.EL_ORDER.indexOf('cu')).y);
    await clickStage(jarCenter(R.EL_ORDER.indexOf('na')).x, jarCenter(R.EL_ORDER.indexOf('na')).y);
    await page.evaluate(() => window.fvGame.pressAssay());
    await wait(300);
    const m1 = await page.evaluate(() => {
        const g = window.fvGame;
        return {
            state: g.state, diff: g.diff.length,
            clearHidden: document.getElementById('fv-clear').classList.contains('hidden'),
            toast: document.getElementById('fv-toast').textContent,
        };
    });
    if (m1.state !== 'playing') fail(`谱差不该终局，state 应仍是 playing，got ${m1.state}`);
    else if (m1.diff !== 2) fail(`cu 少 1 + na 多 1 应报 2 条谱差，got ${m1.diff}`);
    else if (!m1.clearHidden) fail('谱差时结算面板不应出现');
    else if (!m1.toast) fail('谱差应弹提示');
    else pass(`谱差反馈：${m1.diff} 条（少/多同时报）、state 仍 playing、不弹结算`);

    // 读少补投不罚：重开 fv2，只投 cu1 → 谱差「少 1」→ 补 1 把 → 吻合（cost = par → 3 星）
    await page.evaluate(() => window.fvGame.startLevel(1));
    await wait(250);
    await clickStage(jarCenter(R.EL_ORDER.indexOf('cu')).x, jarCenter(R.EL_ORDER.indexOf('cu')).y);
    await page.evaluate(() => window.fvGame.pressAssay());
    await wait(300);
    const under = await page.evaluate(() => {
        const g = window.fvGame;
        return { state: g.state, diff: g.diff.length, want: g.diff[0] ? g.diff[0].want : -1, got: g.diff[0] ? g.diff[0].got : -1 };
    });
    if (under.state !== 'playing') fail(`读少送检不该终局，got ${under.state}`);
    else if (under.diff !== 1 || under.want !== 2 || under.got !== 1) fail(`应报「cu 少 1」一条谱差，got ${JSON.stringify(under)}`);
    else pass(`读少报「少」：diff 1 条（want 2 / got 1）、不终局`);

    await clickStage(jarCenter(R.EL_ORDER.indexOf('cu')).x, jarCenter(R.EL_ORDER.indexOf('cu')).y);
    await page.evaluate(() => { window.fvGame.pressAssay(); });
    await wait(350);
    const m2 = await page.evaluate(() => {
        const g = window.fvGame;
        return { state: g.state, stars: document.getElementById('fv-clear-stars').textContent.trim(), line: document.getElementById('fv-clear-line').textContent.trim() };
    });
    if (m2.state !== 'won-level') fail(`补投后应通关，got ${m2.state}`);
    else if (m2.stars !== '★★★') fail(`读少了补投不罚，应 3 星，got "${m2.stars}"`);
    else pass(`补投通关：★★★、${m2.line}`);
}

/* ── 8. 误投必罚：倒掉路径掉到 1 星 ── */
console.log('\n▶ 8. 误投必罚');
{
    await page.evaluate(() => window.fvGame.startLevel(2));
    await wait(250);
    // fv3 = {li:1,na:2}（par 3）：投 li+na+sr（3 把，sr 是误投）
    await clickStage(jarCenter(0).x, jarCenter(0).y);
    await clickStage(jarCenter(3).x, jarCenter(3).y);
    await clickStage(jarCenter(1).x, jarCenter(1).y);
    await page.evaluate(() => window.fvGame.pressDump());      // 罚金 2
    await throwRecipe(R.LEVELS[2].recipe);                      // 再投 par=3 把
    await page.evaluate(() => window.fvGame.pressAssay());
    await wait(350);
    const p1 = await page.evaluate(() => {
        const g = window.fvGame;
        return { state: g.state, cost: g.cost(), stars: document.getElementById('fv-clear-stars').textContent.trim() };
    });
    const wantCost = 3 + R.RULES.refillCost + 3;
    if (p1.state !== 'won-level') fail(`倒掉重投后应通关，got ${p1.state}`);
    else if (p1.cost !== wantCost) fail(`代价应 ${wantCost}（3 误投 + 2 罚金 + 3 重投），got ${p1.cost}`);
    else if (p1.stars !== '★☆☆') fail(`误投+倒掉应掉到 1 星，got "${p1.stars}"`);
    else pass(`误投必罚：代价 ${p1.cost}（par 3 + 误投 3 + 罚金 2）、${p1.stars}`);
}

/* ── 9. 每日 5 皿 ── */
console.log('\n▶ 9. 每日赛程');
{
    await page.evaluate(() => window.fvGame.toMenu());
    await wait(200);
    await page.evaluate(() => window.fvGame.startDaily());
    await wait(300);
    const d1 = await page.evaluate(() => {
        const g = window.fvGame;
        return {
            mode: g.mode, n: g.daily ? g.daily.course.length : 0,
            hud: document.getElementById('fv-hud-level').textContent.trim(),
            keys: g.daily ? g.daily.course.map(s => ['li', 'sr', 'ca', 'na', 'ba', 'cu', 'k', 'cs'].map(x => s.recipe[x] | 0).join('')).join(',') : '',
        };
    });
    if (d1.mode !== 'daily') fail(`每日模式 mode 应 daily，got ${d1.mode}`);
    else if (d1.n !== R.DAILY_COUNT) fail(`每日应 ${R.DAILY_COUNT} 皿，got ${d1.n}`);
    else if (!/每日\s*1\s*\/\s*5/.test(d1.hud)) fail(`HUD 应显示 每日 1/5，got "${d1.hud}"`);
    else if (new Set(d1.keys.split(',')).size !== R.DAILY_COUNT) fail(`每日 5 皿不应重复：${d1.keys}`);
    else pass(`每日：${R.DAILY_COUNT} 皿不重复、HUD "${d1.hud}"、配方 ${d1.keys}`);
}

/* ── 10. 抽屉契约：暂停冻结 ── */
console.log('\n▶ 10. 抽屉暂停');
{
    await page.evaluate(() => window.fvGame.toMenu());
    await wait(200);
    await page.evaluate(() => window.fvGame.startLevel(0));
    await wait(250);
    const t0 = await page.evaluate(() => { window.fvGame.pauseQuiet(); return { paused: window.fvGame.isPaused, running: window.fvGame.isRunning(), time: window.fvGame.time }; });
    await wait(450);
    const t1 = await page.evaluate(() => ({ time: window.fvGame.time, running: window.fvGame.isRunning() }));
    await page.evaluate(() => window.fvGame.resumeQuiet());
    await wait(150);
    const t2 = await page.evaluate(() => ({ paused: window.fvGame.isPaused, running: window.fvGame.isRunning() }));
    if (!t0.paused || t0.running) fail('pauseQuiet 后 isPaused 应 true / isRunning 应 false');
    else if (Math.abs(t1.time - t0.time) > 0.02) fail(`暂停时动画时钟仍在走（${t0.time.toFixed(2)} → ${t1.time.toFixed(2)}）`);
    else if (t2.paused || !t2.running) fail('resumeQuiet 后应恢复 running');
    else pass('抽屉契约：pauseQuiet 冻结时钟、resumeQuiet 恢复');
}

/* ── 11. 复位：重开 / 回菜单 ── */
console.log('\n▶ 11. 复位');
{
    const r1 = await page.evaluate(() => {
        const g = window.fvGame;
        g.throwSalt('na');
        g.restartLevel();
        let n = 0;
        for (const k of ['li', 'sr', 'ca', 'na', 'ba', 'cu', 'k', 'cs']) n += g.recipe[k] | 0;
        return { state: g.state, inFlame: n, throws: g.throws, cost: g.cost() };
    });
    if (r1.state !== 'playing' || r1.inFlame !== 0 || r1.throws !== 0 || r1.cost !== 0) {
        fail(`重开应复位（state ${r1.state} / 炉 ${r1.inFlame} / 投 ${r1.throws} / 代价 ${r1.cost}）`);
    } else pass('重开复位：炉空、代价清零');

    const r2 = await page.evaluate(() => {
        const g = window.fvGame;
        g.toMenu();
        return {
            state: g.state, startVisible: !document.getElementById('fv-start').classList.contains('hidden'),
            runDimmed: document.getElementById('fv-run-btn').classList.contains('is-dimmed'),
            hud: document.getElementById('fv-hud-level').textContent.trim(),
        };
    });
    if (r2.state !== 'menu' || !r2.startVisible || !r2.runDimmed) fail(`回菜单应复位（${JSON.stringify(r2)}）`);
    else pass(`回菜单复位：menu、开始层出现、动作钮隐藏、HUD "${r2.hud}"`);
}

await browser.close();

console.log(`\nsmoke-flame-verse ${fails.length ? `失败 ❌（${fails.length}）` : '全部通过 ✅'}`);
if (fails.length) {
    console.log(fails.map(m => '  ✗ ' + m).join('\n'));
    process.exit(1);
}
