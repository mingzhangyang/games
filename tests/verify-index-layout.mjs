#!/usr/bin/env node
// verify-index-layout.mjs — 首页三块（daily-hub / games-section / perks）横向居中回归。
//
// 背景：`.daily-hub` 曾经左右 margin 对称但宽度受限，在 `.idx-main`（普通块容器，
// 不像 body 那样 flex 居中）里被顶到**左边缘**。肉眼在宽屏上很扎眼，但所有既有
// 校验器都测不到 —— 它们量的是游戏页的画布/侧栏/热区，没人量落地页的居中度。
//
// 判据：skew = 左间隙 − 右间隙，|skew| ≤ 2px 视为居中。七档视口全覆盖；
// 同时守住 pages > layout 后首页 footer 在窄屏 / 矮屏 / 两者叠加时的 spacing。
//
// 卡片网格（docs/proposal-home-layout.md P1）：每档列数固定；≤600px 是单列横条
// （≤80px 高）；任何视口下标题都不在单词中间断开（曾经 390px 两列把 Minesweeper
// 拆成 Minesweep/er）；≥360px 时标题不被省略号截断；卡片不横向溢出。P2 起按分区
// 输出多个网格，每个分区的列数都要等于期望值。
// 「新」胶囊按 UTC+8 今天判定，页面时钟冻结在 FROZEN_NOW，保证有卡片同时带「每日 + 新」；
// 手机档再跑一遍中文 + 浅色（浅色才显示「仅深色」胶囊），覆盖三枚胶囊同处一张卡的组合（PR #147 review）。
// 任何视口下标题都不能被胶囊挤到不足自身宽度的一半（曾在 320px 中文浅色只剩 19px 的「…」）。
// 用法：node tests/verify-index-layout.mjs [baseUrl]（需静态服务器）
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';

const BASE = process.argv[2] || 'http://127.0.0.1:8911';
const CHROME = CHROME_PATH;

const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: LAUNCH_ARGS,
});

const FROZEN_NOW = Date.UTC(2026, 9, 15, 4); // 2026-10-15 12:00 UTC+8：needle-awn / sword-flight 同时「每日 + 新」
const VIEWPORTS = [
    { w: 1440, h: 900, label: 'desktop-1440' },
    { w: 1024, h: 800, label: 'tablet-1024' },
    { w: 768, h: 900, label: 'mobile-768' },
    { w: 768, h: 680, label: 'short-768' },
    { w: 390, h: 844, label: 'phone-390' },
    { w: 360, h: 740, label: 'phone-360' },
    { w: 320, h: 568, label: 'phone-320' },
    { w: 1440, h: 900, label: 'desktop-zh-light', lang: 'zh', theme: 'light' },
    { w: 390, h: 844, label: 'phone-390-zh-lt', lang: 'zh', theme: 'light' },
    { w: 360, h: 740, label: 'phone-360-zh-lt', lang: 'zh', theme: 'light' },
    { w: 320, h: 568, label: 'phone-320-zh-lt', lang: 'zh', theme: 'light' },
];
const EXPECTED_COLS = { 1440: 4, 1024: 3, 768: 2, 390: 1, 360: 1, 320: 1 };

let failed = 0;

