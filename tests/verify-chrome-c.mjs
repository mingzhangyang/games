#!/usr/bin/env node
/**
 * Chrome Step 2 C: real-browser regression for five special pages.
 * Includes negative validation: temporarily move the status back into the
 * topbar and prove the same ownership predicate detects the regression.
 * Browser test; auto-discovered by tests/verify-all.mjs.
 */
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';

const BASE = process.argv.find(value => value.startsWith('http')) || 'http://127.0.0.1:8899';
const ORIGIN = new URL(BASE).origin;
const GAMES = [
    { id: 'minesweeper', name: { zh: '扫雷', en: 'Minesweeper' },
        items: ['#ms-counter-mines', '#ms-face', '#ms-counter-timer'],
        menu: '#ms-start', play: '#ms-btn-play' },
    { id: 'reversi', name: { zh: '黑白棋', en: 'Reversi' },
        items: ['#rv-box-black', '#rv-box-white'],
        menu: '#rv-start', play: '#rv-btn-play' },
    { id: 'word-daily', name: { zh: '每日猜词', en: 'Word Daily' },
        items: ['#wd-num', '#wd-mode-tag'] },
    { id: 'shadow-loom', name: { zh: '影织', en: 'Shadow Loom' },
        items: ['#sl-target-btn'],
        menu: '#sl-start', play: '#sl-level-grid .sl-chip' },
    { id: 'firefly-signal', name: { zh: '萤火信号', en: 'Firefly Signal' },
        items: ['#fs-level-pill'],
        menu: '#fs-start', play: '#fs-level-list .fs-level-btn' },
];
const VIEWPORTS = [
    { width: 390, height: 664, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    { width: 1280, height: 900, deviceScaleFactor: 1 },
];
let checks = 0;
const failures = [];
function check(condition, label, extra = '') {
    checks++;
    if (!condition) failures.push(label + (extra ? ' — ' + extra : ''));
}
async function capture(page, selectors) {
    return page.evaluate(items => {
        const header = document.querySelector('.game-topbar');
        const center = header.querySelector('.game-topbar-center');
        const stage = document.querySelector('.game-stage');
        const rect = el => {
            const r = el.getBoundingClientRect();
            return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height };
        };
        const status = items.map(sel => {
            const el = document.querySelector(sel);
            return el && {
                sel, parent: el.parentElement?.className, r: rect(el),
                inStage: stage.contains(el), inTopbar: header.contains(el),
                shown: getComputedStyle(el).display !== 'none'
                    && getComputedStyle(el).visibility !== 'hidden' && !!el.getClientRects().length,
            };
        });
        const visibleText = [...center.querySelectorAll('*')].filter(el =>
            !el.children.length && el.getBoundingClientRect().width > 1
            && el.getBoundingClientRect().height > 1 && getComputedStyle(el).display !== 'none')
            .map(el => el.textContent.trim()).filter(Boolean);
        return {
            status, visibleText, stage: rect(stage), header: rect(header),
            viewport: { width: innerWidth, height: innerHeight },
        };
    }, selectors);
}
function ownedByStage(snapshot) {
    return snapshot.status.every(item => item && item.shown && item.inStage && !item.inTopbar
        && item.r.l >= snapshot.stage.l - 1 && item.r.r <= snapshot.stage.r + 1
        && item.r.t >= snapshot.stage.t - 1 && item.r.b <= snapshot.stage.b + 1);
}
const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: LAUNCH_ARGS });
try {
    for (const game of GAMES) {
        for (const vp of VIEWPORTS) {
            for (const lang of ['zh', 'en']) {
                const tag = game.id + '@' + vp.width + '×' + vp.height + '/' + lang;
                const page = await browser.newPage();
                const errors = [];
                page.on('pageerror', err => errors.push(String(err.message || err)));
                try {
                    await page.setViewport(vp);
                    await page.setBypassServiceWorker(true);
                    await page.setRequestInterception(true);
                    page.on('request', req => {
                        if (/workers\.dev/.test(req.url())) {
                            void req.respond({
                                status: 200, contentType: 'application/json',
                                headers: { 'access-control-allow-origin': ORIGIN }, body: '[]',
                            });
                        } else void req.continue();
                    });
                    await page.evaluateOnNewDocument(language => {
                        try {
                            localStorage.setItem('site_lang', language);
                            localStorage.setItem('site_muted', '1');
                        } catch { /* sandbox privacy setting */ }
                    }, lang);
                    await page.goto(BASE + '/' + game.id + '.html',
                        { waitUntil: 'load', timeout: 30000 });
                    if (game.menu) {
                        await page.waitForSelector(game.menu, { visible: true, timeout: 12000 });
                        if (game.id === 'minesweeper' || game.id === 'reversi') {
                            const start = await page.evaluate(sel => {
                                const menu = document.querySelector(sel);
                                const bar = document.querySelector('.game-topbar');
                                const btn = bar.querySelector('[data-chrome="sound"]');
                                const box = btn.getBoundingClientRect();
                                const hit = document.elementFromPoint(box.x + box.width / 2,
                                    box.y + box.height / 2);
                                return {
                                    canMute: btn === hit || btn.contains(hit),
                                    bottom: bar.getBoundingClientRect().bottom,
                                    padding: parseFloat(getComputedStyle(menu).paddingTop),
                                    nameVisible: getComputedStyle(bar.querySelector('.game-topbar-center'))
                                        .visibility === 'visible',
                                };
                            }, game.menu);
                            check(start.canMute, tag + ': start overlay leaves sound button clickable');
                            check(start.padding >= start.bottom - 1,
                                tag + ': start overlay reserves --game-topbar-bottom', JSON.stringify(start));
                            check(start.nameVisible, tag + ': menu preserves topbar name');
                            if (game.id === 'minesweeper') {
                                const hidden = await page.$eval('#ms-btn-pause', el =>
                                    getComputedStyle(el).visibility === 'hidden');
                                check(hidden, tag + ': Pause hidden until gameplay');
                            }
                        }
                        await page.waitForSelector(game.play, { visible: true, timeout: 30000 });
                        await page.click(game.play);
                        await page.waitForFunction(id => {
                            if (id === 'minesweeper') {
                                return document.getElementById('ms-start').classList.contains('hidden');
                            }
                            if (id === 'reversi') return window.rvGame?.state === 'playing';
                            if (id === 'shadow-loom') return window.slGame?.state === 'playing';
                            return window.__fireflySignal?.state === 'playing';
                        }, { timeout: 30000 }, game.id);
                    } else {
                        await page.waitForFunction(() => !!window.wordDailyGame
                            && document.querySelectorAll('#wd-board .wd-row').length > 0,
                        { timeout: 15000 });
                    }
                    await page.evaluate(() => new Promise(resolve =>
                        requestAnimationFrame(() => requestAnimationFrame(resolve))));
                    const before = await capture(page, game.items);
                    check(ownedByStage(before), tag + ': HUD and controls belong to stage',
                        JSON.stringify(before.status));
                    check(before.visibleText.length === 1
                        && before.visibleText[0].replace(/\s+/g, '') === game.name[lang].replace(/\s+/g, ''),
                    tag + ': only localized game title remains in topbar',
                    JSON.stringify(before.visibleText));
                    check(before.header.h <= 68, tag + ': single-row header', String(before.header.h));

                    if (game.id === 'minesweeper') {
                        const geo = await page.evaluate(() => {
                            const rect = sel => document.querySelector(sel).getBoundingClientRect();
                            const face = rect('#ms-face');
                            return { headerBottom: rect('.ms-board-hud').bottom,
                                boardTop: rect('#ms-board').top,
                                faceWidth: face.width, faceHeight: face.height };
                        });
                        check(geo.headerBottom <= geo.boardTop + 1,
                            tag + ': status row above board', JSON.stringify(geo));
                        check(geo.faceWidth >= 44 && geo.faceHeight >= 44,
                            tag + ': smiley touch target at least 44px', JSON.stringify(geo));
                        await page.click('#ms-board .ms-cell');
                        await page.click('#ms-btn-pause');
                        await page.click('#ms-face');
                        const reset = await page.evaluate(() => ({
                            state: window.msGame.state, paused: window.msGame.paused,
                            revealed: document.querySelectorAll('#ms-board .ms-cell.revealed').length,
                        }));
                        check(reset.state === 'idle' && !reset.paused && reset.revealed === 0,
                            tag + ': click smiley restarts even after pause', JSON.stringify(reset));
                    }
                    if (game.id === 'reversi') {
                        const geo = await page.evaluate(() => {
                            const box = sel => document.querySelector(sel).getBoundingClientRect();
                            return {
                                scoreBottom: box('.rv-score-row').bottom,
                                boardTop: box('#rv-board').top,
                                cellWidth: box('#rv-board .rv-cell').width,
                                black: document.querySelector('#rv-count-black').textContent.trim(),
                                white: document.querySelector('#rv-count-white').textContent.trim(),
                            };
                        });
                        check(geo.scoreBottom <= geo.boardTop + 1,
                            tag + ': scorecards above board', JSON.stringify(geo));
                        check(geo.cellWidth >= 20, tag + ': touch cell remains at least 20px', JSON.stringify(geo));
                        check(/^\d+$/.test(geo.black) && /^\d+$/.test(geo.white),
                            tag + ': names and piece counts remain live', JSON.stringify(geo));
                    }
                    if (game.id === 'word-daily') {
                        const issue = await page.$eval('#wd-num', el => el.textContent.trim());
                        check(/^#\d+/.test(issue), tag + ': daily issue label', issue);
                    }
                    if (game.id === 'shadow-loom') {
                        const hit = await page.$eval('#sl-target-btn', el => {
                            const r = el.getBoundingClientRect();
                            const target = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
                            return target === el || el.contains(target);
                        });
                        check(hit, tag + ': target button is pointer reachable');
                        const previous = await page.evaluate(() => window.slGame.revealUntil);
                        await page.click('#sl-target-btn');
                        const next = await page.evaluate(() => window.slGame.revealUntil);
                        check(next > previous, tag + ': target button invokes revealTarget',
                            String(previous) + ' → ' + String(next));
                    }
                    if (game.id === 'firefly-signal') {
                        const level = await page.$eval('#fs-level-pill', el => el.textContent.trim());
                        check(lang === 'en' ? level === '1 · First Light' : level === '1 · 初光',
                            tag + ': stage HUD reflects current level', level);
                    }
                    // Reverse verification: restore the old (incorrect) topbar arrangement in the DOM.
                    await page.evaluate(selectors => {
                        const center = document.querySelector('.game-topbar-center');
                        for (const selector of selectors) {
                            center.appendChild(document.querySelector(selector));
                        }
                    }, game.items);
                    const reverted = await capture(page, game.items);
                    check(!ownedByStage(reverted), tag + ': reverse mutation rejected by ownership predicate');
                    check(errors.length === 0, tag + ': no runtime errors', errors.join(' | '));
                    console.log('  ✓ ' + tag);
                } catch (error) {
                    check(false, tag + ': exception', String(error.stack || error));
                } finally {
                    await page.close();
                }
            }
        }
    }
} finally {
    await browser.close();
}
if (failures.length) {
    console.error('\n✗ verify-chrome-c: ' + failures.length + ' failures (' + checks + ' checks)');
    for (const error of failures) console.error('  ✗ ' + error);
    process.exit(1);
}
console.log('✓ verify-chrome-c: ' + checks + ' assertions passed');
