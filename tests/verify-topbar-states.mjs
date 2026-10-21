// 顶栏控件交互状态校验：node tests/verify-topbar-states.mjs [baseUrl]
//
// 断言（topbar cap 的每页 × 深色 / 浅色（页面支持时）× 桌面 1280 / 触屏 390，首屏）：
//   ① 触屏（hover: none）下用 DevTools 强制 :hover，顶栏控件的背景与描边不变。
//      悬停规则必须写在 @media (hover: hover) 里，否则手指点完 Sound 会留下「粘住的高亮」，
//      直到点别处才消失（2026-10-21 实测 26 页里 140 处）。
//   ② 桌面下强制 :hover，每颗 .game-icon-btn 的背景或描边有变化（不能没有悬停反馈：
//      magnetic-garden 曾用无层页面规则把底色写死，共享层的悬停永远赢不了）。
//   ③ 强制 :focus-visible，每个顶栏控件都有 ≥2px 实线焦点环，且焦点环颜色与它盖住的
//      背景像素（截图取样）对比度 ≥ 3:1。页面主色不一定达标（circuit 的金黄在浅底上
//      只有 1.2:1），所以共享层用 --tok-focus，而不是 --tok-accent。
//   ④ 顶栏里 disabled 的按钮不可见（共享层 visibility:hidden，保留槽位）。曾经 firefly /
//      loop-jail / magnetic-garden 显示 35–40% 透明的死按钮，sudoku-mist 的暂停钮禁用了
//      却看起来完全正常。
//   ⑤ 顶栏图标钮（非 --wide）是正方形。科学展柜曾给它加 min-height: 44px，
//      在手机上变成 36×44 的竖条（44px 热区本来就由 ::after 提供）。
//
// ⚠️ 无头 Chrome 不报告任何指针设备：(hover: hover) 永远不匹配，CDP 的
//    Emulation.setEmulatedMedia 与 --blink-settings 都改不了它。桌面轮因此在 CSSOM 里
//    把所有 @media (hover: hover) 规则改写成 all，模拟一台有鼠标的设备；触屏轮保持原样。
import puppeteer from 'puppeteer-core';
import { decodePng } from './lib/png.mjs';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { keepPage, exitIfNoPages } from './lib/page-filter.mjs';
import { registry } from './lib/registry.mjs';

const BASE = process.argv.slice(2).find(a => a.startsWith('http')) || 'http://127.0.0.1:8899';
const PAGES = registry.withCap('topbar').map(g => g.id).filter(keepPage);
exitIfNoPages(PAGES, 'verify-topbar-states');

const MODES = {
    desk: { width: 1280, height: 900 },
    touch: { width: 390, height: 664, hasTouch: true, isMobile: true },
};
const CONTROLS = '.game-topbar button, .game-topbar a';
const MIN_RING_CONTRAST = 3;

const fails = [];
let checks = 0;
const check = (ok, msg) => { checks++; if (!ok) fails.push(msg); };

const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const rgb = s => (s.match(/rgba?\(([^)]+)\)/)?.[1] || '0,0,0').split(/[\s,/]+/).filter(Boolean).map(Number);

const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: LAUNCH_ARGS });

