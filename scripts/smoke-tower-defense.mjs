#!/usr/bin/env node
// Runtime smoke for the immersive Tower Defense pass.
// The same script runs against the source server and against dist/ via
// run-smoke-dist.mjs, so hashed production URLs get exercised too.
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';

const BASE = process.argv.find(arg => arg.startsWith('http')) || 'http://127.0.0.1:8899';
const failures = [];
const check = (condition, label, detail = '') => {
    if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
    console.log(`${condition ? '✓' : '✗'} ${label}${detail ? ` (${detail})` : ''}`);
};
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: LAUNCH_ARGS });
const page = await browser.newPage();
const pageErrors = [];
const requestFailures = [];
page.on('pageerror', error => pageErrors.push(String(error.stack || error.message || error).split('\n')[0]));
page.on('requestfailed', request => requestFailures.push(`${request.url()} — ${request.failure()?.errorText || 'failed'}`));

await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
await page.goto(`${BASE}/tower-defense.html`, { waitUntil: 'networkidle2', timeout: 30000 });
await page.waitForFunction(() => window.tdGame && window.__TD_ART__?.status, { timeout: 15000 });

const boot = await page.evaluate(() => ({
    art: window.__TD_ART__,
    stage: (() => { const r = document.querySelector('.td-stage').getBoundingClientRect(); return { width: r.width, height: r.height }; })(),
    canvas: (() => { const c = document.getElementById('td-canvas'); const r = c.getBoundingClientRect(); return { width: r.width, height: r.height, backingW: c.width, backingH: c.height }; })(),
    map: window.__TD_GRID__,
    artState: document.documentElement.dataset.tdArt,
    legacyDrawer: !!window.tdDrawer || !!document.querySelector('#tdStatsDrawer, .game-drawer-panel'),
    immersive: !!document.querySelector('.game-shell--immersive.game-shell') && !!document.querySelector('.game-stage--immersive'),
}));
check(boot.immersive, '页面使用 immersive shell / stage');
check(boot.artState === 'ready' && boot.art.status === 'ready', '生产美术资源进入 ready 状态', JSON.stringify(boot.art));
check(boot.art.loaded === 8 && boot.art.failed.length === 0, '八组生产资源均已加载', `${boot.art.loaded}/8`);
check(Object.values(boot.art.keys || {}).every(info => info?.complete && info.naturalWidth > 0), '关键图片 complete 且 naturalWidth > 0');
check(boot.stage.width <= 800.5 && boot.canvas.backingW > 0, '桌面战场不超过 800px 且画布有后备缓冲', `${boot.stage.width}px / ${boot.canvas.backingW} backing`);
check(boot.map.buildableCount >= 190, '运行时 active map 保留 ≥190 个可建格', boot.map.buildableCount);
check(!boot.legacyDrawer, '不存在旧 stats drawer / tdDrawer');
check(requestFailures.length === 0, '启动阶段无资源请求失败', requestFailures.join(' | '));

