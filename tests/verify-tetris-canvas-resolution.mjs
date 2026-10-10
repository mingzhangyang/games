// W6b: actual Canvas pixels, buffer geometry, resize/DPR and game-state contract.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { LOGICAL_W, LOGICAL_H, MAX_DPR, calculateCanvasResolution, applyCanvasResolution } from '../src/games/tetris/canvas-resolution.js';

assert.equal(LOGICAL_W, 400);
assert.equal(LOGICAL_H, 800);
assert.equal(MAX_DPR, 2);
assert.equal(calculateCanvasResolution(0, 1), null);
assert.equal(calculateCanvasResolution(NaN, 2), null);
assert.deepEqual(calculateCanvasResolution(464, 1), { width: 464, height: 928, scale: 1.16, dpr: 1 });
assert.equal(calculateCanvasResolution(280.1, 1).width, 281);
assert.equal(calculateCanvasResolution(480, 4).width, 960);
const fakes = [{ width: 400, height: 800 }, { width: 400, height: 800 }];
const planned = calculateCanvasResolution(464, 2);
assert.equal(applyCanvasResolution(fakes, planned), true);
assert.equal(applyCanvasResolution(fakes, planned), false);
assert.ok(fakes.every(c => c.width === 928 && c.height === 1856));

const BASE = process.argv[2] || 'http://127.0.0.1:8899';
const failures = [];
function check(ok, name, note = '') {
    console.log(`  ${ok ? '✓' : '✗'} ${name}${note ? ': ' + note : ''}`);
    if (!ok) failures.push(name + (note ? ': ' + note : ''));
}
const ready = (page, previous = null) => page.waitForFunction(prev => {
    const c = document.getElementById('tetris');
    const g = window.game;
    if (!g || !g.renderScale || !c?.clientWidth) return false;
    const dpr = window.devicePixelRatio || 1;
    const width = Math.ceil(c.clientWidth * Math.max(1, Math.min(dpr, 2)));
    if (prev && prev.width === c.clientWidth && prev.dpr === dpr) return false;
    return c.width === width && c.height === width * 2
        && ['particleCanvas', 'lineClearCanvas'].every(id => {
            const layer = document.getElementById(id);
            return layer.width === width && layer.height === width * 2;
        })
        && g.gridCanvas.width === width && g.gridCanvas.height === width * 2
        && !!document.querySelector('.game-shell')?.style.getPropertyValue('--frame-chrome');
}, { timeout: 12000 }, previous);

const snapshot = () => {
    const g = window.game;
    const b = document.getElementById('tetris');
    const canvases = ['tetris', 'particleCanvas', 'lineClearCanvas'].map(id => document.getElementById(id));
    const describe = c => {
        const r = c.getBoundingClientRect();
        const m = c.getContext('2d').getTransform();
        return {
            width: c.width, height: c.height,
            rect: { x: r.x, y: r.y, w: r.width, h: r.height },
            matrix: [m.a, m.b, m.c, m.d, m.e, m.f],
        };
    };
    const pixel = (c, x, y) => {
        const scale = c.width / 400;
        return Array.from(c.getContext('2d').getImageData(
            Math.floor(x * scale), Math.floor(y * scale), 1, 1,
        ).data);
    };
    return {
        clientWidth: b.clientWidth,
        dpr: window.devicePixelRatio,
        layers: canvases.map(describe),
        grid: {
            width: g.gridCanvas.width, height: g.gridCanvas.height,
            scale: g.gridCtx.getTransform().a,
        },
        pixels: [
            pixel(canvases[0], 140, 340), // locked cyan I block
            pixel(canvases[1], 105, 105), // magenta particle
            pixel(canvases[2], 185, 105), // green line clear
        ],
        game: {
            board: JSON.stringify(g.board), current: JSON.stringify(g.currentPiece),
            next: JSON.stringify(g.nextPiece), score: g.score, lines: g.lines,
            level: g.level, combo: g.combo, paused: g.paused, dropCounter: g.dropCounter,
        },
    };
};
function audit(s) {
    const bad = [];
    const near = (x, y) => Math.abs(x - y) <= 0.6;
    const width = Math.ceil(s.clientWidth * Math.max(1, Math.min(s.dpr, 2)));
    const scale = width / 400;
    const reference = s.layers[0].rect;
    [...s.layers, s.grid].forEach((layer, i) => {
        if (layer.width !== width || layer.height !== width * 2) bad.push(`backing ${i}`);
    });
    s.layers.forEach((l, i) => {
        const m = l.matrix;
        if (!near(m[0], scale) || !near(m[3], scale) || m[1] !== 0 || m[2] !== 0
            || m[4] !== 0 || m[5] !== 0) bad.push(`transform ${i}`);
        for (const k of ['x', 'y', 'w', 'h']) {
            if (!near(l.rect[k], reference[k])) bad.push(`offset ${i} ${k}`);
        }
    });
    if (!near(s.grid.scale, scale)) bad.push('grid scale');
    if (s.pixels[0].slice(0, 3).join(',') !== '79,209,224') bad.push('block pixel');
    if (s.pixels[1].join(',') !== '255,0,255,255') bad.push('particle pixel');
    if (s.pixels[2].join(',') !== '0,255,0,255') bad.push('line pixel');
    return bad;
}

