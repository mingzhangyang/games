// 顶栏两行结构回归
// 用法：node scripts/verify-td-topbar.mjs [baseUrl] [outDir]
//
// 背景（2026-09-19）：用户要求「全应用级 icons 在第一行，本应用信息在第二行」。
// 原来 7 个控件平铺在同一个 flex + wrap 里，靠 wrap 随机折断。
//
// 断言重点：两行必须真的分层（y 不重叠、顺序正确），且触控目标仍 ≥44px。
import puppeteer from 'puppeteer-core';
import { existsSync, mkdirSync } from 'node:fs';

const EXE = [
    'C:/Users/mingz/.cache/puppeteer/chrome/win64-119.0.6045.105/chrome-win64/chrome.exe',
].find(existsSync);
const BASE = process.argv[2] || 'http://127.0.0.1:8899';
const OUT = process.argv[3] || 'C:/tmp';
mkdirSync(OUT, { recursive: true });

const fails = [];
const check = (ok, label, detail) => {
    if (!ok) fails.push(label + (detail ? ' — ' + detail : ''));
    console.log(`  ${ok ? '\u2713' : '\u2717'} ${label}${detail ? '  (' + detail + ')' : ''}`);
};

const browser = await puppeteer.launch({ executablePath: EXE, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push((e.stack || e.message).split('\n').slice(0, 4).join('\n    ')));

const VIEWPORTS = [
    { w: 375, h: 667, name: 'iPhone SE' },
    { w: 390, h: 844, name: 'iPhone 14' },
    { w: 768, h: 1024, name: 'iPad' },
    { w: 1280, h: 900, name: 'Desktop' },
];

const probe = () => page.evaluate(() => {
    const r = (el) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, bottom: b.bottom, right: b.right }; };
    const rowApp = document.querySelector('.td-topbar-row--app');
    const rowGame = document.querySelector('.td-topbar-row--game');
    const home = document.getElementById('td-btn-home');
    const ids = ['tdStatsToggle', 'td-range-btn', 'td-speed-btn', 'td-pause-btn', 'td-mute-btn'];
    const appBtns = ids.map(id => ({ id, ...r(document.getElementById(id)) }));
    const stats = ['td-stat-lives', 'td-stat-gold', 'td-stat-wave']
        .map(id => ({ id, ...r(document.getElementById(id)) }));

    // 触控热区：目标或它的 ::after 外扩后的有效区域
    const hit = (el) => {
        const b = el.getBoundingClientRect();
        let w = b.width, h = b.height;
        const af = getComputedStyle(el, '::after');
        if (af && af.content !== 'none' && af.position === 'absolute') {
            const top = parseFloat(af.top) || 0, bottom = parseFloat(af.bottom) || 0;
            const left = parseFloat(af.left) || 0, right = parseFloat(af.right) || 0;
            w = w - left - right; h = h - top - bottom;
        }
        return { w: Math.round(w), h: Math.round(h) };
    };

    return {
        rowApp: r(rowApp), rowGame: r(rowGame),
        home: r(home), appBtns, stats,
        homeHit: hit(home),
        appHit: ids.map(id => ({ id, ...hit(document.getElementById(id)) })),
        stackInGameRow: !!rowGame.querySelector('#td-stack-badge'),
        // 关键：功能钮必须都在 app 行里，状态胶囊必须都在 game 行里
        appHasStats: !!rowApp.querySelector('.td-stat'),
        gameHasButtons: !!rowGame.querySelector('.td-icon-btn'),
        // 堆叠徽章：居中判定要看它显不显示、多宽
        stack: (() => {
            const el = document.getElementById('td-stack-badge');
            if (!el) return null;
            const cs = getComputedStyle(el);
            return {
                visible: !el.classList.contains('hidden') && cs.display !== 'none',
                marginLeft: parseFloat(cs.marginLeft) || 0,
                ...r(el),
            };
        })(),
    };
});

console.log('\n=== 1. 两行分层结构 ===');
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
await page.goto(BASE + '/tower-defense.html', { waitUntil: 'networkidle2' });
await new Promise(r => setTimeout(r, 800));
let p = await probe();

check(!!p.rowApp && !!p.rowGame, '存在两行容器');
check(!p.appHasStats, '第一行不含本局状态胶囊');
check(!p.gameHasButtons, '第二行不含功能图标钮');
check(p.stackInGameRow, '堆叠徽章位于第二行（本局信息行）');
check(p.rowApp.h > 0 && p.rowGame.h > 0, '两行都有实际高度', `${Math.round(p.rowApp.h)} / ${Math.round(p.rowGame.h)}px`);

// 竖直分层：第一行整体在第二行之上，且不重叠
const gapV = p.rowGame.y - p.rowApp.bottom;
check(p.rowApp.y < p.rowGame.y, '第一行在第二行之上');
check(gapV >= -0.5, '两行未垂直重叠', `间距 ${gapV.toFixed(1)}px`);

