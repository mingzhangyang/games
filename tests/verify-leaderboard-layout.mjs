#!/usr/bin/env node
// Browser geometry gate for the shared leaderboard family (leaderboard-v1 + leaderboard-v2).
//
// Every page with a result-overlay leaderboard is held to ONE standard expectation table:
// there are no page-level geometry exceptions. Static/runtime class adoption is verified by
// family-extraction.mjs; this test is the independent browser oracle that proves the
// resulting cascade computes the shared container/title/list/row/empty/status/input
// geometry on each page, at a phone and a desktop viewport (so a page @media override
// cannot hide behind one breakpoint).
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { keepPage, exitIfNoPages } from './lib/page-filter.mjs';
import { registry } from './lib/registry.mjs';

const BASE = process.argv[2] || 'http://127.0.0.1:8899';

const VIEWPORTS = [
    { width: 390, height: 844 },
    { width: 1280, height: 900 },
];

// Per-page fixture overrides, keyed by registry id. Every page with the `leaderboard`
// cap must appear here or in LEADERBOARD_EXEMPT, so a new leaderboard game cannot be
// silently skipped (registry.assertCovered fails instead).
const FIXTURES = {
    'bond-forge': {},
    'circuit': {},
    'crystal-bloom': {},
    'echo-cave': {},
    'flame-verse': {},
    'gravity-slingshot': {},
    'hoop-shot': {},
    'lumen': {},
    'maxwell-demon': {},
    'minesweeper': { overlay: '#ms-result', hide: ['#ms-start'] },
    'planet-merge': {},
    'reversi': {},
    'ripple-duet': {},
    'silk-dew': {},
    'tower-defense': {},
};
// Original Tetris / Sword Flight boards keep independent layouts. New dialog-mode
// boards are verified by smoke-scoreboard-dialog and verify-scoreboard-contract;
// they are native <dialog> children mounted outside the page stage, not per-page
// result-overlay game-lb-* surfaces measured by this test.
const LEADERBOARD_EXEMPT = [
    'tetris', 'sword-flight',
    ...registry.withCap('leaderboard').filter(game => game.scores?.ui === 'dialog').map(game => game.id),
];
registry.assertCovered({
    cap: 'leaderboard', covered: Object.keys(FIXTURES), exempt: LEADERBOARD_EXEMPT, label: 'FIXTURES',
});
const PAGES = registry.withCap('leaderboard')
    .filter(game => FIXTURES[game.id])
    .map(game => [game.prefix, game.href, FIXTURES[game.id]]);

// Values owned by the shared `game-lb-*` rules in css/layout.css. `inherit:<subject>`
// means "must equal the computed value of that subject", i.e. the page wrote nothing.
const STANDARD = {
    container: { display: 'block', maxWidth: '330px', radius: '14px', padding: ['12px', '14px', '12px', '14px'],
        textAlign: 'inherit:parent' },
    title: { fontSize: '14px', fontWeight: '700', marginBottom: '8px', letterSpacing: 'normal', textTransform: 'none' },
    list: { display: 'flex', flexDirection: 'column', gap: '3px', minHeight: '40px', maxHeight: '168px',
        overflowY: 'auto', scrollbarWidth: 'auto' },
    row: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px', radius: '7px',
        padding: ['3px', '6px', '3px', '6px'], transitionDuration: '0s' },
    rank: { width: '22px', flexShrink: '0', flexGrow: '0', fontWeight: '700' },
    name: { flexGrow: '1', textAlign: 'left' },
    score: { flexGrow: '0', flexShrink: '1', fontWeight: '700' },
    empty: { fontSize: '13px', padding: ['10px', '0px', '10px', '0px'] },
    status: { minHeight: '16px', marginTop: '4px', fontSize: '11.5px', lineHeight: 'inherit:container' },
    usernameRow: { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' },
    label: { flexShrink: '0', flexGrow: '0', fontSize: '11.5px', fontWeight: 'inherit:container' },
    input: { fontSize: '13px', radius: '9px', padding: ['7px', '10px', '7px', '10px'], height: 'auto-box',
        outlineStyle: 'none', transitionDuration: '0s' },
};

const SHARED_CLASSES = {
    container: 'game-lb', title: 'game-lb-title', list: 'game-lb-list', status: 'game-lb-status',
    usernameRow: 'game-lb-username-row', label: 'game-lb-username-label', input: 'game-lb-username',
};

const RUN = PAGES.filter(([, href]) => keepPage(href));
exitIfNoPages(RUN, 'verify-leaderboard-layout');

const failures = [];
const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: LAUNCH_ARGS,
});

function compare(id, subject, snapshot, expected) {
    const actual = snapshot[subject];
    for (const [key, wanted] of Object.entries(expected || {})) {
        let target = wanted;
        if (typeof wanted === 'string' && wanted.startsWith('inherit:')) {
            target = snapshot[wanted.slice('inherit:'.length)]?.[key];
        } else if (wanted === 'auto-box') {
            // No page height: the input must be exactly as tall as its auto-height clone.
            target = snapshot.autoHeight;
        }
        const got = actual?.[key];
        if (JSON.stringify(got) !== JSON.stringify(target)) {
            failures.push(`${id}: ${subject} ${key}=${JSON.stringify(got)}, expected ${JSON.stringify(target)}`);
        }
    }
}

