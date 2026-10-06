#!/usr/bin/env node
// CSS Cascade Layers P3-D behavior gate.
// Source mode is auto-discovered by verify-all; Architecture v2 CI runs the same
// contract against dist/ via tests/lib/run-smoke-dist.mjs.

import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { keepPage, exitIfNoPages } from './lib/page-filter.mjs';
import { runCssLayerBehaviorBatch } from './lib/css-layer-behavior.mjs';

const BASE = process.argv.find(arg => arg.startsWith('http')) || 'http://127.0.0.1:8899';
const label = (id, viewportName, message) => id + ' ' + viewportName + ': ' + message;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitDrawer(page, selector, open) {
    await page.waitForFunction(({ selector, open }) => {
        const drawer = document.querySelector(selector);
        if (!drawer) return false;
        const bodyLocked = document.body.classList.contains('drawer-locked');
        if (open) return !drawer.hidden && drawer.classList.contains('is-open') && bodyLocked;
        return drawer.hidden && !drawer.classList.contains('is-open') && !bodyLocked;
    }, { timeout: 5000 }, { selector, open });
}


async function validateDrawer(page, config, check, viewportName) {
    const initial = await page.evaluate(cfg => {
        const toggle = document.querySelector(cfg.toggle);
        const drawer = document.querySelector(cfg.drawer);
        const sidebar = document.querySelector(cfg.sidebar);
        const panels = document.querySelector(cfg.panels);
        const body = document.querySelector(cfg.drawerBody);
        return {
            bodyClass: document.body.className,
            toggleDisplay: toggle ? getComputedStyle(toggle).display : null,
            drawerHidden: drawer?.hidden,
            drawerDisplay: drawer ? getComputedStyle(drawer).display : null,
            sidebarDisplay: sidebar ? getComputedStyle(sidebar).display : null,
            panelsInDrawer: Boolean(panels && body && body.contains(panels)),
        };
    }, config.drawerContract);

    check(initial.bodyClass.includes('has-stats-drawer'), label(config.id, viewportName, 'drawer capability marker stays attached'));
    check(initial.toggleDisplay !== 'none', label(config.id, viewportName, 'mobile Stats trigger stays visible'), initial.toggleDisplay || 'missing');
    check(initial.drawerHidden === true && initial.drawerDisplay === 'none', label(config.id, viewportName, 'drawer starts hidden'));
    check(initial.sidebarDisplay === 'none', label(config.id, viewportName, 'desktop sidebar yields to mobile drawer'), initial.sidebarDisplay || 'missing');
    check(initial.panelsInDrawer, label(config.id, viewportName, 'single stats panel instance is placed in drawer body'));

    const runningState = () => page.evaluate(id => {
        if (id === 'tetris') return Boolean(window.game && window.game.animationId !== null && !window.game.paused && !window.game.gameOver);
        if (id === 'carrot-pull') return Boolean(window.cpGame?.isRunning?.());
        if (id === 'shadow-loom') return Boolean(window.slGame?.isRunning?.());
        return null;
    }, config.id);
    const setPaused = paused => page.evaluate(({ id, paused }) => {
        if (id === 'tetris') {
            if (Boolean(window.game?.paused) !== paused) window.game?.togglePause?.();
            return Boolean(window.game?.paused);
        }
        if (id === 'carrot-pull') {
            if (paused) window.cpGame?.pauseQuiet?.();
            else window.cpGame?.resumeQuiet?.();
            return !window.cpGame?.isRunning?.();
        }
        if (id === 'shadow-loom') {
            if (paused) window.slGame?.pauseQuiet?.();
            else window.slGame?.resumeQuiet?.();
            return !window.slGame?.isRunning?.();
        }
        return null;
    }, { id: config.id, paused });
    const wasRunning = await runningState();

    await page.click(config.drawerContract.toggle);
    await waitDrawer(page, config.drawerContract.drawer, true);
    await wait(350);

    const open = await page.evaluate(cfg => {
        const toggle = document.querySelector(cfg.toggle);
        const drawer = document.querySelector(cfg.drawer);
        const panel = drawer?.querySelector('.game-drawer-panel');
        const panels = document.querySelector(cfg.panels);
        const body = document.querySelector(cfg.drawerBody);
        const drawerStyle = drawer ? getComputedStyle(drawer) : null;
        const panelStyle = panel ? getComputedStyle(panel) : null;
        const rect = panel?.getBoundingClientRect();
        return {
            expanded: toggle?.getAttribute('aria-expanded'),
            position: drawerStyle?.position,
            opacity: Number.parseFloat(drawerStyle?.opacity || '0'),
            transform: panelStyle?.transform,
            maxHeight: Number.parseFloat(panelStyle?.maxHeight || '0'),
            panelRect: rect ? {
                top: rect.top,
                bottom: rect.bottom,
                left: rect.left,
                right: rect.right,
                width: rect.width,
                height: rect.height,
            } : null,
            viewport: { width: innerWidth, height: innerHeight },
            overflow: getComputedStyle(document.body).overflow,
            panelsInDrawer: Boolean(panels && body && body.contains(panels)),
        };
    }, config.drawerContract);

    check(open.expanded === 'true', label(config.id, viewportName, 'drawer ARIA expands'));
    check(open.position === 'fixed' && open.opacity > 0.99, label(config.id, viewportName, 'drawer fixed overlay contract wins'), open.position + '/' + open.opacity);
    check(open.transform === 'none' || open.transform === 'matrix(1, 0, 0, 1, 0, 0)', label(config.id, viewportName, 'drawer panel settles on screen'), open.transform || 'missing');
    check(open.maxHeight > 0 && open.maxHeight <= open.viewport.height + 1, label(config.id, viewportName, 'drawer panel max-height stays viewport-bounded'), String(open.maxHeight));
    check(Boolean(open.panelRect)
        && open.panelRect.top >= -1
        && open.panelRect.left >= -1
        && open.panelRect.right <= open.viewport.width + 1
        && open.panelRect.height <= open.viewport.height + 1
        && Math.abs(open.panelRect.bottom - open.viewport.height) <= 1,
    label(config.id, viewportName, 'drawer panel stays inside viewport and bottom-aligned'),
    JSON.stringify({ rect: open.panelRect, viewport: open.viewport }));
    check(open.overflow === 'hidden', label(config.id, viewportName, 'drawer locks background scroll'), open.overflow);
    check(open.panelsInDrawer, label(config.id, viewportName, 'drawer keeps the single stats panel instance'));

    if (wasRunning === true) {
        const paused = await runningState();
        check(paused === false, label(config.id, viewportName, 'opening drawer pauses live gameplay'));
    }

    await page.click(config.drawerContract.close);
    await waitDrawer(page, config.drawerContract.drawer, false);
    const closed = await page.evaluate(cfg => ({
        expanded: document.querySelector(cfg.toggle)?.getAttribute('aria-expanded'),
        panelsInDrawer: document.querySelector(cfg.drawerBody)?.contains(document.querySelector(cfg.panels)),
    }), config.drawerContract);
    check(closed.expanded === 'false', label(config.id, viewportName, 'drawer ARIA collapses'));
    check(closed.panelsInDrawer, label(config.id, viewportName, 'closing drawer does not clone or strand stats content'));

    if (wasRunning === true) {
        const resumed = await runningState();
        check(resumed === true, label(config.id, viewportName, 'closing drawer resumes only drawer-paused gameplay'));

        const manuallyPaused = await setPaused(true);
        check(manuallyPaused === true, label(config.id, viewportName, 'player pause state can be established before drawer reopen'));
        // Pointer reachability and drawer geometry were already proven by the first
        // open/close cycle above. This second cycle isolates the state-machine contract:
        // a player-paused game must stay paused after the drawer closes. Trigger the same
        // button click handler directly so layout/scroll changes from Tetris unlockPage()
        // cannot create a second, unrelated pointer-geometry race.
        await page.evaluate(selector => document.querySelector(selector)?.click(), config.drawerContract.toggle);
        await waitDrawer(page, config.drawerContract.drawer, true);
        await page.evaluate(selector => document.querySelector(selector)?.click(), config.drawerContract.close);
        await waitDrawer(page, config.drawerContract.drawer, false);
        const stillPaused = await runningState();
        check(stillPaused === false, label(config.id, viewportName, 'closing drawer does not resume player-paused gameplay'));
        await setPaused(false);
    }
}

