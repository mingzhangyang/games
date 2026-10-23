// verify-all: timeout=300000
// Real browser: bound overlay elements, CSS visibility, themes and mobile/desktop.
// Source and dist run the same gate through verify-all's DIST_SUITE.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { keepPage, exitIfNoPages } from './lib/page-filter.mjs';
import { registry } from '../tools/lib/registry.mjs';
import { resultRoles } from '../src/platform/shell/render-result-overlays.js';

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
try {
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
