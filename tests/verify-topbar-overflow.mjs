// verify-all: timeout=300000
// Real rendered controls at both sides of the breakpoint, plus isolated native
// popover lifecycle races. Runs against source AND dist through verify-all.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { keepPage, exitIfNoPages } from './lib/page-filter.mjs';
import { registry } from './lib/registry.mjs';
import { clickTopbarAction } from './lib/topbar-actions.mjs';
import { renderTopbar, planMobileTopbar } from '../src/platform/shell/render-topbar.js';

const BASE = process.argv.find(a => a.startsWith('http')) || 'http://127.0.0.1:8899';
const games = registry.withCap('topbar').filter(g => keepPage(g.id));
exitIfNoPages(games, 'verify-topbar-overflow');
const OUT = join(tmpdir(), 'chrome-step5b-' + (process.env.VERIFY_BUILT_OUTPUT ? 'dist' : 'source'));
mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME_PATH, args: LAUNCH_ARGS, headless: 'new' });
let checks = 0;
const check = (ok, message) => { checks++; assert(ok, message); };
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const openMenu = async page => {
    await page.click('[data-topbar-more]');
    await page.waitForFunction(() => document.querySelector('[popover]')?.matches(':popover-open')
        && document.activeElement?.hasAttribute('data-topbar-proxy'));
};
const closeMenu = async page => {
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('[popover]')?.matches(':popover-open'));
};
const begin = async (page, id) => {
    if (id === 'carrot-pull') {
        await page.waitForFunction(() => ['ready', 'fallback'].includes(document.getElementById('cp-stage')?.dataset.artState));
    }
    await page.evaluate(async name => {
        if (name === 'carrot-pull') window.cpGame.start();
        if (name === 'shadow-loom') await window.slGame.startLevel(0);
        if (name === 'loop-jail') window.ljGame.start();
        if (name === 'sudoku-mist') window.smGame.startLevel(0);
    }, id);
    await page.waitForFunction(() => {
        const source = document.querySelector('[data-topbar-overflow-source]');
        return source && !source.disabled && !source.classList.contains('hidden');
    });
    await settle(page);
};

