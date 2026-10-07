#!/usr/bin/env node
// 针尖对麦芒生产美术烟测：资源状态、真实启动、尖端碰撞、Boss、双人、响应式与 fallback。
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { assetSignatures, installImageFailureHook, isExpectedBlockedDiagnostic } from './lib/art-request.mjs';
import { ART_URLS as NEEDLE_ART_URLS } from '../src/games/needle-awn/render/art.js';

const CRITICAL_ART_SIGNATURES = assetSignatures([
    ...Object.values(NEEDLE_ART_URLS.layers),
    ...Object.values(NEEDLE_ART_URLS.bosses),
    ...Object.values(NEEDLE_ART_URLS.ui),
]);

const BASE = process.argv.find(arg => arg.startsWith('http')) || 'http://127.0.0.1:8899';
const fails = [];
const fail = message => fails.push(message);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function isIgnorable(message) {
    return /analytics\.js|sw-register\.js|manifest|apple-touch-icon|favicon|game-scores|games-analytics|CORS/i.test(message);
}

async function setupPage(page, { blockArt = false } = {}) {
    const pageErrors = [];
    const consoleErrors = [];
    const failedRequests = [];
    const blockedArtUrls = [];
    page.on('pageerror', error => pageErrors.push(String(error.message || error).split('\n')[0]));
    page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(`${message.text().split('\n')[0]} @ ${message.location()?.url || ''}`);
    });
    page.on('requestfailed', request => failedRequests.push(request.url()));
    if (blockArt) {
        await installImageFailureHook(page, CRITICAL_ART_SIGNATURES);
    }
    await page.evaluateOnNewDocument(() => {
        try {
            localStorage.clear();
            localStorage.setItem('site_lang', 'zh');
        } catch { /* storage is optional in private contexts */ }
    });
    await page.goto(`${BASE}/needle-awn.html`, { waitUntil: 'networkidle0', timeout: 45000 });
    await page.waitForFunction(() => window.gameEngine && ['ready', 'fallback'].includes(document.getElementById('na-stage')?.dataset.artState), { timeout: 15000 });
    if (blockArt) {
        blockedArtUrls.push(...await page.evaluate(() => window.__testBlockedArtUrls || []));
    }
    await wait(180);
    return { pageErrors, consoleErrors, failedRequests, blockArt, blockedArtUrls };
}

async function collectDiagnostics(diagnostics, label) {
    for (const message of diagnostics?.pageErrors || []) if (!isIgnorable(message)) fail(`${label} 页面错误: ${message}`);
    for (const message of diagnostics?.consoleErrors || []) {
        const expectedBlockedArt = diagnostics?.blockArt
            && isExpectedBlockedDiagnostic(message, diagnostics.blockedArtUrls || []);
        if (!expectedBlockedArt && !isIgnorable(message)) fail(`${label} console 错误: ${message}`);
    }
    for (const url of diagnostics?.failedRequests || []) {
        const expectedBlockedArt = diagnostics?.blockArt
            && (diagnostics.blockedArtUrls || []).includes(url);
        if (!expectedBlockedArt && !isIgnorable(url)) fail(`${label} 请求失败: ${url}`);
    }
}

