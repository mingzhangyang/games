#!/usr/bin/env node
/**
 * smoke-loop-jail — 画牢 Loop Jail 的真实交互冒烟（需服务器 + Chrome）
 *
 * 几何检查测不出可玩性，这里走真实输入链（page.touchscreen / page.mouse → Pointer Events →
 * 页面自己的坐标换算），只在需要「定住世界」时直接改模拟里小怪的速度：
 *   ① boot：菜单可见、HUD 隐藏、顶栏暂停禁用 / 重开隐藏、排行榜入口存在、无 pageerror
 *   ② 开始：HUD + 第 1 波横幅、画布后备缓冲 = CSS × min(dpr,2)、画面非空
 *   ③ 触屏：单指绕小怪画一圈 → 捕获、得分进 HUD；拖动不滚页
 *   ④ 鼠标（桌面）：悬停移动笔尖不画线；按住画线、松开墨线保留；画环捕获
 *   ⑤ 咬断：小怪碰到留在场上的墨线 → 整条消失
 *   ⑥ 暂停：P 键 → 暂停浮层、模拟时间冻结、重开钮隐藏、暂停钮变「继续」；继续后恢复
 *   ⑦ 切到后台：自动弹暂停浮层，回到前台不自动开打
 *   ⑧ 结算：最后一条命被撞 → 结算浮层（得分 / 波次）、本地最佳写入、成绩 POST 到排行榜 Worker；
 *      再来一局 / 回菜单（菜单显示最佳记录）
 *   ⑨ 语言：中 → 英即时切换，可见文案无 {占位符}
 *   ⑩ 转屏：390×664 → 844×390，世界面积不变、宽高比跟随、画布缓冲跟随
 *
 * 用法：node tests/smoke-loop-jail.mjs [baseUrl]（verify-all 自动传入）
 */
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { WORLD_AREA } from '../src/games/loop-jail/simulation.js';

const BASE = process.argv.find(a => a.startsWith('http')) || 'http://127.0.0.1:8899';
const ORIGIN = new URL(BASE).origin;
const fails = [];
let passes = 0;
const check = (cond, label, extra = '') => {
    if (cond) passes++;
    else fails.push(`${label}${extra !== '' ? ' —— ' + extra : ''}`);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: LAUNCH_ARGS });
const submitted = [];

async function open({ width, height, mobile, lang = 'zh' }) {
    const page = await browser.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e.message || e).split('\n')[0]));
    await page.setViewport({ width, height, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile });
    await page.setBypassServiceWorker(true);
    await page.setRequestInterception(true);
    // 排行榜 / 统计 Worker 一律打桩：冒烟测试绝不向生产提交合成成绩
    page.on('request', request => {
        const url = request.url();
        if (!/^https:\/\/(?:game-scores|games-analytics)\.orangely\.workers\.dev\//.test(url)) {
            void request.continue();
            return;
        }
        if (url.includes('game-scores') && request.method() === 'POST') {
            try { submitted.push(JSON.parse(request.postData() || '{}')); } catch { /* asserted below */ }
        }
        void request.respond({
            status: request.method() === 'OPTIONS' ? 204 : 200,
            headers: {
                'Access-Control-Allow-Origin': ORIGIN,
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            },
            contentType: 'application/json',
            body: request.method() === 'GET' ? '[]' : '',
        });
    });
    await page.evaluateOnNewDocument(l => {
        try {
            localStorage.setItem('site_lang', l);
            localStorage.setItem('site_muted', '1');
        } catch { /* storage unavailable */ }
    }, lang);
    await page.goto(`${BASE}/loop-jail.html`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => !!window.ljGame?.el && !!document.querySelector('.scoreboard-trigger--icon'), { timeout: 15000 });
    return { page, errs };
}

/** 定住世界：所有小怪静止、已显形；三角不再锁定；关掉道具刷新 */
const freeze = page => page.evaluate(() => {
    const sim = window.ljGame.sim;
    for (const m of sim.monsters) {
        m.vx = 0; m.vy = 0; m.spawn = 0; m.boost = 1;
        if (m.type === 'triangle') { m.state = 'recover'; m.timer = 1e9; }
    }
    sim.nextPowerup = 1e9;
});

