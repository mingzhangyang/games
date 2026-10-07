#!/usr/bin/env node
// CSS Cascade Layers P3-E behavior gate.
// Covers the two intentional outlier pages that do not participate in the shared
// shell/topbar contract. Source mode is auto-discovered by verify-all; Architecture
// v2 CI runs the same contract against dist/ via tests/lib/run-smoke-dist.mjs.

import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { keepPage, exitIfNoPages } from './lib/page-filter.mjs';
import { runCssLayerBehaviorBatch } from './lib/css-layer-behavior.mjs';

const BASE = process.argv.find(arg => arg.startsWith('http')) || 'http://127.0.0.1:8899';
const label = (id, viewportName, message) => id + ' ' + viewportName + ': ' + message;

const CASES = [
    {
        id: 'math-rain',
        href: 'math-rain.html',
        shell: '#game-container',
        stage: '#game-area',
        lightTheme: false,
        darkOnly: true,
        themeVar: '--tok-bg',
        probes: ['main.mr-main', '#game-container', '#game-area', '#game-canvas'],
        async ready(page) {
            await page.waitForFunction(
                () => Boolean(window.mathRainGame?.gameStateManager && window.mathRainGame?.uiController),
                { timeout: 10000 },
            );
        },
        async interact(page) {
            await page.click('#difficulty-1');
            await page.click('#start-game-btn');
            await page.waitForFunction(
                () => window.mathRainGame?.gameStateManager?.getState()?.gameState === 'playing',
                { timeout: 8000 },
            );
            return page.evaluate(() => {
                const canvas = document.getElementById('game-canvas');
                const target = document.getElementById('target-number');
                return Boolean(
                    canvas
                    && canvas.clientWidth > 0
                    && canvas.clientHeight > 0
                    && target?.textContent
                    && window.mathRainGame?.expressions?.length > 0
                );
            });
        },
        async mobileInteract(page) {
            await page.click('#difficulty-1');
            await page.click('#start-game-btn');
            await page.waitForFunction(
                () => window.mathRainGame?.gameStateManager?.getState()?.gameState === 'playing',
                { timeout: 8000 },
            );
            return true;
        },
        async validate({ page, viewportName, viewport, check }) {
            const metrics = await page.evaluate(() => {
                const area = document.getElementById('game-area');
                const areaStyle = area ? getComputedStyle(area) : null;
                const overlayStyle = area ? getComputedStyle(area, '::after') : null;
                const canvas = document.getElementById('game-canvas');
                const canvasRect = canvas?.getBoundingClientRect();
                const areaRect = area?.getBoundingClientRect();
                return {
                    bodyClass: document.body.className,
                    bodyOverflow: getComputedStyle(document.body).overflow,
                    sharedShell: Boolean(document.querySelector('.game-shell, .game-topbar, .game-footer')),
                    backgroundImage: areaStyle?.backgroundImage || '',
                    overlayPointerEvents: overlayStyle?.pointerEvents || '',
                    canvas: canvasRect ? {
                        width: canvasRect.width,
                        height: canvasRect.height,
                    } : null,
                    area: areaRect ? {
                        width: areaRect.width,
                        height: areaRect.height,
                    } : null,
                    state: window.mathRainGame?.gameStateManager?.getState()?.gameState || null,
                };
            });

            check(!metrics.sharedShell, label('math-rain', viewportName, 'remains outside shared shell/chrome ownership'));
            check(
                !metrics.bodyClass.includes('has-frame-budget')
                    && !metrics.bodyClass.includes('has-immersive-stage')
                    && !metrics.bodyClass.includes('has-stats-drawer'),
                label('math-rain', viewportName, 'does not inherit shared frame/drawer/immersive markers'),
                metrics.bodyClass,
            );
            check(metrics.bodyOverflow === 'hidden', label('math-rain', viewportName, 'page-owned overflow lock stays authoritative'), metrics.bodyOverflow);
            check(metrics.overlayPointerEvents === 'none', label('math-rain', viewportName, 'observatory decoration cannot intercept gameplay input'), metrics.overlayPointerEvents);

            const expectedBackground = viewport.width <= 768 ? 'observatory-mobile' : 'observatory-wide';
            check(
                metrics.backgroundImage.includes(expectedBackground) && metrics.backgroundImage.includes('fallback'),
                label('math-rain', viewportName, 'responsive production background stack remains selected'),
                metrics.backgroundImage,
            );

            if (viewportName.includes('gameplay')) {
                check(
                    metrics.state === 'playing'
                        && metrics.canvas?.width > 0
                        && metrics.canvas?.height > 0
                        && metrics.area?.width > 0
                        && metrics.area?.height > 0,
                    label('math-rain', viewportName, 'real gameplay keeps a visible canvas inside the observatory stage'),
                    JSON.stringify({ state: metrics.state, canvas: metrics.canvas, area: metrics.area }),
                );
            }
        },
    },
    {
        id: 'tank-battle',
        href: 'tank-battle.html',
        shell: '#gameContainer',
        stage: '#gameCanvas',
        lightTheme: false,
        darkOnly: true,
        themeVar: '--tok-bg',
        probes: ['#gameContainer', '#gameCanvas', '#gameInfo', '#miniMap'],
        async ready(page) {
            await page.waitForFunction(() => {
                const game = window.tankBattleInstance;
                const container = document.getElementById('gameContainer');
                return Boolean(
                    game
                    && game.art?.ready === true
                    && container?.dataset.tbArtState === 'ready'
                    && game.art?.getTerrainCacheStatus?.().ready === true
                );
            }, { timeout: 12000 });
        },
        async interact(page) {
            const before = await page.evaluate(() => Boolean(window.tankBattleInstance?.paused));
            await page.keyboard.press('p');
            await page.waitForFunction(expected => Boolean(window.tankBattleInstance?.paused) === expected, { timeout: 5000 }, !before);
            await page.keyboard.press('p');
            await page.waitForFunction(expected => Boolean(window.tankBattleInstance?.paused) === expected, { timeout: 5000 }, before);
            return true;
        },
        async mobileInteract(page) {
            // Tank Battle's touch/hover media contract is evaluated as a device mode.
            // Reload after each emulated orientation, matching the existing dedicated
            // smoke cases instead of assuming Chromium will reclassify pointer/hover
            // media features during an in-document viewport rotation.
            await page.setViewport({
                width: 844,
                height: 390,
                deviceScaleFactor: 2,
                isMobile: true,
                hasTouch: true,
            });
            await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForFunction(() => {
                const game = window.tankBattleInstance;
                const controller = document.getElementById('virtualController');
                const orientation = document.getElementById('orientationOverlay');
                return game?.art?.ready === true
                    && controller
                    && getComputedStyle(controller).display === 'block'
                    && orientation
                    && getComputedStyle(orientation).display === 'none';
            }, { timeout: 12000 });

            const tapPause = async expectedPaused => {
                const target = await page.evaluate(() => {
                    const button = document.getElementById('btnPause');
                    const rect = button?.getBoundingClientRect();
                    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
                    const x = rect.left + rect.width / 2;
                    const y = rect.top + rect.height / 2;
                    const hit = document.elementFromPoint(x, y);
                    return {
                        x,
                        y,
                        hitPause: Boolean(hit?.closest?.('#btnPause')),
                        hit: hit?.id || hit?.className || hit?.tagName || 'unknown',
                    };
                });
                if (!target?.hitPause) {
                    throw new Error(`Pause control is not the landscape hit target (got ${target?.hit || 'missing'})`);
                }
                await page.touchscreen.tap(target.x, target.y);
                await page.waitForFunction(
                    expected => Boolean(window.tankBattleInstance?.paused) === expected,
                    { timeout: 5000 },
                    expectedPaused,
                );
            };

            const before = await page.evaluate(() => Boolean(window.tankBattleInstance?.paused));
            await tapPause(!before);
            // The production control intentionally debounces duplicate touch/click input
            // for 250ms. Honor that contract before verifying the resume path.
            await new Promise(resolve => setTimeout(resolve, 300));
            await tapPause(before);

            const landscape = await page.evaluate(() => {
                const canvas = document.getElementById('gameCanvas')?.getBoundingClientRect();
                const dpad = document.getElementById('dpad')?.getBoundingClientRect();
                const fire = document.getElementById('btnFire')?.getBoundingClientRect();
                return {
                    canvas: canvas ? {
                        width: canvas.width,
                        height: canvas.height,
                        left: canvas.left,
                        right: canvas.right,
                        top: canvas.top,
                        bottom: canvas.bottom,
                    } : null,
                    dpad: dpad ? { width: dpad.width, height: dpad.height } : null,
                    fire: fire ? { width: fire.width, height: fire.height } : null,
                    vw: innerWidth,
                    vh: innerHeight,
                };
            });
            const landscapeOk = Boolean(
                landscape.canvas
                && landscape.canvas.width > 0
                && landscape.canvas.height > 0
                && landscape.canvas.left >= -1
                && landscape.canvas.right <= landscape.vw + 1
                && landscape.canvas.top >= -1
                && landscape.canvas.bottom <= landscape.vh + 1
                && landscape.dpad?.width >= 100
                && landscape.dpad?.height >= 100
                && landscape.fire?.width >= 60
                && landscape.fire?.height >= 60
            );

            await page.setViewport({
                width: 390,
                height: 844,
                deviceScaleFactor: 2,
                isMobile: true,
                hasTouch: true,
            });
            await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForFunction(() => {
                const game = window.tankBattleInstance;
                const controller = document.getElementById('virtualController');
                const orientation = document.getElementById('orientationOverlay');
                return game?.art?.ready === true
                    && controller
                    && getComputedStyle(controller).display === 'none'
                    && orientation
                    && getComputedStyle(orientation).display === 'flex';
            }, { timeout: 12000 });
            return landscapeOk;
        },
        async validate({ page, viewportName, check }) {
            const metrics = await page.evaluate(() => {
                const canvas = document.getElementById('gameCanvas');
                const canvasRect = canvas?.getBoundingClientRect();
                const container = document.getElementById('gameContainer');
                const containerRect = container?.getBoundingClientRect();
                const orientation = document.getElementById('orientationOverlay');
                const orientationRect = orientation?.getBoundingClientRect();
                const controller = document.getElementById('virtualController');
                const hud = document.getElementById('gameUI');
                const hudRect = hud?.getBoundingClientRect();
                const gameInfo = document.getElementById('gameInfo');
                const miniMap = document.getElementById('miniMap');
                const instance = window.tankBattleInstance;
                return {
                    bodyClass: document.body.className,
                    bodyDisplay: getComputedStyle(document.body).display,
                    semanticMain: Boolean(document.querySelector('main.tb-main')),
                    sharedShell: Boolean(document.querySelector('.game-shell, .game-topbar, .game-footer')),
                    canvas: canvasRect ? {
                        width: canvasRect.width,
                        height: canvasRect.height,
                        intrinsicWidth: canvas.width,
                        intrinsicHeight: canvas.height,
                    } : null,
                    container: containerRect ? {
                        left: containerRect.left,
                        width: containerRect.width,
                    } : null,
                    artState: container?.dataset.tbArtState,
                    artReady: instance?.art?.ready === true,
                    terrainReady: instance?.art?.getTerrainCacheStatus?.().ready === true,
                    orientationDisplay: orientation ? getComputedStyle(orientation).display : null,
                    orientationPosition: orientation ? getComputedStyle(orientation).position : null,
                    orientationRect: orientationRect ? {
                        top: orientationRect.top,
                        left: orientationRect.left,
                        width: orientationRect.width,
                        height: orientationRect.height,
                    } : null,
                    controllerDisplay: controller ? getComputedStyle(controller).display : null,
                    hud: hudRect ? {
                        position: getComputedStyle(hud).position,
                        pointerEvents: getComputedStyle(hud).pointerEvents,
                        top: hudRect.top,
                        left: hudRect.left,
                        right: hudRect.right,
                        bottom: hudRect.bottom,
                    } : null,
                    gameInfoPosition: gameInfo ? getComputedStyle(gameInfo).position : null,
                    miniMapPosition: miniMap ? getComputedStyle(miniMap).position : null,
                    containerRect: containerRect ? {
                        top: containerRect.top,
                        left: containerRect.left,
                        right: containerRect.right,
                        bottom: containerRect.bottom,
                    } : null,
                    vw: innerWidth,
                    vh: innerHeight,
                };
            });

            check(metrics.semanticMain, label('tank-battle', viewportName, 'semantic main remains present despite display:contents'));
            check(!metrics.sharedShell, label('tank-battle', viewportName, 'remains outside shared shell/chrome ownership'));
            check(
                !metrics.bodyClass.includes('has-frame-budget')
                    && !metrics.bodyClass.includes('has-immersive-stage')
                    && !metrics.bodyClass.includes('has-stats-drawer'),
                label('tank-battle', viewportName, 'does not inherit shared frame/drawer/immersive markers'),
                metrics.bodyClass,
            );
            check(metrics.bodyDisplay === 'flex', label('tank-battle', viewportName, 'page-owned centering stays authoritative'), metrics.bodyDisplay);
            check(
                metrics.canvas?.intrinsicWidth === 800
                    && metrics.canvas?.intrinsicHeight === 600
                    && Math.abs(metrics.canvas.width / metrics.canvas.height - 4 / 3) < 0.02,
                label('tank-battle', viewportName, '4:3 battlefield and 800x600 logical canvas stay frozen'),
                JSON.stringify(metrics.canvas),
            );
            check(
                Boolean(metrics.container)
                    && Math.abs((metrics.vw - metrics.container.width) / 2 - metrics.container.left) < 60,
                label('tank-battle', viewportName, 'battlefield container remains centered'),
                JSON.stringify(metrics.container),
            );
            check(
                metrics.artState === 'ready' && metrics.artReady && metrics.terrainReady,
                label('tank-battle', viewportName, 'production art and terrain cache remain ready'),
                JSON.stringify({ state: metrics.artState, artReady: metrics.artReady, terrainReady: metrics.terrainReady }),
            );
            check(
                metrics.hud?.position === 'absolute'
                    && metrics.hud?.pointerEvents === 'none'
                    && metrics.gameInfoPosition === 'absolute'
                    && metrics.miniMapPosition === 'absolute'
                    && metrics.containerRect
                    && metrics.hud.top >= metrics.containerRect.top - 1
                    && metrics.hud.left >= metrics.containerRect.left - 1
                    && metrics.hud.right <= metrics.containerRect.right + 1
                    && metrics.hud.bottom <= metrics.containerRect.bottom + 1,
                label('tank-battle', viewportName, 'overlay HUD remains absolutely positioned inside battlefield container'),
                JSON.stringify({
                    hud: metrics.hud,
                    gameInfo: metrics.gameInfoPosition,
                    miniMap: metrics.miniMapPosition,
                    container: metrics.containerRect,
                }),
            );

            if (viewportName === 'desktop') {
                check(metrics.orientationDisplay === 'none' && metrics.controllerDisplay === 'none',
                    label('tank-battle', viewportName, 'desktop keeps phone-only overlays/controllers out of layout'),
                    metrics.orientationDisplay + '/' + metrics.controllerDisplay);
            }

            if (viewportName === 'mobile-gameplay') {
                check(
                    metrics.orientationDisplay === 'flex'
                        && metrics.orientationPosition === 'fixed'
                        && metrics.controllerDisplay === 'none'
                        && metrics.orientationRect
                        && Math.abs(metrics.orientationRect.top) <= 1
                        && Math.abs(metrics.orientationRect.left) <= 1
                        && Math.abs(metrics.orientationRect.width - metrics.vw) <= 1
                        && Math.abs(metrics.orientationRect.height - metrics.vh) <= 1,
                    label('tank-battle', viewportName, 'portrait touch mode is owned by the full-screen rotation gate'),
                    JSON.stringify({
                        orientation: metrics.orientationDisplay,
                        position: metrics.orientationPosition,
                        rect: metrics.orientationRect,
                        controller: metrics.controllerDisplay,
                    }),
                );
            }
        },
    },
].filter(testCase => keepPage(testCase.id));

exitIfNoPages(CASES, 'verify-css-p3e');

await runCssLayerBehaviorBatch({
    name: 'CSS P3-E',
    base: BASE,
    cases: CASES,
    chromePath: CHROME_PATH,
    launchArgs: LAUNCH_ARGS,
});
