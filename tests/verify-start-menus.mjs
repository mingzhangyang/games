#!/usr/bin/env node
// verify-start-menus.mjs — 手机 / 平板上的开始菜单必须完整可达（docs/contracts/layout.md「开始菜单」）
//
// 事故（2026-09-26）：舞台内浮层是 absolute + inset:0 + 隐藏滚动条，高度被画布卡死。手机上画布只有
// 280–500px 高，关卡网格被压进一个看不出能滚的小盒子 —— 晶绽 / 涟漪 / 焰语只露出 10/20 个关卡，
// 电路谜题一个都看不到。几何检查器全绿，因为菜单「在舞台里」。
//
// 断言（390×844、768×1024、844×390；九个 W4b 页面另测 1280×900，全部注册表页面）：
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
// W5a: independent, source-reviewed glow palette; keeping it outside CSS means
// the browser gate catches both wrong theme tokens and wrong shared opacity.
const W5A_GLOW_HUES = Object.freeze({
    'circuit': 'rgb(255, 201, 77)',
    'crystal-bloom': 'rgb(255, 211, 77)',
    'echo-cave': 'rgb(255, 211, 77)',
    'flame-verse': 'rgb(255, 211, 77)',
    'gravity-slingshot': 'rgb(125, 250, 208)',
    'lumen': 'rgb(125, 250, 208)',
    'maxwell-demon': 'rgb(255, 211, 77)',
    'ripple-duet': 'rgb(255, 211, 77)',
    'silk-dew': 'rgb(159, 232, 255)',
});

const W4A_GAMES = new Set([
    'circuit', 'crystal-bloom', 'echo-cave', 'flame-verse', 'gravity-slingshot',
    'lumen', 'maxwell-demon', 'ripple-duet', 'silk-dew',
]);   // 含横屏手机：na 的横屏规则给舞台定了高度

