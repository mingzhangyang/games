// verify-all: timeout=360000
// Chrome step 4: 26 pages share exact desktop Home/title/Sound x anchors,
// regardless of shell width, language or whether a native scrollbar is present.
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { keepPage, exitIfNoPages } from './lib/page-filter.mjs';
import { registry } from './lib/registry.mjs';

const BASE = process.argv.slice(2).find(arg => arg.startsWith('http')) || 'http://127.0.0.1:8899';
const GAMES = registry.withCap('topbar').filter(game => keepPage(game.id));
exitIfNoPages(GAMES, 'verify-topbar-desktop');
const VIEWPORTS = [[1280, 900], [1440, 900], [1920, 1080]];
const cases = VIEWPORTS.flatMap(([w, h]) => ['zh', 'en'].map(lang => ({ w, h, lang })));
cases.push({ w: 1024, h: 768, lang: 'en' }); // desktop threshold + scrollbar edge safety
const WIDTH_CAP = 1200;
const VIEWPORT_RESERVE = 80;
const references = new Map();
const failures = [];
let passed = 0;
const check = (ok, label) => { passed++; if (!ok) failures.push(label); };
const close = (a, b, epsilon = 0.06) => Number.isFinite(a) && Number.isFinite(b)
    && Math.abs(a - b) <= epsilon;
const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: LAUNCH_ARGS });

const measure = page => page.evaluate(() => {
    const shell = document.querySelector('.game-shell');
    const bar = shell?.querySelector(':scope > .game-topbar');
    const home = bar?.querySelector('[data-chrome="home"]');
    const name = bar?.querySelector('.game-topbar-name');
    const sound = bar?.querySelector('[data-chrome="sound"]');
    const stage = shell?.querySelector('.game-stage');
    const side = shell?.querySelector('.game-sidebar');
    const status = shell?.querySelector('.game-stage > .game-stage-status');
    const rect = el => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, width: r.width, top: r.top, height: r.height };
    };
    const css = bar ? getComputedStyle(bar) : null;
    return {
        w: innerWidth, clientW: document.documentElement.clientWidth,
        scrollW: document.documentElement.scrollWidth,
        rootGutter: getComputedStyle(document.documentElement).scrollbarGutter,
        rootBackground: getComputedStyle(document.documentElement).backgroundColor,
        bar: rect(bar), home: rect(home), name: rect(name), sound: rect(sound),
        shell: rect(shell), stage: rect(stage), side: rect(side),
        status: rect(status),
        padLeft: css ? parseFloat(css.paddingLeft) : NaN,
        padRight: css ? parseFloat(css.paddingRight) : NaN,
        maxWidth: css ? parseFloat(css.maxWidth) : NaN,
        chrome: shell ? parseFloat(shell.style.getPropertyValue('--frame-chrome')) : NaN,
        bound: document.body.classList.contains('has-frame-budget')
            || document.body.classList.contains('has-immersive-stage'),
    };
});

async function open(page, game, w, h, lang) {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument(language => {
        try { localStorage.setItem('site_lang', language); } catch { /* private mode */ }
    }, lang);
    await page.goto(BASE + '/' + game.href, { waitUntil: 'load', timeout: 25000 });
    await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
}

