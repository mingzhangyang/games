import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { SOURCE_IDS } from './lib/css/runtime-sources.mjs';

const BASE = process.argv.find(arg => arg.startsWith('http')) || 'http://127.0.0.1:8899';
const p0 = JSON.parse(readFileSync(new URL('./css-runtime-style-p0-baseline.json', import.meta.url), 'utf8'));
const expected = Object.fromEntries(Object.entries(SOURCE_IDS).map(([key, id]) =>
    [key, p0.styles.find(style => style.id === id).css]));
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
        await page.goto(BASE + '/math-rain.html', { waitUntil: 'networkidle0' });
        await page.waitForFunction(() => window.mathRainGame?.uiController && window.mobileAdapter && window.shopManager);
        const initial = await page.evaluate(() => ({
            styles: [...document.querySelectorAll('style')].map(style => style.dataset.mathRainStyle),
            links: [...document.querySelectorAll('link[rel~="stylesheet"]')].map(link => link.href),
        }));
        assert.deepEqual(initial.styles, mobile ? ['low-end', 'mobile'] : [], 'activation before first popup');

        const result = await page.evaluate(expectedCss => {
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
            const cssRules = sheet => [...sheet.cssRules].map(rule => rule.cssText);
            for (const sheet of document.styleSheets) {
                const owner = sheet.ownerNode;
                if (owner?.tagName === 'LINK') continue;
                const key = owner?.dataset.mathRainStyle;
                if (!key || !Object.hasOwn(expectedCss, key)) {
                    failures.push('Unregistered stylesheet');
                    continue;
                }
                // Use the browser as the independent parser/oracle. These
                // expected strings come from immutable P0, not the new registry.
                const reference = new window.CSSStyleSheet();
                reference.replaceSync(expectedCss[key]);
                if (JSON.stringify(cssRules(sheet)) !== JSON.stringify(cssRules(reference))) {
                    failures.push('CSSOM differs from P0: ' + key);
                }
                if (sheet.disabled || owner.media) failures.push('Unexpected stylesheet activation: ' + key);
            }
            if (document.adoptedStyleSheets.length) failures.push('Unregistered adopted stylesheet');
            return {
                keys, failures,
                links: [...document.querySelectorAll('link[rel~="stylesheet"]')].map(link => link.href),
            };
        }, expected);
        assert.deepEqual(result.keys, [...initial.styles, 'score-popup', 'error-notification', 'notification']);
        assert.deepEqual(result.failures, []);
        assert.deepEqual(result.links, initial.links, 'runtime must not add external stylesheets');
        assert.deepEqual(pageErrors, []);
        await page.close();
    }
    console.log('PASS Math Rain stylesheet activation, insertion order, P0 CSSOM and repeat-call coverage');
} finally {
    await browser.close();
}