// Mobile landscape must keep the long start menu in normal document flow.
// The immersive battlefield is fixed-height only after the player starts;
// before that, the page needs to release clipping and allow a vertical swipe
// to reach the Deploy button.
const menuPage = await browser.newPage();
const menuErrors = [];
menuPage.on('pageerror', error => menuErrors.push(String(error.stack || error.message || error).split('\n')[0]));
await menuPage.setViewport({ width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await menuPage.goto(`${BASE}/tower-defense.html`, { waitUntil: 'networkidle2', timeout: 30000 });
await menuPage.waitForFunction(() => window.tdGame?.state === 'menu', { timeout: 15000 });
const menuLayout = await menuPage.evaluate(() => {
    const stage = document.querySelector('.td-stage');
    const overlay = document.querySelector('#td-start');
    const play = document.querySelector('#td-btn-play');
    const stageStyle = getComputedStyle(stage);
    const overlayStyle = getComputedStyle(overlay);
    const rect = play.getBoundingClientRect();
    return {
        stageHeight: stage.getBoundingClientRect().height,
        viewportHeight: globalThis.innerHeight,
        documentHeight: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
        stageOverflow: stageStyle.overflow,
        stageTouchAction: stageStyle.touchAction,
        overlayPosition: overlayStyle.position,
        overlayOverflow: overlayStyle.overflow,
        playTop: rect.top + globalThis.scrollY,
        playBottom: rect.bottom + globalThis.scrollY,
    };
});
check(menuLayout.stageOverflow === 'visible', '844×390 横屏开始菜单释放舞台裁剪', menuLayout.stageOverflow);
check(menuLayout.stageTouchAction === 'auto', '844×390 横屏开始菜单允许页面滚动', menuLayout.stageTouchAction);
check(menuLayout.overlayPosition === 'relative' && menuLayout.overlayOverflow === 'visible',
    '横屏开始菜单进入正常文档流', `${menuLayout.overlayPosition}/${menuLayout.overlayOverflow}`);
check(menuLayout.documentHeight >= menuLayout.playBottom - 1, '开始按钮位于可滚动文档范围内',
    `${menuLayout.documentHeight} >= ${menuLayout.playBottom}`);
await menuPage.evaluate(() => {
    const play = document.querySelector('#td-btn-play');
    const rect = play.getBoundingClientRect();
    window.scrollTo(0, Math.max(0, rect.top + globalThis.scrollY - globalThis.innerHeight * 0.6));
});
await wait(120);
const menuAfterScroll = await menuPage.evaluate(() => {
    const play = document.querySelector('#td-btn-play');
    const rect = play.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return {
        scrollY: globalThis.scrollY,
        visible: rect.top >= 0 && rect.bottom <= globalThis.innerHeight,
        hitPlay: hit === play || !!hit?.closest?.('#td-btn-play'),
    };
});
check(menuAfterScroll.scrollY > 0 || menuLayout.playBottom <= menuLayout.viewportHeight,
    '横屏开始菜单可以滚动到 Deploy 按钮', `scrollY=${menuAfterScroll.scrollY}`);
check(menuAfterScroll.visible && menuAfterScroll.hitPlay, '滚动后 Deploy 按钮可命中', JSON.stringify(menuAfterScroll));
await menuPage.click('#td-btn-play');
await menuPage.waitForFunction(() => window.tdGame?.state === 'playing', { timeout: 5000 });
const gameplayLayout = await menuPage.evaluate(() => {
    const stage = document.querySelector('.td-stage');
    const canvas = document.querySelector('#td-canvas');
    const topbar = document.querySelector('.td-topbar');
    const footer = document.querySelector('.td-footer');
    const style = getComputedStyle(stage);
    const stageRect = stage.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    return {
        display: style.display,
        position: style.position,
        height: style.height,
        overflow: style.overflow,
        touchAction: style.touchAction,
        stageRect: {
            top: stageRect.top,
            left: stageRect.left,
            right: stageRect.right,
            bottom: stageRect.bottom,
            width: stageRect.width,
            height: stageRect.height,
        },
        canvasRect: { width: canvasRect.width, height: canvasRect.height },
        viewport: { width: globalThis.innerWidth, height: globalThis.innerHeight },
        topbarPosition: getComputedStyle(topbar).position,
        bodyOverflow: getComputedStyle(document.body).overflow,
        footerDisplay: getComputedStyle(footer).display,
    };
});
check(
    gameplayLayout.display === 'block'
        && gameplayLayout.position === 'fixed'
        && gameplayLayout.height !== 'auto'
        && gameplayLayout.overflow === 'hidden'
        && gameplayLayout.touchAction === 'none',
    '横屏点击 Deploy 后进入全视口沉浸式战场',
    JSON.stringify(gameplayLayout),
);
check(
    Math.abs(gameplayLayout.stageRect.top) <= 1
        && Math.abs(gameplayLayout.stageRect.left) <= 1
        && Math.abs(gameplayLayout.stageRect.right - gameplayLayout.viewport.width) <= 1
        && Math.abs(gameplayLayout.stageRect.bottom - gameplayLayout.viewport.height) <= 1,
    '844×390 战斗舞台铺满整个可视口',
    JSON.stringify(gameplayLayout.stageRect),
);
check(
    gameplayLayout.canvasRect.height >= gameplayLayout.viewport.height - 1
        && Math.abs(gameplayLayout.canvasRect.width / gameplayLayout.canvasRect.height - 4 / 3) < 0.01,
    '横屏战场用满手机高度且保持 800×600 比例',
    JSON.stringify(gameplayLayout.canvasRect),
);
check(
    gameplayLayout.topbarPosition === 'fixed'
        && gameplayLayout.bodyOverflow === 'hidden'
        && gameplayLayout.footerDisplay === 'none',
    '战斗 HUD 悬浮且页脚不再占用手机首屏',
    JSON.stringify(gameplayLayout),
);
check(menuErrors.length === 0, '横屏开始菜单无 pageerror', menuErrors.join(' | '));
await menuPage.close();

await page.click('#td-btn-play');
await page.waitForFunction(() => window.tdGame?.state === 'playing', { timeout: 5000 });

const battlefield = await page.evaluate(() => {
    const g = window.tdGame;
    const canvas = document.getElementById('td-canvas');
    const rect = canvas.getBoundingClientRect();
    const grid = window.__TD_GRID__;
    const levels = window.__TD_LEVELS__;
    const firstSignature = grid.signature;
    const firstMap = { ground: g.map.groundPath.total, buildable: g.map.buildableCount, signature: firstSignature };
    // Place one of each tower type beside the authored route. The smoke grants
    // credits only inside this test page; no gameplay balance is changed.
    g.gold = 9999;
    const cells = [];
    for (let r = 0; r < grid.ROWS; r++) {
        for (let c = 0; c < grid.COLS; c++) {
            if (grid.pathGrid[r * grid.COLS + c] || g.towerAt(c, r) >= 0) continue;
            const adjacent = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dr]) => {
                const nc = c + dc, nr = r + dr;
                return nc >= 0 && nc < grid.COLS && nr >= 0 && nr < grid.ROWS && grid.pathGrid[nr * grid.COLS + nc];
            });
            if (adjacent) cells.push({ c, r });
        }
    }
    for (const [index, type] of ['pulse', 'frost', 'cannon', 'tesla'].entries()) {
        g.selectedCell = cells[index];
        g.selectedTowerIdx = -1;
        g.tryBuild(type);
    }
    const towerCount = g.towers.filter(Boolean).length;
    const firstTower = g.towers.find(Boolean);
    // Put a target on the compiled route and force one attack cycle so the
    // smoke observes a real projectile/effect and a rotated tower.
    g.spawnEnemy('normal', Math.min(140, g.map.groundPath.total - 1));
    const target = g.enemies[g.enemies.length - 1];
    const beforeProjectiles = g.projectiles.length;
    for (const tower of g.towers) if (tower) { tower.cooldown = 0; g.fireTower(tower); }
    const projectileCount = g.projectiles.length;
    const rotated = g.towers.filter(Boolean).some(tower => Number.isFinite(tower.angle) && tower.angle !== -Math.PI / 2);
    g.empCd = 0;
    g.castEmp();
    const empReady = g.empCd > 0 && g.effects.some(effect => effect.kind === 'emp_wave');
    g.boostCd = 0;
    g.castOverdrive();
    const overdriveReady = g.boostCd > 0 && g.overdriveUntil > g.time;
    // Exercise a real wave spawn as well as the direct mechanism probes.
    g.enemies.length = 0;
    g.projectiles.length = 0;
    g.startWave();
    g.spawnTimer = 0;
    g.update(0.5);
    const waveSpawned = g.wave === 1 && (g.enemies.length > 0 || g.spawnQueue.length > 0);

    const skyfall = levels.find(level => level.id === 'skyfall');
    g.level = skyfall;
    g.resetRun();
    const skyfallMap = { ground: g.map.groundPath.total, air: g.map.airPath.total, signature: g.map.signature };
    g.level = levels.find(level => level.id === 'outpost');
    g.resetRun();
    return {
        firstMap, skyfallMap, towerCount, targetType: target.type,
        projectileCount, beforeProjectiles, rotated, empReady, overdriveReady, waveSpawned,
        canvas: { width: rect.width, height: rect.height, ratio: rect.width / rect.height },
        state: g.state,
        firstTowerType: firstTower?.type,
    };
});
check(battlefield.towerCount === 4, '四种塔均可建造', `建成 ${battlefield.towerCount}`);
check(battlefield.projectileCount > battlefield.beforeProjectiles || battlefield.empReady, '投射物 / 命中特效正常生成');
check(battlefield.rotated, '塔能根据目标旋转');
check(battlefield.empReady && battlefield.overdriveReady, 'EMP 与 Overdrive 技能可施放');
check(battlefield.waveSpawned, '点击发波后 active wave 开始出怪');
check(battlefield.skyfallMap.signature !== battlefield.firstMap.signature && battlefield.skyfallMap.air < battlefield.skyfallMap.ground, '切换关卡同步路径，并保留 flyer 空中捷径');
check(Math.abs(battlefield.canvas.ratio - 4 / 3) < 0.02, '桌面战场保持 4:3', battlefield.canvas.ratio.toFixed(3));

