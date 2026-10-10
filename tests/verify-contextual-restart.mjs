#!/usr/bin/env node
// Contextual topbar retry: live only during gameplay, never a dead menu action.
// The twelve consumers share one controller and preserve their own game rules.
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { keepPage, exitIfNoPages } from './lib/page-filter.mjs';
import { registry } from './lib/registry.mjs';

const BASE = process.argv.find(arg => arg.startsWith('http')) || 'http://127.0.0.1:8899';
const CASES = {
    'lumen': ['lm', 'lmGame', 'startLevel', 'showMenu'],
    'circuit': ['cc', 'ccGame', 'startLevel', 'showMenu'],
    'silk-dew': ['sd', 'sdGame', 'startLevel', 'toMenu'],
    'echo-cave': ['ec', 'ecGame', 'startLevel', 'toMenu'],
    'bond-forge': ['bf', 'bfGame', 'startLevel', 'toMenu'],
    'flame-verse': ['fv', 'fvGame', 'startLevel', 'toMenu'],
    'ripple-duet': ['rd', 'rdGame', 'startLevel', 'toMenu'],
    'carrot-pull': ['cp', 'cpGame', 'start', null],
    'crystal-bloom': ['cb', 'cbGame', 'startLevel', 'toMenu'],
    'maxwell-demon': ['md', 'mdGame', 'startLevel', 'toMenu'],
    'shadow-loom': ['sl', 'slGame', 'startLevel', 'showMenu'],
    'gravity-slingshot': ['gd', 'gdGame', 'startLevelMode', 'enterMenu'],
};

// Negative contract: adding an unreviewed topbar reset must not silently pass.
const topbarGames = registry.withCap('topbar').map(g => g.id);
for (const id of Object.keys(CASES)) {
    if (!topbarGames.includes(id)) throw new Error(id + ' is not a topbar page');
    const [pre] = CASES[id];
    const html = readFileSync(new URL('../' + id + '.html', import.meta.url), 'utf8');
    const tags = html.match(new RegExp('<button\\b[^>]*id="' + pre + '-reset-btn"[^>]*>', 'g')) || [];
    if (tags.length !== 1 || !tags[0].includes('data-contextual-restart=')
        || !tags[0].includes(' hidden')) {
        throw new Error(id + ': topbar retry must be initially hidden and explicitly opted in');
    }
    const src = readFileSync(new URL('../src/games/' + id + '/runtime.js', import.meta.url), 'utf8');
    if (!src.includes('bindContextualRestart({')
        || !src.includes("from '../../platform/contextual-restart.js'")) {
        throw new Error(id + ': the shared restart controller is missing');
    }
}
const PAGES = Object.keys(CASES).filter(keepPage);
exitIfNoPages(PAGES, 'verify-contextual-restart');

