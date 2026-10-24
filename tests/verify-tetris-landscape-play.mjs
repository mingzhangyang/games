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
            // The preceding swipe and the following button tap are separate human
            // gestures, not two CDP actions dispatched back-to-back in one frame.
            await new Promise(resolve => setTimeout(resolve, 170));
            await page.evaluate(() => {
                const button = document.getElementById('mobilePauseBtn');
                window.__q2PauseEvents = [];
                const types = ['touchstart', 'touchend', 'touchcancel', 'pointerdown',
                    'pointerup', 'pointercancel', 'click'];
                for (const type of types) {
                    document.addEventListener(type, event => {
                        if (!event.target.closest?.('#mobileControls')) return;
                        const point = event.changedTouches?.[0] || event;
                        const hit = document.elementFromPoint(point.clientX, point.clientY);
                        const record = { type, target: event.target.id, hit: hit?.id || hit?.tagName,
                            buttonDisabled: button.disabled, defaultPrevented: event.defaultPrevented,
                            scrollY: window.scrollY, visualTop: visualViewport?.offsetTop,
                            time: Math.round(performance.now()) };
                        window.__q2PauseEvents.push(record);
                        queueMicrotask(() => { record.defaultPrevented = event.defaultPrevented; });
                    }, { passive: true });
                }
            });
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
            const pauseTrace = await page.evaluate(() => ({
                events: window.__q2PauseEvents,
                hover: matchMedia('(hover: hover) and (pointer: fine)').matches,
                button: { disabled: document.getElementById('mobilePauseBtn').disabled,
                    touchAction: getComputedStyle(document.getElementById('mobilePauseBtn')).touchAction,
                    transform: getComputedStyle(document.getElementById('mobilePauseBtn')).transform },
                scrollY: window.scrollY,
            }));
            assert(paused.paused && paused.animationId === null,
                name + ' Pause stops the game loop', JSON.stringify({ paused, events: pauseTrace }));
            await page.tap('#mobilePauseBtn');
            await page.waitForFunction(() => !window.game.paused &&
                window.game.animationId !== null, { timeout: 1300 }).catch(() => {});
            const resumed = await page.evaluate(() => ({
                paused: window.game.paused, animationId: window.game.animationId,
                label: document.getElementById('mobilePauseBtn').textContent,
            }));
            assert(!resumed.paused && resumed.animationId !== null,
                name + ' Resume continues gameplay', JSON.stringify(resumed));
            // Real canvas double-tap hard-drops a piece, earning drop points and
            // leaving occupied board cells. Restart must undo these observable
            // gameplay effects, not merely leave a zero score untouched.
            const boardNow = await geometry(page);
            const x = boardNow.board.x + boardNow.board.width * 0.5;
            const y = boardNow.board.y + boardNow.board.height * 0.4;
            await page.touchscreen.touchStart(x, y);
            await page.touchscreen.touchEnd();
            await new Promise(resolve => setTimeout(resolve, 110));
            await page.touchscreen.touchStart(x, y);
            await page.touchscreen.touchEnd();
            await page.waitForFunction(() => window.game.score > 0 &&
                window.game.board.some(row => row.some(Boolean)), { timeout: 2000 }).catch(() => {});
            const beforeRestart = await page.evaluate(() => ({
                score: window.game.score,
                locked: window.game.board.flat().filter(Boolean).length,
            }));
            assert(beforeRestart.score > 0 && beforeRestart.locked > 0,
                name + ' real double-tap earns points and locks a piece',
                JSON.stringify(beforeRestart));
            await new Promise(resolve => setTimeout(resolve, 170));
            await page.tap('#mobileRestartBtn');
            await page.waitForFunction(() => {
                const g = window.game;
                return g.score === 0 && g.board.every(row => row.every(value => !value)) &&
                    !g.paused && !g.gameOver && g.animationId !== null;
            }, { timeout: 2000 }).catch(() => {});
            const afterRestart = await page.evaluate(() => {
                const g = window.game;
                return { score: g.score, locked: g.board.flat().filter(Boolean).length,
                    paused: g.paused, over: g.gameOver, running: g.animationId !== null };
            });
            assert(beforeRestart.score > 0 && beforeRestart.locked > 0 &&
                afterRestart.score === 0 && afterRestart.locked === 0 &&
                !afterRestart.paused && !afterRestart.over && afterRestart.running,
            name + ' Restart clears previous score and board, starts active game',
            JSON.stringify({ beforeRestart, afterRestart }));
        } else {
            assert(false, name + ' gameplay cannot start: Start control inaccessible');
        }
        await page.screenshot({ path: join(OUT, 'tetris-' + name + '-playing.png') });

        await page.setViewport(portrait);
        // Resize/layout and .btn transitions are asynchronous. Wait for the
        // actual three-column portrait widths and bottom-docked controls.
        await page.waitForFunction(() => {
            const board = document.getElementById('tetris').getBoundingClientRect();
            const bar = document.getElementById('mobileControls');
            if (getComputedStyle(bar).display === 'none') return false;
            const rect = bar.getBoundingClientRect();
            const buttons = [...bar.querySelectorAll('button')];
            return rect.bottom <= innerHeight + 1 && rect.width >= innerWidth - 2 &&
                board.bottom <= rect.top - 1 && buttons.length === 3 &&
                buttons.every(b => {
                    const r = b.getBoundingClientRect();
                    return r.width >= 100 && r.height >= 40 && r.right <= innerWidth &&
                        r.bottom <= innerHeight;
                });
        }, { timeout: 3000 }).catch(() => {});
        const upright = await geometry(page);
        console.log('GEOMETRY portrait after ' + name + ' ' + JSON.stringify(upright));
        assert(upright.board.bottom <= (upright.bar?.top ?? portrait.height) - 1,
            name + ' orientation back to portrait keeps full board above fixed controls',
            JSON.stringify({ boardBottom: upright.board.bottom, barTop: upright.bar?.top }));
        assert(upright.buttons.every(b => b.visible && b.hit), name + ' portrait controls work');
        await page.screenshot({ path: join(OUT, 'tetris-' + name + '-portrait.png') });

        await page.setViewport(vp);
        await page.waitForFunction(() => {
            const board = document.getElementById('tetris').getBoundingClientRect();
            const bar = document.getElementById('mobileControls');
            if (getComputedStyle(bar).display === 'none') return false;
            const b = bar.getBoundingClientRect();
            const buttons = [...bar.querySelectorAll('button')];
            return board.bottom <= innerHeight - 2 && b.right <= innerWidth &&
                b.width <= 140 && buttons.length === 3 &&
                buttons.every(button => {
                    const rect = button.getBoundingClientRect();
                    return rect.width >= 85 && rect.height >= 40 &&
                        rect.bottom <= innerHeight;
                });
        }, { timeout: 3000 }).catch(() => {});
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
