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
    executablePath: CHROME_PATH,
    headless: 'new',
    args: LAUNCH_ARGS,
});

const errs = [];
const consoleErrors = [];

function isGardenMidProductionUrl(url) {
    let pathname = url;
    try { pathname = new URL(url).pathname; } catch { /* keep original */ }
    // Match garden-mid.svg and Vite-style garden-mid-<hash>.svg, but never
    // garden-mid-lit(.|-) so the test fails if an unrelated production layer breaks.
    return /\/garden-mid(?:-(?!lit(?:\.|-))[A-Za-z0-9_-]+)?\.svg$/.test(pathname);
}

function attachDiagnostics(target, label, { allowRequestFailure } = {}) {
    target.on('pageerror', e => {
        errs.push(`[${label}] ${String(e.message || e).split('\n')[0]}`);
    });
    target.on('console', msg => {
        if (msg.type() !== 'error') return;
        const url = (msg.location() && msg.location().url) || '';
        if (allowRequestFailure && allowRequestFailure(url)) return;
        consoleErrors.push(`[${label}] ${msg.text().split('\n')[0]} @ ${url}`);
    });
    target.on('requestfailed', request => {
        if (allowRequestFailure && allowRequestFailure(request.url())) return;
        const reason = request.failure()?.errorText || 'unknown';
        errs.push(`[${label}] request failed: ${request.url()} (${reason})`);
    });
}

const page = await browser.newPage();
attachDiagnostics(page, 'main');
await page.setViewport({ width: 1280, height: 900 });
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
    artState: document.getElementById('sd-stage')?.dataset.artState,
    sceneDebug: window.sdGame?.scene?.debug || null,
    levelsLabel: document.getElementById('sd-btn-levels')?.textContent || '',
    dailyLabel: document.getElementById('sd-btn-daily')?.textContent || '',
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
if (boot.artState !== 'ready') fail(`生产美术未 ready（artState=${boot.artState}）`);
if (!boot.sceneDebug || boot.sceneDebug.lightWidth !== 240 || boot.sceneDebug.lightHeight !== 320) {
    fail(`局部光半分辨率缓冲异常: ${JSON.stringify(boot.sceneDebug)}`);
}
if (!boot.sceneDebug?.cacheReady) {
    fail(`静态美术缓存未构建: ${JSON.stringify(boot.sceneDebug)}`);
}
if (/[🧵📅]/u.test(boot.levelsLabel + boot.dailyLabel)) {
    fail(`开始菜单仍显示 emoji 占位符: ${boot.levelsLabel} / ${boot.dailyLabel}`);
}

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
    if (after.starsTaken !== started.starCount) fail(`L1 教学路线应收齐星芒，实际 ${after.starsTaken}/${started.starCount}`);
    if (after.clearStars !== '★★★') fail(`L1 收齐星芒且 1 次牵拉应为三星，实际: ${after.clearStars}`);
    const p = after.progress['S1'];
    if (!p || p.stars !== 3 || p.bestDrags !== 1) {
        fail(`sd_progress 应记录 S1 三星 / 1 次最佳牵拉: ${JSON.stringify(after.progress)}`);
    }
}

/* ── 5. 全关卡渲染回归：逐关 startLevel + 强制 draw，捕获绘制期异常 ──
 * 教训（circuit）：新元素类型（spdt）首次出现在中后段关卡，冒烟若只测前 5 关，
 * 该崩溃 100% 漏网。这里遍历全部 20 关，逐关强制同步 draw() 若干帧。
 * 统计「气泡/风/荆棘」出现次数做自检：若遍历中一个都没遇到，说明该回归形同虚设。 */