try {
    for (const game of games) {
        for (const lang of ['zh', 'en']) {
            const page = await browser.newPage();
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.setViewport({ width: 390, height: 844 });
            await page.setBypassServiceWorker(true);
            await page.evaluateOnNewDocument(locale => {
                localStorage.setItem('site_lang', locale);
                localStorage.setItem('site_muted', '1');
            }, lang);
            try {
                await page.goto(BASE + '/' + game.href, { waitUntil: 'load', timeout: 30000 });
                const plan = planMobileTopbar(game);
                if (plan.overflow.length) {
                    await page.waitForSelector('[data-topbar-overflow-ready]');
                    if (plan.overflow.includes('restart')) {
                        check(await page.$eval('[data-topbar-more]', node => node.hidden), game.id + ': no dead menu before play');
                        await begin(page, game.id);
                    }
                }
                for (const width of [320, 375, 390, 480, 481, 1280]) {
                    await page.setViewport({ width, height: 844 });
                    await settle(page);
                    const snapshot = await page.evaluate(() => {
                        const header = document.querySelector('.game-topbar');
                        // Include visibility:hidden slots in the geometry budget.
                        const laidOut = node => node.getBoundingClientRect().width > 0;
                        const actions = [...header.querySelectorAll('[data-topbar-action]')];
                        const visible = actions.filter(laidOut);
                        const row = [...header.querySelectorAll('button, [data-chrome="home"]')]
                            .filter(node => !node.closest('[popover]') && laidOut(node));
                        const boxes = row.map(node => node.getBoundingClientRect());
                        const mids = boxes.map(r => r.top + r.height / 2);
                        const more = header.querySelector('[data-topbar-more]');
                        return {
                            visible: visible.map(node => node.dataset.topbarAction),
                            overflowHidden: actions.filter(node => node.hasAttribute('data-topbar-overflow-source'))
                                .every(node => !laidOut(node)),
                            more: more && laidOut(more),
                            spread: Math.max(...mids) - Math.min(...mids),
                            clipped: boxes.some(r => r.left < -1 || r.right > innerWidth + 1),
                            last: row.at(-1)?.getAttribute('data-chrome'),
                            duplicates: [...document.querySelectorAll('[id]')].map(n => n.id)
                                .filter((id, index, ids) => ids.indexOf(id) !== index),
                        };
                    });
                    const tag = `${game.id}/${lang}/${width}`;
                    check(snapshot.visible.filter(role => role !== 'sound').length <= (width <= 480 ? 2 : game.chrome.actions.length), tag + ': action limit');
                    check(snapshot.last === 'sound', tag + ': Sound is always last');
                    check(snapshot.spread <= 12 && !snapshot.clipped, tag + ': one row inside viewport');
                    check(!snapshot.duplicates.length, tag + ': duplicate ids');
                    if (plan.overflow.length) {
                        check(snapshot.overflowHidden === (width <= 480), tag + ': source/menu CSS breakpoint');
                        check(!!snapshot.more === (width <= 480), tag + ': menu invoker CSS breakpoint');
                    } else check(!snapshot.more, tag + ': no redundant menu');
                }
                if (plan.overflow.length) {
                    await page.setViewport({ width: 390, height: 844 });
                    await openMenu(page);
                    const semantics = await page.evaluate(() => {
                        const menu = document.querySelector('[popover]');
                        const more = document.querySelector('[data-topbar-more]');
                        const items = [...menu.querySelectorAll('[data-topbar-proxy]')].filter(node => !node.hidden);
                        return menu.getAttribute('popover') === 'auto' && menu.getAttribute('role') === 'menu'
                            && more.getAttribute('aria-expanded') === 'true' && more.getAttribute('aria-haspopup') === 'menu'
                            && more.getAttribute('aria-controls') === menu.id && !!more.getAttribute('aria-label')
                            && items.length > 0 && items.every(item => item.textContent.trim()
                                && item.getAttribute('aria-label') === document.getElementById(item.dataset.topbarProxy).getAttribute('aria-label')
                                && item.getBoundingClientRect().height >= 44);
                    });
                    check(semantics, game.id + ': named menu and 44px commands');
                    if (lang === 'zh') await page.screenshot({ path: join(OUT, game.id + '-390-menu.png') });
                    await closeMenu(page);
                    check(await page.$eval('[data-topbar-more]', node => node === document.activeElement), game.id + ': Escape restores focus');
                    await page.keyboard.press('ArrowDown');
                    await page.waitForFunction(() => document.activeElement.hasAttribute('data-topbar-proxy'));
                    await page.keyboard.press('Tab');
                    await page.waitForFunction(() => !document.querySelector('[popover]').matches(':popover-open'));
                    check(await page.$eval('[data-chrome="sound"]', node => node === document.activeElement), game.id + ': Tab exits to Sound');
                    await openMenu(page);
                    await page.setViewport({ width: 481, height: 844 });
                    await page.waitForFunction(() => !document.querySelector('[popover]').matches(':popover-open'));
                    check(await page.evaluate(() => document.activeElement.getBoundingClientRect().width > 0), game.id + ': resize preserves visible focus');
                    await page.setViewport({ width: 390, height: 844 });
                }
                if (game.id === 'tower-defense') {
                    await page.evaluate(() => {
                        window.__rangeClicks = 0;
                        document.getElementById('td-range-btn').addEventListener('click', () => window.__rangeClicks++);
                    });
                    const before = await page.evaluate(() => window.tdGame.showAllRanges);
                    await clickTopbarAction(page, '#td-range-btn');
                    check(await page.evaluate(prior => window.__rangeClicks === 1 && window.tdGame.showAllRanges !== prior, before), 'range command invokes original handler exactly once');
                    check(await page.$eval('[data-topbar-more]', node => node === document.activeElement), 'range command returns to more');
                    await clickTopbarAction(page, '#tdStatsToggle');
                    await page.waitForFunction(() => !document.getElementById('tdTacticalPanel').classList.contains('hidden'));
                    check(await page.$eval('#tdTacticalClose', node => node === document.activeElement), 'field manual receives focus');
                    await page.keyboard.press('Escape');
                    check(await page.$eval('[data-topbar-more]', node => node === document.activeElement), 'field manual returns to visible invoker');
                }
                if (game.id === 'needle-awn') {
                    await clickTopbarAction(page, '#na-leaderboard-btn');
                    await page.waitForFunction(() => document.querySelector('dialog[data-scoreboard-dialog]')?.open);
                    check(await page.evaluate(() => document.querySelector('dialog').contains(document.activeElement)), 'menu does not steal modal focus');
                    await page.keyboard.press('Escape');
                    await page.waitForFunction(() => !document.querySelector('dialog[data-scoreboard-dialog]').open);
                    check(await page.$eval('[data-topbar-more]', node => node === document.activeElement), 'dialog returns to visible menu invoker');
                    // Real input-owner regression: releasing W with the popover
                    // open must clear Needle Awn's held movement state.
                    await page.waitForFunction(() => window.gameEngine?.artReady, { timeout: 15000 });
                    await page.evaluate(() => window.gameEngine.startEndlessMode());
                    await page.keyboard.down('w');
                    check(await page.evaluate(() => window.gameEngine.keys.KeyW === true), 'needle held W registers before menu');
                    await openMenu(page);
                    await page.keyboard.up('w');
                    check(await page.evaluate(() => window.gameEngine.keys.KeyW === false), 'needle held W releases through open menu');
                    await closeMenu(page);
                    check(await page.evaluate(() => window.gameEngine.keys.KeyW === false), 'needle movement remains released after dismissal');
                }
                check(!errors.length, game.id + ': runtime errors ' + errors.join('; '));
            } finally {
                await page.close();
            }
        }
    }

    // Isolated native fixture: a bounded test of observer/focus races and
    // idempotence, without game clocks or network determining the outcome.
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844 });
    const tower = registry.all().find(g => g.id === 'tower-defense');
    const css = ['tokens', 'layout'].map(name => readFileSync(new URL('../css/' + name + '.css', import.meta.url), 'utf8')).join('\n');
    const controller = readFileSync(new URL('../src/platform/game-topbar-overflow.js', import.meta.url), 'utf8')
        .replace("import { getLang } from './site-settings.js';", "const getLang = () => 'en';")
        .replace('export function', 'function');
    await page.setContent('<style>' + css + '</style>' + renderTopbar(tower)
        + '<button id="outside">Outside</button><dialog id="fixture"><button id="close">Close</button></dialog>');
    await page.addScriptTag({ content: controller + `
        const header = document.querySelector('.game-topbar');
        window.fixtureApi = bindTopbarOverflow(header);
        window.sameBinding = window.fixtureApi === bindTopbarOverflow(header);
        window.commandCount = 0;
        document.getElementById('td-range-btn').addEventListener('click', () => window.commandCount++);
        document.getElementById('tdStatsToggle').setAttribute('aria-label', 'Statistics');
        document.getElementById('tdStatsToggle').addEventListener('click', () => document.getElementById('fixture').showModal());
        document.getElementById('close').addEventListener('click', () => document.getElementById('fixture').close());
    ` });
    check(await page.evaluate(() => window.sameBinding), 'repeated binder calls are idempotent');
    await openMenu(page);
    await page.keyboard.press('Enter');
    check(await page.evaluate(() => window.commandCount === 1), 'Enter fires once');
    await page.keyboard.press('ArrowUp');
    await page.waitForFunction(() => document.activeElement.dataset.topbarProxy === 'tdStatsToggle');
    await page.keyboard.press('Space');
    await page.waitForFunction(() => document.getElementById('fixture').open);
    await settle(page);
    check(await page.$eval('#close', node => node === document.activeElement), 'queued close never steals modal focus');
    await page.click('#close');
    check(await page.$eval('[data-topbar-more]', node => node === document.activeElement), 'native dialog chain returns to more');
    await openMenu(page);
    await page.evaluate(() => { document.getElementById('td-range-btn').disabled = true; });
    await page.waitForFunction(() => document.activeElement.dataset.topbarProxy === 'tdStatsToggle');
    check(await page.$eval('[data-topbar-proxy="td-range-btn"]', node => node.hidden && node.disabled), 'state changes immediately hide invalid commands');
    await page.evaluate(() => { document.getElementById('tdStatsToggle').disabled = true; });
    await page.waitForFunction(() => !document.querySelector('[popover]').matches(':popover-open'));
    check(await page.$eval('[data-topbar-more]', node => node.hidden), 'empty menu hides invoker');
    check(await page.evaluate(() => document.activeElement !== document.body
        && document.activeElement.getBoundingClientRect().width > 0), 'empty-menu close retains visible focus');
    await page.evaluate(() => {
        document.getElementById('td-range-btn').disabled = false;
        document.getElementById('tdStatsToggle').disabled = false;
    });
    await openMenu(page);
    await page.click('#outside');
    await page.waitForFunction(() => !document.querySelector('[popover]').matches(':popover-open'));
    check(await page.$eval('#outside', node => node === document.activeElement), 'light dismiss does not steal a clicked control focus');
    await page.evaluate(() => {
        window.fixtureApi.disconnect();
        window.fixtureApi = null;
    });
    check(await page.$eval('#td-range-btn', node => node.getBoundingClientRect().width > 0), 'disconnect restores original responsive fallback');
    await page.close();
    console.log(`verify-topbar-overflow: ${checks} assertions passed; screenshots ${OUT}`);
} finally {
    await browser.close();
}
