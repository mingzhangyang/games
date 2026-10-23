#!/usr/bin/env node
// W5b/6b: computed record geometry and all ordinary drawer content contracts.
// The stats panels are moved, never cloned, between the desktop sidebar
// and the mobile bottom sheet. Keep this separate from start-menu ownership.
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { registry } from './lib/registry.mjs';
import { keepPage, exitIfNoPages } from './lib/page-filter.mjs';

const BASE = process.argv.slice(2).find(arg => arg.startsWith('http')) || 'http://127.0.0.1:8899';
const PREFIXES = new Set(['cc', 'cb', 'ec', 'fv', 'gd', 'lm', 'rd', 'sd', 'bf']);
const TWO_COLUMN_PREFIXES = new Set([...PREFIXES, 'pm', 'hs']);
const LEGEND_PREFIXES = new Set(['cb', 'ec', 'fv', 'rd']);
const VIEWPORTS = [[390, 844], [768, 1024], [844, 390], [1280, 900]];
const PARTICIPANTS = registry.withCap('drawer').filter(game => game.id !== 'tetris');
const CASES = PARTICIPANTS.filter(game => keepPage(game.id));
registry.assertCovered({
    cap: 'drawer', covered: PARTICIPANTS.map(g => g.id),
    exempt: ['tetris'], label: '6b/sidebar participants',
});
exitIfNoPages(CASES, 'verify-sidebar-family');

const failed = [];
let passed = 0;
function check(ok, message, data = '') {
    if (ok) passed++;
    else failed.push(message + (data ? ' — ' + JSON.stringify(data) : ''));
}

async function checkContent(page, game, label) {
    const content = await page.evaluate(prefix => {
        const panels = document.getElementById(prefix + 'StatsPanels');
        const sidebar = document.querySelector('.game-sidebar');
        const record = document.getElementById(prefix + '-side-records');
        const desktopNodes = [document.getElementById(prefix + 'SideMore'),
            document.getElementById(prefix + '-side-legend'), document.getElementById(prefix + '-side-keys'),
            document.getElementById(prefix + '-side-tip'), document.getElementById(prefix + '-cheat-card')].filter(Boolean);
        const titles = [...panels.querySelectorAll('.game-side-title')].map(node => node.textContent.trim());
        const rich = document.getElementById(prefix + '-side-rules-text');
        return {
            panels: document.querySelectorAll('#' + prefix + 'StatsPanels').length,
            correctHost: panels.parentElement === (innerWidth >= 1024 ? sidebar
                : document.getElementById(prefix + 'StatsDrawerBody')),
            titles,
            desktopOnly: desktopNodes.every(node => sidebar.contains(node) && !panels.contains(node)),
            moreCount: document.querySelectorAll('#' + prefix + 'SideMore').length,
            glossary: prefix !== 'lm' || (panels.contains(document.getElementById('lm-gloss'))
                && document.querySelectorAll('#lm-gloss .game-legend-row').length === 4),
            progress: prefix !== 'cp' || (panels.contains(document.getElementById('cp-progress-dots'))
                && document.querySelectorAll('#cp-progress-dots > *').length > 0
                && panels.contains(document.getElementById('cp-side-score'))
                && panels.contains(document.getElementById('cp-side-best'))),
            shadow: prefix !== 'sl' || (record.children.length === 8
                && [...record.children].every(row => row.children.length === 3
                    && row.firstElementChild.tagName === 'B')),
            richRules: !['na', 'sf'].includes(prefix) || (rich.querySelectorAll('b').length > 0
                && panels.querySelectorAll('.game-side-kbd-row').length >= 5),
            cheat: prefix !== 'bf' || (document.getElementById('bf-cheat-toggle').getAttribute('aria-controls') === 'bf-cheat-body'
                && !panels.contains(document.getElementById('bf-cheat-card'))),
        };
    }, game.prefix);
    check(content.panels === 1 && content.correctHost, label + ' single panel node is in the correct host');
    check(content.titles.length > 0 && content.titles.every(Boolean), label + ' all movable cards have translated headings', content.titles);
    check(content.desktopOnly && content.moreCount <= 1, label + ' desktop reference content stays outside movable panels');
    check(content.glossary && content.progress && content.shadow && content.richRules && content.cheat,
        label + ' hand-owned content keeps its structure and placement', content);
}

async function checkSettings(page, game, label) {
    const translations = {};
    for (const lang of ['en', 'zh']) for (const theme of ['dark', 'light']) {
        await page.evaluate(({ lang, theme }) => {
            localStorage.setItem('site_lang', lang);
            localStorage.setItem('site_theme', theme);
            window.dispatchEvent(new CustomEvent('site-settings:changed'));
        }, { lang, theme });
        await page.waitForFunction(({ prefix, lang, theme, supportsLight }) => {
            const title = document.getElementById(prefix + 'StatsDrawerTitle');
            return title?.textContent === (lang === 'zh' ? '数据统计' : 'Stats')
                && document.documentElement.dataset.theme === (supportsLight ? theme : 'dark');
        }, { timeout: 7000 }, { prefix: game.prefix, lang, theme, supportsLight: game.caps.includes('theme-light') })
            .catch(error => { throw new Error('sidebar locale/theme ' + lang + '/' + theme + ': ' + error.message); });
        await checkContent(page, game, label + '/' + lang + '/' + theme);
        translations[lang] = await page.$eval('#' + game.prefix + 'StatsPanels', panels =>
            [...panels.querySelectorAll('.game-side-title')].map(node => node.textContent.trim()).join('|'));
    }
    check(translations.en !== translations.zh, label + ' actual sidebar headings change between English and Chinese');
}

