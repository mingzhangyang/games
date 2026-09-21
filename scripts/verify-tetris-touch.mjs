// Tetris 触屏「棋盘不许缩放/不许位移」回归检查
// 用法：node scripts/serve-static.mjs 8899 &  然后  node scripts/verify-tetris-touch.mjs http://127.0.0.1:8899
//
// 背景：css/tetris.css 曾在 @media (max-width:480px) 里给棋盘加
//   #tetris:active { transform: scale(0.99); transition: transform 0.1s ease }
// 于是手机上一碰棋盘它就缩一下再弹回；粒子层/消行层是它的绝对定位兄弟节点、
// 不跟着缩放，动画那 0.1s 里棋盘与特效层还会错位。
//
// 这条规则只在**触摸按下**时才生效，所以不能只看初始状态（那样必然"通过"）：
// 必须真的按住棋盘，在 :active 生效期间量 transform 与 rect。
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
    console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? '  (' + detail + ')' : ''}`);
};

const browser = await puppeteer.launch({ executablePath: EXE, headless: 'new', args: LAUNCH_ARGS });

// 采集棋盘 + 两个叠加画布的几何与变换
const SNAP = () => {
    const c = document.getElementById('tetris');
    const cs = getComputedStyle(c);
    const r = c.getBoundingClientRect();
    const box = b => ({ w: +b.width.toFixed(2), h: +b.height.toFixed(2), x: +b.x.toFixed(2), y: +b.y.toFixed(2) });
    return {
        board: box(r),
        transform: cs.transform,
        transitionProperty: cs.transitionProperty,
        transitionDuration: cs.transitionDuration,
        touchAction: cs.touchAction,
        htmlTouchAction: getComputedStyle(document.documentElement).touchAction,
        bodyTouchAction: getComputedStyle(document.body).touchAction,
        overlays: ['particleCanvas', 'lineClearCanvas'].map(id => ({
            id,
            ...box(document.getElementById(id).getBoundingClientRect()),
        })),
        hitAtBoardCenter: (() => {
            const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            return el ? (el.id || el.className || el.tagName) : null;
        })(),
    };
};

for (const vp of [
    { name: '移动端 390×844', width: 390, height: 844, deviceScaleFactor: 2, hasTouch: true },
    { name: '桌面端 1280×900', width: 1280, height: 900, deviceScaleFactor: 1, hasTouch: false },
]) {
    console.log('\n=== ' + vp.name + ' ===');
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', e => pageErrors.push(e.message));
    await page.setViewport(vp);
    await page.goto(BASE + '/tetris.html', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 700));

    const before = await page.evaluate(SNAP);
    check(before.hitAtBoardCenter === 'tetris',
        '棋盘中心命中目标就是 <canvas id="tetris">（否则下面的按住测试是空转）',
        '命中 ' + before.hitAtBoardCenter);

    // 静态声明：棋盘不应有任何过渡，页面层应禁掉双击放大
    check(/none/.test(before.transitionProperty) || /^0s/.test(before.transitionDuration),
        '棋盘无 transition（不会出现交互动画）',
        before.transitionProperty + ' / ' + before.transitionDuration);
    check(before.touchAction === 'none', '棋盘自身 touch-action: none', before.touchAction);
    check(before.htmlTouchAction === 'manipulation' && before.bodyTouchAction === 'manipulation',
        '页面层禁双击放大（touch-action: manipulation，保留捏合）',
        `html=${before.htmlTouchAction} body=${before.bodyTouchAction}`);

    // 核心：按住棋盘不放，在 :active 生效期间量
    const cx = before.board.x + before.board.w / 2;
    const cy = before.board.y + before.board.h / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await new Promise(r => setTimeout(r, 250)); // 远长于旧规则的 0.1s 过渡
    const during = await page.evaluate(SNAP);
    await page.mouse.up();
    await new Promise(r => setTimeout(r, 250));
    const after = await page.evaluate(SNAP);

    check(during.transform === 'none', '按住棋盘时 transform 保持 none（棋盘不缩放）', during.transform);
    check(/^0s/.test(during.transitionDuration) || /none/.test(during.transitionProperty),
        '按住棋盘时也没有过渡动画（无交互动画）',
        during.transitionProperty + ' / ' + during.transitionDuration);
    const frozen = during.board.w === before.board.w && during.board.h === before.board.h &&
        during.board.x === before.board.x && during.board.y === before.board.y;
    check(frozen, '按住棋盘时尺寸与位置逐像素不变',
        `${before.board.w}×${before.board.h} → ${during.board.w}×${during.board.h}`);

    const drift = [['按下前', before], ['按住时', during], ['松开后', after]].map(([name, s]) => {
        const bad = s.overlays.filter(o => o.w !== s.board.w || o.h !== s.board.h || o.x !== s.board.x || o.y !== s.board.y);
        return bad.length
            ? `${name}: ${bad.map(o => `${o.id} ${o.w}×${o.h}@${o.x},${o.y}`).join(', ')} ≠ board ${s.board.w}×${s.board.h}@${s.board.x},${s.board.y}`
            : null;
    }).filter(Boolean);
    check(drift.length === 0, '粒子层/消行层与棋盘始终对齐（缩放会让它们错位）',
        drift.length ? drift.join(' | ') : '三个状态下均对齐');

    // 手指落在操作钮上时，棋盘同样不能动
    const btn = await page.evaluate(() => {
        const el = [...document.querySelectorAll('.mobile-controls button, .mobile-controls .btn')]
            .find(b => getComputedStyle(b).display !== 'none' && b.getBoundingClientRect().width > 0);
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return { id: el.id || el.className, x: b.x + b.width / 2, y: b.y + b.height / 2 };
    });
    if (btn) {
        await page.mouse.move(btn.x, btn.y);
        await page.mouse.down();
        await new Promise(r => setTimeout(r, 200));
        const onBtn = await page.evaluate(SNAP);
        await page.mouse.up();
        await new Promise(r => setTimeout(r, 200));
        check(onBtn.board.w === before.board.w && onBtn.board.x === before.board.x && onBtn.transform === 'none',
            '按住操作钮时棋盘也不动（' + btn.id + '）',
            `${onBtn.board.w}×${onBtn.board.h} transform=${onBtn.transform}`);
    }

    // 真实触摸点一下棋盘（移动端），确认尺寸不变
    if (vp.hasTouch) {
        await page.touchscreen.tap(cx, cy);
        await new Promise(r => setTimeout(r, 300));
        const afterTap = await page.evaluate(SNAP);
        check(afterTap.board.w === before.board.w && afterTap.board.h === before.board.h,
            '真实触摸点击后棋盘尺寸不变',
            `${before.board.w}×${before.board.h} → ${afterTap.board.w}×${afterTap.board.h}`);
    }

    await page.screenshot({ path: `${OUT}/tetris-touch-${vp.width > 400 ? 'desktop' : 'mobile'}.png`, fullPage: true });
    check(pageErrors.length === 0, '无 JS 运行时错误', pageErrors.join(' | ') || 'none');
    await page.close();
}

await browser.close();
console.log('\n' + (fails.length ? '失败 ' + fails.length + ' 项:\n - ' + fails.join('\n - ') : '全部通过'));
process.exit(fails.length ? 1 : 0);