const fails = [];
let passes = 0;
let verifiedPageViewports = 0;
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
        try {
            // networkidle2 can hang on analytics, service workers and third-party fonts
            // even when the game is ready. DOMContentLoaded waits for deferred/module
            // scripts; the dynamically rendered level chips prove W4b runtime startup.
            // Never turn a timeout into a silent skip: record its exact game + viewport.
            await page.goto(`${BASE}/${g.href}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
            if (W4A_GAMES.has(g.id)) {
                await page.waitForSelector('.game-start-level-chip', { timeout: 10000 });
            }
        } catch (error) {
            check(false, `${g.id}@${w}×${h}：页面或菜单初始化失败`, error.message);
            await page.close().catch(() => {});
            continue;
        }
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

            // W5a checks real computed CSS for the results and HUD counters.
            // Results remain hidden during startup; computed values still expose
            // the exact cascade and skin that the game will show on completion.
            const resultHud = await page.evaluate(() => {
                const get = selector => {
                    const el = document.querySelector(selector);
                    if (!el) return null;
                    const s = getComputedStyle(el);
                    let exactTwoCh = null;
                    if (selector === '.game-cut-value') {
                        // An inherited-font probe is independent of the candidate's
                        // min-width. It stays valid if computedStyle serializes ch as px.
                        const probe = document.createElement('span');
                        probe.style.cssText = 'display:inline-block;position:absolute;min-width:2ch;'
                            + 'visibility:hidden;pointer-events:none;';
                        el.appendChild(probe);
                        exactTwoCh = getComputedStyle(probe).minWidth;
                        probe.remove();
                    }
                    return {
                        fontSize: s.fontSize, fontWeight: s.fontWeight,
                        lineHeight: s.lineHeight, fontVariantNumeric: s.fontVariantNumeric,
                        minHeight: s.minHeight, textShadow: s.textShadow,
                        display: s.display, alignItems: s.alignItems, gap: s.gap,
                        borderRadius: s.borderRadius, borderTopWidth: s.borderTopWidth,
                        borderTopStyle: s.borderTopStyle, backgroundColor: s.backgroundColor,
                        padding: s.padding, minWidth: s.minWidth, expectedTwoCh: exactTwoCh, textAlign: s.textAlign,
                        fontFamily: s.fontFamily,
                    };
                };
                return {
                    showcase: !!document.querySelector('.science-showcase'),
                    score: get('.game-over-score'), subtitle: get('.game-over-sub'),
                    cutBox: get('.game-cut-box'), cutValue: get('.game-cut-value'),
                };
            });
            check(resultHud.score?.fontSize === (w <= 480 ? '34px' : '42px')
                && resultHud.score?.fontWeight === '800'
                && (resultHud.score?.lineHeight === '1'
                    || Number.parseFloat(resultHud.score?.lineHeight) === Number.parseFloat(resultHud.score?.fontSize))
                && resultHud.score?.fontVariantNumeric === 'tabular-nums',
            `${g.id}@${w}：W5a result score geometry`, JSON.stringify(resultHud.score));
            // Resolve a fixed 45% reference shadow in the same browser instead of
            // checking "contains 26px": color-mix serialization varies by engine.
            // Light-capable pages are tested in both themes without reloading.
            const shadowContract = await page.evaluate(({ hue, supportsLight }) => {
                const score = document.querySelector('.game-over-score');
                const root = document.documentElement;
                const originalTheme = root.getAttribute('data-theme');
                const sample = document.createElement('span');
                sample.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;';
                document.body.appendChild(sample);
                const snapshot = expectedHue => {
                    sample.style.textShadow =
                        `0 0 26px color-mix(in srgb, ${expectedHue} 45%, transparent)`;
                    const style = getComputedStyle(score);
                    return {
                        actual: style.textShadow,
                        expected: getComputedStyle(sample).textShadow,
                        hue: style.getPropertyValue('--game-over-glow-hue').trim(),
                    };
                };
                try {
                    const dark = snapshot(hue);
                    let light = null;
                    if (supportsLight) {
                        root.setAttribute('data-theme', 'light');
                        light = snapshot('transparent');
                    }
                    return { initialTheme: originalTheme, dark, light };
                } finally {
                    if (originalTheme === null) root.removeAttribute('data-theme');
                    else root.setAttribute('data-theme', originalTheme);
                    sample.remove();
                }
            }, {
                hue: W5A_GLOW_HUES[g.id],
                supportsLight: (g.caps || []).includes('theme-light'),
            });
            check(shadowContract.initialTheme === 'dark'
                && shadowContract.dark.actual === shadowContract.dark.expected
                && shadowContract.dark.hue === W5A_GLOW_HUES[g.id],
            `${g.id}@${w}：W5a dark glow hue, 26px blur and exactly 45% opacity`,
            JSON.stringify(shadowContract.dark));
            if ((g.caps || []).includes('theme-light')) {
                check(shadowContract.light?.actual === shadowContract.light?.expected
                    && shadowContract.light?.hue === 'transparent'
                    && shadowContract.light?.actual !== shadowContract.dark.actual,
                `${g.id}@${w}：W5a light theme produces an unpainted transparent shadow`,
                JSON.stringify(shadowContract.light));
            }
            check(resultHud.subtitle?.fontSize === '13px'
                && resultHud.subtitle?.minHeight === '16px'
                && resultHud.subtitle?.fontVariantNumeric === 'tabular-nums',
            `${g.id}@${w}：W5a result subtitle typography`, JSON.stringify(resultHud.subtitle));
            const needsCounter = ['crystal-bloom', 'echo-cave', 'flame-verse',
                'maxwell-demon', 'ripple-duet', 'silk-dew'].includes(g.id);
            if (needsCounter) {
                check(resultHud.cutBox?.display === 'flex'
                    && resultHud.cutBox?.alignItems === 'baseline'
                    && resultHud.cutBox?.gap === '5px'
                    && resultHud.cutBox?.padding === '6px 12px'
                    && resultHud.cutBox?.borderRadius === (resultHud.showcase ? '8px' : '11px')
                    && resultHud.cutBox?.borderTopStyle === 'solid'
                    && resultHud.cutBox?.borderTopWidth === '1px',
                `${g.id}@${w}：W5a cut-box standardized surface with P0 retained`,
                JSON.stringify(resultHud.cutBox));
                check(resultHud.cutValue?.fontSize === (w <= 480 ? '16px' : '19px')
                    && resultHud.cutValue?.fontWeight === '800'
                    && resultHud.cutValue?.fontVariantNumeric === 'tabular-nums'
                    && resultHud.cutValue?.textAlign === 'center'
                    && !!resultHud.cutValue?.expectedTwoCh
                    && (resultHud.cutValue?.minWidth === resultHud.cutValue?.expectedTwoCh
                        || (resultHud.cutValue?.minWidth?.endsWith('px')
                            && resultHud.cutValue?.expectedTwoCh?.endsWith('px')
                            && Math.abs(Number.parseFloat(resultHud.cutValue.minWidth)
                                - Number.parseFloat(resultHud.cutValue.expectedTwoCh)) < 0.25)),
                `${g.id}@${w}：W5a cut-value width/typography`,
                JSON.stringify(resultHud.cutValue));
            } else {
                check(resultHud.cutBox === null && resultHud.cutValue === null,
                    `${g.id}@${w}：W5a no invented HUD counter`);
            }
            if (g.id === 'gravity-slingshot') {
                check(audit.howto?.maxWidth === '350px',
                    `${g.id}@${w}：howto 不再保留 340px 特例`, String(audit.howto?.maxWidth));
            }
        }
        check(errors.length === 0, `${g.id}@${w}：无 pageerror`, errors.join(' | '));
        await page.close();
        verifiedPageViewports++;
    }
}
await browser.close();

if (fails.length) {
    console.error(fails.map(f => `✗ ${f}`).join('\n'));
    console.error(`\nverify-start-menus：${fails.length} 项失败（${passes} 项通过）❌`);
    process.exit(1);
}
console.log(`verify-start-menus 全部通过 ✅（${passes} 项断言，${GAMES.length} 页，${verifiedPageViewports} 组页面/视口）`);
