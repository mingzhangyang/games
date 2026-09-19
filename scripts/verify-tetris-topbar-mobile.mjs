// Tetris 顶栏主题钮 + 移动端「页尾内容可达性」回归检查
//
// 覆盖两个真实缺陷：
//   A. ✅ .theme-toggle 里 "🌈 Theme" 文案不垂直居中
//      —— emoji 字体度量撑高行盒（10px 字号下上留 7px / 下留 15px，文案偏高 4px）。
//   B. ✅ 移动端 SCORE 之下的 Level/Lines/Combo/Next Piece/More Games 永远看不到
//      —— body 曾 position:fixed + overflow:auto：overflow 被传播给视口、body 自身
//      没有滚动盒，加上 body 脱流导致 html 无在流内容 ⇒ 视口可滚高度=视口高度，
//      脚本赋值 / 滚轮 / 真实触摸上滑都滚不动。另外固定底栏 76px 高于 body 的 72px 留白。
//   附带：.theme-toggle 曾是 position:static，热区伪元素 ::after(inset:-6px) 解析到
//      .game-container，给整页铺了一层隐形命中层。
//
// 用法：node scripts/serve-static.mjs 8899 & 然后
//       node scripts/verify-tetris-topbar-mobile.mjs http://127.0.0.1:8899 [outDir]
import puppeteer from 'puppeteer-core';
import { existsSync, mkdirSync } from 'node:fs';

const EXE = [
    'C:/Users/mingz/.cache/puppeteer/chrome/win64-119.0.6045.105/chrome-win64/chrome.exe',
].find(existsSync);
const BASE = process.argv[2] || 'http://127.0.0.1:8899';
const OUT = process.argv[3] || 'C:/tmp/tetris-topbar-mobile';
mkdirSync(OUT, { recursive: true });

