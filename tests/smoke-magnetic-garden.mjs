#!/usr/bin/env node
// Real pointer/keyboard acceptance: deterministic preview, capture undo, durable
// replay, all 24 puzzles, and the six-gardens-per-chapter ranking boundary.
// verify-all: timeout=180000
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { LEVELS, CHAPTERS } from '../src/games/magnetic-garden/model/levels.js';
import { applyAction, createState, legalActions, stateKey } from '../src/games/magnetic-garden/model/rules.js';
import { solveLevel } from '../src/games/magnetic-garden/model/solver.js';
import { describePreview } from '../src/games/magnetic-garden/preview-description.js';
import { LANGUAGES } from '../src/games/magnetic-garden/i18n.js';

const BASE = process.argv.find(value => value.startsWith('http')) || 'http://127.0.0.1:8899';
const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: LAUNCH_ARGS });
const errors = [];
const posts = [];
const storageKey = 'game:magnetic-garden:v1:progress';
function findOffPathHint() {
    for (const level of LEVELS) {
        let state = createState(level);
        const canonical = new Set([stateKey(state)]);
        for (const action of level.solution) { state = applyAction(level, state, action).state; canonical.add(stateKey(state)); }
        for (const action of legalActions(level, createState(level))) {
            const next = applyAction(level, createState(level), action).state;
            if (next.won || canonical.has(stateKey(next))) continue;
            const result = solveLevel(level, { start: next, maxStates: 20000, maxDepth: 6 });
            if (result.status === 'solved' && result.solution.length) return { level, action, next, solution: result.solution };
        }
    }
    throw new Error('No short solvable off-path hint fixture in authored levels');
}
let assertions = 0;
function check(value, message) { assert.ok(value, message); assertions++; }
async function open(width = 390, height = 844, lang = 'en', reduced = false) {
    const page = await browser.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewport({ width, height, deviceScaleFactor: 2, isMobile: width < 900, hasTouch: width < 900 });
    await page.setBypassServiceWorker(true);
    await page.setRequestInterception(true);
    page.on('request', request => {
        if (request.url().startsWith('https://game-scores.orangely.workers.dev/scores')) {
            if (request.method() === 'POST') posts.push(JSON.parse(request.postData()));
            void request.respond({ status: 200, contentType: 'application/json',
                headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS',
                    'access-control-allow-headers': 'content-type' }, body: '[]' });
        } else if (/workers\.dev/.test(request.url())) {
            void request.respond({ status: 200, contentType: 'application/json',
                headers: { 'access-control-allow-origin': '*' }, body: '{}' });
        } else void request.continue();
    });
    await page.evaluateOnNewDocument(language => {
        localStorage.setItem('site_lang', language);
        localStorage.setItem('site_muted', '1');
        localStorage.setItem('player_name', 'Garden Tester');
    }, lang);
    if (reduced) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.goto(`${BASE}/magnetic-garden.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.mgGame);
    await page.evaluate(() => {
        window.__gardenEvents = [];
        window.hubTrack = (game, event) => window.__gardenEvents.push([game, event]);
    });
    return page;
}
const snapshot = page => page.evaluate(() => JSON.parse(JSON.stringify(window.mgGame.sim)));
async function swipeMenuUp(page) {
    const client = await page.target().createCDPSession();
    const x = 190, startY = 710, distance = 410;
    try {
        await client.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{ x, y:startY, id:1 }] });
        for (let i = 1; i <= 10; i++) {
            await client.send('Input.dispatchTouchEvent', {
                type:'touchMove', touchPoints:[{ x, y:startY - distance * i / 10, id:1 }],
            });
            await new Promise(resolve => setTimeout(resolve, 22));
        }
        await client.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
        await new Promise(resolve => setTimeout(resolve, 160));
    } finally { await client.detach(); }
}
async function click(page, selector) {
    await page.waitForSelector(selector, { visible: true });
    await page.$eval(selector, element => element.scrollIntoView({ block: 'center', inline: 'center' }));
    await page.click(selector);
}
async function start(page, level) {
    if (!await page.$eval('#mg-start', element => !element.classList.contains('hidden'))) {
        const state = await page.evaluate(() => window.mgGame.state);
        if (state === 'over') await click(page, '#mg-result-menu');
        else { await click(page, '#mg-pause-btn'); await click(page, '#mg-pause-menu'); }
    }
    await click(page, `[data-level="${level.id}"]`);
    await page.waitForFunction(id => window.mgGame.state === 'playing' && window.mgGame.level.id === id,
        {}, level.id);
}
async function perform(page, action, { preview = false } = {}) {
    const before = await snapshot(page);
    const magnet = before.magnets.find(item => item.id === action.magnetId);
    await click(page, magnet.cell === null ? `[data-magnet="${magnet.id}"]` : `[data-cell="${magnet.cell}"]`);
    if (action.type === 'flip') await click(page, '#mg-flip');
    else await click(page, `[data-cell="${action.cell}"]`);
    if (preview) {
        assert.deepEqual(await snapshot(page), before, 'preview cannot mutate live garden');
        const levelId = await page.evaluate(() => window.mgGame.level.id);
        const expected = applyAction(LEVELS.find(level => level.id === levelId), before, action).state;
        const renderedPreview = await page.evaluate(() => window.mgGame.preview.result.state);
        assert.deepEqual(renderedPreview, expected, 'visible preview uses the independent deterministic result');
        const accessibility = await page.evaluate(() => {
            const status = document.getElementById('mg-preview-summary');
            return { text: status.textContent, role: status.getAttribute('role'), live: status.getAttribute('aria-live'),
                describedBy: document.getElementById('mg-commit').getAttribute('aria-describedby') };
        });
        check(accessibility.role === 'status' && accessibility.live === 'polite'
            && accessibility.describedBy === 'mg-preview-summary',
        'exact preview uses a polite live status linked to the Commit button');
        assert.equal(accessibility.text, describePreview(LEVELS.find(level => level.id === levelId),
            before, { action, result: { valid: true, state: expected } }, LANGUAGES.en),
        'accessible preview matches the exact predicted destinations and captures');
        assertions += 3;
    }
    const renderedPreview = await page.evaluate(() => window.mgGame.preview.result.state);
    await click(page, '#mg-commit');
    await page.waitForFunction(moves => window.mgGame.sim.moves === moves, {}, before.moves + 1);
    await page.waitForFunction(() => !window.mgGame.animating);
    assert.deepEqual(await snapshot(page), renderedPreview, 'committed state exactly matches the shown preview');
    assertions++;
}
try {
    const page = await open();
    await page.waitForSelector('.mg-hero-image.is-ready', { visible: true });
    const art = await page.evaluate(async () => {
        const hero = document.querySelector('.mg-hero-image');
        await hero.decode();
        const backdrop = getComputedStyle(document.getElementById('mg-stage'), '::before');
        const url = /url\(["']?([^"')]+)["']?\)/.exec(backdrop.backgroundImage)?.[1];
        const image = new window.Image(); image.src = url || ''; await image.decode();
        return { heroWidth: hero.naturalWidth, heroHeight: hero.naturalHeight,
            fallbackHidden: getComputedStyle(document.querySelector('.mg-hero-art')).display === 'none',
            backdropWidth: image.naturalWidth, backdropHeight: image.naturalHeight,
            backdropVisible: parseFloat(backdrop.opacity) > 0 && backdrop.content !== 'none',
            backdropFetched: performance.getEntriesByName(url).some(entry => entry.responseEnd > 0) };
    });
    check(art.heroWidth >= 512 && art.heroHeight >= 512 && art.fallbackHidden, 'production hero image is decoded and replaces fallback art');
    check(art.backdropWidth >= 512 && art.backdropHeight >= 512 && art.backdropVisible && art.backdropFetched,
        'production greenhouse workbench is fetched, decoded, and displayed: ' + JSON.stringify(art));
    check(LEVELS.length === 24 && CHAPTERS.length === 4, '24 authored gardens in four chapters');
    await click(page, '#mg-help-btn');
    check(await page.evaluate(() => {
        const overlay = document.getElementById('mg-help');
        const frame = overlay.getBoundingClientRect();
        const close = document.getElementById('mg-help-close').getBoundingClientRect();
        return getComputedStyle(overlay).position === 'fixed'
            && Math.abs(frame.top) <= 1 && Math.abs(frame.bottom - innerHeight) <= 1
            && close.top >= 0 && close.bottom <= innerHeight;
    }), 'mobile help is viewport-bound and Close is visible even over the long menu');
    await click(page, '#mg-help-close');
    check(await page.$$eval('[data-level]', buttons => buttons.length === 24 && buttons.every(button => !button.disabled)),
        'all 24 gardens accessible from a new save');
    check(await page.evaluate(() => window.__gardenEvents.length === 0), 'menu view does not count as a play');
    // The click helper scrollIntoView() on Help/Close may move the document.
    // Start the native touch-gesture probe at a known top-of-page position,
    // independent of that earlier accessibility interaction.
    await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
    await page.waitForFunction(() => window.scrollY === 0);
    const mobileMenu = await page.evaluate(() => ({
        stageTouch: getComputedStyle(document.getElementById('mg-stage')).touchAction,
        available: document.documentElement.scrollHeight - window.innerHeight,
        initial: window.scrollY,
    }));
    check(mobileMenu.stageTouch.includes('pan-y') && mobileMenu.available > 250 && mobileMenu.initial === 0,
        'visible mobile level menu exposes native vertical panning without changing play-state touch contract: ' + JSON.stringify(mobileMenu));
    await swipeMenuUp(page);
    check(await page.evaluate(() => window.scrollY > 35),
        'real mobile touch swipe scrolls to later garden chapters (not scrollIntoView)');
    await click(page, '#mg-btn-start');
    check(await page.evaluate(() => window.__gardenEvents.filter(([, event]) => event === 'play').length === 1), 'starting a garden counts one play');
    const untouched = await snapshot(page);
    await page.focus('[data-cell="2"]');
    check(await page.evaluate(() => window.mgGame.preview?.pinned === false
        && document.getElementById('mg-preview-panel').classList.contains('hidden')
        && document.getElementById('mg-preview-summary').textContent.includes('N seed s1')),
    'keyboard focus exposes a transient exact preview through live status');
    assert.deepEqual(await snapshot(page), untouched, 'keyboard preview does not commit a move');
    assertions++;
    await click(page, '#mg-pause-btn');
    await page.keyboard.press('f');
    await page.keyboard.press('u');
    assert.deepEqual(await snapshot(page), untouched, 'paused keyboard cannot change the garden');
    await click(page, '.scoreboard-trigger--icon');
    await page.waitForFunction(() => document.querySelector('dialog[data-scoreboard-dialog]').open);
    check(await page.$eval('.scoreboard-select', select => select.options.length === 4), 'ranking dialog offers four chapter boards');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !window.mgGame.pauseOwnership.isHeld('ranking'));
    check(await page.evaluate(() => window.mgGame.isPaused), 'rankings preserve the player pause');
    await click(page, '#mg-resume');
    check(await page.evaluate(() => window.__gardenEvents.length === 1), 'pause and dialog interruption do not emit play or finish');
    await perform(page, LEVELS[0].solution[0], { preview: true });
    check(await page.evaluate(() => window.mgGame.sim.won && window.mgGame.state === 'over'), 'real first-level input completes garden');
    check(await page.$eval('#mg-result', element => !element.classList.contains('hidden')), 'visible completion result');
    check(posts.length === 0, 'one completed level is ineligible for chapter ranking');
    check(await page.evaluate(() => window.__gardenEvents.filter(([, event]) => event === 'finish').length === 1), 'one finish analytics event per completion');
    const savedBest = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).best, storageKey);
    check(savedBest[LEVELS[0].id], 'completion persists a verified best run');
    await click(page, '#mg-result-undo');
    check(await page.evaluate(() => window.mgGame.state === 'playing' && !window.mgGame.sim.won
        && window.mgGame.sim.moves === 0 && !!window.mgGame.best[window.mgGame.level.id]),
    'result undo restores the captured seed while preserving earned best');
    await perform(page, LEVELS[0].solution[0]);
    check(await page.evaluate(() => window.__gardenEvents.filter(([, event]) => event === 'finish').length === 1),
        'undo and re-completion do not duplicate finish analytics');

    // A captured seed is part of undo and saved-state replay, not a permanent
    // side effect of the flower visual. Find an intermediate partial capture.
    let capture;
    for (const level of LEVELS) {
        let state = createState(level);
        for (let index = 0; index < level.solution.length; index++) {
            const next = applyAction(level, state, level.solution[index]).state;
            if (!next.won && next.seeds.some(seed => seed.captured) && !state.seeds.some(seed => seed.captured)) {
                capture = { level, index }; break;
            }
            state = next;
        }
        if (capture) break;
    }
    check(capture, 'authored levels contain a meaningful partial-capture undo scenario');
    await start(page, capture.level);
    for (let index = 0; index < capture.index; index++) await perform(page, capture.level.solution[index]);
    const beforeCapture = await snapshot(page);
    await perform(page, capture.level.solution[capture.index]);
    const afterCapture = await snapshot(page);
    check(afterCapture.seeds.some(seed => seed.captured), 'real move captures a seed');
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!window.mgGame);
    await click(page, '#mg-btn-start');
    assert.deepEqual(await snapshot(page), afterCapture, 'reload restores current magnets, seeds, captures, and moves');
    await click(page, '#mg-undo');
    assert.deepEqual(await snapshot(page), beforeCapture, 'undo history survives reload and uncaptures the seed');
    assertions += 2;
    check(posts.length === 0, 'partial capture, reload, and undo remain ineligible for ranking');

    // Find a legal state outside every authored solution state. The browser
    // must run its real module Worker, rather than the authored-path shortcut.
    const hint = findOffPathHint();
    await start(page, hint.level);
    await page.evaluate(action => window.mgGame.commit(action), hint.action);
    await page.waitForFunction(() => !window.mgGame.animating);
    assert.deepEqual(await snapshot(page), hint.next, 'off-path hint fixture is a real legal committed state');
    await page.evaluate(() => {
        window.__gardenWorkers = [];
        window.Worker = class extends window.Worker {
            constructor(...args) {
                super(...args);
                this.gardenRecord = { url: String(args[0]), messages: [], terminated: false };
                window.__gardenWorkers.push(this.gardenRecord);
                this.addEventListener('message', event => this.gardenRecord.messages.push(event.data));
            }
            terminate() { this.gardenRecord.terminated = true; return super.terminate(); }
        };
    });
    await click(page, '#mg-hint-btn');
    check(await page.evaluate(() => window.__gardenWorkers.length === 0 && !window.mgGame.preview), 'first hint gives guidance before creating a solver Worker');
    await click(page, '#mg-hint-btn');
    await page.waitForFunction(() => window.__gardenWorkers[0]?.messages.length && window.mgGame.preview?.pinned,
        { timeout: 10000 });
    const workerHint = await page.evaluate(() => ({ worker: window.__gardenWorkers[0], action: window.mgGame.preview.action,
        preview: window.mgGame.preview.result.state, copy: document.getElementById('mg-hint-text').textContent }));
    check(workerHint.worker.url.includes('hint-worker') && workerHint.worker.messages[0].status === 'solved'
        && workerHint.worker.terminated, 'real hint Worker solves the off-path state and closes');
    assert.deepEqual(workerHint.action, hint.solution[0], 'Worker next move agrees with independent bounded solver');
    assert.deepEqual(workerHint.preview, applyAction(hint.level, hint.next, workerHint.action).state,
        'Worker suggestion produces the exact valid next preview');
    assert.deepEqual(await snapshot(page), hint.next, 'hint search leaves live board unchanged');
    check(workerHint.copy.includes('Try'), 'off-path result is presented as a localized actionable hint');
    assertions += 4;

    // Shared hint renderer must retarget selection across different magnets.
    const retargetLevel = LEVELS.find(level => level.id === 'aurora-1');
    await start(page, retargetLevel);
    await perform(page, retargetLevel.solution[0]);
    await click(page, '#mg-hint-btn');
    await click(page, '#mg-hint-btn');
    const retarget = await page.evaluate(() => {
        const game = window.mgGame;
        const states = game.sim.magnets.map(magnet => {
            const cell = document.querySelector(`[data-cell="${magnet.cell}"]`);
            return { id: magnet.id, aria: cell?.getAttribute('aria-selected'),
                highlighted: cell?.classList.contains('is-selected') };
        });
        return { selected: game.selected, previewMagnet: game.preview?.action.magnetId, states };
    });
    check(retarget.selected === 'm2' && retarget.previewMagnet === 'm2'
        && retarget.states.every(item => item.aria === String(item.id === 'm2')
            && item.highlighted === (item.id === 'm2')),
    'authored hint changes both highlight and aria-selected from m1 to m2');
    await click(page, '#mg-clear-preview');
    await click(page, '#mg-flip');
    check(await page.evaluate(() => window.mgGame.preview?.action.magnetId === 'm2'
        && window.mgGame.preview.action.type === 'flip'
        && document.querySelector('.mg-cell.is-selected')?.getAttribute('aria-selected') === 'true'),
    'after clearing a hint, Flip applies to the highlighted magnet m2');

    // Trigger another real Worker and navigate in the same event turn, before
    // its message can race with replacement gameplay. Native Worker remains
    // intact; the small subclass above only records messages and termination.
    await start(page, hint.level);
    await page.evaluate(action => window.mgGame.commit(action), hint.action);
    await page.waitForFunction(() => !window.mgGame.animating);
    await click(page, '#mg-hint-btn');
    const cancelled = await page.evaluate(nextId => {
        document.getElementById('mg-hint-btn').click();
        const pending = window.mgGame.hintWorker;
        document.getElementById('mg-pause-btn').click();
        document.getElementById('mg-pause-menu').click();
        document.querySelector(`[data-level="${nextId}"]`).click();
        return { existed: !!pending, terminated: window.__gardenWorkers.at(-1).terminated,
            cleared: window.mgGame.hintWorker === null };
    }, LEVELS[1].id);
    check(cancelled.existed && cancelled.terminated && cancelled.cleared, 'navigation cancels a pending real hint Worker');
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 150)));
    check(await page.evaluate(id => window.mgGame.level.id === id && window.mgGame.sim.moves === 0
        && !window.mgGame.preview && !window.mgGame.hintMessage, LEVELS[1].id),
    'cancelled hint cannot leak a stale preview or copy into replacement garden');

    // All chapter eligibility is exercised by real authored actions. No score
    // is submitted for the first five gardens; the sixth submits their sum.
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    for (let index = 0; index < LEVELS.length; index++) {
        const level = LEVELS[index];
        await start(page, level);
        for (const action of level.solution) await perform(page, action);
        check(await page.evaluate(() => window.mgGame.state === 'over' && window.mgGame.sim.won), `${level.id}: actual controls solve garden`);
        const expectedPosts = Math.floor((index + 1) / 6);
        if ((index + 1) % 6 === 0) {
            await page.waitForFunction(count => Object.keys(window.mgGame.best).length >= count, {}, index + 1);
            // Submission starts synchronously at completion; allow its request
            // to reach interception before asserting the six-level boundary.
            const deadline = Date.now() + 3000;
            while (posts.length < expectedPosts && Date.now() < deadline) {
                await new Promise(resolve => setTimeout(resolve, 25));
            }
        }
        check(posts.length === expectedPosts, `${level.id}: rank only when all six chapter gardens have verified bests (${posts.length}/${expectedPosts})`);
        if ((index + 1) % 6 === 0) {
            const post = posts.at(-1);
            check(post.game === `magnetic-garden-${level.chapter}`, 'completed chapter posts to its own stable board');
            const sum = await page.evaluate(chapter => window.mgGame.chapterTotal(chapter), level.chapter);
            check(post.score === sum, 'ranking is the sum of six verified local best move counts');
        }
    }
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!window.mgGame);
    check(await page.evaluate(() => Object.keys(window.mgGame.best).length === 24), 'all 24 completed records survive reload');
    await page.close();

    for (const [width, height, lang] of [[320, 640, 'en'], [390, 664, 'zh'], [844, 390, 'en'], [1280, 800, 'en']]) {
        const view = await open(width, height, lang, true);
        const tag = `${width}x${height} ${lang}`;
        check(await view.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${tag}: no horizontal page overflow`);
        const inaccessible = await view.$$eval('[data-level]', buttons => buttons.flatMap(button => {
            button.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
            const r = button.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            return r.width >= 44 && r.height >= 44 && (hit === button || button.contains(hit)) ? [] : [button.dataset.level];
        }));
        check(inaccessible.length === 0, `${tag}: all 24 level targets reach 44px and can be clicked: ${inaccessible}`);
        if (width < 1024) {
            await click(view, '#mg-help-btn');
            check(await view.evaluate(() => {
                const overlay = document.getElementById('mg-help');
                const frame = overlay.getBoundingClientRect();
                const close = document.getElementById('mg-help-close').getBoundingClientRect();
                return getComputedStyle(overlay).position === 'fixed'
                    && Math.abs(frame.top) <= 1 && Math.abs(frame.bottom - innerHeight) <= 1
                    && close.top >= 0 && close.bottom <= innerHeight;
            }), `${tag}: help overlay and Close remain inside the visible viewport`);
            await click(view, '#mg-help-close');
            await view.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
            check(await view.evaluate(() => window.scrollY > 50), `${tag}: long menu really scrolls`);
            await view.click(`[data-level="${LEVELS.at(-1).id}"]`);
            check(await view.evaluate(() => {
                const bar = document.querySelector('.game-topbar').getBoundingClientRect();
                return window.scrollY <= 1 && bar.top >= -1 && bar.bottom <= innerHeight;
            }), `${tag}: entering a late level restores document scroll and visible topbar`);
        } else await click(view, `[data-level="${LEVELS.at(-1).id}"]`);
        const cells = await view.$$eval('[role="gridcell"]', elements => elements.flatMap(element => {
            element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
            const r = element.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            return r.width >= 43.9 && r.height >= 43.9 && (hit === element || element.contains(hit)) && element.getAttribute('aria-label') ? [] : [element.dataset.cell];
        }));
        check(cells.length === 0, `${tag}: every named grid cell has a reachable 44px target: ${cells}`);
        const smallControls = await view.evaluate(() => ['mg-home', 'mg-pause-btn', 'mg-sound', 'mg-undo', 'mg-flip', 'mg-preview-btn', 'mg-hint-btn'].flatMap(id => {
            const element = document.getElementById(id); const r = element.getBoundingClientRect();
            const after = getComputedStyle(element, '::after');
            const pad = edge => Math.max(0, -(parseFloat(after[edge]) || 0));
            return r.width + pad('left') + pad('right') >= 43.9 && r.height + pad('top') + pad('bottom') >= 43.9 ? [] : [id];
        }));
        check(smallControls.length === 0, `${tag}: critical controls retain at least 44px hit areas: ${smallControls}`);
        const active = await view.evaluate(() => window.mgGame.focusCell);
        await view.focus(`[data-cell="${active}"]`);
        await view.keyboard.press('ArrowRight');
        check(await view.evaluate(() => document.activeElement?.getAttribute('role') === 'gridcell'), `${tag}: arrow-key exploration keeps semantic grid focus`);
        await view.keyboard.press('f');
        check(await view.evaluate(() => !!window.mgGame.preview && window.mgGame.sim.moves === 0), `${tag}: keyboard flip previews without committing`);
        await view.focus('#mg-commit');
        await view.keyboard.press('Enter');
        await view.waitForFunction(() => window.mgGame.sim.moves === 1 && !window.mgGame.animating);
        await view.keyboard.press('u');
        check(await view.evaluate(() => window.mgGame.sim.moves === 0), `${tag}: keyboard commits and undoes through the playable controls`);
        const still = await view.evaluate(() => [...document.querySelectorAll('.mg-cell,.mg-seed,.mg-magnet,.mg-path')].every(element => {
            const style = getComputedStyle(element);
            return style.animationName === 'none' && style.transitionDuration.split(',').every(value => parseFloat(value) === 0);
        }));
        check(still, `${tag}: reduced motion removes decorative animation and transitions`);
        check(await view.$eval('#mg-undo', element => element.textContent.includes('撤销')) === (lang === 'zh'), `${tag}: controls use the selected shared language`);
        await view.close();
    }
} finally {
    await browser.close();
}
check(errors.length === 0, 'no runtime errors: ' + errors.join(' | '));
console.log(`PASS Magnetic Garden: 24 real solves / four chapter rankings / preview / undo / replay / off-path Worker hints and cancellation / decoded art / interruption / keyboard / 320–1280px / reduced motion (${assertions} assertions)`);
