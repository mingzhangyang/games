#!/usr/bin/env node
// CSS Cascade Layers P3-B behavior gate.
// Source mode is auto-discovered by verify-all; Architecture v2 CI runs the same
// contract against dist/ via tests/lib/run-smoke-dist.mjs.

import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { keepPage, exitIfNoPages } from './lib/page-filter.mjs';
import { runCssLayerBehaviorBatch } from './lib/css-layer-behavior.mjs';

const BASE = process.argv.find(arg => arg.startsWith('http')) || 'http://127.0.0.1:8899';

const FRAME_VARS = {
    wide: '--frame-max-wide',
    stage: '--frame-stage',
    side: '--frame-side',
    sideGap: '--frame-side-gap',
    ratio: '--frame-ratio',
    stageH: '--frame-stage-h',
};

async function waitHidden(page, selector) {
    await page.waitForFunction(target => {
        const el = document.querySelector(target);
        return el && (el.classList.contains('hidden') || getComputedStyle(el).display === 'none');
    }, { timeout: 5000 }, selector);
    return true;
}

function framePage(config) {
    return {
        ...config,
        lightTheme: config.lightTheme === true,
        frame: {
            wide: config.frame.wide,
            stage: config.frame.stage,
        },
        async ready(page) {
            await page.waitForFunction(shellSelector => {
                const shell = document.querySelector(shellSelector);
                return document.body.classList.contains('has-frame-budget')
                    && Boolean(shell?.style.getPropertyValue('--frame-chrome'));
            }, { timeout: 5000 }, config.shell);
            if (config.ready) await config.ready(page);
        },
        async validate({ page, viewportName, check }) {
            const metrics = await page.evaluate(({ shell, stage, canvas }) => {
                const shellEl = document.querySelector(shell);
                const stageEl = document.querySelector(stage);
                const canvasEl = document.querySelector(canvas);
                const shellStyle = shellEl ? getComputedStyle(shellEl) : null;
                const stageRect = stageEl?.getBoundingClientRect() || null;
                const canvasRect = canvasEl?.getBoundingClientRect() || null;
                const frame = {};
                for (const [key, cssVar] of Object.entries({"wide":"--frame-max-wide","stage":"--frame-stage","side":"--frame-side","sideGap":"--frame-side-gap","ratio":"--frame-ratio","stageH":"--frame-stage-h"})) {
                    frame[key] = shellStyle?.getPropertyValue(cssVar).trim() || '';
                }
                return {
                    bodyHasFrameBudget: document.body.classList.contains('has-frame-budget'),
                    frameChrome: shellEl?.style.getPropertyValue('--frame-chrome') || '',
                    frame,
                    scrollHeight: document.scrollingElement?.scrollHeight || document.documentElement.scrollHeight,
                    viewportHeight: innerHeight,
                    stage: stageRect ? {
                        top: stageRect.top,
                        bottom: stageRect.bottom,
                        width: stageRect.width,
                        height: stageRect.height,
                    } : null,
                    canvas: canvasEl && canvasRect ? {
                        width: canvasRect.width,
                        height: canvasRect.height,
                        clientWidth: canvasEl.clientWidth,
                        clientHeight: canvasEl.clientHeight,
                        attrWidth: canvasEl.width,
                        attrHeight: canvasEl.height,
                    } : null,
                };
            }, config);

            check(metrics.bodyHasFrameBudget, `${config.id} ${viewportName}: frame-budget capability is active`);
            check(Boolean(metrics.frameChrome), `${config.id} ${viewportName}: --frame-chrome is populated`, metrics.frameChrome || 'missing');

            for (const [key, expected] of Object.entries(config.frame)) {
                check(
                    metrics.frame[key] === expected,
                    `${config.id} ${viewportName}: ${FRAME_VARS[key]} keeps page contract`,
                    `got ${metrics.frame[key] || 'missing'}, want ${expected}`,
                );
            }

            check(Boolean(metrics.canvas), `${config.id} ${viewportName}: canvas exists`);
            if (metrics.canvas) {
                check(
                    metrics.canvas.attrWidth + 1 >= metrics.canvas.clientWidth
                        && metrics.canvas.attrHeight + 1 >= metrics.canvas.clientHeight,
                    `${config.id} ${viewportName}: canvas backing buffer is not undersized`,
                    `attr=${metrics.canvas.attrWidth}×${metrics.canvas.attrHeight}, client=${metrics.canvas.clientWidth}×${metrics.canvas.clientHeight}`,
                );
                if (viewportName === 'desktop') {
                    const ratio = metrics.canvas.width / metrics.canvas.height;
                    check(
                        Math.abs(ratio - config.canvasRatio) < 0.015,
                        `${config.id} desktop: canvas keeps logical aspect ratio`,
                        `got ${ratio.toFixed(4)}, want ${config.canvasRatio.toFixed(4)}`,
                    );
                }
            }

            if (viewportName === 'mobile') {
                check(Boolean(metrics.stage), `${config.id} mobile: stage exists for height budget`);
                if (metrics.stage) {
                    check(
                        metrics.stage.top >= -1 && metrics.stage.bottom <= metrics.viewportHeight + 1,
                        `${config.id} mobile: stage stays inside viewport height`,
                        `top=${metrics.stage.top.toFixed(1)} bottom=${metrics.stage.bottom.toFixed(1)} viewport=${metrics.viewportHeight}`,
                    );
                }
                check(
                    metrics.scrollHeight <= metrics.viewportHeight + 2,
                    `${config.id} mobile: document does not exceed viewport height`,
                    `scroll=${metrics.scrollHeight}, viewport=${metrics.viewportHeight}`,
                );
            }
        },
    };
}