const levelCount = await page.evaluate(() => {
    // ⚠ 不要 import('/js/silk-dew-levels.js')：dist 里源码路径已打包成哈希 chunk，
    // 动态 import 必 404。改用 startLevel 的钳制语义探关数（越界 → 最后一关）。
    try {
        window.sdGame.startLevel(9999);
        return window.sdGame.levelIdx + 1;
    } catch (e) {
        return 0;
    }
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

/* ── 6. 每日模式可用 + 重试覆盖当前关结果 ── */
await page.evaluate(() => window.sdGame.toMenu());
await new Promise(r => setTimeout(r, 200));
const dailyOk = await page.evaluate(async () => {
    try {
        const g = window.sdGame;
        g.startDaily();
        const base = {
            state: g.state,
            mode: g.mode,
            course: (g.daily && g.daily.course || []).length,
        };

        // 第一次：当前关拿 2 星。
        g.world.starsTaken = g.world.stars.length;
        g.drags = g.par + 1;
        g.onLevelWon();
        const first = {
            stars: g.daily.stars,
            drags: g.daily.totalDrags,
            result: g.daily.results[0],
        };

        // 重试同一关：改成 1 星。旧实现会累计成 3 星；正确实现应覆盖为 1 星。
        g.restartLevel();
        g.world.starsTaken = 0;
        g.drags = 1;
        g.onLevelWon();
        const second = {
            stars: g.daily.stars,
            drags: g.daily.totalDrags,
            result: g.daily.results[0],
        };

        // 再重试并拿三星，最终只保留这一版成绩。
        g.restartLevel();
        g.world.starsTaken = g.world.stars.length;
        g.drags = g.par;
        g.onLevelWon();
        const third = {
            stars: g.daily.stars,
            drags: g.daily.totalDrags,
            result: g.daily.results[0],
        };

        return { ...base, first, second, third };
    } catch (e) { return { error: String(e.message) }; }
});
if (dailyOk.error) fail(`每日模式启动/重试抛错: ${dailyOk.error}`);
else {
    if (dailyOk.state !== 'playing') fail(`每日模式 state=${dailyOk.state}`);
    if (dailyOk.mode !== 'daily') fail(`每日模式 mode=${dailyOk.mode}`);
    if (dailyOk.course !== 5) fail(`每日课程应为 5 关，实际 ${dailyOk.course}`);
    if (dailyOk.first.stars !== 2 || dailyOk.first.result?.stars !== 2) {
        fail(`每日首次成绩应记录为 2 星: ${JSON.stringify(dailyOk.first)}`);
    }
    if (dailyOk.second.stars !== 1 || dailyOk.second.drags !== 1 || dailyOk.second.result?.stars !== 1) {
        fail(`每日重试后应覆盖而非累计当前关成绩: ${JSON.stringify(dailyOk.second)}`);
    }
    if (dailyOk.third.stars !== 3 || dailyOk.third.result?.stars !== 3 ||
        dailyOk.third.drags !== dailyOk.third.result?.drags) {
        fail(`每日再次重试三星后汇总应只保留最终当前关结果: ${JSON.stringify(dailyOk.third)}`);
    }
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

/* ── 8. 移动端真实触控拖拽回归 ──
 * page.mouse 会产生 pointerType=mouse，无法覆盖手机上「按住锚结 → 滑动」的路径。
 * 这里用 CDP touch events，让 Chromium 走真实的 touch/pointer 兼容链。 */
const mobile = await browser.newPage();
attachDiagnostics(mobile, 'mobile');
await mobile.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
await mobile.evaluateOnNewDocument(() => {
    try { localStorage.clear(); } catch (e) { /* ignore */ }
});
await mobile.goto(`${BASE}/silk-dew.html`, { waitUntil: 'networkidle0', timeout: 45000 });
await new Promise(r => setTimeout(r, 500));
await mobile.evaluate(() => window.sdGame.startLevel(0));
const mobileDrag = await mobile.evaluate(() => {
    const c = document.getElementById('sd-canvas');
    const r = c.getBoundingClientRect();
    const a = window.sdGame.world.ropes[0].particles[0];
    return {
        rect: { left: r.left, top: r.top, width: r.width, height: r.height },
        from: { x: r.left + a.x / 480 * r.width, y: r.top + a.y / 640 * r.height },
    };
});
const touchClient = await mobile.createCDPSession();
const touchPoint = (x, y) => ({ x, y, radiusX: 1, radiusY: 1, force: 1 });
const touchTo = {
    x: mobileDrag.from.x + Math.min(120, mobileDrag.rect.width * 0.28),
    y: mobileDrag.from.y + 40,
};
await touchClient.send('Input.dispatchTouchEvent', {
    type: 'touchStart', touchPoints: [touchPoint(mobileDrag.from.x, mobileDrag.from.y)], modifiers: 0,
});
for (let i = 1; i <= 16; i++) {
    const k = i / 16;
    await touchClient.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [touchPoint(
            mobileDrag.from.x + (touchTo.x - mobileDrag.from.x) * k,
            mobileDrag.from.y + (touchTo.y - mobileDrag.from.y) * k,
        )],
        modifiers: 0,
    });
    await new Promise(r => setTimeout(r, 12));
}
await touchClient.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], modifiers: 0 });
await new Promise(r => setTimeout(r, 180));
const mobileAfter = await mobile.evaluate(() => ({
    state: window.sdGame.state,
    drags: Number(document.getElementById('sd-drags').textContent),
    dragging: window.sdGame.isDragging,
    scrollHeight: document.documentElement.scrollHeight,
    viewportHeight: innerHeight,
}));
if (mobileAfter.state !== 'playing') fail(`移动端触控启动后 state=${mobileAfter.state}`);
if (mobileAfter.drags < 1) fail(`移动端真实触控未抓住锚结（drags=${mobileAfter.drags}）`);
if (mobileAfter.dragging) fail('移动端触控结束后仍卡在 dragging 状态');
if (mobileAfter.scrollHeight > mobileAfter.viewportHeight) {
    fail(`移动端触控测试页面产生滚动溢出: ${mobileAfter.scrollHeight} > ${mobileAfter.viewportHeight}`);
}
await mobile.close();

