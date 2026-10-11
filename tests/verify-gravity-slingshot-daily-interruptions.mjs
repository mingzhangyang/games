#!/usr/bin/env node
// PR #134: a completed daily hole must not auto-advance under an interruption
// lease and must not become permanently paused when the lease is released.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';

const BASE = process.argv.find(arg => arg.startsWith('http')) || 'http://127.0.0.1:8899';
const browser = await puppeteer.launch({
    executablePath: CHROME_PATH, headless: 'new', args: LAUNCH_ARGS,
});
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(String(error.message || error)));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const openDrawer = () => page.$eval('#gdStatsToggle', el => el.click());
const closeDrawer = () => page.$eval('#gdStatsClose', el => el.click());
const startAndCapture = () => page.evaluate(() => {
    const game = window.gdGame;
    game.startDailyMode();
    game.onCapture();
});
const state = () => page.evaluate(() => {
    const game = window.gdGame;
    return {
        hole: game.holeIdx, epoch: game.holeEpoch,
        phase: game.phase, paused: game.isPaused,
        held: game.pauseOwnership.isHeld(),
    };
});
const visibility = hidden => page.evaluate(isHidden => {
    Object.defineProperty(document, 'hidden', {
        configurable: true,
        get: () => isHidden,
    });
    document.dispatchEvent(new Event('visibilitychange'));
}, hidden);

try {
    await page.setViewport({
        width: 390, height: 844, deviceScaleFactor: 2,
        hasTouch: true, isMobile: true,
    });
    await page.setBypassServiceWorker(true);
    await page.goto(BASE + '/gravity-slingshot.html', {
        waitUntil: 'domcontentloaded', timeout: 25000,
    });
    await page.waitForFunction(() => !!window.gdGame?.pauseOwnership
        && !!document.getElementById('gdStatsClose'), { timeout: 12000 });

    // Timer expires with the statistics drawer still open.
    await startAndCapture();
    await openDrawer();
    await sleep(1350);
    const drawerHeld = await state();
    assert.equal(drawerHeld.hole, 0, 'daily hole must not auto-advance behind the drawer');
    assert.equal(drawerHeld.phase, 'holed');
    assert.equal(drawerHeld.paused, true);
    await closeDrawer();
    const drawerCleared = await state();
    assert.deepEqual(
        [drawerCleared.hole, drawerCleared.phase, drawerCleared.paused, drawerCleared.held],
        [1, 'aiming', false, false],
        'the next daily hole resumes immediately after drawer release',
    );
    assert.equal(drawerCleared.epoch, drawerHeld.epoch + 1);

    // The drawer closes before the hidden lease: neither event alone resumes.
    await startAndCapture();
    await openDrawer();
    await visibility(true);
    await sleep(1350);
    await closeDrawer();
    const stillHidden = await state();
    assert.equal(stillHidden.hole, 0);
    assert.equal(stillHidden.phase, 'holed');
    assert.equal(stillHidden.paused, true);
    assert.equal(stillHidden.held, true);
    await visibility(false);
    const foreground = await state();
    assert.deepEqual(
        [foreground.hole, foreground.phase, foreground.paused, foreground.held],
        [1, 'aiming', false, false],
        'only the last released interruption advances the daily hole',
    );
    assert.equal(foreground.epoch, stillHidden.epoch + 1);

    // Restarting while an old 1150ms completion timer is pending must not
    // advance the new run or borrow its previous run's resume permission.
    await startAndCapture();
    await page.evaluate(() => window.gdGame.startDailyMode());
    await sleep(1350);
    const restarted = await state();
    assert.deepEqual(
        [restarted.hole, restarted.phase, restarted.paused, restarted.held],
        [0, 'aiming', false, false],
        'stale completion timers may not advance a restarted daily session',
    );
    assert.equal(pageErrors.length, 0, pageErrors.join(' | '));
    console.log('PASS Gravity Slingshot daily auto-advance: drawer, hidden overlap, stale timer');
} finally {
    await page.close();
    await browser.close();
}
