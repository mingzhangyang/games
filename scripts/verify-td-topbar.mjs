// tower-defense 顶栏「单行三槽」契约回归
// 用法：node scripts/verify-td-topbar.mjs [baseUrl] [outDir]
//
// 背景：2026-09-19 曾按当时需求做过「两行顶栏」（全应用 icons 一行、本局信息一行），
// 2026-09-21 起废弃 —— 与 lumen / gravity-slingshot 对齐为共享层单行三槽契约：
//   左 Home ｜ 中 状态胶囊 ×3 + 堆叠徽章（窄屏可折行，整组居中）｜ 右 Range/Speed/Stats/Pause/Sound
// 页面侧不再有任何纵向拆行覆盖；.td-topbar-row--app / --game / -spacer 已随 HTML 拍平删除，
// 本脚本守住「不再回退成多行」+ 触控热区，并原样保留「空中航线只在飞行关绘制」像素断言。
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { mkdirSync } from 'node:fs';

const EXE = CHROME_PATH;
const BASE = process.argv[2] || 'http://127.0.0.1:8899';
const OUT = process.argv[3] || 'C:/tmp';
mkdirSync(OUT, { recursive: true });

const fails = [];
const check = (ok, label, detail) => {
    if (!ok) fails.push(label + (detail ? ' — ' + detail : ''));
    console.log(`  ${ok ? '\u2713' : '\u2717'} ${label}${detail ? '  (' + detail + ')' : ''}`);
};

const browser = await puppeteer.launch({ executablePath: EXE, headless: 'new', args: LAUNCH_ARGS });
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
    const topbar = document.querySelector('.game-topbar');
    const home = document.getElementById('td-btn-home');
    const ids = ['tdStatsToggle', 'td-range-btn', 'td-speed-btn', 'td-pause-btn', 'td-mute-btn'];
    const appBtns = ids.map(id => ({ id, ...r(document.getElementById(id)) }));
    const stats = ['td-stat-lives', 'td-stat-gold', 'td-stat-wave']
        .map(id => ({ id, ...r(document.getElementById(id)) }));
    const stack = (() => {
        const el = document.getElementById('td-stack-badge');
        if (!el) return null;
        const cs = getComputedStyle(el);
        return { visible: !el.classList.contains('hidden') && cs.display !== 'none', ...r(el) };
    })();

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
        dir: topbar ? getComputedStyle(topbar).flexDirection : null,
        topbarH: topbar ? Math.round(topbar.getBoundingClientRect().height) : 0,
        legacy: {
            appRow: document.querySelectorAll('.td-topbar-row--app').length,
            gameRow: document.querySelectorAll('.td-topbar-row--game').length,
            spacer: document.querySelectorAll('.td-topbar-spacer').length,
        },
        home: r(home),
        appBtns,
        stats,
        stack,
        homeHit: hit(home),
        appHit: ids.map(id => ({ id, ...hit(document.getElementById(id)) })),
    };
});

console.log('\n=== 1. 单行三槽结构（390×844） ===');
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
await page.goto(BASE + '/tower-defense.html', { waitUntil: 'networkidle2' });
await new Promise(r => setTimeout(r, 800));
let p = await probe();

check(!!p.home && !!p.topbarH, '顶栏与 Home 钮存在');
check(p.dir === 'row', '顶栏是横向单行（flex-direction:row）', `dir=${p.dir}`);
check(p.legacy.appRow === 0 && p.legacy.gameRow === 0 && p.legacy.spacer === 0,
    '两行时代的行容器/占位已不存在（不回退）',
    `app=${p.legacy.appRow} game=${p.legacy.gameRow} spacer=${p.legacy.spacer}`);
// Home 贴左、功能钮贴右且与 Home 同一视觉行
check(p.home.x <= 30, 'Home 贴顶栏左侧', `x=${Math.round(p.home.x)}`);
const rightMost = Math.max(...p.appBtns.map(b => b.right));
check(rightMost <= 390 + 0.5, '功能钮未溢出视口', `最右 ${Math.round(rightMost)} ≤ 390`);
const act = p.appBtns.find(b => b.id === 'td-pause-btn');
check(act && Math.abs(act.y - p.home.y) < 8, '功能钮与 Home 同一视觉行',
    `dy=${act ? Math.abs(act.y - p.home.y).toFixed(1) : 'NaN'}px`);
// 顶栏纵向占用：窄屏允许胶囊折一行（≤110px），绝不允许回到三行（>120px）
check(p.topbarH <= 110, '顶栏高度回到单行量级（≤110px，含胶囊折行）', `${p.topbarH}px`);
// 状态胶囊：横向不重叠、不溢出视口
for (let i = 1; i < p.stats.length; i++) {
    const prev = p.stats[i - 1], cur = p.stats[i];
    const sameLine = Math.abs(cur.y - prev.y) < 1.5;
    check(!sameLine || cur.x >= prev.right - 0.5,
        `${prev.id} → ${cur.id} 横向不重叠`);
}
check(Math.max(...p.stats.map(s => s.right)) <= 390 + 0.5, '状态胶囊未溢出视口',
    `最右 ${Math.round(Math.max(...p.stats.map(s => s.right)))} ≤ 390`);

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
    const ok = q.dir === 'row'
        && q.legacy.appRow === 0 && q.legacy.gameRow === 0 && q.legacy.spacer === 0
        && Math.abs(q.appBtns.find(b => b.id === 'td-pause-btn').y - q.home.y) < 8;
    check(ok, `${v.name} ${v.w}×${v.h} 单行结构保持`);
    const right1 = Math.max(q.home.right, ...q.appBtns.map(b => b.right));
    check(right1 <= v.w + 0.5, `  ${v.name} 第一行控件未溢出视口`, `最右 ${Math.round(right1)} ≤ ${v.w}`);
    check(Math.max(...q.stats.map(s => s.right)) <= v.w + 0.5, `  ${v.name} 状态胶囊未溢出视口`,
        `最右 ${Math.round(Math.max(...q.stats.map(s => s.right)))} ≤ ${v.w}`);
    const cap = v.w >= 1024 ? 64 : 110;
    check(q.topbarH <= cap, `  ${v.name} 顶栏高度 ≤${cap}px`, `${q.topbarH}px`);
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
