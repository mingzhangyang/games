#!/usr/bin/env node
/** Real input and layout regressions for the responsive scientific consoles. */
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { keepPage, exitIfNoPages } from './lib/page-filter.mjs';
import { VESSEL, RULES as GAS } from '../src/games/maxwell-demon/model/rules.js';

const BASE = process.argv.find(value => value.startsWith('http')) || 'http://127.0.0.1:8899';
const pages = ['flame-verse', 'ripple-duet', 'crystal-bloom', 'maxwell-demon', 'circuit'].filter(keepPage);
exitIfNoPages(pages, 'verify-science-controls');
const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: LAUNCH_ARGS });
const errors = [];
async function open(id, viewport = { width: 390, height: 844, hasTouch: true }, lang = 'zh', theme = 'dark') {
    const page = await browser.newPage();
    await page.setViewport(viewport);
    await page.evaluateOnNewDocument((language, appearance) => {
        localStorage.setItem('site_lang', language);
        localStorage.setItem('site_theme', appearance);
    }, lang, theme);
    page.on('pageerror', error => errors.push(`${id}: ${error.message}`));
    page.on('console', message => { if (message.text().includes('oscillation')) errors.push(message.text()); });
    await page.goto(`${BASE}/${id}.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.fvGame || window.rdGame || window.cbGame || window.mdGame || window.ccGame);
    return page;
}
async function activate(page, selector, key = null) {
    if (key) {
        await page.focus(selector);
        await page.keyboard.press(key);
    } else {
        await page.tap(selector);
    }
}
try {
    const consoles = [['flame-verse', 'fv', 'fv-lab'], ['ripple-duet', 'rd', 'rd-console'], ['crystal-bloom', 'cb', 'cb-cooling']];
    for (const [id, prefix, consoleId] of consoles.filter(([id]) => pages.includes(id))) {
        for (const [width, height] of [[320, 568], [390, 844], [844, 390], [1280, 800]]) {
            for (const lang of ['zh', 'en']) {
                for (const theme of id === 'flame-verse' ? ['dark'] : ['dark', 'light']) {
                    const page = await open(id, { width, height, hasTouch: width < 1024 }, lang, theme);
                    await page.evaluate(prefix => window[`${prefix}Game`].startLevel(0), prefix);
                    await page.waitForFunction(consoleId => document.getElementById(consoleId).getBoundingClientRect().width > 200, {}, consoleId);
                    const metrics = await page.evaluate(consoleId => {
                        const panel = document.getElementById(consoleId);
                        const stage = panel.closest('.game-stage').getBoundingClientRect();
                        const canvas = document.querySelector('canvas').getBoundingClientRect();
                        const rect = panel.getBoundingClientRect();
                        return {
                            below: rect.top >= canvas.bottom - 1,
                            inside: rect.left >= stage.left - 1 && rect.right <= stage.right + 1,
                            inputs: [...panel.querySelectorAll('button,input')].map(element => {
                                const box = element.getBoundingClientRect();
                                return { id: element.id, w: box.width, h: box.height };
                            }),
                            overflow: document.scrollingElement.scrollWidth > innerWidth + 1,
                        };
                    }, consoleId);
                    const tag = `${id} ${width} ${lang} ${theme}`;
                    assert(metrics.below && metrics.inside && !metrics.overflow, `${tag}: console must sit below the canvas inside the stage`);
                    for (const input of metrics.inputs) assert(input.w >= 44 && input.h >= 44, `${tag}: ${input.id} touch target ${input.w}×${input.h}`);
                    // A clipped element can have good geometry. Test actual center hits after scrolling.
                    const action = id === 'flame-verse' ? '#fv-add-btn' : id === 'ripple-duet' ? '#rd-plus' : '#cb-anchor-add';
                    await page.$eval(action, element => element.scrollIntoView({ block: 'center' }));
                    assert(await page.$eval(action, element => {
                        const box = element.getBoundingClientRect();
                        return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
                    }), `${tag}: action center is actually reachable`);
                    await page.close();
                }
            }
        }
        console.log(`✓ ${id}: four viewports × languages × supported themes, physical targets and real hit surfaces`);
    }
    if (pages.includes('flame-verse')) {
        const page = await open('flame-verse');
        await page.evaluate(() => window.fvGame.startLevel(0));
        await activate(page, '[data-salt="na"]');
        assert.equal(await page.evaluate(() => window.fvGame.cost()), 0, 'Selecting a reagent must be free');
        await activate(page, '#fv-add-btn');
        await activate(page, '#fv-add-btn', 'Enter');
        await activate(page, '#fv-add-btn', 'Space');
        assert.deepEqual(await page.evaluate(() => [window.fvGame.recipe.na, window.fvGame.throws, document.getElementById('fv-add-btn').disabled]), [3, 3, true]);
        await activate(page, '#fv-clear-btn');
        assert.deepEqual(await page.evaluate(() => [window.fvGame.recipe.na, window.fvGame.cost(), window.fvGame.refills]), [0, 5, 1]);
        await page.evaluate(() => window.fvGame.pauseQuiet());
        assert(await page.$eval('#fv-add-btn', element => element.disabled), 'Paused reagent controls must be disabled');
        await page.evaluate(() => { window.fvGame.resumeQuiet(); window.fvGame.startLevel(0); });
        await activate(page, '#fv-add-btn');
        await activate(page, '#fv-run-btn');
        assert.equal(await page.evaluate(() => window.fvGame.state), 'won-level');
        assert(await page.$eval('#fv-lab', element => element.inert), 'Completed console must stop receiving input');
        await page.evaluate(() => { window.fvGame.toMenu(); window.fvGame.startDaily(); });
        assert.deepEqual(await page.evaluate(() => [window.fvGame.cost(), document.querySelector('[data-salt="na"] .fv-reagent-dose').textContent, document.getElementById('fv-add-btn').disabled]), [0, '0/3', false]);
        await page.close();
        console.log('✓ flame: selection / touch / native Enter and Space / capacity / cost / completion / daily reset');
    }
    if (pages.includes('ripple-duet')) {
        const page = await open('ripple-duet');
        await page.evaluate(() => window.rdGame.startLevel(0));
        await activate(page, '#rd-plus', 'Enter');
        await page.keyboard.down('Enter');
        await page.keyboard.down('Enter');
        await page.keyboard.up('Enter');
        assert.equal(await page.evaluate(() => window.rdGame.cost), 2, 'Held native Enter must not buy extra phase steps');
        const before = await page.evaluate(() => [JSON.stringify(window.rdGame.place), window.rdGame.cost]);
        await page.setViewport({ width: 844, height: 390, hasTouch: true });
        assert.deepEqual(await page.evaluate(() => [JSON.stringify(window.rdGame.place), window.rdGame.cost]), before, 'Rotation must preserve phase and costs');
        await page.evaluate(() => window.rdGame.pauseQuiet());
        await page.waitForFunction(() => document.getElementById('rd-plus').disabled);
        assert.match(await page.$eval('#rd-measure-note', element => element.textContent), /振幅/);
        await page.close();
        console.log('✓ ripple: native keys charge once, held keys rejected, rotation and pause preserve the same field');
    }
    if (pages.includes('crystal-bloom')) {
        const page = await open('crystal-bloom');
        await page.evaluate(() => window.cbGame.startLevel(0));
        await page.type('#cb-anchor-time', '45');
        await page.type('#cb-anchor-temp', '60');
        await activate(page, '#cb-anchor-add');
        assert.deepEqual(await page.evaluate(() => window.cbGame.anchors), [{ t: 45, T: 60 }]);
        await activate(page, '#cb-anchor-add');
        assert.equal(await page.evaluate(() => window.cbGame.anchors.length), 1, 'Repeat submit must not buy duplicate points');
        await page.$eval('#cb-anchor-time', element => { element.value = '46'; });
        await page.$eval('#cb-anchor-temp', element => { element.value = '59.5'; });
        await activate(page, '#cb-anchor-temp', 'Enter');
        assert.deepEqual(await page.evaluate(() => [window.cbGame.anchors.length, window.cbGame.phase]), [2, 'draw'], 'Enter in the form must not start growth');
        await page.evaluate(() => window.cbGame.pauseQuiet());
        assert(await page.$eval('#cb-anchor-add', element => element.disabled));
        await page.evaluate(() => { window.cbGame.resumeQuiet(); window.cbGame.restartLevel(); });
        assert.equal(await page.$eval('#cb-anchor-time', element => element.value), '', 'Restart clears the pending point');
        await page.close();
        console.log('✓ crystal: precise half-degree input / repeat rejection / form Enter / pause / pending-point reset');
    }
    if (pages.includes('maxwell-demon')) {
        const page = await open('maxwell-demon');
        await page.evaluate(() => window.mdGame.startLevel(0));
        const visible = await page.evaluate(({ x, y, speed }) => {
            const game = window.mdGame;
            const saved = game.world;
            const molecules = [0.5, 1.8].map((factor, index) => ({ ...saved.molecules[index], x: x - 20 + index * 40, y, vx: speed * factor, vy: 0 }));
            function render(revealT) {
                const strokes = [];
                let from = null, segments = [];
                const context = {
                    save() {}, restore() {}, beginPath() { segments = []; }, closePath() {}, fill() {}, arc() {},
                    moveTo(x, y) { from = [x, y]; },
                    lineTo(x, y) { if (from) segments.push(Math.hypot(x - from[0], y - from[1])); from = [x, y]; },
                    stroke() { if (this.lineWidth === 2) strokes.push({ lengths: segments.slice(), color: this.strokeStyle }); },
                };
                game.world = { ...saved, molecules, revealT };
                game.drawMolecules(context);
                return strokes;
            }
            try { return [render(0), render(1), render(0)]; }
            finally { game.world = saved; }
        }, { x: VESSEL.wallX, y: VESSEL.doorY, speed: GAS.v0 });
        for (const hidden of [visible[0], visible[2]]) {
            assert.equal(hidden.length, 2);
            assert.equal(hidden[0].color, hidden[1].color);
            assert.deepEqual(hidden.map(value => value.lengths), [[12], [12]], 'Unpaid/expired scan must not encode speed in trail length');
        }
        assert.notEqual(visible[1][0].color, visible[1][1].color);
        assert.notEqual(visible[1][0].lengths[0], visible[1][1].lengths[0]);
        await page.focus('#md-scan-btn');
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => window.mdGame.world.scanCount === 1);
        await page.tap('#md-scan-btn');
        await page.waitForFunction(() => window.mdGame.world.scanCount === 2);
        assert.equal(await page.evaluate(() => window.mdGame.world.spent), GAS.costScan * 2, 'Keyboard and pointer each buy exactly one scan');
        await page.close();
        console.log('✓ maxwell: hidden and expired appearance is neutral, paid scan restores speed cues, keyboard/pointer single charging');
    }
    if (pages.includes('circuit')) {
        const page = await open('circuit');
        await page.evaluate(() => { window.ccGame.startLevel(0); window.ccGame.pauseQuiet(); });
        const before = await page.evaluate(() => [window.ccGame.moves, JSON.stringify(window.ccGame.states)]);
        await page.tap('#cc-canvas');
        await page.evaluate(() => window.ccGame.flipSwitch(0));
        assert.deepEqual(await page.evaluate(() => [window.ccGame.moves, JSON.stringify(window.ccGame.states)]), before, 'Pause blocks pointer and direct action entrances');
        await page.close();
        console.log('✓ circuit: paused pointer and paid-action entrances preserve switch state and cost');
    }
    assert.deepEqual(errors, []);
} finally {
    await browser.close();
}
console.log('verify-science-controls: PASS');