async function assertNormalPage() {
    const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: LAUNCH_ARGS });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    let diagnostics;
    try {
        diagnostics = await setupPage(page);
        const boot = await page.evaluate(() => {
            const stage = document.getElementById('na-stage');
            const canvas = document.getElementById('na-canvas');
            return {
                hasGame: !!window.gameEngine,
                state: window.gameEngine?.state,
                artState: stage?.dataset.artState,
                canvas: [canvas?.width, canvas?.height],
                sceneReady: !!window.gameEngine?.scene,
                manifest: window.gameEngine?.scene?.manifest?.coordinateSystem,
                stanceIcon: document.getElementById('na-stance-icon')?.getAttribute('src'),
                lotusIcon: document.querySelector('[data-art-ui="lotus-mark"]')?.getAttribute('src'),
                gatedDisabled: [...document.querySelectorAll('[data-art-gated]')].some(button => button.disabled),
                touchAction: getComputedStyle(canvas).touchAction,
                hasJoystick: !!document.getElementById('na-joy'),
                hasTouchButtons: ['na-touch-dash', 'na-touch-stance', 'na-touch-ult'].every(id => !!document.getElementById(id)),
            };
        });
        if (!boot.hasGame || boot.state !== 'menu' || boot.artState !== 'ready' || !boot.sceneReady) fail(`boot state 异常: ${JSON.stringify(boot)}`);
        if (boot.canvas.some(value => !value) || boot.manifest?.width !== 480 || boot.manifest?.height !== 640) fail(`逻辑画布契约异常: ${JSON.stringify(boot)}`);
        if (!boot.stanceIcon || !boot.lotusIcon || boot.gatedDisabled || boot.touchAction !== 'none' || !boot.hasJoystick || !boot.hasTouchButtons) {
            fail(`正式 UI / 触控接线异常: ${JSON.stringify(boot)}`);
        }

        await page.click('#na-btn-levels');
        await page.waitForSelector('#na-level-grid .unlocked', { visible: true });
        await page.click('#na-level-grid .unlocked');
        const levelOne = await page.evaluate(() => ({
            state: window.gameEngine.state,
            level: window.gameEngine.currentLevel,
            enemies: window.gameEngine.enemies.length,
            playerTipDistance: window.gameEngine.player.tipDistance,
            enemyTipDistance: window.gameEngine.enemies[0]?.tipDistance,
        }));
        if (levelOne.state !== 'playing' || levelOne.level !== 1 || levelOne.enemies !== 1 || levelOne.playerTipDistance !== 22 || levelOne.enemyTipDistance !== 20) {
            fail(`关卡 1 启动或碰撞几何异常: ${JSON.stringify(levelOne)}`);
        }

        await page.evaluate(() => document.activeElement?.blur());
        await page.keyboard.press('p');
        const pausedByP = await page.evaluate(() => ({
            state: window.gameEngine.state,
            overlayVisible: !document.getElementById('na-overlay-pause')?.classList.contains('hidden'),
            chromeLabel: document.getElementById('na-btn-pause')?.getAttribute('aria-label'),
        }));
        if (pausedByP.state !== 'paused' || !pausedByP.overlayVisible || !pausedByP.chromeLabel?.includes('继续')) {
            fail(`P 暂停或暂停 UI/标签未同步: ${JSON.stringify(pausedByP)}`);
        }

        await page.keyboard.press('Escape');
        const resumedByEscape = await page.evaluate(() => ({
            state: window.gameEngine.state,
            overlayHidden: document.getElementById('na-overlay-pause')?.classList.contains('hidden'),
            chromeLabel: document.getElementById('na-btn-pause')?.getAttribute('aria-label'),
        }));
        if (resumedByEscape.state !== 'playing' || !resumedByEscape.overlayHidden || !resumedByEscape.chromeLabel?.includes('暂停')) {
            fail(`Escape 恢复或暂停 UI/标签未同步: ${JSON.stringify(resumedByEscape)}`);
        }

        await page.click('#na-btn-pause');
        const focusedPause = await page.evaluate(() => ({
            state: window.gameEngine.state,
            activeId: document.activeElement?.id,
            overlayVisible: !document.getElementById('na-overlay-pause')?.classList.contains('hidden'),
        }));
        if (focusedPause.state !== 'paused' || focusedPause.activeId !== 'na-btn-pause' || !focusedPause.overlayVisible) {
            fail(`顶栏暂停按钮未留下可复现的聚焦暂停态: ${JSON.stringify(focusedPause)}`);
        }

        await page.keyboard.press('Escape');
        const focusedEscapeResume = await page.evaluate(() => ({
            state: window.gameEngine.state,
            activeId: document.activeElement?.id,
            overlayHidden: document.getElementById('na-overlay-pause')?.classList.contains('hidden'),
            chromeLabel: document.getElementById('na-btn-pause')?.getAttribute('aria-label'),
        }));
        if (focusedEscapeResume.state !== 'playing' || !focusedEscapeResume.overlayHidden || !focusedEscapeResume.chromeLabel?.includes('暂停')) {
            fail(`控件保留焦点时 Escape 无法恢复: ${JSON.stringify(focusedEscapeResume)}`);
        }

        const yBeforeFocusedMove = await page.evaluate(() => window.gameEngine.player.y);
        await page.keyboard.down('w');
        await wait(120);
        await page.keyboard.up('w');
        const focusedMove = await page.evaluate(() => ({
            state: window.gameEngine.state,
            activeId: document.activeElement?.id,
            y: window.gameEngine.player.y,
            keyHeld: !!window.gameEngine.keys.KeyW,
        }));
        if (focusedMove.state !== 'playing' || focusedMove.y >= yBeforeFocusedMove - 1 || focusedMove.keyHeld) {
            fail(`按钮保留焦点后 WASD 仍被阻断: before=${yBeforeFocusedMove}, after=${JSON.stringify(focusedMove)}`);
        }

        await page.setViewport({ width: 390, height: 844 });
        await wait(80);
        await page.click('#naStatsToggle');
        await page.waitForFunction(() => window.naDrawer?.open && window.gameEngine.state === 'paused', { timeout: 2000 });
        const drawerPause = await page.evaluate(() => ({
            open: window.naDrawer?.open,
            pausedByDrawer: window.naDrawer?.pausedByDrawer,
            state: window.gameEngine.state,
            activeId: document.activeElement?.id,
        }));
        await page.keyboard.press('p');
        const drawerAfterP = await page.evaluate(() => ({
            open: window.naDrawer?.open,
            state: window.gameEngine.state,
        }));
        if (!drawerPause.open || !drawerPause.pausedByDrawer || drawerPause.state !== 'paused'
            || !drawerAfterP.open || drawerAfterP.state !== 'paused') {
            fail(`统计抽屉打开时 P 不应恢复游戏: before=${JSON.stringify(drawerPause)}, after=${JSON.stringify(drawerAfterP)}`);
        }

        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !window.naDrawer?.open, { timeout: 2000 });
        const drawerClosed = await page.evaluate(() => ({
            open: window.naDrawer?.open,
            state: window.gameEngine.state,
        }));
        if (drawerClosed.open || drawerClosed.state !== 'playing') {
            fail(`Escape 关闭统计抽屉后未由抽屉恢复游戏: ${JSON.stringify(drawerClosed)}`);
        }
        await page.setViewport({ width: 1280, height: 900 });
        await wait(80);

        const clash = await page.evaluate(() => {
            const game = window.gameEngine;
            game.state = 'paused';
            const player = game.player;
            const enemy = game.enemies[0];
            enemy.x = 240;
            enemy.y = 100;
            enemy.angle = Math.PI / 2;
            player.x = 240;
            player.y = 142;
            player.angle = -Math.PI / 2;
            player.isDashing = true;
            const before = game.totalClashes;
            const result = game.checkTipClash(player, enemy);
            return {
                result,
                clashes: game.totalClashes,
                score: game.score,
                enemiesLeft: game.enemies.length,
                tipDistance: [player.tipDistance, enemy.tipDistance],
                increment: game.totalClashes - before,
                clashMaxStored: JSON.parse(localStorage.getItem('game:needle-awn:v1:clashMax') || '0'),
            };
        });
        if (!clash.result || clash.increment !== 1 || clash.clashes !== 1 || clash.clashMaxStored !== 1 || clash.score <= 0 || clash.enemiesLeft !== 0 || JSON.stringify(clash.tipDistance) !== JSON.stringify([22, 20])) {
            fail(`真实针尖碰撞未按原契约触发: ${JSON.stringify(clash)}`);
        }

        const bosses = await page.evaluate(() => {
            const game = window.gameEngine;
            const result = [];
            for (const level of [5, 8, 10]) {
                game.startLevel(level);
                const boss = game.enemies[0];
                result.push({ level, type: boss?.bossType, hp: boss?.hp, tipDistance: boss?.tipDistance, chapter: game.scene.getChapter({ mode: game.mode, level: game.currentLevel }).chapterIndex });
            }
            game.startLevel(5);
            game.state = 'paused';
            const boss = game.enemies[0];
            const hpBefore = boss.hp;
            const player = game.player;
            player.x = 240;
            player.y = 156;
            player.angle = -Math.PI / 2;
            boss.x = 240;
            boss.y = 122;
            boss.angle = Math.PI / 2;
            player.isDashing = true;
            game.checkTipClash(player, boss);
            const hpAfterOne = boss.hp;
            let safety = 0;
            while (game.enemies.length && safety < 12) {
                const activeBoss = game.enemies[0];
                player.x = activeBoss.x;
                player.y = activeBoss.y + player.tipDistance + activeBoss.tipDistance;
                player.angle = -Math.PI / 2;
                activeBoss.angle = Math.PI / 2;
                player.isDashing = true;
                game.checkTipClash(player, activeBoss);
                safety += 1;
            }
            return {
                result,
                hpBefore,
                hpAfterOne,
                stunned: hpAfterOne < hpBefore && boss.stunTimer > 0,
                defeated: game.enemies.length === 0,
                safety,
            };
        });
        if (bosses.result.some(item => !item.type || item.tipDistance !== 34 || item.hp <= 0)) fail(`Boss 关卡未正确生成: ${JSON.stringify(bosses.result)}`);
        if (JSON.stringify(bosses.result.map(item => item.chapter)) !== JSON.stringify([1, 2, 2])) fail(`Boss 章节色调映射异常: ${JSON.stringify(bosses.result)}`);
        if (!bosses.stunned || !bosses.defeated) fail(`Boss HP / stun / death 异常: ${JSON.stringify(bosses)}`);

        const duel = await page.evaluate(() => {
            const game = window.gameEngine;
            game.startDuelMode();
            const before = game.player.stance;
            return {
                state: game.state,
                hasPlayer2: !!game.player2,
                player2Stance: game.player2?.stance,
                before,
                controls: document.getElementById('na-touch-controls')?.getBoundingClientRect().width > 0,
            };
        });
        if (duel.state !== 'playing' || !duel.hasPlayer2 || duel.player2Stance !== 'awn' || !duel.controls) fail(`1v1 / 触控战斗接线异常: ${JSON.stringify(duel)}`);

        await page.goto(`${BASE}/needle-awn.html?debug-hitbox=1`, { waitUntil: 'networkidle0', timeout: 45000 });
        await page.waitForFunction(() => window.gameEngine && document.getElementById('na-stage')?.dataset.artState === 'ready', { timeout: 15000 });
        const debug = await page.evaluate(() => ({ debugHitbox: window.gameEngine.debugHitbox, artState: document.getElementById('na-stage')?.dataset.artState }));
        if (!debug.debugHitbox || debug.artState !== 'ready') fail(`debug-hitbox 开关异常: ${JSON.stringify(debug)}`);

        for (const viewport of [[390, 844], [430, 932], [844, 390], [1440, 900]]) {
            await page.setViewport({ width: viewport[0], height: viewport[1] });
            await page.reload({ waitUntil: 'networkidle0', timeout: 45000 });
            await page.waitForFunction(() => window.gameEngine && ['ready', 'fallback'].includes(document.getElementById('na-stage')?.dataset.artState), { timeout: 15000 });
            const layout = await page.evaluate(() => {
                const stage = document.getElementById('na-stage')?.getBoundingClientRect();
                return {
                    viewport: window.innerWidth,
                    bodyWidth: document.body.scrollWidth,
                    stageWidth: stage?.width || 0,
                    stageHeight: stage?.height || 0,
                };
            });
            if (layout.bodyWidth > viewport[0] + 1 || layout.stageWidth <= 0 || layout.stageHeight <= 0) fail(`响应式布局异常 ${viewport.join('×')}: ${JSON.stringify(layout)}`);
        }
    } catch (error) {
        fail(`正常路径脚本异常: ${error.message}`);
    } finally {
        await collectDiagnostics(diagnostics, '正常路径');
        await browser.close();
    }
}

