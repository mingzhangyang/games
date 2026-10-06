#!/usr/bin/env node
// verify-reduced-motion.mjs — P2-X / #103 Reduced-Motion Accessibility Closure
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { keepPage, exitIfNoPages } from './lib/page-filter.mjs';

const BASE = process.argv.slice(2).find(arg => arg.startsWith('http')) || 'http://127.0.0.1:8899';
const PROBE_PAGES = [
    'tetris', 'math-rain', 'circuit', 'needle-awn', 'word-daily', 'crystal-bloom',
];
const RUN_PAGES = new Set(PROBE_PAGES.filter(keepPage));
exitIfNoPages([...RUN_PAGES], 'verify-reduced-motion');
const shouldRun = href => RUN_PAGES.has(String(href).replace(/\.html$/, ''));

const fails = [];
let passes = 0;
const check = (condition, label, extra = '') => {
    if (condition) passes++;
    else fails.push(label + (extra ? ' —— ' + extra : ''));
};
const toMs = value => {
    const first = String(value || '').split(',')[0].trim();
    if (first.endsWith('ms')) return Number.parseFloat(first);
    if (first.endsWith('s')) return Number.parseFloat(first) * 1000;
    return Number.NaN;
};

const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: LAUNCH_ARGS });

async function open(href) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error.message || error).split('\n')[0]));
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.goto(`${BASE}/${href}`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(
        () => document.readyState === 'complete' && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches,
        { timeout: 5000 },
    );
    const media = await page.evaluate(() => globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches);
    check(media, `${href}: reduced-motion media query is active`);
    return { page, errors };
}

async function style(page, selector) {
    return page.evaluate(sel => {
        const element = document.querySelector(sel);
        if (!element) return null;
        const cs = getComputedStyle(element);
        return {
            animationName: cs.animationName,
            animationDuration: cs.animationDuration,
            animationIterationCount: cs.animationIterationCount,
            transitionDuration: cs.transitionDuration,
            scrollBehavior: cs.scrollBehavior,
        };
    }, selector);
}

// Universal important clamps: contract v3 must keep exact legacy values.
for (const [href, expectedMs] of [['tetris.html', 0.01], ['math-rain.html', 0.001]].filter(([href]) => shouldRun(href))) {
    const { page, errors } = await open(href);
    const s = await style(page, 'html');
    check(!!s, `${href}: root exists`);
    if (s) {
        check(Math.abs(toMs(s.animationDuration) - expectedMs) < 0.0001,
            `${href}: animation duration clamp preserved`, s.animationDuration);
        check(Math.abs(toMs(s.transitionDuration) - expectedMs) < 0.0001,
            `${href}: transition duration clamp preserved`, s.transitionDuration);
        check(Number.parseFloat(s.animationIterationCount) === 1,
            `${href}: animation iteration clamp preserved`, s.animationIterationCount);
        check(s.scrollBehavior === 'auto', `${href}: smooth scrolling disabled`, s.scrollBehavior);
    }
    check(errors.length === 0, `${href}: no pageerror`, errors.join(' | '));
    await page.close();
}

// Page-scoped important animation rule.
if (shouldRun('circuit.html')) {
    const { page, errors } = await open('circuit.html');
    const s = await style(page, '.cc-hero');
    check(!!s, 'circuit: hero probe exists');
    if (s) check(s.animationName === 'none', 'circuit: hero animation disabled', s.animationName);

    // Shared normal contracts must still beat the layered component transitions.
    const icon = await style(page, '.game-icon-btn');
    check(!!icon, 'circuit: shared icon button probe exists');
    if (icon) check(toMs(icon.transitionDuration) === 0,
        'circuit: shared icon transition disabled by reduced-motion contract', icon.transitionDuration);

    const drawer = await style(page, '.game-drawer-panel');
    check(!!drawer, 'circuit: drawer panel probe exists');
    if (drawer) check(toMs(drawer.transitionDuration) === 0,
        'circuit: shared drawer transition disabled by reduced-motion contract', drawer.transitionDuration);
    check(errors.length === 0, 'circuit: no pageerror', errors.join(' | '));
    await page.close();
}

// Important transition family.
if (shouldRun('needle-awn.html')) {
    const { page, errors } = await open('needle-awn.html');
    const s = await style(page, '.na-btn');
    check(!!s, 'needle-awn: button probe exists');
    if (s) check(toMs(s.transitionDuration) === 0,
        'needle-awn: important transition disabled', s.transitionDuration);
    check(errors.length === 0, 'needle-awn: no pageerror', errors.join(' | '));
    await page.close();
}

// One rule containing both important animation and transition.
if (shouldRun('word-daily.html')) {
    const { page, errors } = await open('word-daily.html');
    const s = await style(page, '.wd-btn');
    check(!!s, 'word-daily: button probe exists');
    if (s) {
        check(s.animationName === 'none', 'word-daily: animation disabled', s.animationName);
        check(toMs(s.transitionDuration) === 0, 'word-daily: transition disabled', s.transitionDuration);
    }
    check(errors.length === 0, 'word-daily: no pageerror', errors.join(' | '));
    await page.close();
}

// Important layer precedence is reversed. Science Showcase still owns its shared
// reduced-motion clamp in components, so components intentionally remains before
// accessibility until that stylesheet gets its own dependency-closed showcase migration.
if (shouldRun('crystal-bloom.html')) {
    const { page, errors } = await open('crystal-bloom.html');
    const s = await style(page, '.cb-card');
    check(!!s, 'crystal-bloom: showcase card probe exists');
    if (s) {
        check(s.animationName === 'none', 'crystal-bloom: page animation remains disabled', s.animationName);
        check(Math.abs(toMs(s.animationDuration) - 0.001) < 0.0001,
            'crystal-bloom: shared showcase duration precedence preserved', s.animationDuration);
    }
    check(errors.length === 0, 'crystal-bloom: no pageerror', errors.join(' | '));
    await page.close();
}

await browser.close();

if (fails.length) {
    console.error(fails.map(fail => `✗ ${fail}`).join('\n'));
    console.error(`\nverify-reduced-motion: ${fails.length} failed (${passes} passed) ❌`);
    process.exit(1);
}
console.log(`verify-reduced-motion passed ✅ (${passes} assertions)`);
