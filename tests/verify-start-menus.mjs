#!/usr/bin/env node
// verify-start-menus.mjs — 手机 / 平板上的开始菜单必须完整可达（docs/contracts/layout.md「开始菜单」）
//
// 事故（2026-09-26）：舞台内浮层是 absolute + inset:0 + 隐藏滚动条，高度被画布卡死。手机上画布只有
// 280–500px 高，关卡网格被压进一个看不出能滚的小盒子 —— 晶绽 / 涟漪 / 焰语只露出 10/20 个关卡，
// 电路谜题一个都看不到。几何检查器全绿，因为菜单「在舞台里」。
//
// 断言（390×844、768×1024，全部注册表页面）：
//   ① 覆盖：加载时可见、且被困在舞台里（非视口级全屏）的 .game-overlay 不得内部溢出 ——
//      溢出的必须加 .game-overlay--menu（新游戏漏加 → 红）
//   ② 可达：带 .game-overlay--menu 的菜单里，每个可见按钮都能滚到视口里、并且中心点命中它自己
//      （elementFromPoint —— 被盖住 / 被裁掉都算失败）；菜单不被 overflow≠visible 的舞台截断
//   视口含横屏手机 844×390（Copilot 在 PR #15 指出：na 的横屏规则给舞台定了高度 + overflow:hidden）
//   ③ 无 pageerror
//
// 用法：node tests/verify-start-menus.mjs [baseUrl]（verify-all 自动传入）
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { keepPage, exitIfNoPages } from './lib/page-filter.mjs';
import { registry } from './lib/registry.mjs';

const BASE = process.argv.slice(2).find(a => a.startsWith('http')) || 'http://127.0.0.1:8899';
const VIEWPORTS = [[390, 844], [768, 1024], [844, 390]];
const W4A_GAMES = new Set([
    'circuit', 'crystal-bloom', 'echo-cave', 'flame-verse', 'gravity-slingshot',
    'lumen', 'maxwell-demon', 'ripple-duet', 'silk-dew',
]);   // 含横屏手机：na 的横屏规则给舞台定了高度

const fails = [];
let passes = 0;
const check = (cond, label, extra = '') => { if (cond) passes++; else fails.push(`${label}${extra ? ' —— ' + extra : ''}`); };

const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: LAUNCH_ARGS });

