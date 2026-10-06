#!/usr/bin/env node
// verify-immersive.mjs — Immersive Stage 布局契约（docs/contracts/layout.md §7）
//
// 页面清单：registry.withLayout('immersive')（games.config.json 的 layout 字段），新页自动纳入。
// 视口：390×844 / 393×852 / 430×932（竖屏手机）· 844×390（横屏手机）· 1280×800 / 1440×900（桌面）
// 断言（每页 × 每视口）：
//   ① 默认：舞台顶边 = 顶栏底边、底边 = 视口底边；TD 手机横屏战斗例外：舞台 = 整个视口，顶栏悬浮
//   ② --frame-chrome 是实测值：= shell 上内距 + 顶栏高（不是 CSS 里 150px 的兜底）
//   ③ 宽度：窄于 --frame-immersive-max 时贴边铺满；更宽时居中，按页面上限（TD 为 800px，其它为 640px）
//   ④ 默认：无横向滚动且页脚在首屏之下可滚到；TD 手机横屏战斗例外：页脚 display:none
//   ⑤ 场景是纯手势区：touch-action:none、user-select:none
//   ⑤b computed contract：immersive shell/stage/topbar/footer 的 named-layer 结构值真实生效；TD 桌面 stats 例外可见
//   ⑥ 画布后备缓冲 = CSS 尺寸 × min(dpr, 2)（高清且有上限），画面非空
//   ⑦ HUD 在舞台上部 25% 以内（悬浮在天空区域），不是独立面板
//   ⑧ 转屏 / 缩放后重新满足 ①（ResizeObserver + bindFrame 生效，不靠刷新）
//   ⑨ 标准布局页零回归抽查：注册表里非 immersive 的页不带 immersive 类、body 不带 has-immersive-stage
//   ⑩ 无 pageerror
//
// 用法：node tests/verify-immersive.mjs [baseUrl]（verify-all 自动传入）
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { keepPage, exitIfNoPages } from './lib/page-filter.mjs';
import { registry } from './lib/registry.mjs';

const BASE = process.argv.slice(2).find(a => a.startsWith('http')) || 'http://127.0.0.1:8899';
const PAGES = registry.withLayout('immersive');
const VIEWPORTS = [
    [390, 844, 3], [393, 852, 3], [430, 932, 3], [844, 390, 3], [1280, 800, 1], [1440, 900, 2],
];

const fails = [];
let passes = 0;
const check = (cond, label, extra = '') => { if (cond) passes++; else fails.push(`${label}${extra !== '' ? ' —— ' + extra : ''}`); };

if (!PAGES.length) {
    console.error('✗ 注册表里没有 layout: "immersive" 的页面 —— 契约无人使用，校验器无事可做');
    process.exit(1);
}
// 按页过滤（VERIFY_PAGES）放在「契约无人使用」守卫之后，不让过滤把那条守卫变绿
const RUN_PAGES = PAGES.filter(g => keepPage(g.id));
const STANDARD_SAMPLE = registry.withLayout('standard').filter(g => keepPage(g.id));
exitIfNoPages([...RUN_PAGES, ...STANDARD_SAMPLE], 'verify-immersive');

const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: LAUNCH_ARGS });