for (const id of PAGES) {
    for (const theme of ['dark', 'light']) {
        for (const [mode, viewport] of Object.entries(MODES)) {
            const tag = `${id}/${theme}/${mode}`;
            const page = await browser.newPage();
            await page.setViewport(viewport);
            const errs = [];
            page.on('pageerror', e => errs.push(String(e.message || e).split('\n')[0]));
            await page.evaluateOnNewDocument(t => {
                try { localStorage.setItem('site_lang', 'zh'); localStorage.setItem('site_theme', t); } catch (e) { /* 隐私模式 */ }
            }, theme);
            try {
                await page.goto(`${BASE}/${id}.html`, { waitUntil: 'load', timeout: 25000 });
                // 就绪 = bindChrome 已写入声音图标 + 字体就绪 + 再等两帧布局
                await page.waitForFunction(() => document.querySelector('.game-topbar [data-chrome="sound"] svg'), { timeout: 10000 });
                await page.evaluate(() => document.fonts.ready.then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))));
            } catch (e) {
                check(false, `${tag}: 页面未就绪（${e.message.split('\n')[0]}）`);
                await page.close();
                continue;
            }
            // 浅色只测声明支持浅色的页（其余页面偏好浅色时仍是深色，与深色轮重复）
            if (theme === 'light' && await page.evaluate(() => document.documentElement.dataset.theme) !== 'light') {
                await page.close();
                continue;
            }
            await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; }' });
            if (mode === 'desk') await page.evaluate(() => {
                const walk = rules => {
                    for (const r of rules) {
                        if (r.media && /hover:\s*hover/.test(r.conditionText || '')) r.media.mediaText = 'all';
                        if (r.cssRules) walk(r.cssRules);
                    }
                };
                for (const s of document.styleSheets) { try { walk(s.cssRules); } catch (e) { /* 跨源样式表 */ } }
            });

            const read = () => page.evaluate(sel => [...document.querySelectorAll(sel)].map(el => {
                const c = getComputedStyle(el);
                const r = el.getBoundingClientRect();
                return {
                    name: el.id || el.dataset.chrome || el.className.split(' ')[0] || el.tagName,
                    iconBtn: el.classList.contains('game-icon-btn'),
                    wide: el.classList.contains('game-icon-btn--wide'),
                    shown: c.display !== 'none' && c.visibility !== 'hidden' && r.width > 0,
                    disabled: !!el.disabled,
                    bg: c.backgroundColor, bd: c.borderTopColor,
                    outline: { style: c.outlineStyle, width: parseFloat(c.outlineWidth), color: c.outlineColor },
                    rect: [r.left, r.top, r.width, r.height],
                };
            }), CONTROLS);
            const base = await read();

            // ③ 的取样底图：未聚焦时焦点环将要盖住的像素（边框外 2–4px，取中线 3px）
            const barBottom = await page.evaluate(() => document.querySelector('.game-topbar').getBoundingClientRect().bottom);
            const shot = decodePng(await page.screenshot({
                type: 'png',
                clip: { x: 0, y: 0, width: viewport.width, height: Math.min(viewport.height, Math.ceil(barBottom) + 8) },
            }));
            const pixel = (x, y) => {
                x = Math.round(x); y = Math.round(y);
                if (x < 0 || y < 0 || x >= shot.w || y >= shot.h) return null;
                const i = (y * shot.w + x) * shot.bpp;
                return [shot.px[i], shot.px[i + 1], shot.px[i + 2]];
            };

            const cdp = await page.target().createCDPSession();
            await cdp.send('DOM.enable');
            await cdp.send('CSS.enable');
            const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
            const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: CONTROLS });
            const forced = async (i, states) => {
                await cdp.send('CSS.forcePseudoState', { nodeId: nodeIds[i], forcedPseudoClasses: states });
                const now = (await read())[i];
                await cdp.send('CSS.forcePseudoState', { nodeId: nodeIds[i], forcedPseudoClasses: [] });
                return now;
            };

            for (let i = 0; i < base.length; i++) {
                const b = base[i];
                // ④ 禁用即隐藏
                if (b.disabled) check(!b.shown, `${tag}: 禁用的顶栏按钮 ${b.name} 仍然可见（应 visibility:hidden）`);
                if (!b.shown) continue;

                // ①② 悬停
                const hover = await forced(i, ['hover']);
                const changed = hover.bg !== b.bg || hover.bd !== b.bd;
                if (mode === 'touch') {
                    check(!changed, `${tag}: ${b.name} 在触屏上有悬停样式（${b.bg} → ${hover.bg}），须放进 @media (hover: hover)`);
                } else if (b.iconBtn) {
                    check(changed, `${tag}: ${b.name} 桌面悬停没有任何反馈（背景 ${b.bg}，描边 ${b.bd}）`);
                }

                // ③ 焦点环
                const { outline } = await forced(i, ['focus', 'focus-visible']);
                const solid = outline.style === 'solid' && outline.width >= 2;
                check(solid, `${tag}: ${b.name} 焦点环不是 ≥2px 实线（${outline.style} ${outline.width}px）`);
                if (solid) {
                    const ring = rgb(outline.color);
                    const [x, y, w, h] = b.rect;
                    const samples = [[x - 3, y + h / 2], [x + w + 2, y + h / 2], [x + w / 2, y - 3], [x + w / 2, y + h + 2]]
                        .map(([px, py]) => pixel(px, py)).filter(Boolean);
                    const worst = Math.min(...samples.map(p => contrast(ring, p)));
                    check(worst >= MIN_RING_CONTRAST,
                        `${tag}: ${b.name} 焦点环 ${outline.color} 与背景对比度 ${worst.toFixed(2)}:1 < ${MIN_RING_CONTRAST}:1`);
                }

                // ⑤ 图标钮正方形
                if (b.iconBtn && !b.wide) {
                    const [, , w, h] = b.rect;
                    check(Math.abs(w - h) < 0.5, `${tag}: 顶栏图标钮 ${b.name} 不是正方形（${w}×${h}）`);
                }
            }
            check(errs.length === 0, `${tag}: pageerror ${errs.join(' | ')}`);
            await page.close();
        }
    }
}

await browser.close();

if (fails.length) {
    console.log(`\n✗ verify-topbar-states：${fails.length} 项失败（${checks} 项断言）`);
    fails.forEach(f => console.log('  ✗ ' + f));
    process.exit(1);
}
console.log(`✓ verify-topbar-states：${checks} 项断言通过（${PAGES.length} 页 × 深/浅色 × 桌面/触屏）`);