async function checkBreakpointIdentity(page, game, label) {
    const p = game.prefix;
    const original = await page.$('#' + p + 'StatsPanels');
    const children = await page.evaluateHandle(panels => [...panels.children], original);
    const initialHtml = await page.$eval('#' + p + 'StatsPanels', panels => panels.innerHTML);
    try {
        for (const width of [1023, 1024, 1023]) {
            await page.setViewport({ width, height: 900 });
            await page.waitForFunction(({ prefix, width }) => {
                const node = document.getElementById(prefix + 'StatsPanels');
                return node?.parentElement === (width >= 1024 ? document.querySelector('.game-sidebar')
                    : document.getElementById(prefix + 'StatsDrawerBody'));
            }, { timeout: 7000 }, { prefix: p, width })
                .catch(error => { throw new Error('panel host after resizing to ' + width + ': ' + error.message); });
            check(await page.evaluate((node, children, prefix) =>
                node === document.getElementById(prefix + 'StatsPanels')
                && children.length === node.children.length
                && children.every((child, index) => child === node.children[index]), original, children, p),
            label + '@' + width + ' moves the same panel and card nodes without copying');
            check(await page.$eval('#' + p + 'StatsPanels', panels => panels.innerHTML) === initialHtml,
                label + '@' + width + ' preserves all panel content across breakpoint');
            await checkContent(page, game, label + '@' + width);
        }
        // Moving the panels finishes before ResizeObserver has necessarily
        // settled the topbar. A real pointer click needs a stable button box.
        await page.locator('#' + p + 'StatsToggle').click();
        await page.waitForFunction(prefix => document.getElementById(prefix + 'StatsToggle').getAttribute('aria-expanded') === 'true',
            { timeout: 7000 }, p)
            .catch(error => { throw new Error('open after breakpoint roundtrip: ' + error.message); });
        check(await page.$eval('#' + p + 'StatsDrawer', drawer => !drawer.hidden), label + ' moved panel reopens in the drawer');
        await page.keyboard.press('Escape');
        await page.waitForFunction(prefix => document.getElementById(prefix + 'StatsToggle').getAttribute('aria-expanded') === 'false',
            { timeout: 7000 }, p)
            .catch(error => { throw new Error('Escape after breakpoint roundtrip: ' + error.message); });
        check(await page.evaluate(prefix => document.activeElement === document.getElementById(prefix + 'StatsToggle'), p),
            label + ' Escape restores focus to the visible Stats control after resize');
    } finally {
        await original.dispose();
        await children.dispose();
    }
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
            await page.setBypassServiceWorker(true);
            await page.evaluateOnNewDocument(({ lang, theme }) => {
                localStorage.clear();
                localStorage.setItem('site_lang', lang);
                localStorage.setItem('site_theme', theme);
                localStorage.setItem('site_muted', '1');
            }, { lang: width <= 768 ? 'zh' : 'en', theme: width === 768 || width === 1280 ? 'light' : 'dark' });
            const label = g.id + '@' + width + 'x' + height;
            try {
                await page.goto(BASE + '/' + g.href, { waitUntil: 'domcontentloaded', timeout: 25000 });
                await page.waitForFunction(prefix => {
                    const root = document.getElementById(prefix + '-side-records');
                    const panels = document.getElementById(prefix + 'StatsPanels');
                    return document.body.classList.contains('has-stats-drawer') && panels
                        && (!root || root.children.length > 0);
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
                    const rows = record ? [...record.children] : [];
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
                        recordClass: record?.classList.contains('game-side-records') || false,
                        recordStyle: extract(record, ['display', 'flexDirection']),
                        panelLocation: panels?.parentElement?.id || '',
                        sidebarRows: rows.map(row => ({
                            shared: row.classList.contains('game-side-row'),
                            layout: extract(row, rowProps),
                            strong: row.lastElementChild?.tagName === 'B',
                            labelText: row.firstElementChild?.textContent.trim(),
                            valueText: row.lastElementChild?.textContent.trim(),
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
                if (TWO_COLUMN_PREFIXES.has(p)) {
                    check(actual.recordClass && actual.recordStyle?.display === 'flex'
                    && actual.recordStyle?.flexDirection === 'column',
                    label + ' record column adopts shared geometry', actual.recordStyle);
                    check(actual.sidebarRows.length > 0
                    && actual.sidebarRows.every(row =>
                        row.shared && row.strong && row.labelText && row.valueText
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
                }
                check(actual.rippleUsesRealRows, label + ' ripple runtime rows retain original identity');
                if (PREFIXES.has(p)) check(actual.clearClass && actual.clearTitle?.fontSize === '26px'
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
                await checkContent(page, g, label);
                if (width === 390 || width === 1280) await checkSettings(page, g, label);
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
                if (width === 390) {
                    await page.keyboard.press('Escape');
                    await page.waitForFunction(prefix => document.getElementById(prefix + 'StatsToggle').getAttribute('aria-expanded') === 'false'
                        && document.getElementById(prefix + 'StatsDrawer').hidden,
                    { timeout: 7000 }, p)
                        .catch(error => { throw new Error('Escape before breakpoint roundtrip: ' + error.message); });
                    await checkBreakpointIdentity(page, g, label);
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