async function assertFallbackPage() {
    const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: LAUNCH_ARGS });
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844 });
    let diagnostics;
    try {
        diagnostics = await setupPage(page, { blockArt: true });
        const fallback = await page.evaluate(() => ({
            artState: document.getElementById('na-stage')?.dataset.artState,
            hasGame: !!window.gameEngine,
            sceneState: window.gameEngine?.scene?.getArtState(),
            canvasVisible: document.getElementById('na-canvas')?.getBoundingClientRect().width > 0,
        }));
        if (fallback.artState !== 'fallback' || fallback.sceneState !== 'fallback' || !fallback.hasGame || !fallback.canvasVisible) {
            fail(`资源失败时 fallback 未接管: ${JSON.stringify({ ...fallback, blockedArtRequests: diagnostics?.blockedArtUrls?.length || 0 })}`);
        }
        const playable = await page.evaluate(() => {
            const game = window.gameEngine;
            game.startLevel(1);
            game.state = 'paused';
            const enemy = game.enemies[0];
            const player = game.player;
            enemy.x = 240;
            enemy.y = 100;
            enemy.angle = Math.PI / 2;
            player.x = 240;
            player.y = 142;
            player.angle = -Math.PI / 2;
            player.isDashing = true;
            const clash = game.checkTipClash(player, enemy);
            return { state: game.state, clash, clashes: game.totalClashes, sceneState: game.scene.getArtState() };
        });
        if (playable.state !== 'paused' || !playable.clash || playable.clashes !== 1 || playable.sceneState !== 'fallback') {
            fail(`fallback 场景不可交互: ${JSON.stringify(playable)}`);
        }
    } catch (error) {
        fail(`fallback 路径脚本异常: ${error.message}`);
    } finally {
        await collectDiagnostics(diagnostics, 'fallback 路径');
        await browser.close();
    }
}

await assertNormalPage();
await assertFallbackPage();
if (fails.length) {
    console.error('✗ smoke-needle-awn');
    fails.forEach(message => console.error(`  - ${message}`));
    process.exit(1);
}
console.log('smoke-needle-awn：production art / clash / Boss / duel / responsive / fallback 全部通过 ✅');