function standardPage(config) {
    return {
        ...config,
        lightTheme: config.lightTheme === true,
        themeVar: '--tok-bg',
        probes: ['.game-topbar', '.game-main', config.stage, '.game-footer'],
        async ready(page) {
            await page.waitForFunction(name => Boolean(window[name]), { timeout: 10000 }, config.gameGlobal);
            if (config.drawerContract) {
                await page.waitForFunction(() => document.body.classList.contains('has-stats-drawer'), { timeout: 5000 });
            }
            if (config.ready) await config.ready(page);
        },
        async validate(ctx) {
            const metrics = await ctx.page.evaluate(() => ({
                bodyClass: document.body.className,
                immersive: Boolean(document.querySelector('.game-shell--immersive, .game-stage--immersive')),
            }));
            ctx.check(metrics.bodyClass.includes('has-frame-budget'), label(config.id, ctx.viewportName, 'standard page keeps frame-budget marker'), metrics.bodyClass);
            ctx.check(!metrics.immersive && !metrics.bodyClass.includes('has-immersive-stage'), label(config.id, ctx.viewportName, 'standard page stays outside immersive contract'));
            if (config.validate) await config.validate(ctx);

            if (!config.drawerContract) return;
            if (ctx.viewport.width < 1024) {
                await validateDrawer(ctx.page, config, ctx.check, ctx.viewportName);
            } else {
                const desktop = await ctx.page.evaluate(cfg => ({
                    toggle: getComputedStyle(document.querySelector(cfg.toggle)).display,
                    drawer: getComputedStyle(document.querySelector(cfg.drawer)).display,
                    sidebar: getComputedStyle(document.querySelector(cfg.sidebar)).display,
                    panelsInSidebar: document.querySelector(cfg.sidebar)?.contains(document.querySelector(cfg.panels)),
                }), config.drawerContract);
                ctx.check(desktop.toggle === 'none', label(config.id, ctx.viewportName, 'desktop Stats trigger remains hidden'), desktop.toggle);
                ctx.check(desktop.drawer === 'none', label(config.id, ctx.viewportName, 'desktop shared drawer remains out of layout'), desktop.drawer);
                ctx.check(desktop.sidebar !== 'none' && desktop.panelsInSidebar, label(config.id, ctx.viewportName, 'desktop sidebar owns the single stats panel instance'));
            }
        },
    };
}

