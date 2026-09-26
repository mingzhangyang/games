#!/usr/bin/env node
// verify-immersive.mjs — Immersive Stage 布局契约（docs/contracts/layout.md §7）
//
// 页面清单：registry.withLayout('immersive')（games.config.json 的 layout 字段），新页自动纳入。
// 视口：390×844 / 393×852 / 430×932（竖屏手机）· 844×390（横屏手机）· 1280×800 / 1440×900（桌面）
// 断言（每页 × 每视口）：
//   ① 舞台顶边 = 顶栏底边，舞台底边 = 视口底边（− 底部安全区，无头环境为 0）：顶栏以下整块视口归场景
//   ② --frame-chrome 是实测值：= shell 上内距 + 顶栏高（不是 CSS 里 150px 的兜底）
//   ③ 宽度：窄于 --frame-immersive-max 时贴边铺满；更宽时居中且 600–640px
//   ④ 无横向滚动；首屏内没有页脚（页脚随流在首屏之下）但页脚存在且可滚到
//   ⑤ 场景是纯手势区：touch-action:none、user-select:none
//   ⑥ 画布后备缓冲 = CSS 尺寸 × min(dpr, 2)（高清且有上限），画面非空
//   ⑦ HUD 在舞台上部 25% 以内（悬浮在天空区域），不是独立面板
//   ⑧ 转屏 / 缩放后重新满足 ①（ResizeObserver + bindFrame 生效，不靠刷新）
//   ⑨ 标准布局页零回归抽查：注册表里非 immersive 的页不带 immersive 类、body 不带 has-immersive-stage
//   ⑩ 无 pageerror
//
// 用法：node scripts/verify-immersive.mjs [baseUrl]（verify-all 自动传入）
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
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
    const rootMax = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--frame-immersive-max')) || 640;
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
        bodyClass: document.body.className,
    };
});

for (const g of PAGES) {
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
            const first = menu && menu.querySelector('button');
            if (first) first.click();
        });
        await new Promise(r => setTimeout(r, 400));
        const m = await measure(page);

        check(Math.abs(m.stage.top - m.topbarBottom) <= 1, `① ${tag}：舞台紧贴顶栏`, `stage.top=${m.stage.top} topbar.bottom=${m.topbarBottom}`);
        check(Math.abs(m.stage.bottom - m.vh) <= 1, `① ${tag}：舞台底边 = 视口底边`, `stage.bottom=${m.stage.bottom} vh=${m.vh}`);
        check(Math.abs(m.chromeVar - Math.round(m.padTop + m.topbarH)) <= 1, `② ${tag}：--frame-chrome 为实测值`, `${m.chromeVar} vs ${m.padTop}+${m.topbarH}`);
        if (m.vw <= m.rootMax) {
            check(Math.abs(m.stage.width - m.vw) <= 1 && Math.abs(m.stage.left) <= 1, `③ ${tag}：窄屏贴边铺满`, `${m.stage.left}/${m.stage.width}`);
        } else {
            check(m.stage.width >= 600 && m.stage.width <= 640, `③ ${tag}：宽屏舞台 600–640px`, m.stage.width);
            check(Math.abs(m.stage.left - (m.vw - m.stage.width) / 2) <= 1, `③ ${tag}：宽屏舞台居中`, m.stage.left);
        }
        check(m.scrollW <= m.vw, `④ ${tag}：无横向滚动`, `${m.scrollW} > ${m.vw}`);
        check(m.footerTop !== null && m.footerTop >= m.vh - 1, `④ ${tag}：页脚在首屏之下`, m.footerTop);
        check(m.footerTop !== null && m.scrollH >= m.footerTop + m.footerH - 1, `④ ${tag}：页脚可滚到`);
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
            check(Math.abs(r.stage.top - r.topbarBottom) <= 1 && Math.abs(r.stage.bottom - r.vh) <= 1,
                `⑧ ${tag} → 转屏：舞台重新填满顶栏以下`, JSON.stringify(r.stage));
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
    for (const g of registry.withLayout('standard')) {
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
console.log(`verify-immersive 全部通过 ✅（${passes} 项断言，${PAGES.length} 页 × ${VIEWPORTS.length} 视口 + 标准页抽查）`);
