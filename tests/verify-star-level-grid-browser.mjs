// Step 6d: the five games' actual runtime-built chips in source and production dist.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { keepPage, exitIfNoPages } from './lib/page-filter.mjs';
import { registry } from '../tools/lib/registry.mjs';

const BASE = process.argv.find(arg => arg.startsWith('http')) || 'http://127.0.0.1:8899';
const IDS = new Set(['silk-dew', 'echo-cave', 'maxwell-demon', 'crystal-bloom', 'flame-verse']);
const registered = registry.all().filter(game => IDS.has(game.id));
assert.equal(registered.length, IDS.size, 'all five shared-chip games remain registered');
const games = registered.filter(game => keepPage(game.id));
exitIfNoPages(games, 'verify-star-level-grid-browser');

const settings = [
    { width: 390, height: 844, lang: 'zh', theme: 'light' },
    { width: 1280, height: 900, lang: 'en', theme: 'dark' },
];
// Baseline #185, before Step 6d: exactly this DOM came from each inline renderer.
const expected = (prefix, index, stars) => '<button type="button" class="' + prefix
    + '-chip game-start-level-chip' + (stars ? ' is-done' : '') + '" data-level="' + index
    + '"><span class="' + prefix + '-chip-num game-start-chip-num">' + (index + 1)
    + '</span><span class="' + prefix + '-chip-stars game-start-chip-stars">'
    + '★'.repeat(stars) + '☆'.repeat(3 - stars) + '</span></button>';

const browser = await puppeteer.launch({
    executablePath: CHROME_PATH, args: LAUNCH_ARGS, headless: 'new',
});
let checks = 0;
try {
    for (const game of games) {
        for (const setting of settings) {
            const page = await browser.newPage();
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            try {
                await page.setViewport({ width: setting.width, height: setting.height });
                await page.setBypassServiceWorker(true);
                await page.evaluateOnNewDocument(({ lang, theme }) => {
                    localStorage.clear();
                    localStorage.setItem('site_lang', lang);
                    localStorage.setItem('site_theme', theme);
                    localStorage.setItem('site_muted', '1');
                }, setting);
                const response = await page.goto(BASE + '/' + game.href, {
                    waitUntil: 'domcontentloaded', timeout: 30000,
                });
                assert.equal(response?.status(), 200, game.id + ': page loads');
                await page.waitForFunction(prefix => !!window[prefix + 'Game']
                    && document.querySelectorAll('#' + prefix + '-level-grid button').length === 20,
                { timeout: 20000 }, game.prefix);

                const result = await page.evaluate(prefix => {
                    const runtime = window[prefix + 'Game'];
                    const grid = document.getElementById(prefix + '-level-grid');
                    const snapshot = () => ({
                        count: grid.querySelectorAll('button').length,
                        first: grid.querySelector('button')?.outerHTML,
                        last: grid.querySelectorAll('button')[19]?.outerHTML,
                        allButtons: [...grid.querySelectorAll('button')].every(b => b.type === 'button'),
                        rendered: (() => {
                            const rect = grid.querySelector('button').getBoundingClientRect();
                            return rect.width > 0 && rect.height > 0;
                        })(),
                    });
                    const initial = snapshot();
                    const oldProgress = runtime.progress;
                    const oldStart = runtime.startLevel;
                    const picked = [];
                    let starred;
                    try {
                        runtime.progress = new Proxy({}, { get: () => ({ stars: 2 }) });
                        runtime.renderLevelGrid();
                        starred = snapshot();
                        runtime.startLevel = index => picked.push(index);
                        grid.querySelector('button').click();
                        grid.querySelector('button span').click();
                        runtime.renderLevelGrid();
                        grid.querySelectorAll('button')[19].click();
                    } finally {
                        runtime.startLevel = oldStart;
                        runtime.progress = oldProgress;
                        runtime.renderLevelGrid();
                    }
                    return { initial, starred, picked, restored: snapshot() };
                }, game.prefix);
                const label = game.id + '/' + setting.lang + '/' + setting.width;
                for (const phase of ['initial', 'starred', 'restored']) {
                    assert.equal(result[phase].count, 20, label + ': all 20 levels in ' + phase);
                    assert(result[phase].allButtons, label + ': buttons have correct type');
                    assert(result[phase].rendered, label + ': level chip has nonzero geometry');
                    checks += 3;
                }
                assert.equal(result.initial.first, expected(game.prefix, 0, 0),
                    label + ': initial first chip is legacy DOM');
                assert.equal(result.initial.last, expected(game.prefix, 19, 0),
                    label + ': initial last chip is legacy DOM');
                assert.equal(result.starred.first, expected(game.prefix, 0, 2),
                    label + ': progress stars and done class');
                assert.equal(result.starred.last, expected(game.prefix, 19, 2),
                    label + ': 20th chip uses shared DOM too');
                assert.deepEqual(result.picked, [0, 0, 19],
                    label + ': button and nested span each select once, even after rerender');
                assert.deepEqual(result.restored, result.initial,
                    label + ': game progress and original chips restored');
                assert.deepEqual(errors, [], label + ': no page errors');
                checks += 7;
            } finally {
                await page.close();
            }
        }
    }
    console.log('verify-star-level-grid-browser: ' + checks + ' checks across '
        + games.length + ' games; source/dist, zh/en, 390/1280, DOM and clicks');
} finally {
    await browser.close();
}
