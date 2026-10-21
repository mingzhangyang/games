#!/usr/bin/env node
/**
 * Chrome C visual proposal: REAL Chromium captures of the production build.
 *
 * The first screenshot is unmodified code. The second uses an ephemeral DOM
 * move + tools/dev/chrome-c-preview.css injected AFTER game boot. No gameplay,
 * selector ids or shipped stylesheets are changed on disk by this script.
 *
 * Usage: node tools/dev/capture-chrome-c.mjs [baseUrl] [outputDirectory]
 * Produces 5 games x 2 viewport sizes x 2 preferences x 2 states = 40 PNGs,
 * plus index.html and manifest.json. Dark-only pages correctly remain dark.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { LAUNCH_OPTS } from '../lib/browser.mjs';

const BASE = (process.argv[2] || 'http://127.0.0.1:8899').replace(/\/$/, '');
const OUT = resolve(process.argv[3] || 'chrome-c-screenshots');
const ORIGIN = new URL(BASE).origin;
const CSS = await readFile(new URL('./chrome-c-preview.css', import.meta.url), 'utf8');

const GAMES = [
    { id: 'minesweeper', title: '扫雷', status: '#ms-counter-mines, #ms-face, #ms-counter-timer', board: '#ms-board' },
    { id: 'reversi', title: '黑白棋', status: '#rv-box-black, #rv-box-white', board: '#rv-board' },
    { id: 'word-daily', title: '每日猜词', status: '#wd-num, #wd-mode-tag', board: '#wd-board' },
    { id: 'shadow-loom', title: '影织', status: '#sl-target-btn', board: '#sl-canvas' },
    { id: 'firefly-signal', title: '萤火信号', status: '#fs-level-pill', board: '#fs-canvas' },
];
const VIEWPORTS = [
    { label: '390x664', width: 390, height: 664, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    { label: '1280x900', width: 1280, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
];
const THEMES = ['dark', 'light'];

function assert(ok, message) {
    if (!ok) throw new Error(message);
}

async function enterPlay(page, id) {
    if (id === 'minesweeper') {
        await page.waitForFunction(() => !!window.msGame, { timeout: 20000 });
        await page.click('#ms-btn-play');
        await page.waitForFunction(() => document.getElementById('ms-start').classList.contains('hidden'));
    } else if (id === 'reversi') {
        await page.waitForFunction(() => !!window.rvGame, { timeout: 20000 });
        await page.click('#rv-btn-play');
        await page.waitForFunction(() => window.rvGame.state === 'playing');
    } else if (id === 'word-daily') {
        await page.waitForFunction(() => !!window.wordDailyGame
            && document.querySelectorAll('#wd-board .wd-row').length > 0, { timeout: 20000 });
    } else if (id === 'shadow-loom') {
        await page.waitForFunction(() => !!window.slGame, { timeout: 20000 });
        await page.waitForSelector('#sl-level-grid .sl-chip', { visible: true, timeout: 25000 });
        await page.click('#sl-level-grid .sl-chip');
        await page.waitForFunction(() => window.slGame.state === 'playing', { timeout: 30000 });
    } else if (id === 'firefly-signal') {
        await page.waitForFunction(() => !!window.__fireflySignal, { timeout: 20000 });
        await page.waitForSelector('#fs-level-list .fs-level-btn', { visible: true, timeout: 20000 });
        await page.click('#fs-level-list .fs-level-btn');
        await page.waitForFunction(() => window.__fireflySignal.state === 'playing', { timeout: 20000 });
    } else {
        throw new Error('Unknown game: ' + id);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() => document.fonts.ready.then(() => true));
    await new Promise(done => setTimeout(done, 600));
}

async function snapshot(page, game, proposed) {
    return page.evaluate(({ id, boardSelector, statusSelector, proposed }) => {
        const rect = element => {
            if (!element) return null;
            const r = element.getBoundingClientRect();
            return { x: +r.x.toFixed(1), y: +r.y.toFixed(1),
                width: +r.width.toFixed(1), height: +r.height.toFixed(1),
                right: +r.right.toFixed(1), bottom: +r.bottom.toFixed(1) };
        };
        const board = document.querySelector(boardSelector);
        const center = document.querySelector('.game-topbar-center');
        const statusElements = [...document.querySelectorAll(statusSelector)];
        const stage = document.querySelector('.game-stage');
        const cell = id === 'minesweeper' ? document.querySelector('#ms-board .ms-cell')
            : id === 'reversi' ? document.querySelector('#rv-board .rv-cell') : null;
        const support = document.querySelector('meta[name="theme-support"]');
        const supportsLight = !!support && /(^|\s)light(\s|$)/.test(support.content);
        const topbar = document.querySelector('.game-topbar');
        return {
            theme: document.documentElement.getAttribute('data-theme'),
            supportsLight,
            title: center?.textContent.trim(),
            centerChildren: center?.children.length,
            topbar: rect(topbar),
            board: rect(board),
            cell: rect(cell),
            stage: rect(stage),
            statuses: statusElements.map(node => ({
                id: node.id, rect: rect(node), inTopbar: topbar.contains(node),
                inStage: stage?.contains(node) || false,
                visible: node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden',
            })),
            scrollHeight: document.documentElement.scrollHeight,
            viewportHeight: innerHeight,
            viewportWidth: innerWidth,
            proposed,
        };
    }, { id: game.id, boardSelector: game.board, statusSelector: game.status, proposed });
}

async function applyProposal(page, gameId) {
    await page.evaluate(id => {
        const byId = key => {
            const el = document.getElementById(key);
            if (!el) throw new Error('Missing preview element #' + key);
            return el;
        };
        const center = document.querySelector('.game-topbar-center');
        const title = text => {
            center.replaceChildren();
            const el = document.createElement('span');
            el.className = 'chrome-c-title game-topbar-name';
            el.textContent = text;
            center.append(el);
        };
        if (id === 'minesweeper') {
            const name = byId('ms-title').textContent.trim();
            const bar = document.createElement('div');
            bar.className = 'ms-board-hud';
            bar.append(byId('ms-counter-mines'), byId('ms-face'), byId('ms-counter-timer'));
            document.querySelector('.ms-board-wrap').prepend(bar);
            title(name);
        } else if (id === 'reversi') {
            const name = byId('rv-title').textContent.trim();
            const bar = document.createElement('div');
            bar.className = 'rv-score-row';
            const divider = center.querySelector('.rv-vs');
            bar.append(byId('rv-box-black'));
            if (divider) bar.append(divider);
            bar.append(byId('rv-box-white'));
            document.querySelector('.rv-stage').prepend(bar);
            title(name);
        } else if (id === 'word-daily') {
            document.querySelector('.wd-board-wrap').prepend(document.querySelector('.wd-sub-row'));
        } else if (id === 'shadow-loom') {
            byId('sl-stage').append(byId('sl-target-btn'));
        } else if (id === 'firefly-signal') {
            const name = byId('fs-h1').textContent.trim();
            byId('fs-stage').insertBefore(byId('fs-level-pill'), byId('fs-hud'));
            const label = document.createElement('span');
            label.className = 'chrome-c-title game-topbar-name';
            label.textContent = name;
            center.append(label);
        }
        document.documentElement.classList.add('chrome-c-proposal');
    }, gameId);
    await page.addStyleTag({ content: CSS });
    await page.evaluate(() => new Promise(done => {
        requestAnimationFrame(() => requestAnimationFrame(done));
    }));
}

function verifyPreview(game, before, after, requestedTheme, errors) {
    assert(errors.length === 0, game.id + ': runtime page errors: ' + errors.join(' | '));
    assert(before.board && after.board, game.id + ': board disappeared');
    const expectedTheme = after.supportsLight ? requestedTheme : 'dark';
    assert(after.theme === expectedTheme, game.id + ': unexpected theme ' + after.theme);
    assert(after.statuses.length > 0, game.id + ': status elements missing');
    assert(after.statuses.every(x => x.inStage && !x.inTopbar && x.visible),
        game.id + ': status did not reach visible stage: ' + JSON.stringify(after.statuses));
    assert(after.statuses.every(x => x.rect.x >= -1 && x.rect.right <= after.viewportWidth + 1),
        game.id + ': status spills outside viewport');
    if (game.id === 'minesweeper' || game.id === 'reversi') {
        assert(after.cell && after.cell.width >= 20,
            game.id + ': touch cell below 20px: ' + JSON.stringify(after.cell));
    }
    if (game.id === 'shadow-loom') {
        assert(after.statuses[0].rect.y >= after.stage.y - 1, 'Shadow Loom target above stage');
    }
    if (game.id === 'firefly-signal') {
        assert(after.title.length > 0, 'Firefly topbar name missing');
    }
}

function gallery(items) {
    const cards = items.map(entry => {
        const name = entry.gameTitle + ' · ' + entry.viewport + ' · requested ' + entry.requestedTheme
            + (entry.effectiveTheme !== entry.requestedTheme ? ' → actual dark (dark-only game)' : '');
        return '<section><h2>' + name + '</h2><div class="pair"><figure>'
            + '<a href="' + entry.beforeImage + '"><img src="' + entry.beforeImage + '" loading="lazy" alt="Existing layout"></a>'
            + '<figcaption>Current main, unmodified</figcaption></figure><figure>'
            + '<a href="' + entry.afterImage + '"><img src="' + entry.afterImage + '" loading="lazy" alt="Proposed layout"></a>'
            + '<figcaption>Proposed C placement (browser-only temporary reparenting)</figcaption></figure></div></section>';
    }).join('\n');
    return '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width">'
        + '<title>Chrome C layout preview</title><style>'
        + 'body{font:15px system-ui;background:#101722;color:#e4ecf7;margin:0;padding:24px;max-width:1600px;margin-inline:auto}'
        + 'h1{font-size:27px}p{line-height:1.7;color:#acc0d1}section{border-top:1px solid #435369;padding:20px 0}'
        + 'h2{font-size:17px}.pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}'
        + 'figure{margin:0}img{display:block;max-width:100%;height:auto;border:1px solid #394c5d;border-radius:10px}'
        + 'figcaption{padding:8px 0;color:#c8d6df;font-size:13px}'
        + '@media(max-width:740px){.pair{grid-template-columns:1fr}}'
        + '</style><h1>Chrome 第 2 步 C 批 · 浏览器真实截图</h1>'
        + '<p>Each row compares one real Chromium gameplay run before/after applying temporary proposed markup and CSS. '
        + '390×664 (mobile) and 1280×900 (desktop), dark/light preferences. '
        + '影织、萤火信号仅支持深色；light 请求的实际截图仍为深色，并非伪造浅色。 '
        + '只需审阅布局；正式游戏代码尚未修改。完整几何记录见 manifest.json。</p>'
        + cards + '</html>';
}

await mkdir(OUT, { recursive: true });
const browser = await puppeteer.launch(LAUNCH_OPTS);
const results = [];
const failures = [];
try {
    for (const game of GAMES) {
        for (const viewport of VIEWPORTS) {
            for (const requestedTheme of THEMES) {
                const tag = game.id + '--' + viewport.label + '--' + requestedTheme;
                const page = await browser.newPage();
                const errors = [];
                page.on('pageerror', error => errors.push(error.message));
                try {
                    await page.setViewport(viewport);
                    await page.setBypassServiceWorker(true);
                    await page.setRequestInterception(true);
                    page.on('request', request => {
                        if (request.url().startsWith(ORIGIN + '/')) {
                            void request.continue();
                        } else if (/^https?:/.test(request.url())) {
                            void request.respond({
                                status: 200,
                                contentType: 'application/json',
                                headers: { 'access-control-allow-origin': ORIGIN },
                                body: '[]',
                            });
                        } else {
                            void request.continue();
                        }
                    });
                    await page.evaluateOnNewDocument((theme) => {
                        try {
                            localStorage.clear();
                            localStorage.setItem('site_lang', 'zh');
                            localStorage.setItem('site_theme', theme);
                            localStorage.setItem('site_muted', '1');
                        } catch { /* browser privacy mode */ }
                    }, requestedTheme);
                    await page.goto(BASE + '/' + game.id + '.html', {
                        waitUntil: 'domcontentloaded', timeout: 30000,
                    });
                    await enterPlay(page, game.id);
                    const before = await snapshot(page, game, false);
                    const beforeImage = tag + '--current.png';
                    await page.screenshot({ path: resolve(OUT, beforeImage), type: 'png', fullPage: false });
                    await applyProposal(page, game.id);
                    const after = await snapshot(page, game, true);
                    const afterImage = tag + '--proposal.png';
                    await page.screenshot({ path: resolve(OUT, afterImage), type: 'png', fullPage: false });
                    verifyPreview(game, before, after, requestedTheme, errors);
                    results.push({ game: game.id, gameTitle: game.title, viewport: viewport.label,
                        requestedTheme, effectiveTheme: after.theme, beforeImage, afterImage, before, after });
                    console.log('PASS ' + tag + ' (' + before.theme + ' → ' + after.theme + ')');
                } catch (error) {
                    failures.push({ tag, message: String(error.stack || error) });
                    console.error('FAIL ' + tag + ': ' + String(error.message || error));
                    // Keep capturing other pages: a partial Artifact is useful for diagnosis.
                } finally {
                    await page.close().catch(() => {});
                }
            }
        }
    }
} finally {
    await browser.close();
}
await writeFile(resolve(OUT, 'manifest.json'), JSON.stringify({
    note: 'Current screenshots are real built pages; proposal is temporary DOM+CSS, not production code.',
    expectedCases: 20, completedCases: results.length, failedCases: failures.length,
    results, failures,
}, null, 2) + '\n');
await writeFile(resolve(OUT, 'index.html'), gallery(results));
await writeFile(resolve(OUT, 'README.txt'),
    'Open index.html locally for side-by-side real browser screenshots.\n'
    + '20 comparison pairs = 40 PNGs. Baseline and browser-only proposal.\n'
    + 'Effective themes are in manifest.json. Shadow Loom and Firefly Signal are dark-only.\n'
    + 'Review positions before implementing the actual C-batch source modifications.\n');
console.log('Captured ' + results.length + '/20 pairs. Failures: ' + failures.length);
if (failures.length) process.exitCode = 1;
