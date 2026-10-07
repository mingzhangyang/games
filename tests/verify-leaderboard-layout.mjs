#!/usr/bin/env node
// Browser geometry gate for the first post-#115 component-family extraction.
//
// This deliberately covers one standard leaderboard plus each documented geometry
// exception. Static/runtime class adoption is verified by family-extraction.mjs;
// this test is the independent browser oracle that proves the resulting cascade
// still computes the intended container/list/row/input geometry.
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { keepPage, exitIfNoPages } from './lib/page-filter.mjs';

const BASE = process.argv[2] || 'http://127.0.0.1:8899';

const CASES = [
    {
        id: 'standard-circuit',
        href: 'circuit.html',
        overlay: '#cc-over',
        list: '#cc-lb-list',
        rowClass: 'cc-lb-row game-lb-row',
        rankClass: 'cc-lb-rank game-lb-rank',
        nameClass: 'cc-lb-name game-lb-name',
        scoreClass: 'cc-lb-score game-lb-score',
        container: '.cc-lb',
        input: '#cc-username',
        requiredShared: ['.cc-lb', '#cc-lb-list', '#cc-lb-status', '.cc-username-row', '#cc-username-label', '#cc-username'],
        expected: {
            container: { maxWidth: '330px', radius: '14px', padding: ['12px', '14px', '12px', '14px'] },
            list: { display: 'flex', flexDirection: 'column', gap: '3px', minHeight: '40px', maxHeight: '168px', overflowY: 'auto' },
            row: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px', radius: '7px', padding: ['3px', '6px', '3px', '6px'] },
            input: { fontSize: '13px', radius: '9px', padding: ['7px', '10px', '7px', '10px'] },
        },
    },
    {
        id: 'bond-forge-exception',
        href: 'bond-forge.html',
        overlay: '#bf-over',
        list: '#bf-lb-list',
        rowClass: 'bf-lb-row',
        rankClass: 'bf-lb-rank',
        nameClass: 'bf-lb-name game-lb-name',
        scoreClass: 'bf-lb-score game-lb-score',
        container: '.bf-lb',
        input: '#bf-username',
        requiredShared: ['.bf-lb'],
        requiredLocalOnly: ['#bf-lb-list', '#bf-lb-status', '.bf-username-row', '#bf-username-label', '#bf-username'],
        expected: {
            container: { display: 'flex', flexDirection: 'column', gap: '6px', maxWidth: '330px', radius: '14px',
                textAlign: 'left', padding: ['13px', '15px', '13px', '15px'] },
            list: { display: 'flex', flexDirection: 'column', gap: '3px', maxHeight: '150px', overflowY: 'auto' },
            row: { display: 'flex', alignItems: 'baseline', gap: '8px', fontSize: '12.5px', radius: '0px',
                padding: ['0px', '0px', '0px', '0px'] },
            name: { textAlign: 'left' },
            input: { fontSize: '13px', height: '34px', radius: '9px',
                padding: ['0px', '10px', '0px', '10px'] },
        },
    },
    {
        id: 'planet-merge-exception',
        href: 'planet-merge.html',
        overlay: '#pm-over',
        list: '#pm-lb-list',
        rowClass: 'pm-lb-row game-lb-row',
        rankClass: 'pm-lb-rank game-lb-rank',
        nameClass: 'pm-lb-name game-lb-name',
        scoreClass: 'pm-lb-score game-lb-score',
        container: '.pm-lb',
        input: '#pm-username',
        requiredShared: ['.pm-lb', '#pm-lb-list', '#pm-lb-status', '.pm-username-row', '#pm-username-label', '#pm-username'],
        requiredLocalOnly: ['#pm-lb-title'],
        expected: {
            container: { maxWidth: '340px', radius: '14px', padding: ['12px', '14px', '12px', '14px'] },
            list: { display: 'flex', flexDirection: 'column', gap: '3px', minHeight: '60px', maxHeight: '148px', overflowY: 'auto' },
            row: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px', radius: '7px',
                padding: ['3px', '6px', '3px', '6px'] },
            input: { fontSize: '13px', radius: '9px', padding: ['7px', '10px', '7px', '10px'] },
        },
    },
    {
        id: 'minesweeper-exception',
        href: 'minesweeper.html',
        overlay: '#ms-result',
        hide: ['#ms-start'],
        list: '#ms-lb-list',
        rowClass: 'ms-lb-row game-lb-row',
        rankClass: 'ms-lb-rank game-lb-rank',
        nameClass: 'ms-lb-name game-lb-name',
        scoreClass: 'ms-lb-score game-lb-score',
        container: '.ms-lb',
        input: '#ms-username',
        requiredShared: ['#ms-lb-title', '#ms-lb-list', '#ms-lb-status', '.ms-username-row', '#ms-username-label', '#ms-username'],
        requiredLocalOnly: ['.ms-lb'],
        expected: {
            container: { maxWidth: 'none', radius: '14px', padding: ['12px', '14px', '12px', '14px'] },
            list: { display: 'flex', flexDirection: 'column', gap: '3px', minHeight: '40px', maxHeight: '168px', overflowY: 'auto' },
            row: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px', radius: '7px',
                padding: ['3px', '6px', '3px', '6px'] },
            input: { fontSize: '13px', radius: '9px', padding: ['7px', '10px', '7px', '10px'] },
        },
    },
    {
        id: 'tower-defense-exception',
        href: 'tower-defense.html',
        overlay: '#td-over',
        list: '#td-lb-list',
        rowClass: 'td-lb-row game-lb-row',
        rankClass: 'td-lb-rank game-lb-rank',
        nameClass: 'td-lb-name game-lb-name',
        scoreClass: 'td-lb-score game-lb-score',
        container: '.td-lb',
        input: '#td-username',
        requiredShared: ['.td-lb', '#td-lb-list', '#td-lb-status', '.td-username-row', '#td-username-label', '#td-username'],
        expected: {
            container: { maxWidth: '340px', radius: '16px', padding: ['13px', '15px', '13px', '15px'] },
            list: { display: 'flex', flexDirection: 'column', gap: '3px', minHeight: '40px', maxHeight: '175px', overflowY: 'auto' },
            row: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', radius: '8px',
                padding: ['4px', '7px', '4px', '7px'] },
            usernameRow: { marginTop: '8px' },
            input: { fontSize: '13px', radius: '10px', padding: ['7px', '11px', '7px', '11px'] },
        },
    },
];

