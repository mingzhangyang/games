#!/usr/bin/env node
// Shared instant hiding is opt-in. Transition-driven Math Rain modals remain
// visible to layout so opacity/visibility can animate independently.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';

const BASE = process.argv.find(arg => arg.startsWith('http')) || 'http://127.0.0.1:8899';
const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: LAUNCH_ARGS,
});

try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844 });

    await page.goto(BASE + '/bond-forge.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
    const optedIn = await page.evaluate(() => {
        const root = document.documentElement.classList.contains('game-hidden-contract');
        const el = document.createElement('div');
        el.className = 'hidden';
        document.body.append(el);
        const display = getComputedStyle(el).display;
        el.remove();
        return { root, display };
    });
    assert.deepEqual(optedIn, { root: true, display: 'none' },
        'opted-in pages must retain the shared display-none hidden contract');

    await page.goto(BASE + '/math-rain.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
    const mathRain = await page.evaluate(() => {
        const screen = document.getElementById('pause-screen');
        const style = getComputedStyle(screen);
        return {
            sharedHiddenOptIn: document.documentElement.classList.contains('game-hidden-contract'),
            screenHidden: screen.classList.contains('hidden'),
            display: style.display,
            visibility: style.visibility,
            opacity: style.opacity,
            transitionProperty: style.transitionProperty,
        };
    });
    assert.equal(mathRain.sharedHiddenOptIn, false,
        'Math Rain must not implicitly adopt display:none for animated modals');
    assert.equal(mathRain.screenHidden, true);
    assert.equal(mathRain.display, 'flex',
        'Math Rain hidden modals must retain layout for their opacity fade');
    assert.equal(mathRain.visibility, 'hidden');
    assert.equal(mathRain.opacity, '0');
    assert.match(mathRain.transitionProperty, /opacity/);

    console.log('PASS shared hidden opt-in and Math Rain modal visibility/opacity transition');
} finally {
    await browser.close();
}
