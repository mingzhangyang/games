#!/usr/bin/env node
// CSS Cascade Layers P3-C behavior gate.
// Source mode is auto-discovered by verify-all; Architecture v2 CI runs the same
// contract against dist/ via tests/lib/run-smoke-dist.mjs.

import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { keepPage, exitIfNoPages } from './lib/page-filter.mjs';
import { runCssLayerBehaviorBatch } from './lib/css-layer-behavior.mjs';

const BASE = process.argv.find(arg => arg.startsWith('http')) || 'http://127.0.0.1:8899';

async function waitHidden(page, selector) {
    await page.waitForFunction(target => {
        const el = document.querySelector(target);
        return el && (el.classList.contains('hidden') || getComputedStyle(el).display === 'none');
    }, { timeout: 5000 }, selector);
    return true;
}

function showcasePage(config) {
    const prefix = config.prefix;
    const selectors = {
        topbar: `.${prefix}-topbar`,
        footer: `.${prefix}-footer`,
        sideCard: `.${prefix}-side-card`,
        title: `.${prefix}-title`,
        mode: `.${prefix}-mode`,
        daily: `.${prefix}-mode-daily`,
        cutBox: `.${prefix}-cut-box`,
        cutValue: `.${prefix}-cut-value`,
        overlay: `.${prefix}-overlay`,
        canvas: `#${prefix}-canvas`,
        start: `#${prefix}-start`,
        levels: `#${prefix}-btn-levels`,
    };

    const startGameplay = async page => {
        await page.click(selectors.levels);
        await waitHidden(page, selectors.start);
        // Do not let Puppeteer's stationary pointer leak :hover into the next
        // same-layout navigation, where we assert the controls' rest-state skin.
        await page.mouse.move(0, 0);
        return true;
    };

    return {
        ...config,
        lightTheme: config.lightTheme === true,
        shell: `.${prefix}-shell`,
        stage: `.${prefix}-stage`,
        themeVar: '--tok-bg',
        frame: {
            wide: '940px',
            stage: `${config.stageWidth}px`,
        },
        probes: ['.game-topbar', '.game-main', '.game-footer'],
        async ready(page) {
            await page.waitForFunction(selector => {
                const button = document.querySelector(selector);
                return button && button.textContent.trim().length > 0;
            }, { timeout: 10000 }, selectors.levels);
        },
        interact: startGameplay,
        mobileInteract: startGameplay,
        async validate({ page, snapshot, viewportName, viewport, check }) {
            const metrics = await page.evaluate(({ selectors }) => {
                const bodyStyle = getComputedStyle(document.body);
                const styleOf = selector => {
                    const el = document.querySelector(selector);
                    return el ? getComputedStyle(el) : null;
                };
                const resolveColor = cssVar => {
                    const probe = document.createElement('span');
                    probe.style.position = 'fixed';
                    probe.style.color = `var(${cssVar})`;
                    document.body.appendChild(probe);
                    const value = getComputedStyle(probe).color;
                    probe.remove();
                    return value;
                };
                const topbar = styleOf(selectors.topbar);
                const footer = styleOf(selectors.footer);
                const sideCard = styleOf(selectors.sideCard);
                const title = styleOf(selectors.title);
                const mode = styleOf(selectors.mode);
                const daily = styleOf(selectors.daily);
                const cutBox = styleOf(selectors.cutBox);
                const cutValue = styleOf(selectors.cutValue);
                const overlay = styleOf(selectors.overlay);
                const canvas = styleOf(selectors.canvas);

                return {
                    bodyClasses: [...document.body.classList],
                    accent: bodyStyle.getPropertyValue('--showcase-accent').trim(),
                    showcase: {
                        bg: resolveColor('--showcase-bg'),
                        panel: resolveColor('--showcase-panel'),
                        panelRaised: resolveColor('--showcase-panel-raised'),
                        border: resolveColor('--showcase-border'),
                        borderStrong: resolveColor('--showcase-border-strong'),
                        text: resolveColor('--showcase-text'),
                        onAccent: resolveColor('--showcase-on-accent'),
                        accent: resolveColor('--showcase-accent'),
                        cutBg: resolveColor('--showcase-cut-bg'),
                        overlay: resolveColor('--showcase-overlay'),
                    },
                    body: {
                        backgroundColor: bodyStyle.backgroundColor,
                        backgroundImage: bodyStyle.backgroundImage,
                        fontFamily: bodyStyle.fontFamily,
                        firstFontFamily: bodyStyle.fontFamily
                            .split(',')[0]
                            .trim()
                            .replace(/^["']|["']$/g, ''),
                    },
                    topbar: topbar && {
                        backgroundColor: topbar.backgroundColor,
                        borderBottomColor: topbar.borderBottomColor,
                        boxShadow: topbar.boxShadow,
                    },
                    footer: footer && { backgroundColor: footer.backgroundColor },
                    sideCard: sideCard && {
                        backgroundColor: sideCard.backgroundColor,
                        borderTopColor: sideCard.borderTopColor,
                        borderRadius: sideCard.borderRadius,
                        boxShadow: sideCard.boxShadow,
                    },
                    title: title && {
                        backgroundImage: title.backgroundImage,
                        color: title.color,
                        textFillColor: title.webkitTextFillColor,
                    },
                    mode: mode && {
                        minHeight: mode.minHeight,
                        backgroundColor: mode.backgroundColor,
                        borderTopColor: mode.borderTopColor,
                        color: mode.color,
                        boxShadow: mode.boxShadow,
                    },
                    daily: daily && {
                        backgroundColor: daily.backgroundColor,
                        borderTopColor: daily.borderTopColor,
                        color: daily.color,
                    },
                    cutBox: cutBox && {
                        backgroundColor: cutBox.backgroundColor,
                        borderTopColor: cutBox.borderTopColor,
                    },
                    cutValue: cutValue && { fontFamily: cutValue.fontFamily },
                    overlay: overlay && { backgroundColor: overlay.backgroundColor },
                    canvas: canvas && {
                        borderRadius: canvas.borderRadius,
                        borderTopStyle: canvas.borderTopStyle,
                        borderTopWidth: canvas.borderTopWidth,
                        boxShadow: canvas.boxShadow,
                        touchAction: canvas.touchAction,
                        cursor: canvas.cursor,
                    },
                };
            }, { selectors });

            check(
                metrics.bodyClasses.includes('science-showcase') && metrics.bodyClasses.includes(config.themeClass),
                `${config.id} ${viewportName}: showcase body classes stay attached`,
                metrics.bodyClasses.join(' '),
            );
            check(
                metrics.accent === config.accents[snapshot.theme],
                `${config.id} ${viewportName}: showcase accent keeps page theme contract`,
                `got ${metrics.accent || 'missing'}, want ${config.accents[snapshot.theme]}`,
            );
            check(
                metrics.body.backgroundColor === metrics.showcase.bg && metrics.body.backgroundImage === 'none',
                `${config.id} ${viewportName}: showcase background wins the page skin`,
                `${metrics.body.backgroundColor} / ${metrics.body.backgroundImage}`,
            );
            check(
                metrics.body.firstFontFamily === 'Segoe UI',
                `${config.id} ${viewportName}: unlayered page typography still wins normal cascade`,
                `first=${metrics.body.firstFontFamily || 'missing'}; computed=${metrics.body.fontFamily}`,
            );
            check(Boolean(metrics.topbar), `${config.id} ${viewportName}: showcase topbar exists`);
            if (metrics.topbar) {
                check(
                    metrics.topbar.backgroundColor === metrics.showcase.panel
                        && metrics.topbar.borderBottomColor === metrics.showcase.border
                        && metrics.topbar.boxShadow === 'none',
                    `${config.id} ${viewportName}: shared chrome resolves to showcase material`,
                    `${metrics.topbar.backgroundColor} / ${metrics.topbar.borderBottomColor} / ${metrics.topbar.boxShadow}`,
                );
            }
            check(
                metrics.footer?.backgroundColor === metrics.showcase.panel,
                `${config.id} ${viewportName}: footer resolves to showcase panel`,
                metrics.footer?.backgroundColor || 'missing',
            );
            check(Boolean(metrics.sideCard), `${config.id} ${viewportName}: side card exists`);
            if (metrics.sideCard) {
                check(
                    metrics.sideCard.backgroundColor === metrics.showcase.panel
                        && metrics.sideCard.borderTopColor === metrics.showcase.border
                        && metrics.sideCard.borderRadius === (viewport.width <= 680 ? '10px' : '12px')
                        && metrics.sideCard.boxShadow === 'none',
                    `${config.id} ${viewportName}: side card keeps showcase material contract`,
                    `${metrics.sideCard.backgroundColor} / ${metrics.sideCard.borderTopColor} / ${metrics.sideCard.borderRadius}`,
                );
            }
            check(Boolean(metrics.title), `${config.id} ${viewportName}: title exists`);
            if (metrics.title) {
                check(
                    metrics.title.backgroundImage === 'none'
                        && (metrics.title.textFillColor === 'currentcolor' || metrics.title.textFillColor === metrics.title.color),
                    `${config.id} ${viewportName}: showcase title stays solid instead of gradient-clipped`,
                    `${metrics.title.backgroundImage} / fill=${metrics.title.textFillColor} / color=${metrics.title.color}`,
                );
            }
            check(Boolean(metrics.mode), `${config.id} ${viewportName}: mode control exists`);
            if (metrics.mode) {
                check(
                    Number.parseFloat(metrics.mode.minHeight) >= 44
                        && metrics.mode.backgroundColor === metrics.showcase.panelRaised
                        && metrics.mode.borderTopColor === metrics.showcase.borderStrong
                        && metrics.mode.color === metrics.showcase.text
                        && metrics.mode.boxShadow === 'none',
                    `${config.id} ${viewportName}: mode control keeps showcase component contract`,
                    `${metrics.mode.minHeight} / ${metrics.mode.backgroundColor} / ${metrics.mode.borderTopColor}`,
                );
            }
            check(Boolean(metrics.daily), `${config.id} ${viewportName}: daily control exists`);
            if (metrics.daily) {
                check(
                    metrics.daily.backgroundColor === metrics.showcase.accent
                        && metrics.daily.borderTopColor === metrics.showcase.accent
                        && metrics.daily.color === metrics.showcase.onAccent,
                    `${config.id} ${viewportName}: primary mode keeps showcase accent contract`,
                    `${metrics.daily.backgroundColor} / ${metrics.daily.borderTopColor} / ${metrics.daily.color}`,
                );
            }
            check(
                metrics.cutBox?.backgroundColor === metrics.showcase.cutBg
                    && metrics.cutBox?.borderTopColor === metrics.showcase.border,
                `${config.id} ${viewportName}: HUD cut box resolves to showcase material`,
                `${metrics.cutBox?.backgroundColor || 'missing'} / ${metrics.cutBox?.borderTopColor || 'missing'}`,
            );
            check(
                /monospace/i.test(metrics.cutValue?.fontFamily || ''),
                `${config.id} ${viewportName}: HUD numeric value keeps showcase monospace contract`,
                metrics.cutValue?.fontFamily || 'missing',
            );
            check(
                metrics.overlay?.backgroundColor === metrics.showcase.overlay,
                `${config.id} ${viewportName}: start overlay resolves to showcase overlay`,
                metrics.overlay?.backgroundColor || 'missing',
            );
            check(Boolean(metrics.canvas), `${config.id} ${viewportName}: page canvas exists`);
            if (metrics.canvas) {
                check(
                    metrics.canvas.borderRadius === '18px'
                        && metrics.canvas.borderTopStyle !== 'none'
                        && Number.parseFloat(metrics.canvas.borderTopWidth) > 0
                        && metrics.canvas.boxShadow !== 'none'
                        && metrics.canvas.touchAction === 'none'
                        && metrics.canvas.cursor === 'pointer',
                    `${config.id} ${viewportName}: page-specific canvas skin remains authoritative`,
                    `${metrics.canvas.borderRadius} / ${metrics.canvas.borderTopStyle} ${metrics.canvas.borderTopWidth} / ${metrics.canvas.boxShadow}`,
                );
            }
        },
    };
}

const CASES = [
    showcasePage({
        id: 'crystal-bloom',
        href: 'crystal-bloom.html',
        prefix: 'cb',
        themeClass: 'science-theme-crystal',
        stageWidth: 560,
        lightTheme: true,
        accents: { dark: '#69c7c7', light: '#22807f' },
    }),
    showcasePage({
        id: 'echo-cave',
        href: 'echo-cave.html',
        prefix: 'ec',
        themeClass: 'science-theme-echo',
        stageWidth: 480,
        accents: { dark: '#63c7c8' },
    }),
    showcasePage({
        id: 'maxwell-demon',
        href: 'maxwell-demon.html',
        prefix: 'md',
        themeClass: 'science-theme-maxwell',
        stageWidth: 560,
        lightTheme: true,
        accents: { dark: '#70c4c3', light: '#267f7d' },
    }),
    showcasePage({
        id: 'flame-verse',
        href: 'flame-verse.html',
        prefix: 'fv',
        themeClass: 'science-theme-flame',
        stageWidth: 560,
        accents: { dark: '#e9954f' },
    }),
    showcasePage({
        id: 'ripple-duet',
        href: 'ripple-duet.html',
        prefix: 'rd',
        themeClass: 'science-theme-ripple',
        stageWidth: 560,
        lightTheme: true,
        accents: { dark: '#63c1c5', light: '#237b80' },
    }),
].filter(testCase => keepPage(testCase.id));

exitIfNoPages(CASES, 'verify-css-p3c');

await runCssLayerBehaviorBatch({
    name: 'CSS P3-C',
    base: BASE,
    cases: CASES,
    chromePath: CHROME_PATH,
    launchArgs: LAUNCH_ARGS,
});
