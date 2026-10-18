// Math Rain injects five runtime <style> blocks. Each must install once, under
// its data-math-rain-style key, and never add external stylesheets.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';

const BASE = process.argv.find(arg => arg.startsWith('http')) || 'http://127.0.0.1:8899';
const STYLE_KEYS = ['error-notification', 'score-popup', 'mobile', 'low-end', 'notification'];
const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: LAUNCH_ARGS });

try {
    for (const mobile of [false, true]) {
        const page = await browser.newPage();
        const pageErrors = [];
        page.on('pageerror', error => pageErrors.push(error.message));
        await page.setViewport({ width: mobile ? 390 : 1280, height: mobile ? 844 : 900 });
        await page.evaluateOnNewDocument(low => {
            Object.defineProperty(navigator, 'deviceMemory', { get: () => low ? 1 : 8 });
            Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => low ? 2 : 8 });
        }, mobile);
        await page.goto(BASE + '/math-rain.html', { waitUntil: 'load' });
        await page.waitForFunction(() => window.mathRainGame?.uiController && window.mobileAdapter && window.shopManager);
        const initial = await page.evaluate(() => ({
            styles: [...document.querySelectorAll('style')].map(style => style.dataset.mathRainStyle),
            links: [...document.querySelectorAll('link[rel~="stylesheet"]')].map(link => link.href),
        }));
        assert.deepEqual(initial.styles, mobile ? ['low-end', 'mobile'] : [], 'activation before first popup');

        const result = await page.evaluate(styleKeys => {
            const game = window.mathRainGame;
            const triggerPopups = () => {
                game.uiController.createScorePopup(100, 100, '+10');
                const error = document.createElement('div');
                game.errorHandler.addErrorStyles(error);
                window.shopManager.createNotificationPopup('test', 'red');
            };
            triggerPopups();
            triggerPopups(); // Existing DOM ids must still prevent duplicate installation.
            const keys = [...document.querySelectorAll('style')].map(style => style.dataset.mathRainStyle);
            const failures = [];
            for (const sheet of document.styleSheets) {
                const owner = sheet.ownerNode;
                if (owner?.tagName === 'LINK') continue;
                const key = owner?.dataset.mathRainStyle;
                if (!key || !styleKeys.includes(key)) {
                    failures.push('Unregistered stylesheet');
                    continue;
                }
                if (!sheet.cssRules.length) failures.push('Empty stylesheet: ' + key);
                if (sheet.disabled || owner.media) failures.push('Unexpected stylesheet activation: ' + key);
            }
            if (document.adoptedStyleSheets.length) failures.push('Unregistered adopted stylesheet');
            return {
                keys, failures,
                links: [...document.querySelectorAll('link[rel~="stylesheet"]')].map(link => link.href),
            };
        }, STYLE_KEYS);
        assert.deepEqual(result.keys, [...initial.styles, 'score-popup', 'error-notification', 'notification']);
        assert.deepEqual(result.failures, []);
        assert.deepEqual(result.links, initial.links, 'runtime must not add external stylesheets');
        assert.deepEqual(pageErrors, []);
        await page.close();
    }
    console.log('PASS Math Rain stylesheet activation, insertion order and repeat-call coverage');
} finally {
    await browser.close();
}