for (const vp of VIEWPORTS) {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument((lang, theme, fixed) => {
        try {
            localStorage.setItem('site_lang', lang);
            localStorage.setItem('site_theme', theme);
        } catch (e) { /* ignore */ }
        const RealDate = Date;
        class FrozenDate extends RealDate {
            constructor(...args) { if (args.length) super(...args); else super(fixed); }
            static now() { return fixed; }
        }
        globalThis.Date = FrozenDate;
    }, vp.lang || 'en', vp.theme || 'dark', FROZEN_NOW);
    await page.setViewport({ width: vp.w, height: vp.h });
    await page.goto(BASE + '/index.html', { waitUntil: 'networkidle2' });

    const m = await page.evaluate(() => {
        const pick = sel => {
            const el = document.querySelector(sel);
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return {
                left: Math.round(r.left),
                right: Math.round(r.right),
                width: Math.round(r.width),
                // 左间隙 与 右间隙 的差值：0 = 完美居中
                skew: Math.round(r.left - (document.documentElement.clientWidth - r.right)),
            };
        };
        const footer = document.querySelector('.game-footer');
        const footerCss = footer ? getComputedStyle(footer) : null;
        return {
            vw: document.documentElement.clientWidth,
            hub: pick('.daily-hub'),
            games: pick('.games-section'),
            perks: pick('.perks'),
            footer: footerCss ? {
                gap: footerCss.gap,
                paddingTop: footerCss.paddingTop,
                paddingRight: footerCss.paddingRight,
                paddingBottom: footerCss.paddingBottom,
                paddingLeft: footerCss.paddingLeft,
            } : null,
            footerActions: (() => {
                const el = document.querySelector('.game-footer-actions');
                if (!el) return null;
                const css = getComputedStyle(el);
                return {
                    display: css.display,
                    alignItems: css.alignItems,
                    justifyContent: css.justifyContent,
                    gap: css.gap,
                };
            })(),
            cards: document.querySelectorAll('.game-card').length,
            grid: (() => {
                // P2 起每个分区一个 .games-grid：全部分区的列数都要对
                const grids = [...document.querySelectorAll('.games-grid')];
                const cards = [...document.querySelectorAll('.game-card')];
                const titles = [...document.querySelectorAll('.game-card .card-title')];
                const probe = document.createElement('span');
                probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap';
                document.body.append(probe);
                // 单词宽于标题盒子 → 浏览器只能在词中断开（或溢出）
                const brokenWords = titles.filter(t => {
                    probe.style.font = getComputedStyle(t).font;
                    return t.textContent.trim().split(/\s+/).some(word => {
                        probe.textContent = word;
                        return probe.getBoundingClientRect().width > t.getBoundingClientRect().width + 0.5;
                    });
                }).map(t => t.textContent);
                probe.remove();
                return {
                    cols: getComputedStyle(grids[0]).gridTemplateColumns.split(' ').length,
                    colsMixed: new Set(grids.map(gr => getComputedStyle(gr).gridTemplateColumns.split(' ').length)).size > 1,
                    maxCardH: Math.round(Math.max(...cards.map(c => c.getBoundingClientRect().height))),
                    brokenWords,
                    truncated: titles.filter(t => t.scrollWidth > t.clientWidth + 0.5).map(t => t.textContent),
                    squeezed: titles.filter(t => t.clientWidth < t.scrollWidth / 2).map(t => t.textContent),
                    maxChips: Math.max(...cards.map(c => [...c.querySelectorAll('.card-chip')].filter(x => x.getClientRects().length).length)),
                    overflowing: cards.filter(c => c.scrollWidth > c.clientWidth + 1).map(c => c.dataset.gameId),
                    pageScrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
                };
            })(),
            lumen: !!document.getElementById('lumen-name'),
            circuit: !!document.getElementById('circuit-name'),
        };
    });

    const bad = [];
    for (const k of ['hub', 'games', 'perks']) {
        const v = m[k];
        if (v && Math.abs(v.skew) > 2) bad.push(`${k} skew=${v.skew}`);
    }

    const g = m.grid;
    if (g.cols !== EXPECTED_COLS[vp.w]) bad.push(`grid cols=${g.cols} want ${EXPECTED_COLS[vp.w]}`);
    if (g.colsMixed) bad.push('category grids disagree on column count');
    if (vp.w <= 600 && g.maxCardH > 80) bad.push(`mobile card height=${g.maxCardH} > 80`);
    if (g.brokenWords.length) bad.push(`title broken mid-word: ${g.brokenWords.join(' | ')}`);
    if (vp.w >= 360 && g.truncated.length) bad.push(`title truncated: ${g.truncated.join(' | ')}`);
    if (g.squeezed.length) bad.push(`title squeezed below half its width: ${g.squeezed.join(' | ')}`);
    if (vp.theme === 'light' && g.maxChips < 3) bad.push(`no card shows 3 chips (maxChips=${g.maxChips}); the combination is not exercised`);
    if (g.overflowing.length) bad.push(`card overflow: ${g.overflowing.join(',')}`);
    if (g.pageScrollX) bad.push('page scrolls horizontally');

    // #99: page-layer footer spacing must keep winning over both responsive
    // layout peers. 390×844 = narrow only, 768×680 = short only,
    // 320×568 = narrow + short simultaneously.
    const checksFooterSpacing = vp.w <= 480 || vp.h <= 720;
    if (checksFooterSpacing) {
        const f = m.footer;
        const footerOk = f
            && f.gap === '10px'
            && f.paddingTop === '20px'
            && f.paddingRight === '0px'
            && f.paddingBottom === '28px'
            && f.paddingLeft === '0px';
        if (!footerOk) bad.push(`footer spacing=${JSON.stringify(f)}`);
    }

    // #104: footer actions are landing-page-owned even though their stable rule
    // identity remains physically in layout.css during P2.
    const a = m.footerActions;
    const actionsOk = a
        && a.display === 'flex'
        && a.alignItems === 'center'
        && a.justifyContent === 'center'
        && a.gap === '8px';
    if (!actionsOk) bad.push(`footer actions=${JSON.stringify(a)}`);

    if (bad.length) failed++;
    const mark = bad.length ? '✗' : '✓';
    console.log(`${mark} ${vp.label.padEnd(14)} vw=${m.vw}  cards=${m.cards}  lumen=${m.lumen} circuit=${m.circuit}`);
    console.log(`     grid   cols=${g.cols} maxCardH=${g.maxCardH} truncated=${g.truncated.length} brokenWords=${g.brokenWords.length} maxChips=${g.maxChips}`);
    for (const k of ['hub', 'games', 'perks']) {
        const v = m[k];
        if (v) console.log(`     ${k.padEnd(6)} w=${String(v.width).padStart(4)} left=${String(v.left).padStart(4)} right=${String(v.right).padStart(4)} skew=${v.skew}`);
    }
    if (checksFooterSpacing) {
        const f = m.footer;
        console.log(`     footer gap=${f?.gap ?? 'missing'} padding=${f ? [f.paddingTop, f.paddingRight, f.paddingBottom, f.paddingLeft].join(' ') : 'missing'}`);
    }
    console.log(`     footer-actions display=${a?.display ?? 'missing'} align=${a?.alignItems ?? 'missing'} justify=${a?.justifyContent ?? 'missing'} gap=${a?.gap ?? 'missing'}`);
    if (bad.length) console.log(`     ↳ 回归: ${bad.join(', ')}`);
    await page.close();
}

await browser.close();
console.log(failed === 0 ? '\n首页三块均居中，卡片网格 / 标题均合规 ✅' : `\n${failed} 个视口回归 ❌`);
process.exit(failed === 0 ? 0 : 1);
