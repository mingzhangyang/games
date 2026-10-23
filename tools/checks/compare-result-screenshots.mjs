// One-time, deterministic pre/post browser screenshots for result overlays.
// Run on the exact migration branch with baseline and candidate static servers.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { registry } from '../lib/registry.mjs';
import { CHROME_PATH, LAUNCH_ARGS } from '../../tests/lib/browser.mjs';
import { resultRoles } from '../../src/platform/shell/render-result-overlays.js';

const [beforeBase, afterBase] = process.argv.slice(2);
if (!beforeBase?.startsWith('http') || !afterBase?.startsWith('http')) {
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
let comparisons = 0;
async function capture(base, game, kind, settings) {
    const page = await browser.newPage();
    try {
        await page.setViewport({ width: settings.width, height: settings.height, deviceScaleFactor: 1 });
        // Screens compare CSS/static UI only. Actual game interactions are checked
        // separately in the source+dist suites; remove physics/randomness here.
        await page.setJavaScriptEnabled(false);
        await page.goto(base + '/' + game.href, { waitUntil: 'load', timeout: 30000 });
        await page.addStyleTag({
            content: '*,*::before,*::after { animation:none!important; transition:none!important; caret-color:transparent!important; }',
        });
        await page.evaluate(({ prefix, kind, lang, theme }) => {
            document.documentElement.lang = lang;
            document.documentElement.dataset.theme = theme;
            document.body.dataset.theme = theme;
            for (const overlay of document.querySelectorAll('.game-overlay')) overlay.classList.add('hidden');
            const target = document.getElementById(prefix + '-' + kind);
            if (!target) throw new Error('Missing result overlay ' + prefix + '-' + kind);
            target.classList.remove('hidden');
        }, { prefix: game.prefix, kind, lang: settings.lang, theme: settings.theme });
        await page.evaluate(() => document.fonts.ready);
        return await page.screenshot({ type: 'png', animations: 'disabled' });
    } finally {
        await page.close();
    }
}
try {
    for (const game of registry.all().filter(g => resultRoles(g).length)) {
        for (const kind of resultRoles(game)) {
            for (const setting of SETTINGS) {
                const before = await capture(beforeBase, game, kind, setting);
                const after = await capture(afterBase, game, kind, setting);
                const label = [game.id, kind, setting.lang, setting.theme, setting.width].join('/');
                assert(before.equals(after), label + ': screenshot pixel bytes differ from baseline');
                comparisons++;
                console.log('PIXEL-IDENTICAL', label);
            }
        }
    }
    assert.equal(comparisons, 72, 'eighteen overlays times four deterministic states');
    console.log('Step 6c-3 screenshot parity: ' + comparisons + '/72 pixel-identical pairs');
} finally {
    await browser.close();
}