const measure = page => page.evaluate(() => {
    const shell = document.querySelector('.game-shell');
    const topbar = shell.querySelector(':scope > .game-topbar');
    const stage = document.querySelector('.game-stage--immersive');
    const footer = shell.querySelector(':scope > .game-footer');
    const canvas = stage.querySelector('canvas');
    const hud = stage.querySelector('[class*="hud"]');
    const cs = getComputedStyle(shell);
    const st = stage.getBoundingClientRect();
    const tb = topbar.getBoundingClientRect();
    const ft = footer ? footer.getBoundingClientRect() : null;
    const scs = getComputedStyle(stage);
    const tcs = getComputedStyle(topbar);
    const fcs = footer ? getComputedStyle(footer) : null;
    const stats = document.querySelector('.game-stats-btn');
    const rootStyle = getComputedStyle(document.documentElement);
    const rootMax = parseFloat(rootStyle.getPropertyValue('--frame-immersive-max')) || 640;
    const rootMinH = parseFloat(rootStyle.getPropertyValue('--frame-immersive-min-h')) || 300;
    const immersiveMax = parseFloat(cs.getPropertyValue('--frame-immersive-max')) || rootMax;
    const immersiveMinH = parseFloat(cs.getPropertyValue('--frame-immersive-min-h')) || rootMinH;
    let lit = 0;
    if (canvas && canvas.width) {
        const g = canvas.getContext('2d');
        const d = g.getImageData(0, Math.floor(canvas.height * 0.6), canvas.width, 1).data;
        for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 12) lit++;
    }
    return {
        vw: innerWidth, vh: innerHeight, dpr: window.devicePixelRatio,
        stage: { top: st.top, bottom: st.bottom, left: st.left, width: st.width, height: st.height },
        topbarBottom: tb.bottom, topbarH: tb.height,
        padTop: parseFloat(cs.paddingTop) || 0,
        chromeVar: parseFloat(shell.style.getPropertyValue('--frame-chrome')),
        footerTop: ft ? ft.top : null, footerH: ft ? ft.height : 0,
        scrollW: document.documentElement.scrollWidth,
        scrollH: document.documentElement.scrollHeight,
        touchAction: scs.touchAction, userSelect: scs.userSelect || scs.webkitUserSelect,
        canvas: canvas ? { w: canvas.width, h: canvas.height, cw: canvas.clientWidth, ch: canvas.clientHeight, lit } : null,
        hud: hud ? { top: hud.getBoundingClientRect().top, bottom: hud.getBoundingClientRect().bottom } : null,
        rootMax,
        immersiveMax,
        immersiveMinH,
        bodyClass: document.body.className,
        topbarPosition: tcs.position,
        footerDisplay: footer ? fcs.display : null,
        shellStyle: {
            maxWidth: cs.maxWidth,
            minHeight: parseFloat(cs.minHeight) || 0,
            paddingTop: parseFloat(cs.paddingTop) || 0,
            paddingLeft: parseFloat(cs.paddingLeft) || 0,
            paddingRight: parseFloat(cs.paddingRight) || 0,
        },
        topbarStyle: {
            maxWidth: parseFloat(tcs.maxWidth) || null,
            paddingLeft: parseFloat(tcs.paddingLeft) || 0,
            paddingRight: parseFloat(tcs.paddingRight) || 0,
        },
        stageStyle: {
            position: scs.position,
            display: scs.display,
            overflowX: scs.overflowX,
            overflowY: scs.overflowY,
            maxWidth: parseFloat(scs.maxWidth) || null,
            minHeight: parseFloat(scs.minHeight) || 0,
        },
        footerStyle: fcs ? {
            maxWidth: parseFloat(fcs.maxWidth) || null,
            paddingLeft: parseFloat(fcs.paddingLeft) || 0,
            paddingRight: parseFloat(fcs.paddingRight) || 0,
            paddingBottom: parseFloat(fcs.paddingBottom) || 0,
        } : null,
        statsDisplay: stats ? getComputedStyle(stats).display : null,
    };
});

