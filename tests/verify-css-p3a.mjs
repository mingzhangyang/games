#!/usr/bin/env node
// CSS Cascade Layers P3-A behavior gate.
// Source mode is auto-discovered by verify-all; Architecture v2 CI runs the same
// contract against dist/ via tests/lib/run-smoke-dist.mjs.

import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { keepPage, exitIfNoPages } from './lib/page-filter.mjs';
import { runCssLayerBehaviorBatch } from './lib/css-layer-behavior.mjs';

const BASE = process.argv.find(arg => arg.startsWith('http')) || 'http://127.0.0.1:8899';

const CASES = [
    {
        id: 'index',
        href: 'index.html',
        themeVar: '--tok-bg',
        probes: ['.hero', '.idx-main', '.game-footer', '.game-footer-actions'],
        async interact(page) {
            const before = await page.$eval('#main-title', el => el.textContent.trim());
            await page.click('#lang-toggle');
            await page.waitForFunction(
                previous => document.querySelector('#main-title')?.textContent.trim() !== previous,
                {},
                before,
            );
            return (await page.$eval('#main-title', el => el.textContent.trim())) !== before;
        },
    },
    {
        id: 'word-daily',
        href: 'word-daily.html',
        shell: '.wd-shell',
        stage: '.wd-board-wrap',
        themeVar: '--wd-body-bg',
        frame: { max: '520px', wide: '600px' },
        probes: ['.game-topbar', '.game-main', '.wd-input-row'],
        async interact(page) {
            await page.click('#wd-diff-trigger');
            await page.waitForFunction(
                () => document.getElementById('wd-diff-trigger')?.getAttribute('aria-expanded') === 'true',
            );
            return page.evaluate(() => {
                const menu = document.getElementById('wd-diff-menu');
                return menu && !menu.classList.contains('hidden') && getComputedStyle(menu).display !== 'none';
            });
        },
    },
    {
        id: 'minesweeper',
        href: 'minesweeper.html',
        shell: '.ms-shell',
        stage: '.ms-board-wrap',
        themeVar: '--ms-body-bg',
        frame: { max: '640px', wide: '780px' },
        probes: ['.game-topbar', '.game-main', '.ms-diff-row'],
        async interact(page) {
            await page.click('#ms-btn-play');
            await page.waitForFunction(() => {
                const start = document.getElementById('ms-start');
                return start && (start.classList.contains('hidden') || getComputedStyle(start).display === 'none');
            });
            return page.evaluate(() => document.querySelectorAll('#ms-board > *').length > 0);
        },
    },
    {
        id: 'reversi',
        href: 'reversi.html',
        shell: '.rv-shell',
        stage: '.rv-stage',
        themeVar: '--rv-body-bg',
        frame: { max: '560px', wide: '820px' },
        probes: ['.game-topbar', '.game-main', '.rv-status'],
        async interact(page) {
            await page.click('#rv-btn-play');
            await page.waitForFunction(() => {
                const start = document.getElementById('rv-start');
                return start && (start.classList.contains('hidden') || getComputedStyle(start).display === 'none');
            });
            return page.evaluate(() => document.querySelectorAll('#rv-board .rv-cell').length === 64);
        },
    },
    {
        id: 'gomoku',
        href: 'gomoku.html',
        shell: '.game-container',
        stage: '.board-container',
        themeVar: '--gk-page-bg',
        frame: { max: '760px', wide: '760px', stage: '760px' },
        probes: ['.game-topbar', '.game-main', '.status-bar', '#gameBoard'],
        async interact(page) {
            const before = await page.$eval('#modeText', el => el.textContent.trim());
            await page.click('#modeBtn');
            await page.waitForFunction(
                previous => document.getElementById('modeText')?.textContent.trim() !== previous,
                {},
                before,
            );
            return (await page.$eval('#modeText', el => el.textContent.trim())) !== before;
        },
    },
].filter(testCase => keepPage(testCase.id));

exitIfNoPages(CASES, 'verify-css-p3a');

await runCssLayerBehaviorBatch({
    name: 'CSS P3-A',
    base: BASE,
    cases: CASES,
    chromePath: CHROME_PATH,
    launchArgs: LAUNCH_ARGS,
});
