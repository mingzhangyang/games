#!/usr/bin/env node
// One-time Step 6c-3 pixel-exact comparison with stable frames on both sides.
// JavaScript/game physics is disabled on both sides; actual runtime tested by browser suite.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { registry } from '../lib/registry.mjs';
import { CHROME_PATH, LAUNCH_ARGS } from '../../tests/lib/browser.mjs';
import { resultRoles } from '../../src/platform/shell/render-result-overlays.js';
import { pixelsFromPng, samePixels } from '../lib/png-pixels.mjs';

const [beforeBase, afterBase] = process.argv.slice(2);
if (!beforeBase?.startsWith('http://') || !afterBase?.startsWith('http://')) {
    console.error('usage: node tools/checks/compare-result-screenshots.mjs <old-url> <new-url>');
    process.exit(2);
}
const SETTINGS = [
    { width: 390, height: 844, lang: 'en', theme: 'dark' },
    { width: 390, height: 844, lang: 'zh', theme: 'light' },
    { width: 1280, height: 900, lang: 'en', theme: 'light' },
    { width: 1280, height: 900, lang: 'zh', theme: 'dark' },
];
const browser = await puppeteer.launch({
    executablePath: CHROME_PATH, args: LAUNCH_ARGS, headless: 'new',
});
async function capture(base, game, kind, settings) {
    const page = await browser.newPage();
    try {
        await page.setViewport({ width: settings.width, height: settings.height, deviceScaleFactor: 1 });
        await page.setJavaScriptEnabled(false);
        const response = await page.goto(base + '/' + game.href, {
            waitUntil: 'networkidle0', timeout: 30000,
        });
        assert.equal(response?.status(), 200, game.id + ': static page must return HTTP 200');
        await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;'
            + 'transition:none!important;scroll-behavior:auto!important;caret-color:transparent!important}' });
        await page.evaluate(({ prefix, kind, lang, theme }) => {
            document.documentElement.lang = lang;
            document.documentElement.dataset.theme = theme;
            document.body.dataset.theme = theme;
            for (const overlay of document.querySelectorAll('.game-overlay')) overlay.classList.add('hidden');
            const target = document.getElementById(prefix + '-' + kind);
            if (!target) throw new Error('Missing result overlay ' + prefix + '-' + kind);
            target.classList.remove('hidden');
        }, { prefix: game.prefix, kind, lang: settings.lang, theme: settings.theme });

        // CSS blur, fonts and screenshot rerasterization can differ by 1-2 levels
        // on consecutive frames. Sample until each *side* is exactly stable;
        // only then compare old and new with absolute zero pixel tolerance.
        const deadline = Date.now() + 20000;
        while (!await page.evaluate(() => {
            document.documentElement.getBoundingClientRect();
            return document.fonts.status === 'loaded';
        })) {
            if (Date.now() >= deadline) throw new Error(game.id + ': fonts did not settle');
            await new Promise(resolve => setTimeout(resolve, 25));
        }
        const extent = await page.evaluate(() => ({
            width: Math.max(window.innerWidth, document.documentElement.scrollWidth),
            height: Math.max(window.innerHeight, document.documentElement.scrollHeight),
        }));
        const options = extent.width > settings.width || extent.height > settings.height
            ? { captureBeyondViewport: true, clip: { x: 0, y: 0, ...extent } }
            : { captureBeyondViewport: false };
        let previous = null;
        for (let sample = 1; sample <= 6; sample++) {
            const current = pixelsFromPng(Buffer.from(await page.screenshot(options)));
            assert.equal(current.width, extent.width, game.id + ': entire width captured');
            assert.equal(current.height, extent.height, game.id + ': entire height captured');
            if (previous && samePixels(previous, current)) return { ...current, samples: sample };
            previous = current;
        }
        throw new Error(game.id + ': six frames without pixel-stable composition');
    } finally {
        await page.close();
    }
}
const cases = registry.all().filter(game => resultRoles(game).length);
assert.equal(cases.length, 10, 'all ten puzzle games present');
let comparisons = 0;
let failures = 0;
try {
    for (const game of cases) {
        for (const kind of resultRoles(game)) {
            for (const setting of SETTINGS) {
                const label = [game.id, kind, setting.lang, setting.theme, setting.width].join('/');
                try {
                    const before = await capture(beforeBase, game, kind, setting);
                    const after = await capture(afterBase, game, kind, setting);
                    assert(samePixels(before, after), label + ': rendered RGBA pixels differ');
                    console.log('PIXEL-IDENTICAL', label,
                        before.samples > 2 || after.samples > 2 ? '(stable after compositor settling)' : '');
                    comparisons++;
                } catch (error) {
                    console.error('PIXEL-DIFF', label + ':', error.message);
                    failures++;
                }
            }
        }
    }
} finally {
    await browser.close();
}
assert.equal(comparisons + failures, 72, 'eighteen overlays times four screenshot states');
console.log('Step 6c-3 screenshot parity: ' + comparisons + '/72 pixel-identical pairs, '
    + failures + ' failures');
if (failures) process.exitCode = 1;
