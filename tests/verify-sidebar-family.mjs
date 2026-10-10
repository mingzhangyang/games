#!/usr/bin/env node
// W5b: actual computed sidebar/record/legend/result-title geometry.
// The stats panels are moved, never cloned, between the desktop sidebar
// and the mobile bottom sheet. Keep this separate from start-menu ownership.
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { registry } from './lib/registry.mjs';
import { keepPage, exitIfNoPages } from './lib/page-filter.mjs';

const BASE = process.argv.slice(2).find(arg => arg.startsWith('http')) || 'http://127.0.0.1:8899';
const PREFIXES = new Set(['cc', 'cb', 'ec', 'fv', 'gd', 'lm', 'md', 'rd', 'sd', 'bf']);
const LEGEND_PREFIXES = new Set(['cb', 'ec', 'fv', 'md', 'rd']);
const VIEWPORTS = [[390, 844], [768, 1024], [844, 390], [1280, 900]];
const PARTICIPANTS = registry.all().filter(game => PREFIXES.has(game.prefix));
const CASES = PARTICIPANTS.filter(game => keepPage(game.id));
registry.assertCovered({
    cap: 'drawer', covered: PARTICIPANTS.map(g => g.id),
    exempt: registry.withCap('drawer').filter(game => !PREFIXES.has(game.prefix)).map(game => game.id),
    label: 'W5b/sidebar participants',
});
exitIfNoPages(CASES, 'verify-sidebar-family');