/* ── 9. 旧进度迁移：写失败不得提前打 v2 标记，下一次加载必须可重试 ── */
const migrationFailPage = await browser.newPage();
attachDiagnostics(migrationFailPage, 'migration-fail');
await migrationFailPage.setViewport({ width: 480, height: 760 });
await migrationFailPage.evaluateOnNewDocument(() => {
    try {
        localStorage.clear();
        localStorage.setItem('sd_progress', JSON.stringify({
            S1: { stars: 3, bestDrags: 1 },
            S2: { stars: 2, bestDrags: 4 },
        }));
        const nativeSetItem = globalThis.Storage.prototype.setItem;
        globalThis.Storage.prototype.setItem = function (key, value) {
            if (key === 'sd_progress') {
                throw new globalThis.DOMException('simulated quota failure', 'QuotaExceededError');
            }
            return nativeSetItem.call(this, key, value);
        };
    } catch (e) { /* ignore */ }
});
await migrationFailPage.goto(`${BASE}/silk-dew.html`, { waitUntil: 'networkidle0', timeout: 45000 });
await new Promise(r => setTimeout(r, 500));
const migrationFailed = await migrationFailPage.evaluate(() => ({
    version: localStorage.getItem('sd_progress_version'),
    raw: localStorage.getItem('sd_progress'),
    progress: window.sdGame?.progress || null,
}));
if (migrationFailed.version !== null) {
    fail(`迁移写失败后不应提前写 sd_progress_version: ${JSON.stringify(migrationFailed)}`);
}
if (migrationFailed.progress?.S1?.stars !== 1 || migrationFailed.progress?.S1?.bestDrags !== 0) {
    fail(`迁移写失败时当前会话仍应使用安全降级后的内存进度: ${JSON.stringify(migrationFailed)}`);
}
await migrationFailPage.close();

const migrationRetryPage = await browser.newPage();
attachDiagnostics(migrationRetryPage, 'migration-retry');
await migrationRetryPage.setViewport({ width: 480, height: 760 });
await migrationRetryPage.goto(`${BASE}/silk-dew.html`, { waitUntil: 'networkidle0', timeout: 45000 });
await new Promise(r => setTimeout(r, 500));
const migrationRetried = await migrationRetryPage.evaluate(() => ({
    version: localStorage.getItem('sd_progress_version'),
    raw: localStorage.getItem('sd_progress'),
    progress: window.sdGame?.progress || null,
}));
if (migrationRetried.version !== '2') {
    fail(`下一次正常加载应重试并完成 v2 迁移: ${JSON.stringify(migrationRetried)}`);
}
if (migrationRetried.progress?.S1?.stars !== 1 || migrationRetried.progress?.S1?.bestDrags !== 0 ||
    migrationRetried.progress?.S2?.stars !== 1 || migrationRetried.progress?.S2?.bestDrags !== 0) {
    fail(`重试迁移后的进度不符合 v2 降级语义: ${JSON.stringify(migrationRetried)}`);
}
try {
    const stored = JSON.parse(migrationRetried.raw || '{}');
    if (stored.S1?.stars !== 1 || stored.S1?.bestDrags !== 0 ||
        stored.S2?.stars !== 1 || stored.S2?.bestDrags !== 0) {
        fail(`重试迁移后 localStorage 未持久化 v2 进度: ${migrationRetried.raw}`);
    }
} catch {
    fail(`重试迁移后的 sd_progress 不是合法 JSON: ${migrationRetried.raw}`);
}
await migrationRetryPage.close();