const browser = await puppeteer.launch({
    executablePath: CHROME_PATH, headless: 'new', args: LAUNCH_ARGS,
});
const failures = [];
let count = 0;
const check = (truth, message) => {
    if (truth) count++;
    else failures.push(message);
};
const isHidden = sel => {
    const button = document.querySelector(sel);
    return !!button && button.disabled && getComputedStyle(button).display === 'none';
};
try {
    for (const id of PAGES) {
        const [prefix, global, startMethod, menuMethod] = CASES[id];
        const page = await browser.newPage();
        const selector = '#' + prefix + '-reset-btn';
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));
        await page.setViewport({ width: 390, height: 844 });
        await page.setBypassServiceWorker(true);
        await page.setRequestInterception(true);
        page.on('request', request => {
            if (/^https:\/\/(?:game-scores|games-analytics)\.orangely\.workers\.dev\//.test(request.url())) {
                void request.respond({
                    status: 200,
                    headers: { 'access-control-allow-origin': '*' },
                    contentType: 'application/json',
                    body: '[]',
                });
            } else void request.continue();
        });
        try {
            await page.goto(BASE + '/' + id + '.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForFunction(key => !!window[key], { timeout: 15000 }, global);
            check(await page.evaluate(isHidden, selector), id + ': reset hidden on menu');
            if (id === 'carrot-pull') {
                await page.waitForFunction(() => ['ready', 'fallback']
                    .includes(document.getElementById('cp-stage')?.dataset.artState), { timeout: 15000 });
            }
            const start = () => page.evaluate(({ key, method }) => window[key][method](0),
                { key: global, method: startMethod });
            await start();
            await page.waitForFunction(sel => {
                const b = document.querySelector(sel);
                return b && !b.disabled && getComputedStyle(b).display !== 'none';
            }, { timeout: 4000 }, selector);
            const geometry = await page.evaluate(sel => {
                const b = document.querySelector(sel);
                const rect = b.getBoundingClientRect();
                return { label: b.getAttribute('aria-label'), width: rect.width, height: rect.height };
            }, selector);
            check(geometry.label?.length > 4 && !/^Reset$/.test(geometry.label)
                && geometry.width >= 32 && geometry.height >= 32,
            id + ': accessible playing-state action ' + JSON.stringify(geometry));

            // With no work yet, restarting is harmless and needs no confirmation.
            await page.click(selector);
            const untouched = await page.evaluate(({ key, id: gameId }) => {
                const g = window[key];
                return gameId === 'carrot-pull' ? g.state.mode === 'menu'
                    : gameId === 'gravity-slingshot' ? g.phase === 'aiming'
                        : g.state === 'playing';
            }, { key: global, id });
            check(untouched, id + ': reset without progress works');

            if (['lumen', 'shadow-loom', 'carrot-pull'].includes(id)) {
                if (id === 'carrot-pull') await start();
                const field = id === 'lumen' ? 'flips' : id === 'shadow-loom' ? 'moves' : 'pulls';
                await page.evaluate(({ key, field, gameId }) => {
                    const g = window[key];
                    (gameId === 'carrot-pull' ? g.state : g)[field] = 1;
                }, { key: global, field, gameId: id });
                let declinedMessage = '';
                page.once('dialog', async dialog => {
                    declinedMessage = dialog.message();
                    await dialog.dismiss();
                });
                await page.click(selector);
                const retained = await page.evaluate(({ key, field, gameId }) =>
                    (gameId === 'carrot-pull' ? window[key].state : window[key])[field] === 1,
                { key: global, field, gameId: id });
                check(declinedMessage.length > 0 && retained, id + ': cancel preserves score/progress');

                let acceptedMessage = '';
                page.once('dialog', async dialog => {
                    acceptedMessage = dialog.message();
                    await dialog.accept();
                });
                await page.click(selector);
                const after = await page.evaluate(({ key, field, gameId }) => {
                    const g = window[key], state = gameId === 'carrot-pull' ? g.state : g;
                    return { progress: state[field], state: gameId === 'carrot-pull' ? g.state.mode : g.state };
                }, { key: global, field, gameId: id });
                check(acceptedMessage.length > 0 && after.progress === 0
                    && after.state === (id === 'carrot-pull' ? 'menu' : 'playing'),
                id + ': confirmation restarts correctly ' + JSON.stringify(after));
            }

            if (id !== 'carrot-pull') {
                await page.evaluate(({ key, method }) => window[key][method](true),
                    { key: global, method: menuMethod });
            }
            await page.waitForFunction(isHidden, { timeout: 4000 }, selector);
            check(true, id + ': menu transition hides retry');

            if (id !== 'carrot-pull') {
                await start();
                await page.waitForFunction(sel => !document.querySelector(sel)?.disabled,
                    { timeout: 4000 }, selector);
                const resultId = id === 'shadow-loom' ? prefix + '-result'
                    : id === 'gravity-slingshot' ? prefix + '-over' : prefix + '-clear';
                const exists = await page.evaluate(({ key, name, nodeId }) => {
                    const g = window[key], result = document.getElementById(nodeId);
                    if (!result) return false;
                    if (name === 'gravity-slingshot') g.phase = 'resolved';
                    else g.state = 'done';
                    result.classList.remove('hidden');
                    return true;
                }, { key: global, name: id, nodeId: resultId });
                check(exists, id + ': result overlay owns the replay action');
                await page.waitForFunction(isHidden, { timeout: 4000 }, selector);
                check(true, id + ': topbar retry not shown over result');
            }
            check(!errors.length, id + ': no page errors: ' + errors.join(' | ').slice(0, 250));
        } catch (err) {
            failures.push(id + ': ' + String(err.message || err).slice(0, 700));
        } finally {
            await page.close();
        }
    }
} finally {
    await browser.close();
}
if (failures.length) {
    console.error('FAIL contextual restart\n' + failures.join('\n'));
    process.exit(1);
}
console.log('PASS contextual restart: ' + PAGES.length + ' games / ' + count + ' checks');
