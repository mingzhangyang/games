// verify-all: timeout=300000
// Real browser: bound overlay elements, CSS visibility, themes and mobile/desktop.
// Source and dist run the same gate through verify-all's DIST_SUITE.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { keepPage, exitIfNoPages } from './lib/page-filter.mjs';
import { registry } from '../tools/lib/registry.mjs';
import { resultRoles } from '../src/platform/shell/render-result-overlays.js';
import { renderGameShell } from '../src/platform/shell/render-game-shell.js';

const BASE = process.argv.find(arg => arg.startsWith('http')) || 'http://127.0.0.1:8899';
const cases = registry.all().filter(game => resultRoles(game).length && keepPage(game.id));
exitIfNoPages(cases, 'verify-result-overlays-browser');
const browser = await puppeteer.launch({
    executablePath: CHROME_PATH, args: LAUNCH_ARGS, headless: 'new',
});
const settings = [
    { width: 390, height: 844, lang: 'en', theme: 'dark' },
    { width: 390, height: 844, lang: 'zh', theme: 'light' },
    { width: 1280, height: 900, lang: 'en', theme: 'light' },
    { width: 1280, height: 900, lang: 'zh', theme: 'dark' },
];
let checks = 0;
const prefixClass = (prefix, kind) => prefix + '-lb-' + kind + ' game-lb-' + kind;