function immersivePage(config) {
    return {
        ...config,
        lightTheme: false,
        themeVar: '--tok-bg',
        probes: ['.game-topbar', '.game-main', config.stage, '.game-footer'],
        async ready(page) {
            await page.waitForFunction(name => Boolean(window[name]), { timeout: 10000 }, config.gameGlobal);
            await page.waitForFunction(() => document.body.classList.contains('has-immersive-stage'), { timeout: 5000 });
            if (config.ready) await config.ready(page);
        },
        async validate(ctx) {
            const metrics = await ctx.page.evaluate(stageSelector => {
                const shell = document.querySelector('.game-shell--immersive');
                const stage = document.querySelector(stageSelector);
                const canvas = stage?.querySelector('canvas');
                const shellStyle = shell ? getComputedStyle(shell) : null;
                const stageStyle = stage ? getComputedStyle(stage) : null;
                return {
                    bodyClass: document.body.className,
                    shellMaxWidth: shellStyle?.maxWidth,
                    stageDisplay: stageStyle?.display,
                    overflowX: stageStyle?.overflowX,
                    overflowY: stageStyle?.overflowY,
                    touchAction: stageStyle?.touchAction,
                    userSelect: stageStyle?.userSelect || stageStyle?.webkitUserSelect,
                    canvas: canvas ? {
                        width: canvas.width,
                        height: canvas.height,
                        cssWidth: canvas.clientWidth,
                        cssHeight: canvas.clientHeight,
                        dpr: window.devicePixelRatio,
                    } : null,
                };
            }, config.stage);
            ctx.check(metrics.bodyClass.includes('has-immersive-stage') && !metrics.bodyClass.includes('has-frame-budget'), label(config.id, ctx.viewportName, 'immersive marker stays exclusive'), metrics.bodyClass);
            ctx.check(metrics.shellMaxWidth === 'none', label(config.id, ctx.viewportName, 'immersive shell keeps max-width:none'), metrics.shellMaxWidth || 'missing');
            const strictStage = ctx.viewport.width >= 1024 || ctx.viewportName.includes('gameplay');
            if (strictStage) {
                ctx.check(metrics.stageDisplay === 'block' && metrics.overflowX === 'hidden' && metrics.overflowY === 'hidden', label(config.id, ctx.viewportName, 'immersive stage structure stays authoritative'), metrics.stageDisplay + '/' + metrics.overflowX + '/' + metrics.overflowY);
                ctx.check(metrics.touchAction === 'none' && metrics.userSelect === 'none', label(config.id, ctx.viewportName, 'immersive stage stays a pure gesture surface'), metrics.touchAction + '/' + metrics.userSelect);
                if (metrics.canvas) {
                    const scale = Math.min(2, metrics.canvas.dpr);
                    ctx.check(Math.abs(metrics.canvas.width - metrics.canvas.cssWidth * scale) <= 1 && Math.abs(metrics.canvas.height - metrics.canvas.cssHeight * scale) <= 1,
                        label(config.id, ctx.viewportName, 'canvas backing buffer follows CSS size and DPR'),
                        metrics.canvas.width + 'x' + metrics.canvas.height + ' vs ' + metrics.canvas.cssWidth + 'x' + metrics.canvas.cssHeight + 'x' + scale);
                } else {
                    ctx.check(false, label(config.id, ctx.viewportName, 'immersive stage contains canvas'));
                }
            }
            if (config.validate) await config.validate(ctx);
        },
    };
}