// Home 在第一行最左；其余功能钮都在第一行内
check(Math.abs(p.home.y - p.rowApp.y) < p.rowApp.h, 'Home 位于第一行');
check(Math.abs(p.home.x - p.rowApp.x) < 1.5, 'Home 贴第一行左侧', `x=${Math.round(p.home.x)} vs ${Math.round(p.rowApp.x)}`);
for (const b of p.appBtns) {
    check(Math.abs(b.y - p.home.y) < p.rowApp.h, `${b.id} 与 Home 同行`);
    check(b.x >= p.home.right - 1, `${b.id} 在 Home 右侧`, `x=${Math.round(b.x)}`);
}
// 状态胶囊都在第二行
for (const s of p.stats) {
    check(Math.abs(s.y - p.rowGame.y) < p.rowGame.h, `${s.id} 位于第二行`);
}
// 状态胶囊左对齐成一行、不换行、不重叠
for (let i = 1; i < p.stats.length; i++) {
    check(p.stats[i].x >= p.stats[i - 1].right - 0.5,
        `${p.stats[i - 1].id} → ${p.stats[i].id} 横向不重叠`);
    check(Math.abs(p.stats[i].y - p.stats[0].y) < 1.5,
        `${p.stats[i].id} 与首个胶囊同高（未换行）`);
}
// 状态胶囊在第二行内水平居中
/*
 * 注意：这里断言的是「内容组中点 ≈ 行中点」，不是「首个胶囊贴行首」。
 * 2026-09-19 用户要求把三个状态胶囊改为水平居中，因此旧的
 * `stats[0].x ≈ rowGame.x`（左对齐）断言已作废，会必然失败。
 *
 * 内容组 = 第一个胶囊左边缘 → 最后一个 flex 项（有徽章时是徽章，否则是波次胶囊）右边缘。
 * 这样判定的好处：徽章显隐都不影响结论 —— 它对居中的破坏方式很隐蔽，
 * 若给徽章写 `margin-left: auto`（旧写法），auto 外边距会吃掉左侧全部剩余空间，
 * 内容组中点会被推到行中点左侧，下面的 midDelta 断言立刻抓到。
 */
const gameContent = (q) => {
    const left = q.stats[0].x;
    const right = q.stack && q.stack.visible ? q.stack.right : q.stats[q.stats.length - 1].right;
    return { left, right, mid: (left + right) / 2 };
};
const gc = gameContent(p);
const rowMid = p.rowGame.x + p.rowGame.w / 2;
const midDelta = gc.mid - rowMid;
check(Math.abs(midDelta) < 2, '状态胶囊组水平居中于第二行',
    `组中点 ${gc.mid.toFixed(1)} vs 行中点 ${rowMid.toFixed(1)}（偏 ${midDelta.toFixed(1)}px）`);
// 左右余量对称（居中的直接后果）
const slackL = gc.left - p.rowGame.x;
const slackR = p.rowGame.right - gc.right;
check(Math.abs(slackL - slackR) < 4, '第二行左右余量对称',
    `左 ${slackL.toFixed(1)}px / 右 ${slackR.toFixed(1)}px`);
// 反向守卫：绝不能是左对齐（旧实现）
check(slackL > 12, '第二行不是左对齐（旧实现已移除）', `左侧余量 ${slackL.toFixed(1)}px`);
// 徽章不得再用 margin-left:auto 破坏居中
check(!p.stack || p.stack.marginLeft < 20, '堆叠徽章未使用 auto 外边距',
    `margin-left ${p.stack ? p.stack.marginLeft : 0}px`);
// 防御性下限：居中后左右余量天然各 ≈85px，这里只是防止将来内容变长把这一行撑满
check(slackL >= 6 && slackR >= 6, '第二行左右仍留有安全余量',
    `左 ${slackL.toFixed(1)}px ≥ 6px`);

console.log('\n=== 2. 触控热区（≥44px） ===');
check(p.homeHit.h >= 44, 'Home 热区高 ≥44px', `${p.homeHit.h}px`);
check(p.homeHit.w >= 44, 'Home 热区宽 ≥44px', `${p.homeHit.w}px`);
for (const b of p.appHit) {
    check(b.h >= 44 && b.w >= 44, `${b.id} 热区 ≥44×44`, `${b.w}×${b.h}`);
}