// Tactical panel is page-owned, not the shared bottom drawer.
await page.click('#tdStatsToggle');
const panelOpen = await page.evaluate(() => ({
    expanded: document.getElementById('tdStatsToggle').getAttribute('aria-expanded'),
    visible: !document.getElementById('tdTacticalPanel').classList.contains('hidden'),
    controls: document.getElementById('tdStatsToggle').getAttribute('aria-controls'),
}));
check(panelOpen.expanded === 'true' && panelOpen.visible && panelOpen.controls === 'tdTacticalPanel', 'Stats 打开舞台内 tactical panel 且 ARIA 正确');
await page.keyboard.press('Escape');
check(await page.$eval('#tdTacticalPanel', element => element.classList.contains('hidden')), 'Esc 关闭 tactical panel');

// Rotation contract: portrait prompts instead of shrinking the battle into a
// hard-to-tap card, while landscape keeps the logical scene aspect ratio.
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
await wait(350);
const portrait = await page.$eval('#td-rotate-prompt', element => element.classList.contains('is-active'));
check(portrait, '390×844 竖屏显示旋转提示');
await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 2 });
await wait(350);
const landscape = await page.evaluate(() => {
    const prompt = document.getElementById('td-rotate-prompt');
    const rect = document.getElementById('td-canvas').getBoundingClientRect();
    return { prompt: prompt.classList.contains('is-active'), ratio: rect.width / rect.height, width: rect.width, height: rect.height };
});
check(!landscape.prompt, '844×390 横屏关闭旋转提示');
check(Math.abs(landscape.ratio - 4 / 3) < 0.02, '横屏仍保持完整 4:3 战场', `${landscape.width.toFixed(1)}×${landscape.height.toFixed(1)}`);

// The loader must fail soft. This uses the same runtime loader with a test-only
// URL map; the actual game remains on the successfully loaded production pack.
const fallback = await page.evaluate(async () => {
    const keys = Object.keys(window.__TD_ART__.keys);
    const urls = Object.fromEntries(keys.map(key => [key, '/__td_missing_art__/' + key + '.svg']));
    const art = window.__TD_CREATE_ART__({ timeout: 120, urls });
    const result = await art.ready;
    return { status: result.status, failed: art.failedKeys.length, loaded: art.loadedCount };
});
check(fallback.status === 'fallback' && fallback.failed === 8 && fallback.loaded === 0, '生产资源失败时 loader 可降级到 fallback', JSON.stringify(fallback));

check(pageErrors.length === 0, 'runtime 无 pageerror', pageErrors.join(' | '));
if (failures.length) {
    console.error(`\nsmoke-tower-defense：${failures.length} 项失败 ❌`);
    failures.forEach(failure => console.error(`✗ ${failure}`));
    await browser.close();
    process.exit(1);
}
console.log(`\nsmoke-tower-defense 全部通过 ✅（${BASE}）`);
await browser.close();
