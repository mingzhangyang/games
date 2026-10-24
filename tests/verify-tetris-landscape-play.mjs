#!/usr/bin/env node
// Q2-A / Q1-01: actual touch gameplay and rotation at short landscape sizes.
// verify-all: timeout=90000
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const BASE = process.argv.find(a => a.startsWith('http')) || 'http://127.0.0.1:8899';
const OUT = process.env.Q2_EVIDENCE_DIR || join(tmpdir(), 'games-q2a-evidence');
mkdirSync(OUT, { recursive: true });
const failures = [];
const assert = (ok, name, detail = '') => {
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ': ' + detail : ''));
    if (!ok) failures.push(name + (detail ? ': ' + detail : ''));
};
const portrait = { width: 375, height: 553, deviceScaleFactor: 2, hasTouch: true, isMobile: true };
const landscapes = [
    { width: 750, height: 340, deviceScaleFactor: 2, hasTouch: true, isMobile: true, isLandscape: true },
    { width: 839, height: 360, deviceScaleFactor: 2, hasTouch: true, isMobile: true, isLandscape: true },
];
const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: LAUNCH_ARGS });

async function geometry(page) {
    return page.evaluate(() => {
        const box = el => {
            const r = el.getBoundingClientRect();
            return { x: r.x, y: r.y, left: r.left, right: r.right, top: r.top,
                bottom: r.bottom, width: r.width, height: r.height };
        };
        const board = box(document.getElementById('tetris'));
        const hud = box(document.getElementById('tt-stage-status'));
        const barEl = document.getElementById('mobileControls');
        const visible = getComputedStyle(barEl).display !== 'none';
        const bar = visible ? box(barEl) : null;
        const buttons = [...barEl.querySelectorAll('button')].map(button => {
            const r = box(button);
            const node = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            return { id: button.id, rect: r, hit: node === button || button.contains(node),
                visible: visible && r.width >= 40 && r.height >= 40
                    && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight };
        });
        return { viewport: [innerWidth, innerHeight], board, hud, bar, buttons,
            scrollTop: document.scrollingElement.scrollTop,
            scale: window.game.renderScale };
    });
}
const overlaps = (a, b) => a && b &&
    Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
    Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
