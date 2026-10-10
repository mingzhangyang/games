#!/usr/bin/env node
// Browser-visible leaderboard coverage for all scores.ui="dialog" games.
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { registry } from './lib/registry.mjs';
import { keepPage, exitIfNoPages } from './lib/page-filter.mjs';

const BASE = process.argv.find(arg => arg.startsWith('http')) || 'http://127.0.0.1:8899';
const games = registry.withCap('leaderboard').filter(g => g.scores?.ui === 'dialog')
    .filter(game => keepPage(game.href));
exitIfNoPages(games, 'smoke-scoreboard-dialog');
const errors = [];
const browser = await puppeteer.launch({
    executablePath: CHROME_PATH, headless: 'new', args: LAUNCH_ARGS,
});
try {
    for (const game of games) {
        const page = await browser.newPage();
        const landscape = game.id === 'tank-battle';
        await page.setViewport({ width: landscape ? 844 : 390, height: landscape ? 390 : 844 });
        await page.setBypassServiceWorker(true);
        const pageErrors = [];
        const requests = [];
        page.on('pageerror', err => pageErrors.push(String(err.message || err)));
        await page.setRequestInterception(true);
        page.on('request', request => {
            const url = request.url();
            if (url.startsWith('https://game-scores.orangely.workers.dev/scores')) {
                const parsed = new URL(url);
                requests.push({ method: request.method(), key: parsed.searchParams.get('game') });
                void request.respond({
                    status: 200,
                    contentType: 'application/json',
                    headers: { 'access-control-allow-origin': '*' },
                    body: JSON.stringify([{ name: 'Test Player', score: 1234 }]),
                });
                return;
            }
            void request.continue();
        });
        await page.evaluateOnNewDocument(() => {
            try {
                localStorage.setItem('site_lang', 'en');
                localStorage.setItem('site_muted', '1');
            } catch {}
        });
        try {
            await page.goto(BASE + '/' + game.href, { waitUntil: 'domcontentloaded', timeout: 45000 });
            const trigger = game.id === 'math-rain'
                ? '#start-screen .scoreboard-trigger--icon' : '.scoreboard-trigger--icon';
            await page.waitForSelector(trigger, { timeout: 18000 });
            const state = await page.evaluate(selector => {
                const icon = document.querySelector(selector);
                const box = icon?.getBoundingClientRect();
                const visible = icon && getComputedStyle(icon).display !== 'none' && box?.width > 0 && box?.height > 0;
                const hit = box && document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
                return { visible, width: box?.width, height: box?.height,
                    insideViewport: !!box && box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight,
                    tappable: hit === icon || icon?.contains(hit),
                    aria: icon?.getAttribute('aria-label') };
            }, trigger);
            if (!state.visible || !state.aria || !state.tappable || !state.insideViewport || state.width < 32 || state.height < 32) {
                errors.push(game.id + ': rank entry missing: ' + JSON.stringify(state));
                continue;
            }
            await page.click(trigger);
            await page.waitForFunction(() => document.querySelector('dialog[data-scoreboard-dialog]')?.open, { timeout: 6000 });
            await page.waitForFunction(() =>
                document.querySelector('dialog[data-scoreboard-dialog] .game-lb-name')?.textContent === 'Test Player',
            { timeout: 5000 });
            const ui = await page.evaluate(() => {
                const d = document.querySelector('dialog[data-scoreboard-dialog]');
                const box = d.getBoundingClientRect();
                return {
                    open: d.open, view: [window.innerWidth, window.innerHeight],
                    rect: [box.left, box.top, box.right, box.bottom],
                    rows: d.querySelectorAll('.game-lb-row').length,
                    choices: d.querySelector('.scoreboard-select')?.options.length,
                    status: d.querySelector('.scoreboard-status')?.textContent,
                    nameInput: d.querySelector('.scoreboard-player input')?.getAttribute('maxlength'),
                };
            });
            if (!ui.open || ui.rows !== 1 || ui.choices < 1 || ui.nameInput !== '20'
                || ui.rect[0] < -1 || ui.rect[1] < -1
                || ui.rect[2] > ui.view[0] + 1 || ui.rect[3] > ui.view[1] + 1) {
                errors.push(game.id + ': dialog not viewable: ' + JSON.stringify(ui));
            }
            if (ui.choices > 1) {
                const beforeKey = requests.at(-1)?.key;
                await page.evaluate(() => {
                    const picker = document.querySelector('.scoreboard-select');
                    picker.value = picker.options[picker.options.length - 1].value;
                    picker.dispatchEvent(new Event('change', { bubbles: true }));
                });
                await page.waitForFunction(() => document.querySelector('.game-lb-name')?.textContent === 'Test Player');
                if (requests.at(-1)?.key === beforeKey) errors.push(game.id + ': selector did not change remote key');
            }
            await page.keyboard.press('Escape');
            await page.waitForFunction(() => !document.querySelector('dialog[data-scoreboard-dialog]')?.open);
            if (pageErrors.length) errors.push(game.id + ': page exceptions: ' + pageErrors.join(' | ').slice(0, 600));
        } catch (error) {
            errors.push(game.id + ': ' + String(error.message || error).slice(0, 500));
        } finally {
            await page.close();
        }
    }
} finally {
    await browser.close();
}
if (errors.length) {
    console.error('FAIL scoreboard browser contract\n' + errors.join('\n'));
    process.exit(1);
}
console.log('PASS visible leaderboard UI: ' + games.length + ' games');