console.log('\n=== 3. 多视口不破版 ===');
for (const v of VIEWPORTS) {
    await page.setViewport({ width: v.w, height: v.h, deviceScaleFactor: 1 });
    await new Promise(r => setTimeout(r, 320));
    const q = await probe();
    const ok = q.rowGame.y - q.rowApp.bottom >= -0.5
        && !q.appHasStats && !q.gameHasButtons
        && q.rowApp.h > 0 && q.rowGame.h > 0;
    check(ok, `${v.name} ${v.w}×${v.h} 两行结构保持`, `行间距 ${(q.rowGame.y - q.rowApp.bottom).toFixed(1)}px`);

    // 第一行六个钮是否放得下（不溢出视口）
    const rightMost = Math.max(q.home.right, ...q.appBtns.map(b => b.right));
    check(rightMost <= v.w + 0.5, `  ${v.name} 第一行控件未溢出视口`,
        `最右 ${Math.round(rightMost)} ≤ ${v.w}`);

    // 状态胶囊是否放得下
    const statsRight = q.stats[q.stats.length - 1].right;
    check(statsRight <= v.w + 0.5, `  ${v.name} 状态胶囊未溢出视口`,
        `最右 ${Math.round(statsRight)} ≤ ${v.w}`);

    // 居中在每种视口下都要成立（窄屏超宽时也要保持对称，而不是被挤成左对齐）
    const gq = gameContent(q);
    const dq = gq.mid - (q.rowGame.x + q.rowGame.w / 2);
    check(Math.abs(dq) < 2, `  ${v.name} 状态胶囊组仍居中`, `偏 ${dq.toFixed(1)}px`);
}

console.log('\n=== 4. 空中航线只在有飞行兵的关卡绘制 ===');
// 用 canvas 像素差异判断：无飞行兵关卡（outpost）不应出现紫色宽带
await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
await new Promise(r => setTimeout(r, 300));
const airPixels = await page.evaluate(async () => {
    const g = window.tdGame;
    const cv = document.getElementById('td-canvas');
    const ctx = cv.getContext('2d');

    /**
     * ⚠️ 道路/航线是画进 bgCanvas 的静态背景层（renderBackground 一次性烘焙），
     * 所以切换关卡后必须**重新调用 renderBackground** 再 drawFrame，
     * 否则读到的还是上一关的缓存 —— 这里最容易测出"假通过"。
     */
    const redraw = (bg) => {
        g.renderBackground(bg.width, bg.height);
        g.drawFrame();
    };

    const countLavender = () => {
        const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) {
            const r = d[i], gg = d[i + 1], b = d[i + 2], a = d[i + 3];
            if (a < 40) continue;
            // ⚠️ 判据不能写成绝对亮度（r>150 && b>180）：航线已收窄到 12px、
            // 透明度 0.10，叠加在深色底上只有 [124,95,145] 这个量级，
            // 绝对阈值会把它判成"没画"。改用"相对偏紫"：蓝比绿高、红也比绿高。
            if (b > gg + 18 && r > gg + 8) n++;
        }
        return n;
    };

    // 另外直接采样航线中点，拿到确定的证据（不依赖大面积统计）
    const sampleMid = () => {
        const air = window.__TD_AIR_PATH__;
        const pt = air.pointAt(air.total * 0.5);
        const px = Math.round(pt.x * (cv.width / 480));
        const py = Math.round(pt.y * (cv.height / 640));
        const o = (py * cv.width + px) * 4;
        const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
        return [d[o], d[o + 1], d[o + 2]];
    };

    const out = {};
    for (const id of ['outpost', 'skyfall']) {
        g.level = window.__TD_LEVELS__.find(l => l.id === id);
        g.resetRun();
        redraw(g.bgCanvas);
        out[id] = { px: countLavender(), mid: sampleMid() };
    }
    return out;
});
check(airPixels.outpost.px < 120, '新手关（无飞行兵）不绘制紫色空中航线',
    `偏紫像素 ${airPixels.outpost.px}`);
check(airPixels.skyfall.px > airPixels.outpost.px * 3, '飞行关（skyfall）绘制了空中航线',
    `${airPixels.skyfall.px} vs outpost ${airPixels.outpost.px}`);

// 直接采样航线中点：这是最硬的证据 —— 那一像素必须真的偏紫
const om = airPixels.outpost.mid, sm = airPixels.skyfall.mid;
const isPurple = ([r, g_, b]) => b > g_ + 18 && r > g_ + 8;
check(!isPurple(om), '新手关航线中点像素保持背景色（未绘制）', `rgb(${om.join(',')})`);
check(isPurple(sm), '飞行关航线中点像素呈紫色（确实绘制了）', `rgb(${sm.join(',')})`);

console.log('\n' + '='.repeat(64));
if (pageErrors.length) {
    console.log('运行期异常：');
    pageErrors.forEach(e => console.log('  ! ' + e));
}
if (fails.length) {
    console.log(`FAILED — ${fails.length} 项未通过：`);
    fails.forEach(f => console.log('  ✗ ' + f));
} else {
    console.log('ALL CHECKS PASSED');
}
await browser.close();
process.exit(fails.length || pageErrors.length ? 1 : 0);