function verifyGeometry(m, tag, w) {
    check(!!(m.bar && m.home && m.name && m.sound && m.shell),
        tag + ': missing shell/header/Home/title/Sound or header is no longer a direct child');
    if (!(m.bar && m.home && m.name && m.sound && m.shell)) return;
    const expectedWidth = Math.min(WIDTH_CAP, w - VIEWPORT_RESERVE);
    check(close(m.bar.width, expectedWidth, 0.55),
        tag + ': bar width ' + m.bar.width + ' != ' + expectedWidth);
    check(close(m.maxWidth, WIDTH_CAP, 0.1),
        tag + ': max-width must be 1200px, got ' + m.maxWidth);
    check(m.rootGutter === 'stable both-edges',
        tag + ': inconsistent native scrollbar gutter: ' + m.rootGutter);
    // Native scrollbar-gutter is painted by html, not by body's gradient.
    // Transparent html exposes bright default-canvas rails on dark games.
    check(m.rootBackground !== 'rgba(0, 0, 0, 0)' && m.rootBackground !== 'rgb(255, 255, 255)',
        tag + ': unpainted/white root gutter: ' + m.rootBackground);
    check(close((m.bar.left + m.bar.right) / 2, w / 2, 0.55),
        tag + ': bar not centered in viewport: ' + m.bar.left + '..' + m.bar.right);
    check(m.bar.left >= 24 - 0.5 && m.bar.right <= w - 24 + 0.5,
        tag + ': less than 24px viewport clearance');
    check(m.scrollW <= m.clientW + 1,
        tag + ': horizontal scrolling: document=' + m.scrollW + ' scrollport=' + m.clientW);
    check(close(m.padLeft, 12) && close(m.padRight, 12),
        tag + ': inconsistent horizontal header padding: ' + m.padLeft + '/' + m.padRight);
    check(close(m.home.left, m.bar.left + 12, 0.55),
        tag + ': Home not at the common left edge');
    check(close(m.name.left - m.home.right, 12, 0.55),
        tag + ': title does not start 12px after Home');
    check(close(m.sound.right, m.bar.right - 12, 0.55),
        tag + ': Sound not at the common right edge');
    check(m.stage && m.stage.width > 0, tag + ': stage unexpectedly missing/shrunk');
    if (m.side) check(m.side.width > 0, tag + ': sidebar unexpectedly shrunk');
    const key = tag.split('@')[1].split('/')[0]; // viewport only, across languages and games
    const anchor = { home: m.home.left, title: m.name.left, sound: m.sound.left };
    const original = references.get(key);
    if (!original) references.set(key, { ...anchor, from: tag });
    else for (const part of ['home', 'title', 'sound']) {
        check(close(anchor[part], original[part]),
            tag + ': ' + part + '.x=' + anchor[part] + ' differs from '
            + original.from + ' (' + original[part] + ')');
    }
}

for (const { w, h, lang } of cases) {
    for (const game of GAMES) {
        const tag = game.id + '@' + w + 'x' + h + '/' + lang;
        const page = await browser.newPage();
        const oscillations = [];
        page.on('console', message => {
            if (message.text().includes('--frame-chrome oscillation')) oscillations.push(message.text());
        });
        try {
            await open(page, game, w, h, lang);
            const a = await measure(page);
            await new Promise(resolve => setTimeout(resolve, 275));
            const b = await measure(page);
            verifyGeometry(b, tag, w);
            check(oscillations.length === 0, tag + ': bindFrame oscillation lock triggered');
            if (a.bound || b.bound) {
                check(Number.isFinite(b.chrome) && close(a.chrome, b.chrome, 1),
                    tag + ': --frame-chrome did not converge: ' + a.chrome + ' to ' + b.chrome);
            }
            // A screen-wide header must not expand shell/stage/sidebar sizes or
            // cause their widths to jump when the frame settles.
            if (a.shell && b.shell) check(close(a.shell.width, b.shell.width, 0.75),
                tag + ': shell width unstable after chrome settled');
            if (a.stage && b.stage) check(close(a.stage.width, b.stage.width, 0.75),
                tag + ': stage width unstable after chrome settled');
            if (a.side && b.side) check(close(a.side.width, b.side.width, 0.75),
                tag + ': sidebar width unstable after chrome settled');
            if (a.status && b.status) check(close(a.status.height, b.status.height, 1),
                tag + ': measureStageStatusReserve input changed unexpectedly');

            // Reverse tests: deliberately break width and left padding. The same
            // geometry rules must reject these mutations (not merely parse CSS).
            if (w === 1280 && lang === 'en' && game.id === GAMES[0].id) {
                await page.evaluate(() => document.querySelector('.game-topbar')
                    .style.setProperty('width', '640px', 'important'));
                const narrowed = await measure(page);
                check(Math.abs(narrowed.bar.width - Math.min(1200, w - 80)) > 1,
                    'inverse: shell-coupled 640px header must fail desktop width gate');
                await page.evaluate(() => {
                    const bar = document.querySelector('.game-topbar');
                    bar.style.removeProperty('width');
                    bar.style.setProperty('padding-left', '28px', 'important');
                });
                const shifted = await measure(page);
                check(!close(shifted.home.left, shifted.bar.left + 12, 0.55),
                    'inverse: different left padding must fail Home anchor gate');
            }
        } catch (error) {
            check(false, tag + ': ' + (error.message || error));
        } finally {
            await page.close();
        }
    }
}
await browser.close();