/**
 * 选一只离墙够远、且其余小怪都完全在环外的小怪，返回它的世界坐标与画圈半径。
 * 只量到环线的距离（|d − R|）会把圈心附近的小怪也当成「够远」，一圈捕获两只。
 * 冻结时的站位随浏览器调度而变，偶尔挤成一团、没有一只够空：把选中的那只挪到场上最空处。
 */
const pickTarget = page => page.evaluate(() => {
    const sim = window.ljGame.sim;
    const R = 46;
    const GAP = 6; // 线宽 + 折线弦高的余量
    const inBounds = (x, y) => x >= R + 6 && y >= R + 60 && x <= sim.w - R - 6 && y <= sim.h - R - 6;
    const clearAt = (m, x, y) => Math.min(...sim.monsters.filter(o => o !== m)
        .map(o => Math.hypot(o.x - x, o.y - y) - R - o.r));
    let best = null;
    for (const m of sim.monsters) {
        if (!inBounds(m.x, m.y)) continue;
        const clear = clearAt(m, m.x, m.y);
        if (!best || clear > best.clear) best = { m, clear };
    }
    if (!best || best.clear < GAP) {
        const m = best ? best.m : sim.monsters[0];
        let spot = null;
        for (let x = R + 6; x <= sim.w - R - 6; x += 8) {
            for (let y = R + 60; y <= sim.h - R - 6; y += 8) {
                const clear = clearAt(m, x, y);
                if (!spot || clear > spot.clear) spot = { x, y, clear };
            }
        }
        m.x = spot.x; m.y = spot.y;
        best = { m, clear: spot.clear };
    }
    return { id: best.m.id, x: best.m.x, y: best.m.y, clear: best.clear, R };
});

/**
 * 世界坐标的一圈 → 屏幕坐标（走页面自己的变换）。
 * 补画的那段错开半步：与第一圈的弦端点交错、真正相交；逐点重描会和第一圈共线，
 * 闭不闭环全看浮点噪声。
 */
const circlePath = (page, t, n = 40, extra = 0.15) => page.evaluate(({ t, n, extra }) => {
    const pts = [];
    for (let i = 0; i <= Math.round(n * (1 + extra)); i++) {
        const a = ((i <= n ? i : i - 0.5) / n) * Math.PI * 2;
        const p = window.ljGame.renderer.clientFromWorld(t.x + Math.cos(a) * t.R, t.y + Math.sin(a) * t.R);
        pts.push([p.x, p.y]);
    }
    return pts;
}, { t, n, extra });

const snap = page => page.evaluate(() => {
    const g = window.ljGame;
    const s = g.sim;
    const vis = id => !document.getElementById(id).classList.contains('hidden');
    return {
        state: g.state, paused: g.isPaused, time: s.time, score: s.score, wave: s.wave, lives: s.lives,
        ink: s.ink, monsters: s.monsters.length, strokes: s.strokes.length, loops: s.stats.loops,
        captured: s.stats.captured, bites: s.stats.bites, penX: s.pen.x, penY: s.pen.y, penDown: s.pen.down,
        hudScore: document.getElementById('lj-score').textContent,
        start: vis('lj-start'), pause: vis('lj-pause'), over: vis('lj-over'), hud: vis('lj-hud'),
        resetShown: getComputedStyle(document.getElementById('lj-reset-btn')).display !== 'none',
        pauseLabel: document.getElementById('lj-pause-btn').getAttribute('aria-label'),
        pauseDisabled: document.getElementById('lj-pause-btn').disabled,
    };
});

// 等模拟达到某个条件；超时不抛错，交给紧随其后的 check 报出真实状态
const waitSim = (page, fn, arg) => page.waitForFunction(fn, { timeout: 4000 }, arg).catch(() => {});