for (const g of RUN_PAGES) {
    for (const [w, h, dpr] of VIEWPORTS) {
        const tag = `${g.id}@${w}×${h}`;
        const page = await browser.newPage();
        const errs = [];
        page.on('pageerror', e => errs.push(String(e.message || e).split('\n')[0]));
        await page.setViewport({ width: w, height: h, deviceScaleFactor: dpr, isMobile: w < 900, hasTouch: w < 900 });
        await page.goto(`${BASE}/${g.href}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await new Promise(r => setTimeout(r, 700));
        // 进入游戏态再量：开始菜单期间舞台按 layout.md「开始菜单」契约让位给菜单高度（< 1024px）
        await page.evaluate(() => {
            const menu = document.querySelector('.game-overlay--menu:not(.hidden)');
            const first = menu && (menu.querySelector('[data-immersive-start]')
                || menu.querySelector('#td-btn-play')
                || menu.querySelector('button'));
            if (first) first.click();
        });
        await new Promise(r => setTimeout(r, 400));
        const m = await measure(page);

        const tdLandscapeFullscreen = g.id === 'tower-defense' && w < 1024 && w > h;
        if (tdLandscapeFullscreen) {
            check(Math.abs(m.stage.top) <= 1 && Math.abs(m.stage.bottom - m.vh) <= 1,
                `① ${tag}：TD 横屏战斗舞台覆盖整个视口`, JSON.stringify(m.stage));
            check(m.topbarPosition === 'fixed', `① ${tag}：TD 横屏顶栏悬浮`, m.topbarPosition);
        } else {
            check(Math.abs(m.stage.top - m.topbarBottom) <= 1, `① ${tag}：舞台紧贴顶栏`, `stage.top=${m.stage.top} topbar.bottom=${m.topbarBottom}`);
            check(Math.abs(m.stage.bottom - m.vh) <= 1, `① ${tag}：舞台底边 = 视口底边`, `stage.bottom=${m.stage.bottom} vh=${m.vh}`);
        }
        check(Math.abs(m.chromeVar - Math.round(m.padTop + m.topbarH)) <= 1, `② ${tag}：--frame-chrome 为实测值`, `${m.chromeVar} vs ${m.padTop}+${m.topbarH}`);
        check(m.shellStyle.maxWidth === 'none', `②b ${tag}：immersive shell contract 的 max-width:none 生效`, m.shellStyle.maxWidth);
        check(m.shellStyle.minHeight >= m.vh - 1, `②b ${tag}：immersive shell 至少占满 100dvh`, m.shellStyle.minHeight);
        if (!tdLandscapeFullscreen) {
            check(m.stageStyle.display === 'block', `②b ${tag}：immersive stage display:block`, m.stageStyle.display);
            // Normal-state positioning remains a customizable layout/page choice; only the
            // TD fullscreen state below owns a fixed-position contract.
            check(m.stageStyle.overflowX === 'hidden' && m.stageStyle.overflowY === 'hidden',
                `②b ${tag}：immersive stage overflow:hidden`, `${m.stageStyle.overflowX}/${m.stageStyle.overflowY}`);
            check(Math.abs(m.stageStyle.maxWidth - m.immersiveMax) <= 1,
                `②b ${tag}：stage max-width 由 --frame-immersive-max 驱动`, `${m.stageStyle.maxWidth} vs ${m.immersiveMax}`);
            check(Math.abs(m.stageStyle.minHeight - m.immersiveMinH) <= 1,
                `②b ${tag}：stage min-height 跟随 --frame-immersive-min-h`,
                `${m.stageStyle.minHeight} vs ${m.immersiveMinH}`);
            check(Math.abs(m.topbarStyle.maxWidth - m.immersiveMax) <= 1,
                `②b ${tag}：topbar max-width 与 immersive 上限一致`, `${m.topbarStyle.maxWidth} vs ${m.immersiveMax}`);
            check(m.topbarStyle.paddingLeft >= 9.5 && m.topbarStyle.paddingRight >= 9.5,
                `②b ${tag}：topbar 保留左右 safe-area 下限`, `${m.topbarStyle.paddingLeft}/${m.topbarStyle.paddingRight}`);
            if (m.footerStyle) {
                check(Math.abs(m.footerStyle.maxWidth - m.immersiveMax) <= 1,
                    `②b ${tag}：footer max-width 与 immersive 上限一致`, `${m.footerStyle.maxWidth} vs ${m.immersiveMax}`);
                check(m.footerStyle.paddingLeft >= 9.5 && m.footerStyle.paddingRight >= 9.5 && m.footerStyle.paddingBottom >= 7.5,
                    `②b ${tag}：footer 保留 safe-area padding`, JSON.stringify(m.footerStyle));
            }
        } else {
            check(m.stageStyle.position === 'fixed', `②b ${tag}：TD 横屏全视口 stage contract 为 fixed`, m.stageStyle.position);
            check(m.stageStyle.minHeight === 0, `②b ${tag}：TD 横屏覆盖共享 300px min-height`, m.stageStyle.minHeight);
        }
        if (g.id === 'tower-defense' && w >= 1024) {
            check(m.statsDisplay !== 'none', `②b ${tag}：TD 桌面 stats-button 合法例外保持可见`, m.statsDisplay);
        }
        if (tdLandscapeFullscreen) {
            check(Math.abs(m.stage.width - m.vw) <= 1 && Math.abs(m.stage.left) <= 1,
                `③ ${tag}：TD 横屏战斗舞台横向铺满视口`, `${m.stage.left}/${m.stage.width}`);
        } else if (m.vw <= m.immersiveMax) {
            check(Math.abs(m.stage.width - m.vw) <= 1 && Math.abs(m.stage.left) <= 1, `③ ${tag}：窄屏贴边铺满`, `${m.stage.left}/${m.stage.width}`);
        } else {
            const max = g.id === 'tower-defense' ? m.immersiveMax : 640;
            check(m.stage.width >= (g.id === 'tower-defense' ? 760 : 600) && m.stage.width <= max, `③ ${tag}：宽屏舞台达到页面上限`, `${m.stage.width} ≤ ${max}`);
            check(Math.abs(m.stage.left - (m.vw - m.stage.width) / 2) <= 1, `③ ${tag}：宽屏舞台居中`, m.stage.left);
        }
        check(m.scrollW <= m.vw, `④ ${tag}：无横向滚动`, `${m.scrollW} > ${m.vw}`);
        if (tdLandscapeFullscreen) {
            check(m.footerDisplay === 'none', `④ ${tag}：TD 横屏战斗隐藏页脚`, m.footerDisplay);
        } else {
            check(m.footerTop !== null && m.footerTop >= m.vh - 1, `④ ${tag}：页脚在首屏之下`, m.footerTop);
            check(m.footerTop !== null && m.scrollH >= m.footerTop + m.footerH - 1, `④ ${tag}：页脚可滚到`);
        }
        check(m.touchAction === 'none', `⑤ ${tag}：舞台 touch-action:none`, m.touchAction);
        check(m.userSelect === 'none', `⑤ ${tag}：舞台 user-select:none`, m.userSelect);
        if (m.canvas) {
            const k = Math.min(2, m.dpr);
            check(Math.abs(m.canvas.w - m.canvas.cw * k) <= 1 && Math.abs(m.canvas.h - m.canvas.ch * k) <= 1,
                `⑥ ${tag}：画布后备缓冲 = CSS × min(dpr,2)`, `${m.canvas.w}×${m.canvas.h} vs ${m.canvas.cw}×${m.canvas.ch}×${k}`);
            check(m.canvas.lit > m.canvas.w * 0.5, `⑥ ${tag}：画布画面非空`, m.canvas.lit);
        } else {
            check(false, `⑥ ${tag}：舞台里有 canvas`);
        }
        if (m.hud) check(m.hud.bottom <= m.stage.top + m.stage.height * 0.25 + 1, `⑦ ${tag}：HUD 悬浮在舞台上部 25%`, `${m.hud.bottom} vs ${m.stage.top + m.stage.height * 0.25}`);
        check(/\bhas-immersive-stage\b/.test(m.bodyClass) && !/\bhas-frame-budget\b/.test(m.bodyClass), `${tag}：bindFrame({ layout: 'immersive' }) 打了正确的 body 标记`, m.bodyClass);

        // ⑧ 转屏：竖 ↔ 横互换后不刷新，舞台重新贴合
        if (w < 900) {
            await page.setViewport({ width: h, height: w, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
            await new Promise(r => setTimeout(r, 450));
            const r = await measure(page);
            const rotatedTdLandscapeFullscreen = g.id === 'tower-defense' && h < 1024 && h > w;
            if (rotatedTdLandscapeFullscreen) {
                check(Math.abs(r.stage.top) <= 1 && Math.abs(r.stage.bottom - r.vh) <= 1
                    && Math.abs(r.stage.width - r.vw) <= 1 && r.topbarPosition === 'fixed'
                    && r.footerDisplay === 'none',
                `⑧ ${tag} → 转屏：TD 横屏切换为全视口战场`, JSON.stringify(r.stage));
            } else {
                check(Math.abs(r.stage.top - r.topbarBottom) <= 1 && Math.abs(r.stage.bottom - r.vh) <= 1,
                    `⑧ ${tag} → 转屏：舞台重新填满顶栏以下`, JSON.stringify(r.stage));
            }
            if (r.canvas) check(Math.abs(r.canvas.h - r.canvas.ch * Math.min(2, r.dpr)) <= 1, `⑧ ${tag} → 转屏：画布缓冲跟随`);
        }
        check(errs.length === 0, `⑩ ${tag}：无 pageerror`, errs.join(' | '));
        await page.close();
    }
}

// ⑨ 标准布局页抽查：immersive 的类与 body 标记不外溢（每页一次，390 视口）
{
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844 });
    for (const g of STANDARD_SAMPLE) {
        if (!(g.caps || []).includes('topbar')) continue;
        await page.goto(`${BASE}/${g.href}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await new Promise(r => setTimeout(r, 250));
        const s = await page.evaluate(() => ({
            cls: !!document.querySelector('.game-shell--immersive, .game-stage--immersive'),
            body: document.body.classList.contains('has-immersive-stage'),
        }));
        check(!s.cls && !s.body, `⑨ ${g.id}：标准布局页未被 immersive 规则波及`);
    }
    await page.close();
}

await browser.close();
if (fails.length) {
    console.error(fails.map(f => `✗ ${f}`).join('\n'));
    console.error(`\nverify-immersive：${fails.length} 项失败（${passes} 项通过）❌`);
    process.exit(1);
}
console.log(`verify-immersive 全部通过 ✅（${passes} 项断言，${RUN_PAGES.length} 页 × ${VIEWPORTS.length} 视口 + 标准页抽查）`);