const failed = [];
let passed = 0;
function check(ok, message, data = '') {
    if (ok) passed++;
    else failed.push(message + (data ? ' — ' + JSON.stringify(data) : ''));
}
const browser = await puppeteer.launch({
    executablePath: CHROME_PATH, headless: 'new', args: LAUNCH_ARGS,
});
try {
    for (const g of CASES) {
        const p = g.prefix;
        for (const [width, height] of VIEWPORTS) {
            const page = await browser.newPage();
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.setViewport({ width, height });
            const label = g.id + '@' + width + 'x' + height;
            try {
                await page.goto(BASE + '/' + g.href, { waitUntil: 'domcontentloaded', timeout: 25000 });
                await page.waitForFunction(prefix => {
                    const root = document.getElementById(prefix + '-side-records');
                    return !!root && root.children.length > 0;
                }, { timeout: 12000 }, p);
                if (LEGEND_PREFIXES.has(p)) {
                    await page.waitForFunction(prefix => {
                        const root = document.getElementById(prefix + '-side-legend');
                        return !!root && root.children.length > 0;
                    }, { timeout: 12000 }, p);
                }
                const actual = await page.evaluate(({ prefix, expectLegend, desktop }) => {
                    const record = document.getElementById(prefix + '-side-records');
                    const panels = document.getElementById(prefix + 'StatsPanels');
                    const rows = [...record.children];
                    const resultTitle = document.querySelector('.game-clear-title');
                    const legend = document.getElementById(prefix + '-side-legend');
                    const extract = (el, properties) => {
                        if (!el) return null;
                        const s = getComputedStyle(el);
                        return Object.fromEntries(properties.map(prop => [prop, s[prop]]));
                    };
                    const rowProps = ['display', 'justifyContent', 'alignItems', 'gap', 'paddingTop',
                        'paddingBottom', 'fontSize', 'fontVariantNumeric'];
                    const titleProps = ['fontSize', 'fontWeight', 'letterSpacing'];
                    const legendProps = ['display', 'alignItems', 'gap', 'fontSize', 'paddingTop', 'paddingBottom'];
                    return {
                        desktop,
                        recordClass: record.classList.contains('game-side-records'),
                        recordStyle: extract(record, ['display', 'flexDirection']),
                        panelLocation: panels?.parentElement?.id || '',
                        sidebarRows: rows.map(row => ({
                            shared: row.classList.contains('game-side-row'),
                            layout: extract(row, rowProps),
                            strong: row.lastElementChild?.tagName === 'B',
                            valueNumeric: row.lastElementChild
                                ? getComputedStyle(row.lastElementChild).fontVariantNumeric : '',
                        })),
                        clearTitle: extract(resultTitle, titleProps),
                        clearClass: resultTitle?.classList.contains(prefix + '-card-title') || false,
                        legendPresent: expectLegend ? !!legend : legend === null,
                        legendClass: legend?.classList.contains('game-side-legend') || false,
                        legendLayout: extract(legend, ['display', 'flexDirection', 'gap']),
                        legendRows: legend ? [...legend.querySelectorAll('.game-legend-row')].map(row => ({
                            style: extract(row, legendProps),
                            sharedText: !!row.querySelector('.game-legend-text'),
                        })) : [],
                        legendDesktopOnly: !legend || !legend.closest('[id$="StatsPanels"]'),
                        rippleUsesRealRows: prefix !== 'rd' || rows.every(row => row.classList.contains('rd-rec')),
                    };
                }, { prefix: p, expectLegend: LEGEND_PREFIXES.has(p), desktop: width >= 1024 });
                check(actual.recordClass && actual.recordStyle?.display === 'flex'
                    && actual.recordStyle?.flexDirection === 'column',
                label + ' record column adopts shared geometry', actual.recordStyle);
                check(actual.sidebarRows.length > 0
                    && actual.sidebarRows.every(row =>
                        row.shared && row.strong
                        && row.layout?.display === 'flex'
                        && row.layout.justifyContent === 'space-between'
                        && row.layout.alignItems === 'baseline'
                        && row.layout.gap === '10px'
                        && row.layout.paddingTop === '4px'
                        && row.layout.paddingBottom === '4px'
                        && row.layout.fontSize === '13.5px'
                        && row.valueNumeric === 'tabular-nums'),
                label + ' all actual record rows use shared layout and semantic numeric values',
                    actual.sidebarRows);
                check(actual.rippleUsesRealRows, label + ' ripple runtime rows retain original identity');
                check(actual.clearClass && actual.clearTitle?.fontSize === '26px'
                    && actual.clearTitle.fontWeight === '800'
                    && actual.clearTitle.letterSpacing === '2px',
                label + ' clear-result title geometry', actual.clearTitle);
                check(actual.panelLocation === (width >= 1024
                    ? '' : p + 'StatsDrawerBody') || (width >= 1024
                        && !!actual.panelLocation && actual.panelLocation !== p + 'StatsDrawerBody'),
                label + ' original StatsPanels node stays in the correct host', actual.panelLocation);
                if (LEGEND_PREFIXES.has(p)) {
                    check(actual.legendPresent && actual.legendClass
                        && actual.legendLayout?.display === 'flex'
                        && actual.legendLayout.flexDirection === 'column'
                        && actual.legendLayout.gap === '2px',
                    label + ' shared legend column', actual.legendLayout);
                    check(actual.legendRows.length >= 4 && actual.legendRows.every(row =>
                        row.style?.display === 'flex'
                        && row.style.alignItems === 'center'
                        && row.style.gap === '9px'
                        && row.style.fontSize === '12.5px'
                        && row.style.paddingTop === '3px'
                        && row.style.paddingBottom === '3px'
                        && row.sharedText),
                    label + ' all scientific legend rows share geometry', actual.legendRows);
                    check(actual.legendDesktopOnly,
                        label + ' science legend remains outside movable StatsPanels');
                }
                if (width === 390) {
                    await page.$eval('#' + p + 'StatsToggle', button => button.click());
                    await page.waitForFunction(prefix => {
                        const drawer = document.getElementById(prefix + 'StatsDrawer');
                        const panels = document.getElementById(prefix + 'StatsPanels');
                        return drawer && !drawer.hidden && panels
                            && panels.parentElement?.id === prefix + 'StatsDrawerBody';
                    }, { timeout: 7000 }, p);
                    check(true, label + ' mobile stats drawer opens with the original record DOM');
                }
                if (p === 'rd' && width === 1280) {
                    const colors = await page.evaluate(() => {
                        const row = document.querySelector('.game-legend-row');
                        const root = document.documentElement;
                        const before = root.getAttribute('data-theme');
                        root.setAttribute('data-theme', 'light');
                        const light = getComputedStyle(row).color;
                        root.setAttribute('data-theme', 'dark');
                        const dark = getComputedStyle(row).color;
                        if (before === null) root.removeAttribute('data-theme');
                        else root.setAttribute('data-theme', before);
                        return { light, dark };
                    });
                    check(colors.light === 'rgb(15, 23, 42)'
                        && colors.dark === 'rgb(205, 217, 245)',
                    label + ' ripple light/dark legend palette survives refactor', colors);
                }
                check(errors.length === 0, label + ' no page errors', errors);
            } catch (error) {
                failed.push(label + ' navigation/runtime verification failed: ' + error.message);
            } finally {
                await page.close().catch(() => {});
            }
        }
    }
} finally {
    await browser.close();
}
if (failed.length) {
    console.error(failed.map(line => 'FAIL ' + line).join('\n'));
    console.error('verify-sidebar-family: ' + failed.length + ' failures / ' + passed + ' passes');
    process.exit(1);
}
console.log('verify-sidebar-family: ' + passed + ' checks passed in ' + CASES.length + ' games');