const cases = [
    { width: 320, height: 568, dpr: 2, lang: 'en', theme: 'dark' },
    { width: 390, height: 844, dpr: 2, lang: 'zh', theme: 'light' },
    { width: 1280, height: 900, dpr: 1, lang: 'zh', theme: 'dark', dynamic: true },
    { width: 1920, height: 1080, dpr: 1, lang: 'en', theme: 'light' },
    { width: 2560, height: 1440, dpr: 2, lang: 'zh', theme: 'dark' },
];
const browser = await puppeteer.launch({
    executablePath: CHROME_PATH, headless: 'new', args: LAUNCH_ARGS,
});
try {
    for (const v of cases) {
        const tag = `${v.width}x${v.height}, DPR ${v.dpr}, ${v.lang}/${v.theme}`;
        console.log('\n' + tag);
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        try {
            await page.setViewport({
                width: v.width, height: v.height, deviceScaleFactor: v.dpr,
                hasTouch: v.width < 500, isMobile: v.width < 500,
            });
            await page.evaluateOnNewDocument(({ lang, theme }) => {
                localStorage.setItem('site_lang', lang);
                localStorage.setItem('site_theme', theme);
            }, v);
            await page.goto(BASE + '/tetris.html', { waitUntil: 'load' });
            await ready(page);
            await page.evaluate(() => {
                const g = window.game;
                g.score = 1337;
                g.lines = 2;
                g.level = 3;
                g.combo = 1;
                g.board[8][3] = 'I';
                g.particles = [{
                    life: 1, update() {},
                    draw(ctx) { ctx.fillStyle = '#ff00ff'; ctx.fillRect(100, 100, 12, 12); },
                }];
                g.lineClearAnimations = [{
                    update() { return true; },
                    draw(ctx) { ctx.fillStyle = '#00ff00'; ctx.fillRect(180, 100, 12, 12); },
                }];
                g.draw(false);
                // Exercise the frame in which a tiny shake decays to zero.
                g.shakeAmount = 0.05;
                g.draw(false);
                g.draw(false);
            });
            const first = await page.evaluate(snapshot);
            check(audit(first).length === 0, tag + ' raster and pixel audit', audit(first).join(', '));
            const corrupt = JSON.parse(JSON.stringify(first));
            corrupt.layers[1].width -= 1;
            check(audit(corrupt).includes('backing 1'), tag + ' rejects unsynchronized backing');
            const badTransform = JSON.parse(JSON.stringify(first));
            badTransform.layers[2].matrix[4] = 1;
            check(audit(badTransform).includes('transform 2'), tag + ' rejects layer displacement');

            if (v.dynamic) {
                let previous = { width: first.clientWidth, dpr: first.dpr };
                for (const next of [
                    { width: 1920, height: 1080, dpr: 1 },
                    { width: 1920, height: 1080, dpr: 2 },
                    { width: 1440, height: 900, dpr: 1 },
                ]) {
                    await page.setViewport({
                        width: next.width, height: next.height, deviceScaleFactor: next.dpr,
                    });
                    await ready(page, previous);
                    const after = await page.evaluate(snapshot);
                    const problems = audit(after);
                    check(problems.length === 0, `resize ${next.width} DPR${next.dpr}`, problems.join(', '));
                    check(JSON.stringify(after.game) === JSON.stringify(first.game),
                        'resizing stopped game retains full state');
                    previous = { width: after.clientWidth, dpr: after.dpr };
                }
                await page.evaluate(() => window.dispatchEvent(new Event('game-frame:changed')));
                const repeated = await page.evaluate(snapshot);
                check(audit(repeated).length === 0, 'repeated frame signal is idempotent');

                await page.evaluate(() => {
                    const g = window.game;
                    g.init();
                    g.start();
                    g.score = 321;
                    g.updateDisplay();
                });
                await page.waitForFunction(() => window.game.animationId !== null);
                await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
                await ready(page, previous);
                const running = await page.evaluate(() => ({
                    score: window.game.score, paused: window.game.paused,
                    over: window.game.gameOver, loop: window.game.animationId !== null,
                    rows: window.game.board.length, cols: window.game.board[0].length,
                }));
                check(running.score === 321 && !running.paused && !running.over
                    && running.loop && running.rows === 20 && running.cols === 10,
                'live game remains running after resize');
                await page.evaluate(() => window.game.togglePause());
            }
            check(errors.length === 0, tag + ' no JS pageerrors', errors.join(' | '));
        } catch (err) {
            check(false, tag + ' browser test', String(err));
        } finally {
            await context.close();
        }
    }
} finally {
    await browser.close();
}
if (failures.length) {
    console.error('Tetris canvas W6b failed:\n - ' + failures.join('\n - '));
    process.exit(1);
}
console.log('Tetris canvas W6b passed');