try {
    for (const [prefix, href, options = {}] of RUN) {
        for (const viewport of VIEWPORTS) {
            const id = `${prefix} ${viewport.width}x${viewport.height}`;
            const page = await browser.newPage();
            const pageErrors = [];
            page.on('pageerror', error => pageErrors.push(String(error?.message || error).split('\n')[0]));
            try {
                await page.setViewport({ ...viewport, deviceScaleFactor: 1 });
                await page.goto(`${BASE}/${href}`, { waitUntil: 'load', timeout: 30000 });

                const snapshot = await page.evaluate(({ prefix, overlay, hide, sharedClasses }) => {
                    const target = document.querySelector(overlay || `#${prefix}-over`);
                    if (!target) return { missing: 'overlay' };
                    target.classList.remove('hidden');
                    target.hidden = false;
                    for (const selector of hide || []) {
                        const element = document.querySelector(selector);
                        if (element) element.style.display = 'none';
                    }

                    const q = selector => document.querySelector(selector);
                    const nodes = {
                        container: q(`.${prefix}-lb`),
                        title: q(`.${prefix}-lb-title`),
                        list: q(`#${prefix}-lb-list`),
                        status: q(`#${prefix}-lb-status`),
                        usernameRow: q(`.${prefix}-username-row`),
                        label: q(`#${prefix}-username-label`),
                        input: q(`#${prefix}-username`),
                    };
                    const missing = Object.entries(nodes).filter(([, node]) => !node).map(([key]) => key);
                    if (missing.length) return { missing: missing.join(',') };

                    // The family contract separately proves that production runtime literals
                    // co-locate these classes. Synthetic nodes built from the same literals
                    // exercise the real cascade without leaderboard network/data state.
                    const make = (tag, className, text) => {
                        const element = document.createElement(tag);
                        element.className = className;
                        if (text) element.textContent = text;
                        return element;
                    };
                    nodes.list.textContent = '';
                    const row = make('div', `${prefix}-lb-row game-lb-row`);
                    const rank = make('span', `${prefix}-lb-rank game-lb-rank`, '1');
                    const name = make('span', `${prefix}-lb-name game-lb-name`, 'Player');
                    const score = make('span', `${prefix}-lb-score game-lb-score`, '100');
                    row.append(rank, name, score);
                    const empty = make('div', `${prefix}-lb-empty game-lb-empty`, 'No scores yet');
                    nodes.list.append(row, empty);
                    nodes.status.textContent = 'status';
                    Object.assign(nodes, { row, rank, name, score, empty, parent: nodes.container.parentElement });

                    const style = element => {
                        const s = getComputedStyle(element);
                        return {
                            display: s.display,
                            flexDirection: s.flexDirection,
                            alignItems: s.alignItems,
                            flexGrow: s.flexGrow,
                            flexShrink: s.flexShrink,
                            gap: s.gap,
                            width: s.width,
                            maxWidth: s.maxWidth,
                            minHeight: s.minHeight,
                            maxHeight: s.maxHeight,
                            overflowY: s.overflowY,
                            scrollbarWidth: s.scrollbarWidth,
                            fontSize: s.fontSize,
                            fontWeight: s.fontWeight,
                            letterSpacing: s.letterSpacing,
                            lineHeight: s.lineHeight,
                            textTransform: s.textTransform,
                            textAlign: s.textAlign,
                            height: s.height,
                            radius: s.borderTopLeftRadius,
                            marginTop: s.marginTop,
                            marginBottom: s.marginBottom,
                            outlineStyle: s.outlineStyle,
                            transitionDuration: s.transitionDuration,
                            padding: [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft],
                        };
                    };
                    const result = { overlayDisplay: getComputedStyle(target).display, classes: {} };
                    // Reference height: a clone under the same cascade with the height forced back to
                    // auto. Any page-fixed height on the real input then differs from it.
                    const reference = nodes.input.cloneNode();
                    reference.removeAttribute('id');
                    reference.style.setProperty('height', 'auto', 'important');
                    nodes.input.after(reference);
                    result.autoHeight = getComputedStyle(reference).height;
                    reference.remove();
                    for (const [key, node] of Object.entries(nodes)) result[key] = style(node);
                    for (const [key, sharedClass] of Object.entries(sharedClasses)) {
                        result.classes[key] = nodes[key].classList.contains(sharedClass) ? null : sharedClass;
                    }
                    return result;
                }, { prefix, overlay: options.overlay, hide: options.hide, sharedClasses: SHARED_CLASSES });

                if (snapshot.missing) {
                    failures.push(`${id}: leaderboard fixture is incomplete (${snapshot.missing})`);
                    continue;
                }
                if (snapshot.overlayDisplay === 'none') failures.push(`${id}: result overlay did not open`);
                for (const [key, sharedClass] of Object.entries(snapshot.classes)) {
                    if (sharedClass) failures.push(`${id}: ${key} is missing .${sharedClass}`);
                }
                for (const [subject, expected] of Object.entries(STANDARD)) {
                    compare(id, subject, snapshot, expected);
                }
                for (const error of pageErrors) failures.push(`${id}: pageerror ${error}`);
            } catch (error) {
                failures.push(`${id}: ${error.message}`);
            } finally {
                await page.close();
            }
        }
    }
} finally {
    await browser.close();
}

if (failures.length) {
    console.error('FAIL shared leaderboard computed-geometry contract');
    failures.sort().forEach(failure => console.error('  ' + failure));
    process.exit(1);
}

console.log(`PASS shared leaderboard computed geometry: ${RUN.length} page(s) × ${VIEWPORTS.length} viewports `
    + 'match the standard game-lb-* family with no page-level geometry exceptions');