/* ── 10. 普通保存：payload 写失败不得抢先更新版本标记 ── */
const saveFailPage = await browser.newPage();
attachDiagnostics(saveFailPage, 'save-fail');
await saveFailPage.setViewport({ width: 480, height: 760 });
await saveFailPage.evaluateOnNewDocument(() => {
    try {
        localStorage.clear();
        localStorage.setItem('sd_progress_version', '2');
        localStorage.setItem('sd_progress', JSON.stringify({ S1: { stars: 1, bestDrags: 4 } }));
    } catch (e) { /* ignore */ }
});
await saveFailPage.goto(`${BASE}/silk-dew.html`, { waitUntil: 'networkidle0', timeout: 45000 });
await new Promise(r => setTimeout(r, 400));
const saveFailed = await saveFailPage.evaluate(() => {
    // 将 marker 临时退回 1，模拟“版本写入是否会抢跑”的可观察条件。
    localStorage.setItem('sd_progress_version', '1');
    const before = localStorage.getItem('sd_progress');
    const nativeSetItem = globalThis.Storage.prototype.setItem;
    globalThis.Storage.prototype.setItem = function (key, value) {
        if (key === 'sd_progress') throw new globalThis.DOMException('simulated quota failure', 'QuotaExceededError');
        return nativeSetItem.call(this, key, value);
    };
    window.sdGame.progress.S1 = { stars: 3, bestDrags: 1 };
    const ok = window.sdGame.saveProgress();
    return {
        ok,
        version: localStorage.getItem('sd_progress_version'),
        before,
        after: localStorage.getItem('sd_progress'),
    };
});
if (saveFailed.ok !== false || saveFailed.version !== '1' || saveFailed.after !== saveFailed.before) {
    fail(`普通保存写失败时不应更新版本标记或覆盖旧 payload: ${JSON.stringify(saveFailed)}`);
}
await saveFailPage.close();

/* ── 11. 浅色主题：生产夜景不得覆盖 theme-light 的亮色画布 ── */
const lightPage = await browser.newPage();
attachDiagnostics(lightPage, 'light');
await lightPage.setViewport({ width: 480, height: 760 });
await lightPage.evaluateOnNewDocument(() => {
    try {
        localStorage.clear();
        localStorage.setItem('site_theme', 'light');
    } catch (e) { /* ignore */ }
});
await lightPage.goto(`${BASE}/silk-dew.html`, { waitUntil: 'networkidle0', timeout: 45000 });
await new Promise(r => setTimeout(r, 700));
const lightState = await lightPage.evaluate(() => {
    const g = window.sdGame;
    if (!g) return { hasGame: false };
    g.startLevel(0);
    try { g.draw(); } catch (e) { return { hasGame: true, error: e.message }; }
    const c = document.getElementById('sd-canvas');
    const ctx = c.getContext('2d');
    const d = ctx.getImageData(0, 0, c.width, Math.max(1, Math.floor(c.height * 0.45))).data;
    let lum = 0, count = 0;
    for (let i = 0; i < d.length; i += 16) {
        if (d[i + 3] === 0) continue;
        lum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        count++;
    }
    return {
        hasGame: true,
        theme: document.documentElement.getAttribute('data-theme'),
        productionArt: g.usesProductionArt(),
        avgTopLum: count ? lum / count : 0,
    };
});
if (!lightState.hasGame || lightState.error) fail(`浅色主题无法绘制: ${JSON.stringify(lightState)}`);
else {
    if (lightState.theme !== 'light' || lightState.productionArt) {
        fail(`浅色主题仍路由到生产夜景: ${JSON.stringify(lightState)}`);
    }
    if (lightState.avgTopLum < 145) {
        fail(`浅色主题画布亮度过低: ${JSON.stringify(lightState)}`);
    }
}
await lightPage.close();