const GAMES = registry.all().filter(g => keepPage(g.id));
exitIfNoPages(GAMES, 'verify-start-menus');
for (const g of GAMES) {
    // W4b also checks the complete desktop menu family; preserve the original
    // three-viewport gate for other games to avoid extra unrelated CI work.
    const viewports = W4A_GAMES.has(g.id) ? [...VIEWPORTS, [1280, 900]] : VIEWPORTS;
    for (const [w, h] of viewports) {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.setViewport({ width: w, height: h });
        await page.goto(`${BASE}/${g.href}`, { waitUntil: 'networkidle2' });
        await new Promise(r => setTimeout(r, 400));

        // ① 覆盖
        const overlays = await page.evaluate(() => [...document.querySelectorAll('.game-overlay')]
            .filter(e => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0)
            .map(e => ({
                id: e.id || e.className.split(' ')[0],
                menu: e.classList.contains('game-overlay--menu'),
                // 视口级全屏浮层（td 的开始页）本来就占满屏幕，内部滚动是它的设计
                fullscreen: e.clientHeight >= innerHeight - 1,
                h: e.clientHeight,
                sh: e.scrollHeight,
                overflowY: getComputedStyle(e).overflowY,
            })));
        for (const o of overlays) {
            if (o.fullscreen) continue;
            // The no-inner-scroll invariant belongs to <1024px flow-layout menus.
            // At desktop width the stage stays fixed and .game-overlay intentionally
            // scrolls within it. Require a real scrollable menu if content exceeds
            // its box, then hit-test every button after scrolling below.
            if (w < 1024) {
                check(o.sh <= o.h + 2,
                    `${g.id}@${w}：#${o.id} 移动/平板菜单不能被内部滚动盒裁切`,
                    `h=${o.h} scrollH=${o.sh}`);
            } else if (o.sh > o.h + 2) {
                check(o.menu && o.overflowY === 'auto',
                    `${g.id}@${w}：#${o.id} desktop overflow must be scrollable menu`,
                    JSON.stringify(o));
            }
        }

        // ② 可达：菜单里**所有**可见按钮（不只数字关卡 —— na 的模式按钮也曾被裁）都能滚到并点中；
        //    菜单也不能被裁剪型舞台（overflow ≠ visible）截断
        for (const o of overlays.filter(x => x.menu)) {
            const clip = await page.evaluate((id) => {
                const m = document.getElementById(id);
                const st = m.parentElement;
                const clips = getComputedStyle(st).overflowY !== 'visible' || getComputedStyle(st).overflowX !== 'visible';
                return { clips, menuBottom: Math.round(m.getBoundingClientRect().bottom), stageBottom: Math.round(st.getBoundingClientRect().bottom) };
            }, o.id);
            check(!clip.clips || clip.menuBottom <= clip.stageBottom + 1, `${g.id}@${w}：#${o.id} 没被舞台裁掉`, JSON.stringify(clip));
            const orientationGated = await page.evaluate(() => {
                const gate = document.querySelector('.td-rotate-prompt.is-active');
                return !!gate && getComputedStyle(gate).display !== 'none' && gate.getBoundingClientRect().height > 0;
            });
            const n = await page.evaluate(id => [...document.getElementById(id).querySelectorAll('button')]
                .filter(e => e.offsetParent).length, o.id);
            if (orientationGated) {
                check(true, `${g.id}@${w}：竖屏旋转门禁合法遮挡开始菜单`);
                continue;
            }
            let reachable = 0;
            const missed = [];
            for (let i = 0; i < n; i++) {
                const r = await page.evaluate((id, i) => {
                    const e = [...document.getElementById(id).querySelectorAll('button')].filter(b => b.offsetParent)[i];
                    e.scrollIntoView({ block: 'center' });
                    const rc = e.getBoundingClientRect();
                    const hit = document.elementFromPoint(rc.left + rc.width / 2, rc.top + rc.height / 2);
                    return { ok: !!hit && (hit === e || e.contains(hit)), name: e.id || e.textContent.trim().slice(0, 10) };
                }, o.id, i);
                if (r.ok) reachable++; else missed.push(r.name);
            }
            check(reachable === n, `${g.id}@${w}：#${o.id} 的按钮全部可点`, `${reachable}/${n} 点不到：${missed.join(', ')}`);
        }
        // W4a: check real computed styles (not merely stylesheet rule counts) at every
        // viewport; two dynamically created chip spans are checked with the static menu.
        if (W4A_GAMES.has(g.id)) {
            const audit = await page.evaluate(() => {
                const samples = {};
                for (const suffix of [
                    'par', 'subtitle', 'howto', 'mode-row', 'level-label', 'level-grid',
                    'chip-num', 'chip-stars', 'start-footer', 'card-line',
                ]) {
                    const sharedClass = suffix === 'start-footer' ? 'game-start-footer' : 'game-start-' + suffix;
                    const element = document.querySelector('.' + sharedClass);
                    if (!element) { samples[suffix] = null; continue; }
                    const style = getComputedStyle(element);
                    samples[suffix] = {
                        fontSize: style.fontSize, display: style.display, gap: style.gap,
                        maxWidth: style.maxWidth, gridTemplateColumns: style.gridTemplateColumns,
                    };
                }
                return samples;
            });
            for (const [suffix, value] of Object.entries(audit)) {
                check(value !== null, `${g.id}@${w}：W4a .game-start-${suffix} 已实际采用`);
            }
            const required = [
                ['par', 'fontSize', '11.5px'],
                ['subtitle', 'fontSize', '12.5px'],
                ['howto', 'fontSize', w <= 480 ? '12px' : '13px'],
                ['level-label', 'fontSize', '11px'],
                ['level-grid', 'display', 'grid'],
                ['level-grid', 'gap', w <= 480 ? '5px' : '6px'],
                ['mode-row', 'display', 'flex'],
                ['mode-row', 'gap', '8px'],
                ['chip-num', 'fontSize', '14px'],
                ['chip-stars', 'fontSize', '9.5px'],
                ['start-footer', 'display', 'flex'],
                ['start-footer', 'gap', '10px'],
                ['card-line', 'fontSize', '14px'],
            ];
            for (const [suffix, property, wanted] of required) {
                check(audit[suffix]?.[property] === wanted,
                    `${g.id}@${w}：W4a ${suffix}.${property}=${wanted}`,
                    String(audit[suffix]?.[property]));
            }
            // Computed grid-template-columns expands repeat(5, 1fr) to five used
            // track widths when laid out. If an ancestor has no layout box, the
            // computed value may retain repeat(5, 1fr); handle both forms so a
            // four-column override fails regardless of menu visibility.
            const gridTemplate = audit['level-grid']?.gridTemplateColumns?.trim() ?? '';
            const declaredRepeat = /^repeat\(\s*(\d+)\s*,\s*1fr\s*\)$/.exec(gridTemplate);
            const gridTrackCount = declaredRepeat ? Number(declaredRepeat[1])
                : gridTemplate === 'none' ? 0 : gridTemplate.split(/\s+/).filter(Boolean).length;
            check(gridTrackCount === 5,
                `${g.id}@${w}：W4a 选关网格必须保持五列`,
                `${gridTrackCount} columns (computed grid-template-columns: ${gridTemplate})`);
            // W4b: assert component adoption and resolved geometry, including dynamic
            // level chips. Science Showcase intentionally overrides border radius to
            // 9px with its frozen P0 !important material rule.
            const family = await page.evaluate(() => {
                const sample = (selector) => {
                    const element = document.querySelector(selector);
                    if (!element) return null;
                    const css = getComputedStyle(element);
                    return {
                        fontSize: css.fontSize, fontWeight: css.fontWeight,
                        minHeight: css.minHeight, borderRadius: css.borderRadius,
                        padding: css.padding, cursor: css.cursor,
                        backgroundClip: css.backgroundClip,
                        backgroundImage: css.backgroundImage,
                        height: element.getBoundingClientRect().height,
                    };
                };
                return {
                    showcase: !!document.querySelector('.science-showcase'),
                    title: sample('.game-start-title'),
                    mode: sample('.game-start-mode:not(.game-start-mode--daily)'),
                    daily: sample('.game-start-mode--daily'),
                    chip: sample('.game-start-level-chip'),
                    best: sample('.game-start-daily-best'),
                };
            });
            for (const [name, value] of Object.entries(family)) {
                if (name !== 'showcase') {
                    check(value !== null, `${g.id}@${w}：W4b ${name} component adopted`);
                }
            }
            const wantedTitleSize = w <= 480 ? '27px' : '34px';
            const wantedModeSize = w <= 480 ? '13px' : '14.5px';
            check(family.title?.fontSize === wantedTitleSize,
                `${g.id}@${w}：W4b title standard font size`, String(family.title?.fontSize));
            check(family.title?.fontWeight === '800',
                `${g.id}@${w}：W4b title standard font weight`, String(family.title?.fontWeight));
            if (!family.showcase) {
                check(family.title?.backgroundClip === 'text'
                    && family.title?.backgroundImage !== 'none',
                    `${g.id}@${w}：W4b gradient title text clipping`,
                    JSON.stringify(family.title));
            }
            check(family.mode?.fontSize === wantedModeSize,
                `${g.id}@${w}：W4b mode standard font size`, String(family.mode?.fontSize));
            check(family.mode?.padding === (w <= 480 ? '11px 15px' : '11px 20px'),
                `${g.id}@${w}：W4b mode standard padding`, String(family.mode?.padding));
            for (const [name, expectedRadius] of [
                ['mode', family.showcase ? '9px' : '13px'],
                ['chip', family.showcase ? '9px' : '10px'],
            ]) {
                const style = family[name];
                check(style?.minHeight === '44px' && style?.borderRadius === expectedRadius,
                    `${g.id}@${w}：W4b ${name} touch/radius contract`,
                    JSON.stringify(style));
                check(style?.cursor === 'pointer',
                    `${g.id}@${w}：W4b ${name} clickable state`, String(style?.cursor));
            }
            check(family.best?.fontSize === '12.5px' && family.best?.minHeight === '15px',
                `${g.id}@${w}：W4b best score typographic contract`,
                JSON.stringify(family.best));
            if (g.id === 'gravity-slingshot') {
                check(audit.howto?.maxWidth === '350px',
                    `${g.id}@${w}：howto 不再保留 340px 特例`, String(audit.howto?.maxWidth));
            }
        }
        check(errors.length === 0, `${g.id}@${w}：无 pageerror`, errors.join(' | '));
        await page.close();
    }
}
await browser.close();

if (fails.length) {
    console.error(fails.map(f => `✗ ${f}`).join('\n'));
    console.error(`\nverify-start-menus：${fails.length} 项失败（${passes} 项通过）❌`);
    process.exit(1);
}
console.log(`verify-start-menus 全部通过 ✅（${passes} 项断言，${GAMES.length} 页 × ${VIEWPORTS.length} 视口）`);