const CASES = [
    framePage({
        id: 'planet-merge',
        href: 'planet-merge.html',
        shell: '.pm-shell',
        stage: '.pm-stage',
        canvas: '#pm-canvas',
        canvasRatio: 420 / 640,
        themeVar: '--tok-bg',
        frame: {
            wide: '940px',
            stage: '440px',
            side: '300px',
            sideGap: '14px',
            ratio: '0.65625',
            stageH: '960px',
        },
        probes: ['.game-topbar', '.game-main', '.game-footer'],
        async interact(page) {
            await page.waitForFunction(() => Boolean(window.planetMergeGame));
            await page.click('#pm-btn-endless');
            await waitHidden(page, '#pm-start');
            return page.evaluate(() => Boolean(window.planetMergeGame?.isRunning()));
        },
    }),
    framePage({
        id: 'hoop-shot',
        href: 'hoop-shot.html',
        shell: '.hs-shell',
        stage: '.hs-stage',
        canvas: '#hs-canvas',
        canvasRatio: 420 / 640,
        themeVar: '--hs-body-bg',
        lightTheme: true,
        frame: {
            wide: '940px',
            stage: '440px',
            side: '300px',
            sideGap: '14px',
            ratio: '0.65625',
            stageH: '960px',
        },
        probes: ['.game-topbar', '.game-main', '.game-footer'],
        async interact(page) {
            await page.waitForFunction(() => Boolean(window.hoopShotGame));
            await page.click('#hs-btn-play');
            await waitHidden(page, '#hs-start');
            return page.evaluate(() => Boolean(window.hoopShotGame?.isRunning()));
        },
    }),
    framePage({
        id: 'gravity-slingshot',
        href: 'gravity-slingshot.html',
        shell: '.gd-shell',
        stage: '.gd-stage',
        canvas: '#gd-canvas',
        canvasRatio: 480 / 640,
        themeVar: '--tok-bg',
        frame: {
            wide: '940px',
            stage: '460px',
            side: '300px',
            sideGap: '14px',
            ratio: '0.75',
            stageH: '960px',
        },
        probes: ['.game-topbar', '.game-main', '.game-footer'],
        async interact(page) {
            await page.waitForFunction(() => Boolean(window.gdGame));
            await page.click('#gd-btn-levels');
            await waitHidden(page, '#gd-start');
            return page.evaluate(() => window.gdGame?.phase === 'aiming');
        },
    }),
    framePage({
        id: 'sword-flight',
        href: 'sword-flight.html',
        shell: '.sf-shell',
        stage: '.sf-stage',
        canvas: '#sf-canvas',
        canvasRatio: 480 / 640,
        themeVar: '--color-bg',
        frame: {
            wide: '960px',
            stage: '480px',
            side: '320px',
            sideGap: '10px',
            ratio: '0.75',
            stageH: '960px',
        },
        probes: ['.game-topbar', '.game-main', '.game-footer'],
        async interact(page) {
            await page.waitForFunction(() => Boolean(window.game));
            await page.click('#sf-btn-stages');
            await page.waitForFunction(() => {
                const wrap = document.getElementById('sf-stage-select-wrap');
                return wrap && !wrap.classList.contains('hidden')
                    && wrap.querySelectorAll('.sf-stage-card').length === 9;
            });
            return true;
        },
    }),
    framePage({
        id: 'needle-awn',
        href: 'needle-awn.html',
        shell: '.na-shell',
        stage: '.na-stage',
        canvas: '#na-canvas',
        canvasRatio: 480 / 640,
        themeVar: '--color-bg',
        frame: {
            wide: '960px',
            stage: '480px',
            side: '320px',
            sideGap: '14px',
            ratio: '0.75',
            stageH: '960px',
        },
        probes: ['.game-topbar', '.game-main', '.game-footer'],
        async ready(page) {
            await page.waitForFunction(() => window.gameEngine
                && ['ready', 'fallback'].includes(document.getElementById('na-stage')?.dataset.artState), {
                timeout: 15000,
            });
        },
        async interact(page) {
            await page.click('#na-btn-levels');
            await page.waitForFunction(() => {
                const wrap = document.getElementById('na-level-select-wrap');
                return wrap && !wrap.classList.contains('hidden')
                    && document.getElementById('na-level-grid')?.children.length === 10;
            });
            return true;
        },
    }),
].filter(testCase => keepPage(testCase.id));

exitIfNoPages(CASES, 'verify-css-p3b');

await runCssLayerBehaviorBatch({
    name: 'CSS P3-B',
    base: BASE,
    cases: CASES,
    chromePath: CHROME_PATH,
    launchArgs: LAUNCH_ARGS,
});