const fits = (g, name) => {
    assert(g.board.top >= 0 && g.board.bottom <= g.viewport[1] - 2,
        name + ' whole canvas visible without scrolling', JSON.stringify({ board: g.board, viewport: g.viewport }));
    assert(g.board.width >= 105, name + ' cells remain touch-operable (>=10.5px)',
        g.board.width.toFixed(1));
    assert(g.hud.top >= 0 && g.hud.bottom <= g.board.top + 1, name + ' status row visible');
    assert(g.bar && !overlaps(g.board, g.bar), name + ' controls do not cover the board',
        JSON.stringify({ bar: g.bar, board: g.board }));
    assert(g.buttons.length === 3 && g.buttons.every(b => b.visible && b.hit),
        name + ' Start / Pause / Restart buttons on-screen and hit-testable',
        JSON.stringify(g.buttons));
};
async function swipeRight(page, g, name) {
    const before = await page.evaluate(() => ({ x: window.game.currentPiece.x, y: window.game.currentPiece.y }));
    const x = g.board.left + g.board.width * 0.5;
    const y = g.board.top + Math.min(g.board.height * 0.35, 95);
    const distance = Math.max(36, Math.min(60, g.board.width * 0.35));
    if (y <= 0 || y >= g.viewport[1] || x + distance >= g.viewport[0]) {
        assert(false, name + ' gesture origin in viewport');
        return;
    }
    await page.touchscreen.touchStart(x, y);
    await page.touchscreen.touchMove(x + distance, y);
    await page.touchscreen.touchEnd();
    const after = await page.evaluate(() => ({ x: window.game.currentPiece.x, y: window.game.currentPiece.y }));
    assert(after.x === before.x + 1, name + ' touch swipe moves live tetromino',
        JSON.stringify({ before, after }));
}
for (const vp of landscapes) {
    const name = vp.width + 'x' + vp.height;
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.setViewport(vp);
    await page.setRequestInterception(true);
    page.on('request', r => r.url().includes('workers.dev')
        ? r.respond({ status: 200, contentType: 'application/json',
            headers: { 'access-control-allow-origin': '*' }, body: '[]' })
        : r.continue());
    await page.evaluateOnNewDocument(() => {
        localStorage.setItem('site_muted', '1');
        localStorage.setItem('site_lang', 'en');
    });
    try {
        await page.goto(BASE + '/tetris.html', { waitUntil: 'domcontentloaded', timeout: 35000 });
        await page.waitForFunction(() => window.game && window.game.currentPiece, { timeout: 12000 });
        await page.evaluate(async () => {
            await document.fonts.ready;
            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        });
        const initial = await geometry(page);
        console.log('GEOMETRY initial ' + name + ' ' + JSON.stringify(initial));
        await page.screenshot({ path: join(OUT, 'tetris-' + name + '-initial.png') });
        fits(initial, name + ' initial');

        if (initial.buttons[0]?.visible && initial.buttons[0]?.hit) {
            await page.tap('#mobileStartBtn');
            assert(await page.evaluate(() => !window.game.paused && !window.game.gameOver &&
                window.game.animationId !== null), name + ' Start begins actual gameplay');
            await swipeRight(page, await geometry(page), name);
            await page.tap('#mobilePauseBtn');
            // A touchscreen tap synthesizes its click asynchronously. Observe the
            // actual game transition rather than racing the browser event queue.
            await page.waitForFunction(() => window.game.paused &&
                window.game.animationId === null, { timeout: 1300 }).catch(() => {});
            const paused = await page.evaluate(() => ({
                paused: window.game.paused,
                animationId: window.game.animationId,
                disabled: document.getElementById('mobilePauseBtn').disabled,
                label: document.getElementById('mobilePauseBtn').textContent,
            }));
            assert(paused.paused && paused.animationId === null,
                name + ' Pause stops the game loop', JSON.stringify(paused));
            await page.tap('#mobilePauseBtn');
            await page.waitForFunction(() => !window.game.paused &&
                window.game.animationId !== null, { timeout: 1300 }).catch(() => {});
            const resumed = await page.evaluate(() => ({
                paused: window.game.paused, animationId: window.game.animationId,
                label: document.getElementById('mobilePauseBtn').textContent,
            }));
            assert(!resumed.paused && resumed.animationId !== null,
                name + ' Resume continues gameplay', JSON.stringify(resumed));
            await page.tap('#mobileRestartBtn');
            const restarted = await page.evaluate(() => {
                const g = window.game;
                return g.score === 0 && !g.paused && !g.gameOver && g.animationId !== null;
            });
            assert(restarted, name + ' Restart starts a fresh active game');
        } else {
            assert(false, name + ' gameplay cannot start: Start control inaccessible');
        }
        await page.screenshot({ path: join(OUT, 'tetris-' + name + '-playing.png') });

        await page.setViewport(portrait);
        // .mobile-controls .btn uses transition:all .2s; sample settled
        // geometry, not the 30px in-flight widths from the first animation frame.
        await page.evaluate(() => new Promise(r => setTimeout(r, 280)));
        const upright = await geometry(page);
        console.log('GEOMETRY portrait after ' + name + ' ' + JSON.stringify(upright));
        assert(upright.board.bottom <= (upright.bar?.top ?? portrait.height) - 1,
            name + ' orientation back to portrait keeps full board above fixed controls',
            JSON.stringify({ boardBottom: upright.board.bottom, barTop: upright.bar?.top }));
        assert(upright.buttons.every(b => b.visible && b.hit), name + ' portrait controls work');
        await page.screenshot({ path: join(OUT, 'tetris-' + name + '-portrait.png') });

        await page.setViewport(vp);
        await page.evaluate(() => new Promise(r => setTimeout(r, 280)));
        fits(await geometry(page), name + ' after rotation');
    } catch (e) {
        assert(false, name + ' browser interaction', String(e.stack || e).slice(0,700));
    }
    assert(errors.length === 0, name + ' no page errors', errors.join(' | '));
    await page.close();
}
await browser.close();
console.log('Q2 screenshots: ' + OUT);
console.log('Q2 Tetris ' + (failures.length ? failures.length + ' failures' : 'PASS'));
process.exit(failures.length ? 1 : 0);