const canvasInfo = page => page.evaluate(() => {
    const c = document.getElementById('lj-canvas');
    const g = c.getContext('2d');
    const d = g.getImageData(0, Math.floor(c.height * 0.6), c.width, 1).data;
    let lit = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 12) lit++;
    return { w: c.width, h: c.height, cw: c.clientWidth, ch: c.clientHeight, dpr: window.devicePixelRatio, lit };
});

try {
    /* ── 手机：① ② ③ ⑤ ⑥ ⑦ ⑧ ⑨ ⑩ ── */
    const { page, errs } = await open({ width: 390, height: 664, mobile: true, lang: 'zh' });
    let s = await snap(page);
    check(s.state === 'menu' && s.start && !s.hud && !s.pause && !s.over, '① 菜单可见、HUD 隐藏', JSON.stringify(s));
    check(s.pauseDisabled && !s.resetShown, '① 菜单期间：暂停禁用、重开隐藏');
    const boot = await page.evaluate(() => ({
        h1: document.querySelectorAll('h1').length,
        best: document.getElementById('lj-best-line').textContent,
        start: document.querySelector('[data-immersive-start]')?.id,
        trophy: !!document.querySelector('#lj-pause-btn')?.previousElementSibling?.matches('.scoreboard-trigger'),
        more: document.querySelectorAll('#ljStartMore a').length,
    }));
    check(boot.h1 === 1 && boot.start === 'lj-btn-start', '① 恰好一个 h1；开始按钮带 data-immersive-start');
    // 游戏名只按当前语言显示一种：顶栏 / 开始菜单 / 标签页标题都不中英并列
    const names = () => page.evaluate(() => ({
        pill: document.querySelector('.lj-title-pill').textContent.trim(),
        menu: document.querySelector('.lj-start-title').textContent.trim(),
        doc: document.title,
    }));
    const zhNames = await names();
    check(zhNames.pill === '画牢' && zhNames.menu === '画牢' && /^画牢/.test(zhNames.doc)
        && !/Loop Jail|LOOP JAIL/i.test(Object.values(zhNames).join(' ')), '① 中文：游戏名只显示「画牢」', JSON.stringify(zhNames));
    check(/还没有记录/.test(boot.best), '① 无记录时显示引导文案', boot.best);
    // 舞台和画布贴边是直角：浮层若带共享圆角，四角会露出画布的直角与场地边框线
    const radii = await page.evaluate(() => ['lj-start', 'lj-pause', 'lj-over']
        .map(id => getComputedStyle(document.getElementById(id)).borderTopLeftRadius));
    check(radii.every(r => r === '0px'), '① 开始 / 暂停 / 结算浮层是直角，与贴边舞台一致', JSON.stringify(radii));
    check(boot.trophy, '① 排行榜入口插在暂停钮之前');
    check(boot.more > 10 && !(await page.$('#ljStartMore a[href="loop-jail.html"]')), '① 开始菜单「更多游戏」不含自己', boot.more);

    const menuScroll = await page.evaluate(() => {
        const stage = document.getElementById('lj-stage');
        const overlay = document.getElementById('lj-start');
        const stageStyle = getComputedStyle(stage);
        const menuStyle = getComputedStyle(overlay);
        return {
            action: stageStyle.touchAction, display: stageStyle.display,
            position: menuStyle.position, overflow: menuStyle.overflowY,
            pageHeight: document.documentElement.scrollHeight,
            viewportHeight: window.innerHeight,
        };
    });
    // Shared mobile menu contract expands the document rather than creating a
    // second nested scroller. A visible scrollbar on the overlay is NOT expected.
    check(menuScroll.action.includes('pan-y') && menuScroll.display === 'grid'
        && menuScroll.position === 'relative' && menuScroll.overflow === 'visible',
    '① 矮屏开始菜单遵守共享文档滚动契约', JSON.stringify(menuScroll));

    await page.click('#lj-btn-start');
    await sleep(150);
    s = await snap(page);
    check(s.state === 'playing' && !s.paused && s.hud && !s.start && s.wave === 1, '② 开始：进入第 1 波、HUD 出现', JSON.stringify(s));
    const banner = await page.$eval('#lj-banner', el => ({ on: el.classList.contains('is-on'), text: el.textContent }));
    check(banner.on && banner.text === '第 1 波', '② 第 1 波横幅', JSON.stringify(banner));
    check(!s.pauseDisabled && s.resetShown, '② 游玩中：暂停可用、重开可见');
    const cv = await canvasInfo(page);
    const k = Math.min(2, cv.dpr);
    check(Math.abs(cv.w - cv.cw * k) <= 1 && Math.abs(cv.h - cv.ch * k) <= 1, '② 画布后备缓冲 = CSS × min(dpr,2)', JSON.stringify(cv));
    check(cv.lit > cv.w * 0.5, '② 画面非空', cv.lit);
    check(await page.evaluate(() => window.ljGame.sim.pen.placed === false), '② 开局：笔尖在第一次触摸前不上场');
    const area = await page.evaluate(() => window.ljGame.sim.w * window.ljGame.sim.h);
    check(Math.abs(area - WORLD_AREA) < 1, '② 世界面积恒定', area);

    // ③ 触屏画环
    await sleep(800); // 等出生显形结束
    await freeze(page);
    // Capture, bite and pause checks share one real run. Keep unrelated monster
    // hits from ending it while CI/browser scheduling varies; the lethal hit is
    // explicitly restored and tested in step ⑧.
    await page.evaluate(() => { window.ljGame.sim.pen.invuln = 1e9; });
    let target = await pickTarget(page);
    // The menu is document-flow scrollable on short mobile screens. Clicking Start
    // can leave the canvas partly below the viewport; an offscreen synthetic
    // touchscreen move is lost (pointercancel), leaving an unclosed ring. Keep
    // the actual in-world ring visible before sending real touch input.
    await page.evaluate(t => {
        const center = window.ljGame.renderer.clientFromWorld(t.x, t.y);
        window.scrollBy({ top: center.y - window.innerHeight / 2, behavior: 'instant' });
    }, target);
    let path = await circlePath(page, target);
    const ringVisible = await page.evaluate(points => points.every(([x, y]) =>
        x > 0 && x < window.innerWidth && y > 0 && y < window.innerHeight), path);
    check(ringVisible, '③ 画环全路径位于触屏视口内', JSON.stringify({
        first: path[0], viewport: [390, 664], scroll: await page.evaluate(() => window.scrollY),
    }));
    const before = await snap(page);
    const scrollBefore = await page.evaluate(() => window.scrollY);
    await page.touchscreen.touchStart(...path[0]);
    for (const p of path.slice(1)) await page.touchscreen.touchMove(...p);
    await page.touchscreen.touchEnd();
    await sleep(80);
    s = await snap(page);
    const caught = await page.evaluate(id => !window.ljGame.sim.monsters.some(m => m.id === id), target.id);
    check(await page.evaluate(() => window.ljGame.sim.pen.placed), '③ 第一次触摸后笔尖上场');
    check(s.loops === before.loops + 1 && caught && s.captured === before.captured + 1, '③ 触屏绕小怪一圈：捕获', JSON.stringify({ before: before.loops, after: s.loops, caught }));
    check(s.score > before.score && s.hudScore === s.score.toLocaleString(), '③ 得分进 HUD', `${s.score} / ${s.hudScore}`);
    // 墨水余量取决于逐点触摸花了多久（期间按 5/s 回复），这里只断言按长度累计的耗墨量
    const inkUsed = await page.evaluate(() => window.ljGame.sim.stats.inkUsed);
    check(inkUsed > 10 && inkUsed < 25, '③ 画线按长度消耗墨水（一圈约 300px ≈ 13.5）', inkUsed.toFixed(2));
    check(await page.evaluate(() => window.scrollY) === scrollBefore, '③ 在场地上拖动不滚页');
    const ta = await page.$eval('#lj-stage', el => getComputedStyle(el).touchAction);
    check(ta === 'none', '③ 舞台 touch-action:none', ta);

    // ⑤ 咬断：通过真实触屏留下新墨线，再由单只小怪触发碰撞。
    // 之前用全局 bites === bites0 + 1 判断目标线是否消失，但场上有多只
    // 小怪与历史笔迹：它们可以合法地在同一帧咬断多条线。应验证目标线身份。
    await freeze(page);
    await page.evaluate(() => {
        // 出生保护只用于测试：画线期间排除背景碰撞，抬笔后只释放目标小怪。
        // 不改游戏代码或咬线算法，真实触控仍完整走 Pointer Events。
        // spawnMax must move with spawn: the renderer draws spawn / spawnMax as
        // the fade-in progress, and spawn > spawnMax yields a negative arc
        // radius that throws inside renderer.draw() (which pauseQuiet() calls),
        // so P pauses the sim but never reveals the overlay.
        for (const m of window.ljGame.sim.monsters) { m.spawn = 1e6; m.spawnMax = 1e6; }
    });
    const line = await page.evaluate(() => {
        const r = window.ljGame.renderer;
        const sim = window.ljGame.sim;
        const a = r.clientFromWorld(sim.w * 0.2, sim.h * 0.85);
        const b = r.clientFromWorld(sim.w * 0.8, sim.h * 0.85);
        return [[a.x, a.y], [b.x, b.y]];
    });
    const originalIds = await page.evaluate(() => window.ljGame.sim.strokes.map(x => x.id));
    await page.touchscreen.touchStart(...line[0]);
    for (let i = 1; i <= 12; i++) await page.touchscreen.touchMove(line[0][0] + (line[1][0] - line[0][0]) * i / 12, line[0][1]);
    await page.touchscreen.touchEnd();
    s = await snap(page);
    const newStrokes = await page.evaluate(ids => window.ljGame.sim.strokes
        .filter(x => !ids.includes(x.id))
        .map(x => ({ id: x.id, live: x.live, points: x.points.length })), originalIds);
    check(s.strokes === originalIds.length + 1 && !s.penDown
        && newStrokes.length === 1 && !newStrokes[0].live && newStrokes[0].points >= 2,
    '⑤ 松开后墨线保留在场上', JSON.stringify({ strokes: s.strokes, newStrokes }));
    const targetStrokeId = newStrokes[0]?.id;
    const bites0 = s.bites;
    await page.evaluate(() => {
        const sim = window.ljGame.sim;
        const m = sim.monsters.find(x => x.type === 'circle') || sim.monsters[0];
        m.x = sim.w * 0.5; m.y = sim.h * 0.85 - 4;
        m.vx = 0; m.vy = 0; m.spawn = 0;
        // Do not let the target monster kill the pen during the bite assertion.
        sim.pen.invuln = 1e9;
    });
    // 不依赖 rAF 运行速度：等待真正咬断目标 ID，而非仅看到其他墨线被咬。
    await waitSim(page, ({ id, before }) => {
        const sim = window.ljGame.sim;
        return sim.stats.bites > before && !sim.strokes.some(x => x.id === id);
    }, { id: targetStrokeId, before: bites0 });
    s = await snap(page);
    const remainingIds = await page.evaluate(() => window.ljGame.sim.strokes.map(x => x.id));
    check(targetStrokeId !== undefined && s.bites > bites0 && !s.penDown
        && !remainingIds.includes(targetStrokeId)
        && remainingIds.every(id => originalIds.includes(id)),
    '⑤ 小怪碰到墨线：目标墨线消失且没有新笔迹',
    JSON.stringify({ bitesBefore: bites0, bitesAfter: s.bites, targetStrokeId, remainingIds }));

    // ⑥ 暂停
    // Touch gestures may leave the previously focused Start button hidden and
    // the document scrolled to the tall mobile menu's old position. Test the
    // keyboard shortcut from an active, foreground game viewport instead of
    // depending on the focus/scroll state left by the touch scenario.
    await page.bringToFront();
    await page.evaluate(() => {
        document.activeElement?.blur();
        window.scrollTo({ top: 0, behavior: 'instant' });
    });
    s = await snap(page);
    check(s.state === 'playing' && s.lives > 0,
        '⑥ 暂停验证前仍有可操作的活局', JSON.stringify({ state: s.state, lives: s.lives }));
    if (s.state !== 'playing' || s.paused || s.lives <= 0) {
        throw new Error('⑥ P 键验证前状态无效：' + JSON.stringify({
            state: s.state, paused: s.paused, overlay: s.pause, lives: s.lives,
            hidden: await page.evaluate(() => document.hidden),
        }));
    }
    await page.keyboard.press('p');
    s = await snap(page);
    check(s.paused && s.pause && !s.resetShown && s.pauseLabel === '继续', '⑥ P 键暂停：浮层 + 重开隐藏 + 暂停钮变「继续」', JSON.stringify(s));
    if (!s.paused || !s.pause) {
        throw new Error('⑥ P 键未打开可见暂停层：' + JSON.stringify({
            state: s.state, paused: s.paused, overlay: s.pause,
            hidden: await page.evaluate(() => document.hidden),
            lease: await page.evaluate(() => window.ljGame.pauseOwnership.isHeld()),
            activeElement: await page.evaluate(() => document.activeElement?.id),
        }));
    }
    const t0 = s.time;
    await sleep(300);
    check((await snap(page)).time === t0, '⑥ 暂停期间模拟冻结');
    await page.evaluate(() => document.getElementById('lj-btn-resume').scrollIntoView({
        block: 'center', inline: 'nearest', behavior: 'instant',
    }));
    const resumeHit = await page.evaluate(() => {
        const button = document.getElementById('lj-btn-resume');
        const r = button.getBoundingClientRect();
        const x = (r.left + r.right) / 2;
        const y = (r.top + r.bottom) / 2;
        return {
            visible: r.width > 0 && r.height > 0
                && x >= 0 && x < innerWidth && y >= 0 && y < innerHeight
                && !!document.elementFromPoint(x, y)?.closest('#lj-btn-resume'),
            rect: { x: r.x, y: r.y, width: r.width, height: r.height },
            viewport: { width: innerWidth, height: innerHeight, scrollY: window.scrollY },
            overlayDisplay: getComputedStyle(document.getElementById('lj-pause')).display,
        };
    });
    if (!resumeHit.visible) {
        throw new Error('⑥ 暂停后「继续」按钮不在可点击区域：' + JSON.stringify(resumeHit));
    }
    await page.click('#lj-btn-resume');
    await waitSim(page, t => window.ljGame.sim.time > t, t0);
    s = await snap(page);
    check(!s.paused && !s.pause && s.time > t0 && s.pauseLabel === '暂停', '⑥ 继续：恢复推进', JSON.stringify(s));

    // ⑦ 切到后台
    await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        document.dispatchEvent(new Event('visibilitychange'));
    });
    s = await snap(page);
    check(s.paused && s.pause, '⑦ 切到后台：暂停并显示暂停浮层');
    await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
        document.dispatchEvent(new Event('visibilitychange'));
    });
    s = await snap(page);
    check(s.paused && s.pause, '⑦ 回到前台：不自动开打，等玩家点继续');
    await page.click('#lj-btn-resume');
    s = await snap(page);
    check(!s.paused, '⑦ 手动继续');

    // ⑧ 结算
    const scoreBeforeDeath = s.score;
    submitted.length = 0;
    await page.evaluate(() => {
        const g = window.ljGame;
        // 记录每次 frame() 的 rAF 时间戳：同一时间戳出现两次 = 有两条并行的帧链
        const frame = g.frame;
        window.__ljFrameStamps = [];
        g.frame = t => { window.__ljFrameStamps.push(t); frame(t); };
        const sim = g.sim;
        sim.lives = 1;
        sim.pen.invuln = 0;
        const m = sim.monsters[0];
        m.spawn = 0; m.x = sim.pen.x + 2; m.y = sim.pen.y; m.vx = 0; m.vy = 0;
    });
    await page.waitForFunction(() => window.ljGame.state === 'over', { timeout: 3000 });
    s = await snap(page);
    check(!s.resetShown && s.pauseDisabled, '⑧ 结算瞬间：重开隐藏、暂停禁用');
    await sleep(400);
    const stamps = await page.evaluate(() => {
        const list = window.__ljFrameStamps;
        window.ljGame.frame = Object.getPrototypeOf(window.ljGame).frame.bind(window.ljGame);
        return { total: list.length, unique: new Set(list).size };
    });
    check(stamps.total > 3 && stamps.unique === stamps.total, '⑧ 结算后的特效只有一条 rAF 链（每次刷新 frame() 只跑一次）', JSON.stringify(stamps));
    await page.waitForFunction(() => !document.getElementById('lj-over').classList.contains('hidden'), { timeout: 3000 });
    const over = await page.evaluate(() => ({
        score: document.getElementById('lj-over-score').textContent,
        wave: document.getElementById('lj-over-wave').textContent,
        detail: document.getElementById('lj-over-detail').textContent,
        best: document.getElementById('lj-over-best').textContent,
        newBest: !document.getElementById('lj-over-newbest').classList.contains('hidden'),
        hud: !document.getElementById('lj-hud').classList.contains('hidden'),
        stored: localStorage.getItem('game:loop-jail:v1:best'),
        rank: !!document.querySelector('#lj-over .scoreboard-trigger--text'),
    }));
    check(over.score === scoreBeforeDeath.toLocaleString() && over.wave === '到达第 1 波', '⑧ 结算浮层：得分与波次', JSON.stringify(over));
    check(over.newBest && /最高/.test(over.best) && !over.hud, '⑧ 首局即新纪录；HUD 收起');
    check(over.rank, '⑧ 结算浮层有「查看排名」入口');
    let stored = null;
    try { stored = JSON.parse(over.stored); } catch { /* asserted below */ }
    check(stored && stored.score === scoreBeforeDeath && stored.wave === 1, '⑧ 本地最佳写入 game:loop-jail:v1:best', over.stored);
    await sleep(300);
    check(submitted.some(p => p.game === 'loop-jail' && p.score === scoreBeforeDeath), '⑧ 成绩提交到排行榜 Worker（loop-jail）', JSON.stringify(submitted));
    check(!/\{\w+\}/.test(over.wave + over.detail + over.best), '⑧ 结算文案无占位符');

    await page.click('#lj-btn-again');
    s = await snap(page);
    check(s.state === 'playing' && s.score === 0 && s.lives === 3 && !s.over, '⑧ 再来一局：新的一局');
    await page.evaluate(() => window.ljGame.toMenu());
    const bestLine = await page.$eval('#lj-best-line', el => el.textContent);
    check(bestLine.includes(scoreBeforeDeath.toLocaleString()) && /第 1 波/.test(bestLine), '⑧ 回菜单：显示最佳记录', bestLine);

    // ⑨ 语言
    const en = await page.evaluate(() => {
        localStorage.setItem('site_lang', 'en');
        window.dispatchEvent(new CustomEvent('site-settings:changed'));
        return {
            start: document.querySelector('#lj-btn-start span').textContent,
            kicker: document.querySelector('.lj-kicker').textContent,
            best: document.getElementById('lj-best-line').textContent,
            lang: document.documentElement.lang,
            text: document.body.innerText,
        };
    });
    check(en.start === 'Start drawing' && /Draw/.test(en.kicker) && /^Best /.test(en.best) && en.lang === 'en', '⑨ 中 → 英即时切换', JSON.stringify({ ...en, text: undefined }));
    check(!/\{\w+\}/.test(en.text), '⑨ 可见文案无 {占位符}');
    const enNames = await names();
    check(enNames.pill === 'Loop Jail' && enNames.menu === 'Loop Jail' && /^Loop Jail/.test(enNames.doc)
        && !/画牢/.test(Object.values(enNames).join(' ')), '⑨ 英文：游戏名只显示「Loop Jail」', JSON.stringify(enNames));

    // ⑩ 转屏
    await page.click('#lj-btn-start');
    await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await sleep(400);
    const rot = await page.evaluate(() => {
        const sim = window.ljGame.sim;
        const c = document.getElementById('lj-canvas');
        return { w: sim.w, h: sim.h, cw: c.clientWidth, ch: c.clientHeight, bw: c.width, bh: c.height };
    });
    check(Math.abs(rot.w * rot.h - WORLD_AREA) < 1 && rot.w > rot.h, '⑩ 转屏：世界面积不变、宽高比跟随', JSON.stringify(rot));
    check(Math.abs(rot.bw - rot.cw * 2) <= 1 && Math.abs(rot.bh - rot.ch * 2) <= 1, '⑩ 转屏：画布缓冲跟随');
    check(errs.length === 0, '手机：无 pageerror', errs.join(' | '));
    await page.close();

    /* ── 桌面：④ ── */
    const desk = await open({ width: 1280, height: 800, mobile: false, lang: 'en' });
    const dp = desk.page;
    await dp.click('#lj-btn-start');
    await sleep(900);
    await freeze(dp);
    const hover = await dp.evaluate(() => {
        const sim = window.ljGame.sim;
        const p = window.ljGame.renderer.clientFromWorld(sim.w * 0.25, sim.h * 0.9);
        return [p.x, p.y];
    });
    await dp.mouse.move(...hover, { steps: 4 });
    s = await snap(dp);
    const hoverWorld = await dp.evaluate(() => ({ x: window.ljGame.sim.w * 0.25, y: window.ljGame.sim.h * 0.9 }));
    check(Math.hypot(s.penX - hoverWorld.x, s.penY - hoverWorld.y) < 1 && s.strokes === 0 && !s.penDown, '④ 鼠标悬停：笔尖跟随但不画线', JSON.stringify(s));
    await dp.mouse.down();
    await dp.mouse.move(hover[0] + 160, hover[1], { steps: 10 });
    s = await snap(dp);
    check(s.penDown && s.strokes === 1, '④ 按住左键：画线');
    await dp.mouse.up();
    s = await snap(dp);
    check(!s.penDown && s.strokes === 1, '④ 松开：墨线保留');
    await freeze(dp);
    target = await pickTarget(dp);
    path = await circlePath(dp, target);
    const dBefore = await snap(dp);
    await dp.mouse.move(...path[0]);
    await dp.mouse.down();
    // 逐点发送：插值出的中点短于 SEGMENT_MIN 会被丢弃，留下的点落在第一圈之内、补画段不再相交
    for (const p of path.slice(1)) await dp.mouse.move(...p, { steps: 1 });
    await dp.mouse.up();
    s = await snap(dp);
    check(s.captured === dBefore.captured + 1 && s.score > dBefore.score, '④ 鼠标画环：捕获并得分', JSON.stringify({ before: dBefore.captured, after: s.captured }));
    // 右键不画线
    await dp.mouse.move(hover[0], hover[1] - 40);
    await dp.mouse.down({ button: 'right' });
    await dp.mouse.move(hover[0] + 80, hover[1] - 40, { steps: 5 });
    await dp.mouse.up({ button: 'right' });
    check(!(await snap(dp)).penDown, '④ 右键不起笔');
    check(desk.errs.length === 0, '桌面：无 pageerror', desk.errs.join(' | '));
    await dp.close();
} finally {
    await browser.close();
}

if (fails.length) {
    console.error(`smoke-loop-jail：${fails.length} 项失败 ❌\n  ✗ ${fails.join('\n  ✗ ')}`);
    process.exit(1);
}
console.log(`smoke-loop-jail：触屏画环 / 鼠标画环 / 咬断 / 暂停 / 后台 / 结算 / 排行榜 / 语言 / 转屏 全部通过 ✅（${passes} 项断言）`);