/* ── 12. reduced-motion：风场相位必须冻结且场景漂移停住 ── */
const reducedPage = await browser.newPage();
attachDiagnostics(reducedPage, 'reduced-motion');
await reducedPage.setViewport({ width: 480, height: 760 });
await reducedPage.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
await reducedPage.evaluateOnNewDocument(() => {
    try {
        localStorage.clear();
        localStorage.setItem('site_theme', 'dark');
    } catch (e) { /* ignore */ }
});
await reducedPage.goto(`${BASE}/silk-dew.html`, { waitUntil: 'networkidle0', timeout: 45000 });
await new Promise(r => setTimeout(r, 600));
const reducedState = await reducedPage.evaluate(() => {
    const g = window.sdGame;
    if (!g) return { hasGame: false };
    g.startLevel(0);
    return {
        hasGame: true,
        reduced: g.reducedMotion,
        sceneReduced: g.scene?.debug?.reduced,
    };
});
if (!reducedState.hasGame || !reducedState.reduced || !reducedState.sceneReduced) {
    fail(`reduced-motion 未贯通到游戏/场景: ${JSON.stringify(reducedState)}`);
}
await reducedPage.close();

/* ── 13. 生产图层故障降级：拦截一个正式层，完整 fallback 仍应可绘制、可启动 ── */
const fallbackPage = await browser.newPage();
attachDiagnostics(fallbackPage, 'fallback', { allowRequestFailure: isGardenMidProductionUrl });
await fallbackPage.setViewport({ width: 390, height: 844 });
await fallbackPage.evaluateOnNewDocument(() => {
    try {
        // Earlier smoke pages share this browser context. Reset explicitly so
        // this test cannot inherit light theme and bypass production art.
        localStorage.clear();
        localStorage.setItem('site_theme', 'dark');
    } catch (e) { /* ignore */ }
});
let interceptedGardenMid = 0;
await fallbackPage.setRequestInterception(true);
fallbackPage.on('request', request => {
    if (isGardenMidProductionUrl(request.url())) {
        interceptedGardenMid++;
        request.abort();
    } else {
        request.continue();
    }
});
await fallbackPage.goto(`${BASE}/silk-dew.html`, { waitUntil: 'networkidle0', timeout: 45000 });
await new Promise(r => setTimeout(r, 700));
const fallbackState = await fallbackPage.evaluate(() => {
    const g = window.sdGame;
    if (!g) return { hasGame: false };
    g.startLevel(0);
    try { g.draw(); } catch (e) { return { hasGame: true, error: e.message }; }
    const c = document.getElementById('sd-canvas');
    const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let opaque = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) opaque++;
    return {
        hasGame: true,
        state: g.state,
        theme: document.documentElement.getAttribute('data-theme'),
        productionArt: g.usesProductionArt(),
        artState: document.getElementById('sd-stage')?.dataset.artState,
        sceneState: g.scene?.debug?.status,
        fallbackReady: g.scene?.debug?.fallbackReady,
        fallbackDrawCount: g.scene?.debug?.fallbackDrawCount || 0,
        opaque,
    };
});
if (!fallbackState.hasGame || fallbackState.error) fail(`美术降级路径无法启动: ${JSON.stringify(fallbackState)}`);
else {
    if (interceptedGardenMid !== 1) {
        fail(`fallback 应只拦截 1 个 garden-mid 生产资源，实际 ${interceptedGardenMid}`);
    }
    if (fallbackState.theme !== 'dark' || !fallbackState.productionArt) {
        fail(`fallback 测试未在生产美术启用状态运行: ${JSON.stringify(fallbackState)}`);
    }
    if (fallbackState.artState !== 'fallback' || fallbackState.sceneState !== 'fallback') {
        fail(`生产图层失败后未进入 fallback: ${JSON.stringify(fallbackState)}`);
    }
    if (!fallbackState.fallbackReady || fallbackState.fallbackDrawCount < 1) {
        fail(`fallback 状态成立但 fallback 画板未实际绘制: ${JSON.stringify(fallbackState)}`);
    }
    if (fallbackState.state !== 'playing' || fallbackState.opaque < 5000) {
        fail(`fallback 未保持可玩/可见: ${JSON.stringify(fallbackState)}`);
    }
}
await fallbackPage.close();

/* ── 14. 噪声过滤后的页面错误 ──
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
console.log(`smoke-silk-dew：boot / 渲染 / 启动 / 真实拖拽牵引 / 判胜 / 结算 / 星级 / 全 ${levelCount} 关渲染回归(泡${bubblesSeen} 风${windsSeen} 棘${thornsSeen} 多丝${multiRopeSeen}) / 每日 / 抽屉 / 浅色主题 / reduced-motion / 生产美术 / fallback 全部通过 ✅`);
