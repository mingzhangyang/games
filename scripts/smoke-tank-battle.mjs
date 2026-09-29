// Tank Battle production-art smoke: landscape shell, art readiness, controls, and canvas render.
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';

const BASE = process.argv[2] || 'http://127.0.0.1:8895';
const fails = [];
const fail = message => fails.push(message);

const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: [...LAUNCH_ARGS, '--auto-accept-this-tab-capture'],
});

const cases = [
    { name: 'desktop', width: 1280, height: 720, isMobile: false, hasTouch: false },
    { name: 'landscape-small', width: 844, height: 390, isMobile: true, hasTouch: true },
    { name: 'landscape-wide', width: 932, height: 430, isMobile: true, hasTouch: true },
];

for (const testCase of cases) {
    const page = await browser.newPage();
    await page.setViewport({
        width: testCase.width,
        height: testCase.height,
        isMobile: testCase.isMobile,
        hasTouch: testCase.hasTouch,
    });
    const errs = [];
    page.on('pageerror', error => errs.push(String(error.message || error).split('\n')[0]));
    await page.evaluateOnNewDocument(() => {
        try { localStorage.setItem('site_lang', 'zh'); } catch { /* ignore */ }
    });
    await page.goto(BASE + '/tank-battle.html', { waitUntil: 'load', timeout: 30000 });
    try {
        await page.waitForFunction(() => {
            const game = window.tankBattleInstance;
            const container = document.getElementById('gameContainer');
            const cache = game?.art?.getTerrainCacheStatus?.();
            return Boolean(
                game
                && game.art?.ready === true
                && container?.dataset.tbArtState === 'ready'
                && cache?.ready === true
            );
        }, { timeout: 10000 });
    } catch (error) {
        fail(testCase.name + ': art readiness wait failed: ' + String(error.message || error));
    }

    const snap = await page.evaluate(() => {
        const canvas = document.getElementById('gameCanvas');
        const rect = canvas?.getBoundingClientRect();
        const container = document.getElementById('gameContainer');
        const containerRect = container?.getBoundingClientRect();
        const instance = window.tankBattleInstance;
        const dpad = document.getElementById('dpad')?.getBoundingClientRect();
        const fire = document.getElementById('btnFire')?.getBoundingClientRect();
        const pixels = canvas?.getContext('2d')?.getImageData(2, 2, 1, 1).data || [];
        return {
            mainTag: !!document.querySelector('main.tb-main'),
            h1: document.querySelector('h1.sr-only')?.textContent || '',
            srOnlyHeading: (() => {
                const heading = document.querySelector('h1.sr-only');
                if (!heading) return false;
                const box = heading.getBoundingClientRect();
                return box.width <= 1 && box.height <= 1;
            })(),
            canvasSize: canvas ? canvas.width + 'x' + canvas.height : 'missing',
            canvasVisible: !!rect && rect.width > 100 && rect.height > 100,
            containerCentered: !!containerRect
                && Math.abs((window.innerWidth - containerRect.width) / 2 - containerRect.left) < 60,
            artState: container?.dataset.tbArtState || 'missing',
            loaderReady: instance?.art?.ready === true,
            terrainCache: instance?.art?.getTerrainCacheStatus?.().ready === true,
            noLegacyPhone: !document.querySelector('.phone-frame, .phone-screen'),
            orientationArt: !!document.querySelector('.rotate-device-illustration[src*="rotate-device.svg"]'),
            orientationFallback: (() => {
                const image = document.querySelector('.rotate-device-illustration');
                const fallback = document.querySelector('.rotate-device-fallback');
                if (!image || !fallback) return false;
                const imageHidden = image.hidden;
                const fallbackHidden = fallback.hidden;
                image.dispatchEvent(new Event('error'));
                const works = image.hidden && !fallback.hidden;
                image.hidden = imageHidden;
                fallback.hidden = fallbackHidden;
                return works;
            })(),
            hud: !!document.getElementById('gameInfo'),
            weaponIconAtlas: document.getElementById('weaponHudIcon')?.dataset.tbWeaponIcon === 'atlas'
                && document.getElementById('vWeaponIcon')?.dataset.tbWeaponIcon === 'atlas',
            virtualControllerVisible: (() => {
                const el = document.getElementById('virtualController');
                return el ? getComputedStyle(el).display !== 'none' : false;
            })(),
            dpadHitArea: !!dpad && dpad.width >= 100 && dpad.height >= 100,
            fireHitArea: !!fire && fire.width >= 60 && fire.height >= 60,
            pixels: [...pixels],
            bodyFlex: getComputedStyle(document.body).display === 'flex',
            layoutVarApplied: getComputedStyle(document.documentElement)
                .getPropertyValue('--frame-max').trim() !== '',
        };
    });

    if (errs.length) fail(testCase.name + ': page errors: ' + errs.join(' | '));
    if (snap.canvasSize !== '800x600') fail(testCase.name + ': canvas size ' + snap.canvasSize);
    if (!snap.canvasVisible) fail(testCase.name + ': canvas is not visible');
    if (!snap.containerCentered) fail(testCase.name + ': game container is not centered');
    if (!snap.mainTag || !snap.h1) fail(testCase.name + ': semantic main/heading is missing');
    if (!snap.srOnlyHeading) fail(testCase.name + ': h1.sr-only is not visually hidden');
    if (snap.artState !== 'ready' || !snap.loaderReady) fail(testCase.name + ': production art state is ' + snap.artState);
    if (!snap.terrainCache) fail(testCase.name + ': terrain cache was not built');
    if (!snap.noLegacyPhone || !snap.orientationArt || !snap.orientationFallback) fail(testCase.name + ': authored orientation art or fallback is not wired');
    if (!snap.hud) fail(testCase.name + ': HUD is missing');
    if (!snap.weaponIconAtlas) fail(testCase.name + ': weapon icon atlas is not visible');
    if (testCase.isMobile && (!snap.dpadHitArea || !snap.fireHitArea)) fail(testCase.name + ': virtual-controller hit area shrank');
    if (testCase.isMobile && !snap.virtualControllerVisible) fail(testCase.name + ': virtual controller is hidden');
    if (!testCase.isMobile && snap.virtualControllerVisible) fail(testCase.name + ': desktop virtual controller is visible');
    if (!snap.bodyFlex) fail(testCase.name + ': body flex centering was lost');
    if (!snap.layoutVarApplied) fail(testCase.name + ': layout.css variable is missing');
    if (snap.pixels.length !== 4 || snap.pixels.every(value => value === 0)) fail(testCase.name + ': canvas appears blank');

    const gameplay = await page.evaluate(() => {
        const game = window.tankBattleInstance;
        if (!game) return { error: 'instance missing' };

        const result = {};
        const makeBullet = y => ({
            x: 100,
            y,
            width: 4,
            height: 4,
            direction: 2,
            speed: 6,
            isPlayer: true,
            update(dt) {
                this.y += this.speed * dt;
                return true;
            },
        });

        game.gameState = 'playing';
        game.paused = true;
        game.enemies = [];
        game.powerUps = [];
        game.bullets = [];
        result.authoredSprites = [
            'tanks.player', 'tanks.enemy', 'tanks.boss',
            'powerups.health', 'ui.minimapFrame', 'ui.weaponIcons'
        ].every(key => game.art.has(key));
        result.spriteHitbox = game.player.width === 30 && game.player.height === 30;

        const recordingContext = {
            rotations: [],
            save() {},
            restore() {},
            translate() {},
            rotate(value) { this.rotations.push(value); },
            drawImage() {},
        };
        const expectedVectors = [[0, -1], [1, 0], [0, 1], [-1, 0]];
        const originalDirection = game.player.direction;
        const bulletVectors = expectedVectors.map(([expectedX, expectedY], direction) => {
            game.player.direction = direction;
            game.bullets = [];
            game.shoot(game.player);
            const bullet = game.bullets[0];
            const startX = bullet.x;
            const startY = bullet.y;
            bullet.update(1);
            return {
                direction: bullet.direction,
                x: Math.sign(bullet.x - startX),
                y: Math.sign(bullet.y - startY),
                expectedX,
                expectedY,
            };
        });
        game.bullets = [];
        game.player.direction = originalDirection;
        const barrelDirections = expectedVectors.map(([expectedX, expectedY], direction) => {
            recordingContext.rotations = [];
            const rendered = game.art.drawTank(recordingContext, {
                x: 0,
                y: 0,
                width: 30,
                height: 30,
                direction,
                isPlayer: true,
                isBoss: false,
            });
            const vector = game.art.getTankDirectionVector(direction);
            return rendered
                && recordingContext.rotations.length === 1
                && Math.abs(recordingContext.rotations[0] - game.art.getTankRotation(direction)) < 0.0001
                && vector.x === expectedX
                && vector.y === expectedY;
        });
        result.barrelOrientation = barrelDirections.every(Boolean)
            && bulletVectors.every(({ direction, x, y, expectedX, expectedY }) =>
                direction >= 0
                && direction <= 3
                && x === expectedX
                && y === expectedY
            );

        game.walls = [{ x: 100, y: 100, width: 20, height: 20, destructible: true, type: 'brick' }];
        game.bullets = [makeBullet(96)];
        game.updateBullets(1);
        result.brickCollision = game.walls.length === 0 && game.bullets.length === 0;

        game.walls = [{ x: 100, y: 100, width: 20, height: 20, destructible: false, type: 'steel' }];
        game.bullets = [makeBullet(96)];
        const particlesBeforeSteel = game.particles.length;
        game.updateBullets(1);
        result.steelCollision = game.walls.length === 1
            && game.bullets.length === 0
            && game.particles.length > particlesBeforeSteel;

        game.walls = [];
        game.score = 0;
        game.player.health = game.player.maxHealth - 1;
        const pickup = {
            x: game.player.x,
            y: game.player.y,
            width: 20,
            height: 20,
            type: 'health',
            collected: false,
            update() {},
            getColor() { return '#ff4444'; },
        };
        game.powerUps = [pickup];
        game.updatePowerUps(1);
        result.pickupCollision = game.powerUps.length === 0
            && game.player.health === game.player.maxHealth
            && game.score === 50;

        game.level = 5;
        game.createEnemies();
        result.enemyAndBoss = game.enemies.length >= 3 && game.enemies.some(enemy => enemy.isBoss);
        game.enemies = [];

        game.switchWeapon(1);
        result.weaponSwitch = game.currentWeaponIndex === 1
            && game.player.weapon?.nameKey === 'weapons.rapid'
            && document.getElementById('weaponHudIcon')?.dataset.tbWeaponIcon === 'atlas';

        game.paused = false;
        game.togglePause();
        result.pause = game.paused === true;
        game.togglePause();

        game.renderMiniMap();
        const beforeMap = new Uint8ClampedArray(game.miniMapCtx.getImageData(0, 0, 120, 90).data);
        const originalX = game.player.x;
        game.player.x = originalX + 100;
        game.renderMiniMap();
        const afterMap = game.miniMapCtx.getImageData(0, 0, 120, 90).data;
        result.minimap = beforeMap.some((value, index) => value !== afterMap[index]);
        game.player.x = originalX;

        game.gameState = 'playing';
        game.lives = 1;
        game.player.health = 1;
        game.player.invulnerable = 0;
        game.bullets = [{ x: game.player.x, y: game.player.y, width: 4, height: 4, damage: 1, isPlayer: false }];
        game.checkCollisions();
        result.gameOver = game.gameState === 'gameOver';

        game.gameState = 'playing';
        game.level = 10;
        game.enemies = [];
        game.checkWinCondition();
        result.victory = game.gameState === 'victory';

        game.gameState = 'playing';
        game.paused = true;
        game.bullets = [];
        game.powerUps = [];
        game.enemies = [];
        game.walls = [];
        game.render();
        return result;
    });
    for (const check of [
        'authoredSprites', 'spriteHitbox', 'barrelOrientation', 'brickCollision', 'steelCollision',
        'pickupCollision', 'enemyAndBoss', 'weaponSwitch', 'pause', 'minimap',
        'gameOver', 'victory'
    ]) {
        if (!gameplay[check]) fail(testCase.name + ': gameplay integration check failed: ' + check);
    }

    await page.close();
}

await browser.close();
if (fails.length) {
    console.error('✗ smoke-tank-battle');
    for (const message of fails) console.error('  - ' + message);
    process.exit(1);
}
console.log('smoke-tank-battle：production art + desktop/landscape controls + canvas 全部通过 ✅');
