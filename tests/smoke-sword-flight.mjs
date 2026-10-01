#!/usr/bin/env node
// Runtime smoke for the modular Sword Flight pass.
// The same script runs against the source server and against dist/ via
// run-smoke-dist.mjs, so the production entry/chunks get exercised too.
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';

const BASE = process.argv.find(arg => arg.startsWith('http')) || 'http://127.0.0.1:8899';
const failures = [];
const check = (condition, label, detail = '') => {
    if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
    console.log(`${condition ? '✓' : '✗'} ${label}${detail ? ` (${detail})` : ''}`);
};
const noise = /analytics\.js|sw-register\.js|manifest|favicon|apple-touch-icon|fonts\.(googleapis|gstatic)\.com|game-scores|games-analytics|ERR_FAILED/i;

const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: LAUNCH_ARGS });
const diagnostics = (page, errors, requestFailures) => {
    page.on('pageerror', error => errors.push(String(error.stack || error.message || error).split('\n')[0]));
    page.on('requestfailed', request => {
        const url = request.url();
        const message = `${url} — ${request.failure()?.errorText || 'failed'}`;
        if (!noise.test(message)) requestFailures.push(message);
    });
};

try {
    // Desktop: boot contract, shared frame/drawer, keyboard action, score, and
    // cultivation progression.
    const desktop = await browser.newPage();
    const desktopErrors = [];
    const desktopRequestFailures = [];
    diagnostics(desktop, desktopErrors, desktopRequestFailures);
    await desktop.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    await desktop.goto(`${BASE}/sword-flight.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await desktop.waitForFunction(
        () => window.game
            && window.sfRuntime?.frame && window.sfRuntime?.drawer && window.sfRuntime?.chrome,
        { timeout: 15000 },
    );

    const boot = await desktop.evaluate(() => {
        const shell = document.querySelector('.game-shell');
        const canvas = document.getElementById('sf-canvas');
        const rect = canvas.getBoundingClientRect();
        return {
            startVisible: !document.getElementById('sf-overlay-start').classList.contains('hidden'),
            shell: !!shell,
            canvasRatio: rect.width / rect.height,
            canvasBacking: [canvas.width, canvas.clientWidth, canvas.height, canvas.clientHeight],
            frameChrome: parseFloat(getComputedStyle(shell).getPropertyValue('--frame-chrome')),
            topbarIsChild: !!shell?.querySelector(':scope > .game-topbar'),
            footerIsChild: !!shell?.querySelector(':scope > .game-footer'),
            drawer: !!window.sfDrawer,
            runtimeGame: window.sfRuntime.game === window.game,
            touchAction: getComputedStyle(canvas).touchAction,
        };
    });
    check(boot.startVisible, '桌面端保留 Sword Flight 开始菜单');
    check(boot.shell && Math.abs(boot.canvasRatio - 0.75) < 0.01, '桌面端画布保持 480×640 比例', boot.canvasRatio.toFixed(4));
    check(boot.canvasBacking[0] >= boot.canvasBacking[1] && boot.canvasBacking[2] >= boot.canvasBacking[3],
        '桌面端画布后备缓冲覆盖 CSS 尺寸', boot.canvasBacking.join(' / '));
    check(Number.isFinite(boot.frameChrome) && boot.topbarIsChild && boot.footerIsChild,
        '桌面端共享 frame chrome 已收敛', `${boot.frameChrome}px`);
    check(boot.drawer && boot.runtimeGame, 'window.game 与共享 runtime/drawer 均已挂载');
    check(boot.touchAction === 'none', '画布保留 touch-action:none', boot.touchAction);

    await desktop.click('#sf-btn-endless');
    await desktop.waitForFunction(() => window.game?.isPlaying && window.game.mode === 'endless', { timeout: 5000 });
    const running = await desktop.evaluate(() => ({
        mode: window.game.mode,
        hudVisible: !document.getElementById('sf-in-hud').classList.contains('hidden'),
        touchHidden: document.getElementById('sf-touch-controls').classList.contains('hidden'),
        score: window.game.score,
        lives: window.game.player.lives,
    }));
    check(running.mode === 'endless' && running.hudVisible && !running.touchHidden,
        '桌面端可启动无尽模式', JSON.stringify(running));
    check(running.score === 0 && running.lives === 3, '启动时计分与生命状态保持基线', JSON.stringify(running));

    await desktop.keyboard.press('Space');
    const keyboardAction = await desktop.evaluate(() => ({
        dashTimer: window.game.player.dashTimer,
        qi: window.game.player.qi,
        chromePause: document.getElementById('sf-btn-pause').getAttribute('aria-label'),
    }));
    check(keyboardAction.dashTimer > 0 && keyboardAction.qi < 100, '桌面端空格仍触发破空与真气消耗', JSON.stringify(keyboardAction));
    check(Boolean(keyboardAction.chromePause), 'swordFlightChrome 仍驱动暂停按钮文案');

    const scoring = await desktop.evaluate(() => {
        const g = window.game;
        g.isPlaying = false;
        g.isPaused = false;
        g.score = 0;
        g.combo = 1;
        g.ringsThreaded = 0;
        g.player.qi = 50;
        g.player.ultEnergy = 0;
        g.handleRingThreaded({ x: g.player.x, y: g.player.y });
        const ring = { score: g.score, combo: g.combo, qi: g.player.qi, ultEnergy: g.player.ultEnergy };
        g.player.realmIndex = 0;
        g.player.swordCount = 1;
        g.score = 1500;
        g.checkCultivationBreakthrough();
        return { ring, realmIndex: g.player.realmIndex, swordCount: g.player.swordCount, realmText: document.getElementById('sf-realm-text').textContent };
    });
    check(scoring.ring.score === 200 && scoring.ring.combo === 2 && scoring.ring.qi === 68 && scoring.ring.ultEnergy === 8,
        '穿环计分、连击、真气和极意保持不变', JSON.stringify(scoring.ring));
    check(scoring.realmIndex === 1 && scoring.swordCount === 3, '1500 分仍推进至第二境并召出伴生剑', JSON.stringify(scoring));
    check(desktopErrors.length === 0, '桌面端无 pageerror', desktopErrors.join(' | '));
    check(desktopRequestFailures.length === 0, '桌面端无业务资源请求失败', desktopRequestFailures.join(' | '));
    await desktop.close();

    // Mobile: real touchscreen steering/action controls and daily challenge UI.
    const mobile = await browser.newPage();
    const mobileErrors = [];
    const mobileRequestFailures = [];
    diagnostics(mobile, mobileErrors, mobileRequestFailures);
    await mobile.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await mobile.evaluateOnNewDocument(() => {
        try { localStorage.clear(); } catch (e) { /* isolated smoke state */ }
    });
    await mobile.goto(`${BASE}/sword-flight.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await mobile.waitForFunction(() => window.game, { timeout: 15000 });
    await mobile.click('#sf-btn-endless');
    await mobile.waitForFunction(() => window.game?.isPlaying && window.game.mode === 'endless', { timeout: 5000 });

    const mobileBoot = await mobile.evaluate(() => {
        const canvas = document.getElementById('sf-canvas');
        const rect = canvas.getBoundingClientRect();
        const controls = document.getElementById('sf-touch-controls');
        return {
            canvas: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
            touchAction: getComputedStyle(canvas).touchAction,
            controlsVisible: !controls.classList.contains('hidden') && controls.getAttribute('aria-hidden') === 'false',
            actionButtons: [...controls.querySelectorAll('button')].map(button => button.id),
            scrollY: window.scrollY,
            target: { x: window.game.player.targetX, y: window.game.player.targetY },
        };
    });
    check(mobileBoot.controlsVisible && mobileBoot.actionButtons.length === 3,
        '移动端显示三枚动作按钮', mobileBoot.actionButtons.join(', '));
    check(mobileBoot.touchAction === 'none', '移动端画布禁用页面手势滚动', mobileBoot.touchAction);

    const startX = Math.round(mobileBoot.canvas.left + mobileBoot.canvas.width * 0.25);
    const startY = Math.round(mobileBoot.canvas.top + mobileBoot.canvas.height * 0.35);
    const endX = Math.round(mobileBoot.canvas.left + mobileBoot.canvas.width * 0.78);
    const endY = Math.round(mobileBoot.canvas.top + mobileBoot.canvas.height * 0.58);
    await mobile.touchscreen.touchStart(startX, startY);
    await mobile.touchscreen.touchMove(endX, endY);
    await mobile.touchscreen.touchEnd();
    const steered = await mobile.evaluate(() => ({
        target: { x: window.game.player.targetX, y: window.game.player.targetY },
        scrollY: window.scrollY,
    }));
    check(Math.abs(steered.target.x - 374.4) < 8 && Math.abs(steered.target.y - 371.2) < 8,
        '移动端真实触摸拖动仍映射到逻辑坐标', JSON.stringify(steered));
    check(steered.scrollY === 0, '移动端御剑拖动不滚动页面', `scrollY=${steered.scrollY}`);

    await mobile.tap('#sf-touch-dash');
    const touchAction = await mobile.evaluate(() => ({
        dashTimer: window.game.player.dashTimer,
        qi: window.game.player.qi,
    }));
    check(touchAction.dashTimer > 0 && touchAction.qi < 100, '移动端破空按钮仍触发动作与真气消耗', JSON.stringify(touchAction));

    await mobile.evaluate(() => window.game.returnToMenu());
    await mobile.waitForFunction(() => !window.game.isPlaying && !document.getElementById('sf-overlay-start').classList.contains('hidden'), { timeout: 5000 });
    await mobile.click('#sf-btn-daily');
    await mobile.waitForFunction(() => !document.getElementById('sf-daily-card').classList.contains('hidden'), { timeout: 5000 });
    const dailyCard = await mobile.$eval('#sf-daily-date', node => node.textContent);
    check(/\d{4}-\d{2}-\d{2}/.test(dailyCard), '每日挑战仍显示 UTC+8 日期键', dailyCard);
    await mobile.click('#sf-btn-start-daily');
    await mobile.waitForFunction(() => window.game?.isPlaying && window.game.mode === 'daily', { timeout: 5000 });
    const daily = await mobile.evaluate(() => ({
        mode: window.game.mode,
        startHidden: document.getElementById('sf-overlay-start').classList.contains('hidden'),
        // The card remains inside the start overlay. Assert effective visibility,
        // not a hidden class on this child that the original game never added.
        dailyCardHidden: document.getElementById('sf-daily-card').getClientRects().length === 0,
    }));
    check(daily.mode === 'daily' && daily.startHidden && daily.dailyCardHidden,
        '每日挑战按钮仍进入 daily 模式', JSON.stringify(daily));
    check(mobileErrors.length === 0, '移动端无 pageerror', mobileErrors.join(' | '));
    check(mobileRequestFailures.length === 0, '移动端无业务资源请求失败', mobileRequestFailures.join(' | '));
    await mobile.close();
} finally {
    await browser.close();
}

if (failures.length) {
    console.error(`\nFAIL ${failures.length} 项:`);
    failures.forEach(failure => console.error(`  ✗ ${failure}`));
    process.exit(1);
}
console.log('\nPASS Sword Flight 源码/构建运行时冒烟全部通过 ✅');
