#!/usr/bin/env node
// Q2-A / Q1-02: real touch access to a movable lamp, including the shortest viewports.
// verify-all: timeout=90000
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { LEVELS } from '../src/games/shadow-loom/model/levels.js';
import { STAGE } from '../src/games/shadow-loom/model/rules.js';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const BASE = process.argv.find(a => a.startsWith('http')) || 'http://127.0.0.1:8899';
const OUT = process.env.Q2_EVIDENCE_DIR || join(tmpdir(), 'games-q2a-evidence');
mkdirSync(OUT, { recursive: true });
const fails = [];
const check = (ok, label, detail = '') => {
    console.log((ok ? 'PASS ' : 'FAIL ') + label + (detail ? ': ' + detail : ''));
    if (!ok) fails.push(label + (detail ? ': ' + detail : ''));
};
const deerIndex = LEVELS.findIndex(l => l.id === 'deer');
const deer = LEVELS[deerIndex];
if (deerIndex < 0 || !deer.lamp.movable) throw Error('Deer must be a real movable-lamp level');
const viewports = [
    { width: 320, height: 454, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    { width: 375, height: 553, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
];
const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: LAUNCH_ARGS });

async function snap(page) {
    return page.evaluate(() => {
        const canvas = document.getElementById('sl-canvas');
        const rect = canvas.getBoundingClientRect();
        const g = window.slGame;
        const lamp = { ...g.st.lamp };
        const at = (x, y) => ({
            x: rect.left + x * rect.width / 480,
            y: rect.top + y * rect.height / 854,
        });
        const p = at(lamp.x, lamp.y - 12);
        const hit = document.elementFromPoint(p.x, p.y);
        return {
            state: g.state, lamp, moves: g.moves,
            canvas: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom },
            pointer: p, pointerOnCanvas: hit === canvas,
            viewport: { width: innerWidth, height: innerHeight },
            maxScroll: Math.max(0, document.scrollingElement.scrollHeight - innerHeight),
            scrollTop: document.scrollingElement.scrollTop,
            touchAction: getComputedStyle(canvas).touchAction,
            lampHit: g.lampHit(lamp.x, lamp.y - 12),
            logicalRoundTrip: g.toLogical({ clientX: p.x, clientY: p.y }),
        };
    });
}
const toClient = (s, p) => ({
    x: s.canvas.x + p.x * s.canvas.width / STAGE.w,
    y: s.canvas.y + p.y * s.canvas.height / STAGE.h,
});
async function dragTouch(page, snapshot, from, to) {
    const a = toClient(snapshot, from);
    const b = toClient(snapshot, to);
    await page.touchscreen.touchStart(a.x, a.y);
    // Intermediate physical touch positions, not synthesized page events or direct game-state assignment.
    for (let n = 1; n <= 10; n++) {
        const k = n / 10;
        await page.touchscreen.touchMove(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k);
        await new Promise(resolve => setTimeout(resolve, 20));
    }
    await page.touchscreen.touchEnd();
    await new Promise(resolve => setTimeout(resolve, 120));
}
for (const viewport of viewports) {
    const label = viewport.width + 'x' + viewport.height;
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.setViewport(viewport);
    await page.setRequestInterception(true);
    page.on('request', r => /workers\.dev/.test(r.url())
        ? r.respond({ status: 200, contentType: 'application/json',
            headers: { 'access-control-allow-origin': '*' }, body: '[]' })
        : r.continue());
    await page.evaluateOnNewDocument(() => {
        localStorage.setItem('site_lang', 'en');
        localStorage.setItem('site_muted', '1');
    });
    try {
        await page.goto(BASE + '/shadow-loom.html', { waitUntil: 'domcontentloaded', timeout: 35000 });
        await page.waitForFunction(() => window.slGame && window.slGame.state === 'menu', { timeout: 14000 });
        // Select an actual lamp puzzle. The public menu starts at Rabbit; this bypasses
        // only level progression, not the lazy-load, real canvas event handlers or solver.
        await page.evaluate(index => window.slGame.startLevel(index), deerIndex);
        await page.waitForFunction(() => window.slGame?.state === 'playing' &&
            window.slGame.level?.id === 'deer', { timeout: 18000 });
        await page.evaluate(async () => {
            await document.fonts.ready;
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        });
        let initial = await snap(page);
        console.log('GEOMETRY initial ' + label + ' ' + JSON.stringify(initial));
        await page.screenshot({ path: join(OUT, 'shadow-loom-' + label + '-before.png') });

        check(Math.abs(initial.canvas.height / initial.canvas.width - STAGE.h / STAGE.w) < 0.015,
            label + ' logical stage aspect ratio remains unchanged');
        check(initial.canvas.width >= 240, label + ' finger-operable stage width >= 240px',
            initial.canvas.width.toFixed(1));
        check(initial.touchAction === 'none', label + ' canvas captures actual touch dragging');
        check(initial.lampHit, label + ' lamp physical graphic has matching hit area');
        check(Math.hypot(initial.logicalRoundTrip.x - initial.lamp.x,
            initial.logicalRoundTrip.y - (initial.lamp.y - 12)) < 0.1,
        label + ' CSS-to-logical coordinates round-trip precisely');

        if (!initial.pointerOnCanvas || initial.pointer.y > viewport.height - 8) {
            // If the actionable lamp is below the fold, prove an external gutter provides
            // native touch scrolling (canvas has touch-action:none) before repositioning.
            if (initial.maxScroll > 10) {
                await page.touchscreen.touchStart(8, viewport.height - 40);
                for (const distance of [24, 48, 72, 96]) {
                    await page.touchscreen.touchMove(8, viewport.height - 40 - distance);
                    await new Promise(resolve => setTimeout(resolve, 45));
                }
                await page.touchscreen.touchEnd();
                await new Promise(resolve => setTimeout(resolve, 200));
                const scrolled = await snap(page);
                check(scrolled.scrollTop > 5, label + ' external gutter supports natural touch scrolling',
                    'scrollTop=' + scrolled.scrollTop + '/' + scrolled.maxScroll);
                initial = scrolled;
            } else {
                check(false, label + ' inaccessible lamp has a usable scroll entrance',
                    JSON.stringify(initial));
            }
        }
        // Even if natural scrolling moved the page, make the hit-tested lamp visible.
        const lamp = { ...initial.lamp };
        const from = { x: lamp.x, y: lamp.y - 12 };
        const target = { x: deer.lamp.sol.x, y: deer.lamp.sol.y - 12 };
        if (!initial.pointerOnCanvas || initial.pointer.y < 5 ||
            initial.pointer.y > viewport.height - 5) {
            // The initial hit at scrollTop=0 may have been offscreen. Scroll until the
            // lamp is visible; never fake a pointer event outside the viewport.
            await page.evaluate((y) => window.scrollBy({ top: y - innerHeight * 0.7, behavior: 'instant' }),
                initial.pointer.y);
            initial = await snap(page);
        }
        check(initial.pointerOnCanvas && initial.pointer.y >= 6 &&
            initial.pointer.y <= viewport.height - 6,
        label + ' actual lamp pickup lies inside the touchable viewport',
        JSON.stringify({ pointer: initial.pointer, viewport: initial.viewport }));
        if (initial.pointerOnCanvas && initial.pointer.y >= 6 &&
            initial.pointer.y <= viewport.height - 6) {
            await dragTouch(page, initial, from, target);
            const after = await snap(page);
            console.log('GEOMETRY after drag ' + label + ' ' + JSON.stringify(after));
            check(Math.hypot(after.lamp.x - deer.lamp.sol.x, after.lamp.y - deer.lamp.sol.y) < 2,
                label + ' real touch moves lamp to level solution',
                JSON.stringify({ after: after.lamp, target: deer.lamp.sol }));
            check(after.moves >= 1, label + ' real movement is counted in gameplay', String(after.moves));
            check(after.state === 'playing' || after.state === 'solving',
                label + ' gesture did not abort level', after.state);
            await page.screenshot({ path: join(OUT, 'shadow-loom-' + label + '-dragged.png') });
        }
    } catch (e) {
        check(false, label + ' real browser interaction', String(e.stack || e).slice(0,900));
    }
    check(errors.length === 0, label + ' no pageerror', errors.join(' | '));
    await page.close();
}
await browser.close();
console.log('Q2 screenshots: ' + OUT);
console.log('Q2 Shadow Loom ' + (fails.length ? fails.length + ' failures' : 'PASS'));
process.exit(fails.length ? 1 : 0);