const CASES = [
    standardPage({
        id: 'tetris',
        href: 'tetris.html',
        shell: '.game-container',
        stage: '.game-board',
        gameGlobal: 'game',
        lightTheme: true,
        drawerContract: {
            toggle: '#statsToggle', drawer: '#statsDrawer', close: '#statsClose',
            drawerBody: '#statsDrawerBody', panels: '#statsPanels', sidebar: '#infoPanel',
        },
        async interact(page) {
            await page.click('#startBtn');
            await page.waitForFunction(() => window.game?.animationId !== null && !window.game?.paused && !window.game?.gameOver, { timeout: 5000 });
            return true;
        },
        async mobileInteract(page) {
            await page.click('#mobileStartBtn');
            await page.waitForFunction(() => window.game?.animationId !== null && !window.game?.paused && !window.game?.gameOver, { timeout: 5000 });
            return true;
        },
        async validate({ page, viewportName, viewport, check }) {
            if (viewport.width >= 1024 || !viewportName.includes('gameplay')) return;
            const controls = await page.evaluate(() => {
                const el = document.getElementById('mobileControls');
                const style = getComputedStyle(el);
                const rect = el.getBoundingClientRect();
                return { display: style.display, position: style.position, bottom: rect.bottom, vh: innerHeight };
            });
            check(controls.display === 'flex' && controls.position === 'fixed', label('tetris', viewportName, 'mobile controls remain fixed and visible'), controls.display + '/' + controls.position);
            check(Math.abs(controls.bottom - controls.vh) <= 1, label('tetris', viewportName, 'mobile controls stay pinned to viewport bottom'), controls.bottom + '/' + controls.vh);
        },
    }),
    immersivePage({
        id: 'tower-defense',
        href: 'tower-defense.html',
        shell: '.td-shell',
        stage: '#td-stage',
        gameGlobal: 'tdGame',
        async ready(page) {
            await page.waitForFunction(() => window.__TD_ART__?.status && document.documentElement.dataset.tdArt, { timeout: 15000 });
        },
        async interact(page) {
            await page.click('#td-btn-play');
            await page.waitForFunction(() => window.tdGame?.state === 'playing', { timeout: 5000 });
            await page.click('#tdStatsToggle');
            await page.waitForFunction(() => !document.getElementById('tdTacticalPanel')?.classList.contains('hidden') && document.getElementById('tdStatsToggle')?.getAttribute('aria-expanded') === 'true', { timeout: 5000 });
            const panel = await page.evaluate(() => ({
                display: getComputedStyle(document.getElementById('tdTacticalPanel')).display,
                position: getComputedStyle(document.getElementById('tdTacticalPanel')).position,
                sharedDrawer: Boolean(document.querySelector('.game-drawer')),
            }));
            await page.keyboard.press('Escape');
            await page.waitForFunction(() => document.getElementById('tdTacticalPanel')?.classList.contains('hidden'), { timeout: 5000 });
            return panel.display !== 'none' && panel.position === 'absolute' && panel.sharedDrawer === false;
        },
        async mobileInteract(page) {
            // Portrait phones intentionally show a full-stage rotation prompt that owns
            // pointer input. Enter gameplay through the real landscape path, then restore
            // portrait so the shared harness can take its normal mobile-gameplay snapshot.
            await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
            await page.waitForFunction(
                () => !document.getElementById('td-rotate-prompt')?.classList.contains('is-active'),
                { timeout: 5000 },
            );
            await page.click('#td-btn-play');
            await page.waitForFunction(() => window.tdGame?.state === 'playing', { timeout: 5000 });
            await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
            await page.waitForFunction(
                () => document.getElementById('td-rotate-prompt')?.classList.contains('is-active'),
                { timeout: 5000 },
            );
            return true;
        },
        async validate({ page, viewportName, viewport, check }) {
            const art = await page.evaluate(() => ({
                state: document.documentElement.dataset.tdArt,
                status: window.__TD_ART__?.status,
                loaded: window.__TD_ART__?.loaded,
                failed: window.__TD_ART__?.failed?.length,
                statsDisplay: getComputedStyle(document.getElementById('tdStatsToggle')).display,
            }));
            check(art.state === 'ready' && art.status === 'ready' && art.loaded === 8 && art.failed === 0, label('tower-defense', viewportName, 'production art remains fully ready'), JSON.stringify(art));
            check(art.statsDisplay !== 'none', label('tower-defense', viewportName, 'page-owned tactical Stats trigger remains visible'), art.statsDisplay);

            if (viewport.width >= 1024 || !viewportName.includes('gameplay')) return;
            await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
            await wait(450);
            const landscape = await page.evaluate(() => {
                const stage = document.getElementById('td-stage');
                const rect = stage.getBoundingClientRect();
                return {
                    state: window.tdGame?.state,
                    stage: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
                    stagePosition: getComputedStyle(stage).position,
                    topbarPosition: getComputedStyle(document.querySelector('.td-topbar')).position,
                    footerDisplay: getComputedStyle(document.querySelector('.td-footer')).display,
                    controlsPosition: getComputedStyle(document.getElementById('td-bottom-controls')).position,
                    vw: innerWidth,
                    vh: innerHeight,
                };
            });
            check(landscape.state === 'playing', label('tower-defense', viewportName, 'rotation keeps gameplay running'), landscape.state || 'missing');
            check(landscape.stagePosition === 'fixed' && landscape.topbarPosition === 'fixed', label('tower-defense', viewportName, 'landscape battle keeps fixed stage and topbar'), landscape.stagePosition + '/' + landscape.topbarPosition);
            check(Math.abs(landscape.stage.top) <= 1 && Math.abs(landscape.stage.left) <= 1 && Math.abs(landscape.stage.width - landscape.vw) <= 1 && Math.abs(landscape.stage.height - landscape.vh) <= 1,
                label('tower-defense', viewportName, 'landscape battle covers the full viewport'), JSON.stringify(landscape.stage));
            check(landscape.footerDisplay === 'none' && landscape.controlsPosition === 'absolute', label('tower-defense', viewportName, 'landscape battle hides footer and keeps in-stage controls'), landscape.footerDisplay + '/' + landscape.controlsPosition);
            await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
            await wait(250);
        },
    }),
    standardPage({
        id: 'carrot-pull',
        href: 'carrot-pull.html',
        shell: '.cp-shell',
        stage: '#cp-stage',
        gameGlobal: 'cpGame',
        lightTheme: true,
        drawerContract: {
            toggle: '#cpStatsToggle', drawer: '#cpStatsDrawer', close: '#cpStatsClose',
            drawerBody: '#cpStatsDrawerBody', panels: '#cpStatsPanels', sidebar: '.cp-sidebar',
        },
        async ready(page) {
            await page.waitForFunction(() => ['ready', 'fallback'].includes(document.getElementById('cp-stage')?.dataset.artState), { timeout: 15000 });
        },
        async interact(page) {
            await page.click('#cp-start-btn');
            await page.waitForFunction(() => window.cpGame?.state?.mode === 'playing', { timeout: 5000 });
            await page.evaluate(() => { window.cpGame.state.needle = window.cpGame.state.target; });
            await page.click('#cp-pull-btn');
            return page.evaluate(() => window.cpGame.state.pulls === 1 && window.cpGame.state.score > 0);
        },
        async mobileInteract(page) {
            await page.click('#cp-start-btn');
            await page.waitForFunction(() => window.cpGame?.state?.mode === 'playing', { timeout: 5000 });
            return true;
        },
        async validate({ page, viewportName, check }) {
            const art = await page.evaluate(() => ({
                state: document.getElementById('cp-stage')?.dataset.artState,
                productionVisible: getComputedStyle(document.querySelector('[data-art-production]')).visibility !== 'hidden',
                layerCount: document.querySelectorAll('[data-art-layer]').length,
                layersReady: [...document.querySelectorAll('[data-art-layer]')].every(node => Boolean(node.getAttribute('href') || node.getAttribute('xlink:href'))),
                spriteCount: document.querySelectorAll('[data-art-sprite]').length,
            }));
            check(art.state === 'ready' && art.productionVisible && art.layerCount > 0 && art.layersReady && art.spriteCount > 0,
                label('carrot-pull', viewportName, 'production art remains ready and bound'), JSON.stringify(art));
        },
    }),
    immersivePage({
        id: 'firefly-signal',
        href: 'firefly-signal.html',
        shell: '.fs-shell',
        stage: '#fs-stage',
        gameGlobal: '__fireflySignal',
        async ready(page) {
            await page.waitForFunction(() => document.querySelectorAll('#fs-level-list .fs-level-btn').length > 0, { timeout: 10000 });
        },
        async interact(page) {
            await page.click('#fs-level-list .fs-level-btn');
            await page.waitForFunction(() => window.__fireflySignal?.state === 'playing', { timeout: 5000 });
            return page.evaluate(() => !document.getElementById('fs-hud')?.classList.contains('hidden'));
        },
        async mobileInteract(page) {
            await page.click('#fs-level-list .fs-level-btn');
            await page.waitForFunction(() => window.__fireflySignal?.state === 'playing', { timeout: 5000 });
            return true;
        },
        async validate({ page, viewportName, check }) {
            if (!viewportName.includes('gameplay')) return;
            const gameplay = await page.evaluate(() => ({
                state: window.__fireflySignal?.state,
                hudVisible: !document.getElementById('fs-hud')?.classList.contains('hidden'),
                restartDisabled: document.getElementById('fs-btn-restart')?.disabled,
            }));
            check(gameplay.state === 'playing' && gameplay.hudVisible && gameplay.restartDisabled === false,
                label('firefly-signal', viewportName, 'real gameplay exposes HUD and restart control'), JSON.stringify(gameplay));
        },
    }),
    standardPage({
        id: 'shadow-loom',
        href: 'shadow-loom.html',
        shell: '.sl-shell',
        stage: '#sl-stage',
        gameGlobal: 'slGame',
        drawerContract: {
            toggle: '#slStatsToggle', drawer: '#slStatsDrawer', close: '#slStatsClose',
            drawerBody: '#slStatsDrawerBody', panels: '#slStatsPanels', sidebar: '.sl-sidebar',
        },
        async ready(page) {
            await page.waitForFunction(() => Boolean(window.slGame) && document.querySelectorAll('#sl-level-grid .sl-chip').length > 0, { timeout: 10000 });
        },
        async interact(page) {
            await page.click('#sl-level-grid .sl-chip');
            await page.waitForFunction(() => window.slGame?.state === 'playing', { timeout: 5000 });
            return page.evaluate(() => document.getElementById('sl-start')?.classList.contains('hidden'));
        },
        async mobileInteract(page) {
            await page.click('#sl-level-grid .sl-chip');
            await page.waitForFunction(() => window.slGame?.state === 'playing', { timeout: 5000 });
            return true;
        },
        async validate({ page, viewportName, check }) {
            const canvas = await page.evaluate(() => {
                const el = document.getElementById('sl-canvas');
                const rect = el.getBoundingClientRect();
                const style = getComputedStyle(el);
                return {
                    width: rect.width,
                    height: rect.height,
                    touchAction: style.touchAction,
                    borderStyle: style.borderTopStyle,
                    borderWidth: style.borderTopWidth,
                    shadow: style.boxShadow,
                };
            });
            check(canvas.width > 0 && canvas.height > 0 && canvas.touchAction === 'none' && canvas.borderStyle !== 'none' && Number.parseFloat(canvas.borderWidth) > 0 && canvas.shadow !== 'none',
                label('shadow-loom', viewportName, 'page-owned production canvas skin stays authoritative'), JSON.stringify(canvas));
        },
    }),
].filter(testCase => keepPage(testCase.id));

exitIfNoPages(CASES, 'verify-css-p3d');

await runCssLayerBehaviorBatch({
    name: 'CSS P3-D',
    base: BASE,
    cases: CASES,
    chromePath: CHROME_PATH,
    launchArgs: LAUNCH_ARGS,
});