const RUN = CASES.filter(testCase => keepPage(testCase.href));
exitIfNoPages(RUN, 'verify-leaderboard-layout');

const failures = [];
const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: LAUNCH_ARGS,
});

function compare(id, subject, actual, expected) {
    for (const [key, wanted] of Object.entries(expected || {})) {
        const got = actual?.[key];
        if (Array.isArray(wanted)) {
            if (JSON.stringify(got) !== JSON.stringify(wanted)) {
                failures.push(`${id}: ${subject} ${key}=${JSON.stringify(got)}, expected ${JSON.stringify(wanted)}`);
            }
        } else if (got !== wanted) {
            failures.push(`${id}: ${subject} ${key}=${JSON.stringify(got)}, expected ${JSON.stringify(wanted)}`);
        }
    }
}

try {
    for (const testCase of RUN) {
        const page = await browser.newPage();
        const pageErrors = [];
        page.on('pageerror', error => pageErrors.push(String(error?.message || error).split('\n')[0]));
        try {
            await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
            await page.goto(`${BASE}/${testCase.href}`, { waitUntil: 'load', timeout: 30000 });

            const snapshot = await page.evaluate(config => {
                const target = document.querySelector(config.overlay);
                if (!target) return { missingOverlay: true };
                target.classList.remove('hidden');
                target.hidden = false;
                for (const selector of config.hide || []) {
                    const element = document.querySelector(selector);
                    if (element) element.style.display = 'none';
                }

                const list = document.querySelector(config.list);
                const container = document.querySelector(config.container);
                const input = document.querySelector(config.input);
                if (!list || !container || !input) {
                    return {
                        missing: {
                            list: !list,
                            container: !container,
                            input: !input,
                        },
                    };
                }

                // The family contract separately proves that production runtime literals
                // co-locate these classes. A synthetic row makes the browser exercise the
                // real cascade without depending on leaderboard network/data state.
                list.textContent = '';
                const row = document.createElement('div');
                row.className = config.rowClass;
                const rank = document.createElement('span');
                rank.className = config.rankClass;
                rank.textContent = '1';
                const name = document.createElement('span');
                name.className = config.nameClass;
                name.textContent = 'Player';
                const score = document.createElement('span');
                score.className = config.scoreClass;
                score.textContent = '100';
                row.append(rank, name, score);
                list.append(row);

                const style = selectorOrElement => {
                    const element = typeof selectorOrElement === 'string'
                        ? document.querySelector(selectorOrElement)
                        : selectorOrElement;
                    if (!element) return null;
                    const s = getComputedStyle(element);
                    return {
                        display: s.display,
                        flexDirection: s.flexDirection,
                        alignItems: s.alignItems,
                        gap: s.gap,
                        maxWidth: s.maxWidth,
                        minHeight: s.minHeight,
                        maxHeight: s.maxHeight,
                        overflowY: s.overflowY,
                        fontSize: s.fontSize,
                        fontWeight: s.fontWeight,
                        height: s.height,
                        radius: s.borderTopLeftRadius,
                        marginTop: s.marginTop,
                        marginBottom: s.marginBottom,
                        textAlign: s.textAlign,
                        padding: [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft],
                    };
                };
                const classInfo = selector => {
                    const element = document.querySelector(selector);
                    return element ? [...element.classList] : null;
                };

                return {
                    overlayDisplay: getComputedStyle(target).display,
                    container: style(container),
                    list: style(list),
                    row: style(row),
                    name: style(name),
                    input: style(input),
                    usernameRow: style(input.closest('[class*="username-row"]')),
                    requiredShared: (config.requiredShared || []).map(selector => ({
                        selector,
                        classes: classInfo(selector),
                    })),
                    requiredLocalOnly: (config.requiredLocalOnly || []).map(selector => ({
                        selector,
                        classes: classInfo(selector),
                    })),
                };
            }, testCase);

            if (snapshot.missingOverlay || snapshot.missing) {
                failures.push(`${testCase.id}: result overlay/leaderboard fixture is incomplete: ${JSON.stringify(snapshot)}`);
                continue;
            }
            if (snapshot.overlayDisplay === 'none') {
                failures.push(`${testCase.id}: representative result overlay did not open`);
            }

            for (const item of snapshot.requiredShared || []) {
                if (!item.classes?.some(name => name.startsWith('game-lb'))) {
                    failures.push(`${testCase.id}: ${item.selector} is missing its game-lb shared class`);
                }
            }
            for (const item of snapshot.requiredLocalOnly || []) {
                if (item.classes?.some(name => name.startsWith('game-lb'))) {
                    failures.push(`${testCase.id}: ${item.selector} must remain a documented local-only geometry exception`);
                }
            }

            compare(testCase.id, 'container', snapshot.container, testCase.expected.container);
            compare(testCase.id, 'list', snapshot.list, testCase.expected.list);
            compare(testCase.id, 'row', snapshot.row, testCase.expected.row);
            compare(testCase.id, 'name', snapshot.name, testCase.expected.name);
            compare(testCase.id, 'username row', snapshot.usernameRow, testCase.expected.usernameRow);
            compare(testCase.id, 'input', snapshot.input, testCase.expected.input);

            for (const error of pageErrors) failures.push(`${testCase.id}: pageerror ${error}`);
        } catch (error) {
            failures.push(`${testCase.id}: ${error.message}`);
        } finally {
            await page.close();
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

console.log('PASS shared leaderboard computed geometry: standard family + Bond Forge/Planet Merge/Minesweeper/Tower Defense exceptions');