const fails = [];
const check = (ok, label, detail) => {
    if (!ok) fails.push(label + (detail ? ' — ' + detail : ''));
    console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? '  (' + detail + ')' : ''}`);
};

const VIEWPORTS = [
    { name: '手机 390×844', width: 390, height: 844, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
    { name: '手机 360×640', width: 360, height: 640, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
    { name: '手机 320×568', width: 320, height: 568, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
    { name: '平板 700×900', width: 700, height: 900, deviceScaleFactor: 1, hasTouch: true },
    { name: '桌面 1280×900', width: 1280, height: 900, deviceScaleFactor: 1, hasTouch: false },
];

const browser = await puppeteer.launch({ executablePath: EXE, headless: 'new', args: ['--no-sandbox'] });

const SNAP = () => {
    const box = r => ({ x: +r.x.toFixed(2), y: +r.y.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2), bottom: +r.bottom.toFixed(2) });

    // ── A. 主题钮 ──
    const tt = document.getElementById('themeToggle');
    const cs = getComputedStyle(tt);
    const rect = tt.getBoundingClientRect();
    const label = tt.querySelector('span');
    const svg = tt.querySelector('svg');
    const labelBox = label ? label.getBoundingClientRect() : null;
    const svgBox = svg ? svg.getBoundingClientRect() : null;
    // 文案 ink box（Range 量的是行盒，配合 line-height:1 行盒≈字号，足以判断居中）
    const range = document.createRange();
    range.selectNodeContents(label || tt);
    const ink = box(range.getBoundingClientRect());

    // ── B. 页尾可达性 ──
    const bar = document.querySelector('.mobile-controls');
    const barBox = bar && getComputedStyle(bar).display !== 'none' ? box(bar.getBoundingClientRect()) : null;

    return {
        theme: {
            rect: box(rect),
            display: cs.display,
            alignItems: cs.alignItems,
            lineHeight: cs.lineHeight,
            position: cs.position,
            text: tt.textContent,
            hasSvg: !!svg,
            svgCount: tt.querySelectorAll('svg').length,
            ariaPressed: tt.getAttribute('aria-pressed'),
            svgW: svgBox ? +svgBox.width.toFixed(2) : null,
            svgH: svgBox ? +svgBox.height.toFixed(2) : null,
            // >0 表示文案中心低于胶囊中心
            inkCenterOffset: +(ink.y + ink.h / 2 - (rect.y + rect.height / 2)).toFixed(2),
            // 图标中心 vs 文案中心
            iconLabelOffset: (svgBox && labelBox) ? +(svgBox.y + svgBox.height / 2 - (labelBox.y + labelBox.height / 2)).toFixed(2) : null,
            // 热区伪元素：应只外扩 6px，而不是覆盖整个容器
            afterHitAt40Below: (() => {
                const el = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2 + 40);
                return el ? (el.id || el.className || el.tagName) : null;
            })(),
            afterHitFarLeft: (() => {
                const el = document.elementFromPoint(Math.max(2, rect.x - 120), rect.y + rect.height / 2);
                return el ? (el.id || el.className || el.tagName) : null;
            })(),
        },
        scroll: {
            docScrollHeight: document.scrollingElement.scrollHeight,
            innerHeight: window.innerHeight,
            canScroll: document.scrollingElement.scrollHeight > window.innerHeight + 1,
            bodyPosition: getComputedStyle(document.body).position,
            bodyPaddingBottom: getComputedStyle(document.body).paddingBottom,
            scrollTop: document.scrollingElement.scrollTop,
        },
        bar: barBox,
        board: box(document.getElementById('tetris').getBoundingClientRect()),
        // 侧栏 / 抽屉归属（2026-09-19 起：手机侧栏隐藏、面板搬进抽屉）
        sidebar: (() => {
            const el = document.getElementById('infoPanel');
            if (!el) return null;
            return { display: getComputedStyle(el).display, hasPanels: !!el.querySelector('#statsPanels') };
        })(),
        drawer: (() => {
            const el = document.getElementById('statsDrawer');
            if (!el) return null;
            const body = document.getElementById('statsDrawerBody');
            return {
                exists: true,
                hidden: el.hasAttribute('hidden'),
                display: getComputedStyle(el).display,
                bodyHasPanels: !!body && !!body.querySelector('#statsPanels'),
            };
        })(),
    };
};

for (const vp of VIEWPORTS) {
    console.log('\n=== ' + vp.name + ' ===');
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', e => pageErrors.push(e.message));
    await page.setViewport(vp);
    await page.goto(BASE + '/tetris.html', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 800));

    const s = await page.evaluate(SNAP);

    // 信息项（非断言）：矮屏上棋盘会被固定底栏压住底部 —— 属另一处布局问题，这里只报数
    if (s.bar && s.board && s.board.bottom > s.bar.y) {
        console.log(`  · 注意：未滚动时棋盘底边 ${s.board.bottom} 低于底栏顶边 ${s.bar.y}，被遮 ${(s.board.bottom - s.bar.y).toFixed(0)}px（棋盘 max-height 未随视口高度收敛）`);
    }

    // ── A ──
    // 主题钮已于 2026-09-19 从「图标+文案胶囊」改为纯图标钮（与顶栏其他钮一致），
    // 原「文案 ink 居中 / 图标与文案基线对齐 / .game-btn 约束 15px」三条断言所测的
    // 对象（钮内有 <span> 文案）已不存在，按新契约改为验证「是纯图标钮」。
    // 垂直居中仍要有保障，只是改由 .game-icon-btn 的 flex 居中承担。
    // 相关覆盖由 scripts/verify-tetris-drawer.mjs 承接（含抽屉与 HUD）。
    check(s.theme.hasSvg && s.theme.svgCount === 1, '主题钮内有且只有一个 inline SVG 图标', `svg=${s.theme.svgCount}`);
    check(s.theme.text.trim() === '',
        '主题钮不含文字子节点（纯图标钮；文案只在 aria-label / title）', JSON.stringify(s.theme.text));
    check(s.theme.display.includes('flex') && s.theme.alignItems === 'center',
        '主题钮是 flex + align-items:center（居中交给布局而不是字形度量）',
        `${s.theme.display} / ${s.theme.alignItems}`);
    check(s.theme.svgW > 10 && s.theme.svgW < 26, '图标尺寸在图标钮的预期量级（约 18-20px）', `${s.theme.svgW}×${s.theme.svgH}`);
    check(s.theme.rect && Math.abs(s.theme.rect.w - s.theme.rect.h) <= 2,
        '主题钮是正方钮（与同排 Stats/Home 同形）',
        `${s.theme.rect ? s.theme.rect.w + '×' + s.theme.rect.h : '-'}`);

    // 热区伪元素不得溢出到整页（远点不应命中 themeToggle）
    check(s.theme.afterHitAt40Below !== 'themeToggle' && s.theme.afterHitFarLeft !== 'themeToggle',
        '主题钮热区伪元素不再铺满整页（远点不命中 themeToggle）',
        `下40px=${s.theme.afterHitAt40Below} 左120px=${s.theme.afterHitFarLeft}`);
    check(s.theme.position === 'relative', '主题钮自身是定位元素（热区外扩才有正确包含块）', s.theme.position);

    // ── B ──
    // ⚠️ 面板已搬进底部抽屉（2026-09-19），主文档因此显著变短：
    // 「可滚高度 > 视口」不再恒成立（390×844 上 scrollHeight 已≈视口高）。
    // 真正要守住的是：body 没脱流、且能滚到真实边界 —— 后者在抽屉套件里断言。
    check(s.scroll.bodyPosition !== 'fixed', 'body 不再脱流（否则视口没有任何可滚内容）', s.scroll.bodyPosition);

    // 面板归属：手机端必须是「侧栏隐藏 + 面板在抽屉里」，桌面端反之。
    // 这条守住的是「一套 DOM 只在两处之一出现」——若两处都在，用户会看到重复面板；
    // 若两处都不在，抽屉打开将是空的。
    if (s.sidebar && s.drawer) {
        if (vp.width < 1024) {
            check(s.sidebar.display === 'none', '手机端侧栏已隐藏（让位给抽屉）', `display=${s.sidebar.display}`);
            check(s.drawer.bodyHasPanels && !s.sidebar.hasPanels,
                '面板已挂载到抽屉内、且不在隐藏的侧栏里',
                `抽屉内=${s.drawer.bodyHasPanels} 侧栏内=${s.sidebar.hasPanels}`);
        } else {
            check(s.drawer.display === 'none', '桌面端抽屉不占位（侧栏常驻，抽屉无意义）', `display=${s.drawer.display}`);
            check(s.sidebar.hasPanels, '桌面端面板常驻在侧栏（未搬进抽屉）', `侧栏内=${s.sidebar.hasPanels}`);
        }
    }

    // 真实滚动：脚本 + 滚轮 + 触摸三条路径都必须动。
    // ⚠️ 面板搬进抽屉后主文档变短，250 这个目标值可能超过 maxScroll：
    // 改为「滚到 min(250, maxScroll) 并确认真的到达」，避免把"页面本来就没那么长"
    // 误报成"滚不动"（后者是很隐蔽的真缺陷，必须严格区分）。
    const target = await page.evaluate(() => Math.min(250, Math.max(0, document.scrollingElement.scrollHeight - window.innerHeight)));
    const moved = await page.evaluate((t) => {
        document.scrollingElement.scrollTo({ top: t, behavior: 'instant' });
        return document.scrollingElement.scrollTop;
    }, target);
    check(moved >= Math.max(0, target - 2), '设置 scrollTop 后页面真的滚了（overflow 没被错误传播掉）',
        `目标 ${target} 实到 ${moved}`);

    await page.evaluate(() => document.scrollingElement.scrollTo({ top: 0, behavior: 'instant' }));
    if (vp.hasTouch) {
        // ⚠️ 起手点不能随便取中轴：棋盘上 touch-action:none（游戏操作面），
        // 在棋盘上起手本来就滚不动。这里像真人一样，在底栏上方找一个「不在棋盘上」的横向位置。
        const start = await page.evaluate(() => {
            const bar = document.querySelector('.mobile-controls');
            const visible = bar && getComputedStyle(bar).display !== 'none';
            const y = visible ? bar.getBoundingClientRect().y - 12 : window.innerHeight - 60;
            for (let x = 6; x < window.innerWidth / 2; x += 4) {
                const el = document.elementFromPoint(x, y);
                if (el && !el.closest('#tetris, .game-stage, .game-board')) return { x, y };
            }
            return { x: window.innerWidth / 2, y };
        });
        try {
            await page.touchscreen.touchStart(start.x, start.y);
            for (const dy of [30, 70, 110, 150, 190]) {
                await page.touchscreen.touchMove(start.x, start.y - dy);
                await new Promise(r => setTimeout(r, 35));
            }
            await page.touchscreen.touchEnd();
        } catch (e) { /* 忽略手势异常，下面用 scrollTop 断言实际效果 */ }
    } else {
        await page.mouse.move(vp.width / 2, vp.height - 200);
        await page.mouse.wheel({ deltaY: 600 });
    }
    await new Promise(r => setTimeout(r, 500));
    const maxScroll = await page.evaluate(() => Math.max(0, document.scrollingElement.scrollHeight - window.innerHeight));
    const afterGesture = await page.evaluate(() => document.scrollingElement.scrollTop);
    if (maxScroll < 20) {
        // 页面本来就没什么可滚的（面板已移入抽屉），此时"手势没把页面推动"是正常的
        console.log(`  · 跳过手势滚动断言：本视口主文档仅可滚 ${maxScroll}px（面板已在抽屉内）`);
    } else {
        check(afterGesture > Math.min(100, maxScroll * 0.5), (vp.hasTouch ? '真实触摸上滑' : '滚轮下滚') + '能滚起来', `scrollTop=${afterGesture} / 上限 ${maxScroll}`);
    }

    // 滚到底：末位内容必须完全露在固定底栏之上。
    //
    // ⚠️ 2026-09-19 面板搬进底部抽屉后，本段的被测对象变了，不能再找「主文档里最后一张卡片」：
    //   抽屉（.game-drawer）和 .mobile-controls 都是 position:fixed，不在文档流里，
    //   主文档在手机上只剩 .game-shell（顶栏 + 棋盘），已没有页尾卡片 ⇒ end.tail 恒为 null。
    // 新契约下真正要守的是「末尾的在流元素不被固定底栏盖住」——这才是 body 底部留白
    //   = calc(76px + env(safe-area-inset-bottom)) 那条规则的目的（漏写就是曾发生的真缺陷）。
    //
    // ⚠️ 2026-09-19（第二次）：桌面端侧栏接入了「限高 + 内部滚动」契约
    //   （css/layout.css 的 body.has-frame-budget .game-sidebar），末尾内容可能落在
    //   **嵌套滚动容器**里而不是主文档里。本断言要守的是「页尾内容可达」，
    //   不是「只靠滚主文档就能看见」——所以先把文档滚到底，再把 shell 内每个
    //   overflow-y:auto/scroll 的容器也滚到底，然后才测量。
    //   这样既保留原缺陷的守护（主文档完全滚不动时，末位仍会留在视口外 ⇒ 失败），
    //   又不会把「侧栏内部滚动」误报成回归。
    await page.evaluate(() => {
        document.scrollingElement.scrollTo({ top: 999999, behavior: 'instant' });
        document.querySelectorAll('.game-shell *').forEach(el => {
            const oy = getComputedStyle(el).overflowY;
            if (oy === 'auto' || oy === 'scroll') el.scrollTop = el.scrollHeight;
        });
    });
    await new Promise(r => setTimeout(r, 400));
    const end = await page.evaluate(() => {
        const box = r => ({ y: +r.y.toFixed(2), bottom: +r.bottom.toFixed(2), h: +r.height.toFixed(2) });
        const bar = document.querySelector('.mobile-controls');
        const barBox = bar && getComputedStyle(bar).display !== 'none' ? box(bar.getBoundingClientRect()) : null;
        // 只挑「在文档流里的可见末尾元素」：排除 fixed/absolute 浮层（底栏、抽屉、更多游戏面板…）
        const shell = document.querySelector('.game-shell');
        const inFlow = [...document.querySelectorAll('.game-shell *')].filter(el => {
            const r = el.getBoundingClientRect();
            if (r.height <= 0 || r.width <= 0) return false;
            const pos = getComputedStyle(el).position;
            return pos !== 'fixed' && pos !== 'absolute';
        });
        // 取几何上最靠下的那个（不是 DOM 序最末，避免命中被 overflow 收起的元素）
        let tail = null;
        for (const el of inFlow) {
            const r = el.getBoundingClientRect();
            if (!tail || r.bottom > tail.r.bottom) tail = { el, r };
        }
        return {
            bar: barBox,
            tail: tail ? { ...box(tail.r), label: tail.el.className || tail.el.tagName } : null,
            shellBottom: shell ? +shell.getBoundingClientRect().bottom.toFixed(2) : null,
            bodyPaddingBottom: getComputedStyle(document.body).paddingBottom,
            docBottom: document.scrollingElement.scrollHeight,
        };
    });
    if (end.bar) {
        // 主文档已无页尾卡片时（新版布局），退化为断言「文档末尾在固定底栏之上」
        const lastBottom = end.tail ? Math.max(end.tail.bottom, end.shellBottom ?? 0) : end.shellBottom;
        check(lastBottom !== null && lastBottom <= end.bar.y + 1,
            '滚到底后末尾在流内容完全在固定底栏之上（不再被遮挡）',
            `末位 ${end.tail ? end.tail.label : '-'} 底边 ${lastBottom} vs 底栏顶边 ${end.bar.y}`);
        check(parseFloat(end.bodyPaddingBottom) >= end.bar.h - 1,
            'body 底部留白 ≥ 底栏高度', `${end.bodyPaddingBottom} vs 底栏 ${end.bar.h}px`);
    } else {
        check(end.tail !== null && end.tail.bottom <= vp.height + 1,
            '（无底栏）滚到底后末尾内容完全可见',
            `${end.tail ? end.tail.label : '-'} 底边 ${end.tail ? end.tail.bottom : '-'} vs 视口高 ${vp.height}`);
    }
    await page.screenshot({ path: `${OUT}/vp-${vp.width}-scrolled-bottom.png` });

    // 主题钮可点、可键盘触发、aria-pressed 跟随
    await page.evaluate(() => document.scrollingElement.scrollTo({ top: 0, behavior: 'instant' }));
    await new Promise(r => setTimeout(r, 200));
    const before = await page.evaluate(() => ({
        text: document.getElementById('themeToggle').textContent,
        pressed: document.getElementById('themeToggle').getAttribute('aria-pressed'),
        rainbow: document.body.classList.contains('rainbow-theme'),
    }));
    await page.$eval('#themeToggle', el => el.click());
    await new Promise(r => setTimeout(r, 300));
    const afterClick = await page.evaluate(() => ({
        text: document.getElementById('themeToggle').textContent,
        pressed: document.getElementById('themeToggle').getAttribute('aria-pressed'),
        rainbow: document.body.classList.contains('rainbow-theme'),
        svgCount: document.getElementById('themeToggle').querySelectorAll('svg').length,
    }));
    check(afterClick.rainbow !== before.rainbow && afterClick.pressed !== before.pressed,
        '点击主题钮切换主题并同步 aria-pressed',
        `${before.text}(${before.pressed}) → ${afterClick.text}(${afterClick.pressed})`);
    check(afterClick.svgCount === 1, '切换后图标仍在（不会被 i18n 回写覆盖）', `svg=${afterClick.svgCount}`);

    await page.screenshot({ path: `${OUT}/vp-${vp.width}-top.png`, fullPage: false });
    check(pageErrors.length === 0, '无 JS 运行时错误', pageErrors.join(' | ') || 'none');
    await page.close();
}

await browser.close();
console.log('\n' + (fails.length ? `失败 ${fails.length} 项:\n - ` + fails.join('\n - ') : '全部通过'));
console.log('截图: ' + OUT);
process.exit(fails.length ? 1 : 0);