// The shared browser helper hides native scrollbars. Repeat real classic-scrollbar
// checks without that flag so "100vw includes scrollbar" cannot evade CI.
const classic = await puppeteer.launch({
    executablePath: CHROME_PATH, headless: 'new',
    args: LAUNCH_ARGS.filter(arg => arg !== '--hide-scrollbars'),
});
for (const game of [GAMES[0], GAMES.find(g => g.layout === 'immersive')].filter(Boolean)) {
    for (const [w, h] of [[1024, 768], [1280, 900]]) {
        const tag = game.id + '@' + w + 'x' + h + '/native-scrollbar';
        const page = await classic.newPage();
        try {
            await open(page, game, w, h, 'en');
            const before = await measure(page);
            await page.evaluate(() => {
                document.documentElement.style.setProperty('overflow-y', 'scroll', 'important');
                document.body.style.minHeight = '160vh';
            });
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            const after = await measure(page);
            verifyGeometry(after, tag, w);
            if (before.home && after.home) {
                for (const part of ['home', 'name', 'sound']) {
                    check(close(before[part].left, after[part].left, 0.55),
                        tag + ': ' + part + ' jumped when classic scrollbar appeared');
                }
            }
            if (before.stage && after.stage) check(close(before.stage.width, after.stage.width, 0.75),
                tag + ': scrollbar changed stage width');
            if (before.side && after.side) check(close(before.side.width, after.side.width, 0.75),
                tag + ': scrollbar changed sidebar width');
        } catch (error) {
            check(false, tag + ': ' + (error.message || error));
        } finally {
            await page.close();
        }
    }
}
// Negative scope gate: Math Rain / Tank Battle consume layout.css without
// a shared topbar. They must not acquire the root's symmetric scrollbar gutter,
// which would otherwise shrink their edge-to-edge viewport geometries.
for (const game of registry.all().filter(g => !(g.caps || []).includes('topbar') && keepPage(g.id))) {
    const page = await classic.newPage();
    const tag = game.id + '@1280x900/no-shared-topbar';
    try {
        await open(page, game, 1280, 900, 'en');
        const scope = await page.evaluate(() => ({
            gutter: getComputedStyle(document.documentElement).scrollbarGutter,
            hasSharedTopbar: !!document.querySelector('.game-shell > .game-topbar'),
        }));
        check(!scope.hasSharedTopbar, tag + ': negative control unexpectedly gained shared topbar');
        check(scope.gutter === 'auto',
            tag + ': unrelated full-bleed page received shared chrome scrollbar gutter: ' + scope.gutter);
        // Reverse scope test: a deliberately injected shared shell + header
        // must activate the gutter contract. This is a selector regression,
        // not a mutation of the production DOM.
        await page.evaluate(() => {
            const shell = document.createElement('div');
            shell.className = 'game-shell';
            const header = document.createElement('header');
            header.className = 'game-topbar';
            shell.appendChild(header);
            document.body.appendChild(shell);
        });
        const activated = await page.evaluate(() => getComputedStyle(document.documentElement).scrollbarGutter);
        check(activated === 'stable both-edges',
            tag + ': inverse injected shared topbar failed to activate gutter scope');
    } catch (error) {
        check(false, tag + ': ' + (error.message || error));
    } finally {
        await page.close();
    }
}
await classic.close();
if (failures.length) {
    console.error('verify-topbar-desktop: ' + failures.length + ' failures (' + passed + ' assertions)');
    for (const failure of failures) console.error('  FAIL ' + failure);
    process.exitCode = 1;
} else {
    console.log('verify-topbar-desktop: ' + passed + ' assertions passed across '
        + GAMES.length + ' pages; shared anchors: ' + JSON.stringify(Object.fromEntries(references)));
}