try {
    // A real newly scaffolded page must opt into CSS hidden behavior, not just
    // carry the 'hidden' class. Exercise the emitted markup with the actual
    // shared source/dist stylesheets before any game runtime can change state.
    const scaffoldGame = registry.all().find(game => game.id === 'lumen');
    if (keepPage(scaffoldGame.id)) {
        const scaffoldPage = await browser.newPage();
        try {
            await scaffoldPage.setJavaScriptEnabled(false);
            // Load the *actual* source or bundled dist stylesheets, then replace
            // only the DOM with the newly emitted scaffold. A raw scaffold HTML
            // document references source CSS paths which are bundled away in dist.
            const response = await scaffoldPage.goto(BASE + '/' + scaffoldGame.href, {
                waitUntil: 'load', timeout: 30000,
            });
            assert.equal(response?.status(), 200, 'scaffold CSS fixture must load');
            await scaffoldPage.evaluate(html => {
                const emitted = new window.DOMParser().parseFromString(html, 'text/html');
                document.documentElement.className = emitted.documentElement.className;
                document.documentElement.lang = emitted.documentElement.lang;
                document.body.innerHTML = emitted.body.innerHTML;
            }, renderGameShell(scaffoldGame));
            const css = await scaffoldPage.evaluate(prefix => {
                const root = document.documentElement;
                const overlays = ['clear', 'over'].map(kind => {
                    const target = document.getElementById(prefix + '-' + kind);
                    if (!target) throw new Error('Missing generated ' + kind);
                    const start = getComputedStyle(target).display;
                    target.classList.remove('hidden');
                    const open = getComputedStyle(target).display;
                    target.classList.add('hidden');
                    const closed = getComputedStyle(target).display;
                    return { start, open, closed };
                });
                return { optedIn: root.classList.contains('game-hidden-contract'), overlays };
            }, scaffoldGame.prefix);
            assert(css.optedIn, 'scaffold uses the pre-existing game-hidden-contract CSS rule');
            for (const overlay of css.overlays) {
                assert.equal(overlay.start, 'none', 'new game overlay starts hidden');
                assert.notEqual(overlay.open, 'none', 'new game overlay can open');
                assert.equal(overlay.closed, 'none', 'new game overlay closes again');
                checks += 3;
            }
        } finally {
            await scaffoldPage.close();
        }
    }
    for (const game of cases) {
        for (const setting of settings) {
            const page = await browser.newPage();
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            try {
                await page.setViewport({ width: setting.width, height: setting.height });
                await page.setBypassServiceWorker(true);
                await page.evaluateOnNewDocument(({ lang, theme }) => {
                    localStorage.setItem('site_lang', lang);
                    localStorage.setItem('site_theme', theme);
                    localStorage.setItem('site_muted', '1');
                }, setting);
                await page.goto(BASE + '/' + game.href, { waitUntil: 'load', timeout: 30000 });
                await page.waitForFunction(prefix => !!window[prefix + 'Game'], { timeout: 20000 }, game.prefix);
                if (['sd', 'ec', 'md', 'cb', 'fv', 'rd'].includes(game.prefix)) {
                    const board = await page.evaluate(prefix => {
                        const runtime = window[prefix + 'Game'];
                        const list = document.getElementById(prefix + '-lb-list');
                        const input = Array.from({ length: 12 }, (_, index) => ({
                            name: index === 1 ? '<img src=x>' : 'Player ' + index,
                            score: 100 - index,
                        }));
                        runtime.renderBoard(input);
                        const items = [...list.children];
                        const before = {
                            count: items.length,
                            tags: items.map(item => item.tagName),
                            names: items.map(item => item.children[1].textContent),
                            scores: items.map(item => item.children[2].textContent),
                            order: items.map(item => [...item.children].map(child => child.className)),
                            top: items.slice(0, 4).map(item =>
                                [...item.classList].filter(name => name.startsWith(prefix + '-lb-top'))),
                            injected: list.querySelector('img') !== null,
                        };
                        runtime.renderBoard([]);
                        before.empty = {
                            count: list.children.length,
                            tag: list.firstElementChild?.tagName,
                            klass: list.firstElementChild?.className,
                        };
                        return before;
                    }, game.prefix);
                    const label = game.id + '/' + setting.lang + '/' + setting.width;
                    assert.equal(board.count, 10, label + ': top-ten view limit');
                    assert(board.tags.every(tag => tag === 'LI'), label + ': existing row type');
                    assert.deepEqual(board.names.slice(0, 3), ['Player 0', '<img src=x>', 'Player 2'],
                        label + ': rows use safe text, preserve ranking order');
                    assert.equal(board.injected, false, label + ': names must never become HTML');
                    assert.deepEqual(board.scores.slice(0, 3), ['100', '99', '98'], label + ': score order');
                    for (const row of board.order) {
                        assert.deepEqual(row, [prefixClass(game.prefix, 'rank'), prefixClass(game.prefix, 'name'),
                            prefixClass(game.prefix, 'score')], label + ': legacy row classes');
                    }
                    const top3 = !['sd', 'ec'].includes(game.prefix);
                    assert.deepEqual(board.top, top3
                        ? [[game.prefix + '-lb-top1'], [game.prefix + '-lb-top2'], [game.prefix + '-lb-top3'], []]
                        : [[], [], [], []], label + ': per-game podium semantics');
                    assert.equal(board.empty.count, 1, label + ': empty board leaves only placeholder');
                    assert.equal(board.empty.tag, 'DIV', label + ': empty placeholder type');
                    assert.equal(board.empty.klass, game.prefix + '-lb-empty game-lb-empty',
                        label + ': empty placeholder CSS');
                    checks += 10;
                }
                for (const kind of resultRoles(game)) {
                    const geometry = await page.evaluate(({ prefix, kind }) => {
                        const target = document.getElementById(prefix + '-' + kind);
                        const originallyHidden = target.classList.contains('hidden');
                        const prev = [...document.querySelectorAll('.game-overlay')]
                            .filter(element => !element.classList.contains('hidden'));
                        for (const overlay of prev) overlay.classList.add('hidden');
                        target.classList.remove('hidden');
                        const visible = getComputedStyle(target).display !== 'none';
                        const rect = target.getBoundingClientRect();
                        const buttons = [...target.querySelectorAll('button')].map(node => {
                            const r = node.getBoundingClientRect();
                            return { id: node.id, w: r.width, h: r.height,
                                x: r.left, right: r.right, y: r.top, bottom: r.bottom };
                        });
                        target.classList.add('hidden');
                        const after = getComputedStyle(target).display;
                        for (const overlay of prev) overlay.classList.remove('hidden');
                        return { originallyHidden, shown: visible, width: rect.width,
                            height: rect.height, buttons, hiddenAgain: after === 'none' };
                    }, { prefix: game.prefix, kind });
                    const label = game.id + '/' + kind + '/' + setting.width + '/' + setting.lang;
                    assert(geometry.originallyHidden, label + ': result starts hidden');
                    assert(geometry.shown && geometry.width > 0 && geometry.height > 0,
                        label + ': result can be made visible');
                    assert(geometry.hiddenAgain, label + ': result closes again');
                    assert.equal(geometry.buttons.length, 3, label + ': three action buttons');
                    assert(geometry.buttons.every(button => button.w > 0 && button.h > 0),
                        label + ': buttons are visible and hittable');
                    assert(geometry.buttons.every(button => button.x >= -3
                        && button.right <= setting.width + 3), label + ': action buttons fit viewport');
                    checks += 5;
                }
                assert(!errors.length, game.id + ': browser page errors: ' + errors.join('; '));
                checks++;
            } finally {
                await page.close();
            }
        }
    }
    console.log('verify-result-overlays-browser: ' + checks + ' checks across ' + cases.length
        + ' games; source/dist, language/theme, viewport, show/hide and buttons');
} finally {
    await browser.close();
}
