#!/usr/bin/env node
// Browser-visible leaderboard coverage for all scores.ui="dialog" games.
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { registry } from './lib/registry.mjs';
import { keepPage, exitIfNoPages } from './lib/page-filter.mjs';

async function setHeldMovement(page, gameId) {
    if (!['tank-battle', 'needle-awn'].includes(gameId)) return;
    await page.evaluate(id => {
        if (id === 'tank-battle') {
            const game = window.tankBattleInstance;
            game.keys.w = true;
            game.keys[' '] = true;
            document.getElementById('btnFire')?.classList.add('active');
            document.querySelector('#dpad .dpad-btn')?.classList.add('active');
        } else {
            const game = window.gameEngine;
            game.keys.KeyW = true;
            game.aimTouchId = 91;
            game.joy.active = true;
            game.joy.id = 42;
            game.joy.x = 1;
            game.joy.y = -0.5;
            game.dom.joy.classList.remove('hidden');
        }
    }, gameId);
}

async function heldMovementReleased(page, gameId) {
    if (!['tank-battle', 'needle-awn'].includes(gameId)) return true;
    return page.evaluate(id => {
        if (id === 'tank-battle') {
            const game = window.tankBattleInstance;
            return !game.keys.w && !game.keys[' ']
                && !document.getElementById('btnFire')?.classList.contains('active')
                && !document.querySelector('#dpad .dpad-btn.active');
        }
        const game = window.gameEngine;
        return !game.keys.KeyW && !game.joy.active && game.joy.id === null
            && game.joy.x === 0 && game.joy.y === 0 && game.aimTouchId === null
            && game.dom.joy.classList.contains('hidden');
    }, gameId);
}

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
        let scoreWorkerReady = true;
        page.on('pageerror', err => pageErrors.push(String(err.message || err)));
        await page.setRequestInterception(true);
        page.on('request', request => {
            const url = request.url();
            if (url.startsWith('https://game-scores.orangely.workers.dev/scores')) {
                const parsed = new URL(url);
                requests.push({ method: request.method(), key: parsed.searchParams.get('game') });
                void request.respond({
                    status: scoreWorkerReady ? 200 : 400,
                    contentType: scoreWorkerReady ? 'application/json' : 'text/plain',
                    headers: { 'access-control-allow-origin': '*' },
                    body: scoreWorkerReady ? JSON.stringify([{ name: 'Test Player', score: 1234 }]) : 'Invalid',
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
                const iconStyle = icon && getComputedStyle(icon);
                const hitPad = icon && getComputedStyle(icon, '::after');
                const targetHeight = box && hitPad ? box.height
                    - parseFloat(hitPad.top || 0) - parseFloat(hitPad.bottom || 0) : 0;
                const visualSize = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tok-btn-size'));
                const hit = box && document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
                return { visible, width: box?.width, height: box?.height,
                    visualSize, targetHeight, layoutHeight: iconStyle?.height,
                    insideViewport: !!box && box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight,
                    tappable: hit === icon || icon?.contains(hit),
                    aria: icon?.getAttribute('aria-label') };
            }, trigger);
            if (!state.visible || !state.aria || !state.tappable || !state.insideViewport || state.width < 32 || state.height < 32) {
                errors.push(game.id + ': rank entry missing: ' + JSON.stringify(state));
                continue;
            }
            if (['needle-awn', 'shadow-loom'].includes(game.id)
                && (Math.abs(state.height - state.visualSize) > 1 || state.targetHeight < 44)) {
                errors.push(game.id + ': topbar rank control changed frame chrome or lost its 44px hit area: '
                    + JSON.stringify(state));
            }
            // The modal consumes keyup. A key/button held before opening must
            // be explicitly released by the owning game input controller.
            await setHeldMovement(page, game.id);
            await page.click(trigger);
            await page.waitForFunction(() => document.querySelector('dialog[data-scoreboard-dialog]')?.open, { timeout: 6000 });
            if (!await heldMovementReleased(page, game.id)) {
                errors.push(game.id + ': modal open left held keyboard/joystick/fire state behind');
            }
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
            // A modal's focused controls must own keyboard input. Game-level
            // document/window shortcuts (Tank P, Math Rain Space, Needle Escape)
            // must never see the events or resume the world underneath.
            const focusReady = await page.evaluate(() => {
                const dialog = document.querySelector('dialog[data-scoreboard-dialog]');
                const input = dialog.querySelector('.game-lb-username');
                window.__scoreboardKeyLeaks = [];
                document.addEventListener('keydown', event => {
                    window.__scoreboardKeyLeaks.push('document:down:' + event.code);
                });
                window.addEventListener('keyup', event => {
                    window.__scoreboardKeyLeaks.push('window:up:' + event.code);
                });
                // Use a known short value so the maxLength=20 cap cannot
                // turn the typed-key regression into a false negative.
                window.__scoreboardOldName = input.value;
                input.value = 'KeyTest';
                input.focus();
                input.setSelectionRange(input.value.length, input.value.length);
                return document.activeElement === input;
            });
            if (!focusReady) errors.push(game.id + ': nickname input could not receive native focus');
            await page.keyboard.press('p');
            await page.keyboard.press('Space');
            const keyboardWhileOpen = await page.evaluate(() => {
                const input = document.querySelector('.game-lb-username');
                return { leaks: window.__scoreboardKeyLeaks.slice(), inputValue: input.value,
                    open: document.querySelector('dialog[data-scoreboard-dialog]').open };
            });
            if (!keyboardWhileOpen.open || keyboardWhileOpen.inputValue !== 'KeyTestp '
                || keyboardWhileOpen.leaks.length) {
                errors.push(game.id + ': modal keyboard reached gameplay or broke input: '
                    + JSON.stringify(keyboardWhileOpen));
            }
            await page.evaluate(() => {
                document.querySelector('.game-lb-username').value = window.__scoreboardOldName;
            });
            await setHeldMovement(page, game.id);
            await page.keyboard.press('Escape');
            // Native <dialog> clears .open before its asynchronous close event
            // fires. Wait for the input owner's onClose cleanup, not only .open.
            await page.waitForFunction(id => {
                if (document.querySelector('dialog[data-scoreboard-dialog]')?.open) return false;
                if (id === 'tank-battle') {
                    const game = window.tankBattleInstance;
                    return !game.keys.w && !game.keys[' ']
                        && !document.getElementById('btnFire')?.classList.contains('active')
                        && !document.querySelector('#dpad .dpad-btn.active');
                }
                if (id === 'needle-awn') {
                    const game = window.gameEngine;
                    return !game.keys.KeyW && !game.joy.active && game.joy.id === null
                        && game.joy.x === 0 && game.joy.y === 0 && game.aimTouchId === null
                        && game.dom.joy.classList.contains('hidden');
                }
                return true;
            }, { timeout: 6000 }, game.id);
            if (!await heldMovementReleased(page, game.id)) {
                errors.push(game.id + ': modal close resumed with stale held controls');
            }
            const escapeLeaks = await page.evaluate(() =>
                window.__scoreboardKeyLeaks.filter(key => key.endsWith(':down:Escape')));
            if (escapeLeaks.length) errors.push(game.id + ': Escape leaked into gameplay: ' + escapeLeaks.join(','));

            // Simulate a Cloudflare auto-published site outrunning the manually
            // deployed scoring Worker. Old Worker rejects the new board key.
            scoreWorkerReady = false;
            await page.click(trigger);
            await page.waitForFunction(() => {
                const dialog = document.querySelector('dialog[data-scoreboard-dialog]');
                return dialog?.open && dialog.querySelector('.scoreboard-status')?.textContent
                    ?.includes('not live yet');
            }, { timeout: 6000 });
            await page.evaluate(() => document.querySelector('dialog[data-scoreboard-dialog]').close());
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
