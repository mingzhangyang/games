#!/usr/bin/env node
// Behavioral oracle for stylesheet activation on every page.
//
// The ingress audit is a syntax boundary: it rejects every way to create a
// stylesheet, document or script, but it cannot know which element a generic
// write (`el.rel = …`, `meta.setAttribute('content', …)`) targets. That is data
// flow. This check observes the real browser instead: from before the first
// byte is parsed it records every insertion, removal and attribute write on
// link/style/script/meta/base, then compares the page's live activation with
// the activation its own served HTML declares. Evidence covers page load at a
// desktop and a mobile/low-end profile, not every interaction path.
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { exitIfNoPages, keepPage } from './lib/page-filter.mjs';
import { SOURCE_IDS } from './lib/css/runtime-sources.mjs';

const BASE = process.argv.find(arg => arg.startsWith('http')) || 'http://127.0.0.1:8899';
const baseline = JSON.parse(readFileSync(new URL('./css-activation-p0-baseline.json', import.meta.url), 'utf8'));
const KEY_BY_ID = Object.fromEntries(Object.entries(SOURCE_IDS).map(([key, id]) => [id, key]));
const pages = Object.keys(baseline.pages).filter(file => keepPage(file.replace(/^public\//, '')));
exitIfNoPages(pages, 'verify-css-live-activation');

const PROFILES = [
    { name: 'desktop', viewport: { width: 1280, height: 900 }, lowEnd: false },
    { name: 'mobile', viewport: { width: 390, height: 844, isMobile: true, hasTouch: true }, lowEnd: true },
];

// Runs in the page before any document content. Self-contained by design.
function instrument(lowEnd) {
    Object.defineProperty(navigator, 'deviceMemory', { get: () => lowEnd ? 1 : 8 });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => lowEnd ? 2 : 8 });
    const TAGS = new Set(['link', 'style', 'script', 'meta', 'base']);
    const DIRECTIVES = new Set(['viewport', 'color-scheme', 'supported-color-schemes']);
    const FETCHING_RELS = ['stylesheet', 'preload', 'modulepreload', 'prefetch'];
    const tokens = value => (value ?? '').replace(/[A-Z]/g, c => c.toLowerCase())
        .split(/[\t\n\f\r ]+/).filter(Boolean).sort();
    const hash = text => {
        let h = 2166136261;
        for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
        return (h >>> 0).toString(16) + ':' + text.length;
    };
    // Activation identity: what the element can load, apply, execute or direct.
    const describe = element => {
        const tag = element.localName;
        const attr = name => element.getAttribute(name);
        if (tag === 'link') return ['link', tokens(attr('rel')).join(' '), attr('media') ?? '', element.hasAttribute('disabled')].join('|');
        if (tag === 'style') {
            const key = attr('data-math-rain-style');
            return ['style', key ?? '', attr('media') ?? '', key ? '' : hash(element.textContent)].join('|');
        }
        if (tag === 'script') return ['script', tokens(attr('type')).join(' '), attr('src') ?? ''].join('|');
        if (tag === 'meta') {
            return ['meta', tokens(attr('name')).join(' '), tokens(attr('http-equiv')).join(' '),
                (attr('charset') ?? '').toLowerCase()].join('|');
        }
        return tag;
    };
    const log = window.__cssActivation = { added: [], removed: [], writes: [], shadowRoots: 0, describe };
    // Each element is counted once per direction. A record's subtree may already
    // contain children that also get their own (parser) records, and fragment
    // insertions only report their roots, so walk subtrees and dedupe by identity.
    const seen = { added: new WeakSet(), removed: new WeakSet() };
    const collect = (nodes, direction) => {
        for (const node of nodes) {
            if (node.nodeType !== 1) continue;
            for (const element of [node, ...node.querySelectorAll('link,style,script,meta,base')]) {
                if (!TAGS.has(element.localName) || element.namespaceURI !== 'http://www.w3.org/1999/xhtml'
                    || seen[direction].has(element)) continue;
                seen[direction].add(element);
                log[direction].push(describe(element));
            }
        }
    };
    const attributeWrite = (element, name) => {
        const tag = element.localName;
        if (name.startsWith('data-')) return null;
        if (tag === 'link' && name === 'href'
            && !tokens(element.getAttribute('rel')).some(rel => FETCHING_RELS.includes(rel))) return null;
        if (tag === 'meta' && name === 'content' && !element.hasAttribute('http-equiv')
            && !element.hasAttribute('charset')
            && !DIRECTIVES.has(tokens(element.getAttribute('name')).join(' '))) return null;
        return tag + '[' + name + '] on ' + describe(element);
    };
    new window.MutationObserver(records => {
        for (const record of records) {
            if (record.type === 'childList') {
                collect(record.addedNodes, 'added');
                collect(record.removedNodes, 'removed');
            } else if (record.type === 'attributes' && TAGS.has(record.target.localName)) {
                const write = attributeWrite(record.target, record.attributeName);
                if (write) log.writes.push(write);
            }
        }
    }).observe(document, { childList: true, subtree: true, attributes: true });
    const attachShadow = window.Element.prototype.attachShadow;
    window.Element.prototype.attachShadow = function (...args) {
        log.shadowRoots++;
        return attachShadow.apply(this, args);
    };
}

async function observe(browser, file, profile) {
    const page = await browser.newPage();
    try {
        await page.setViewport(profile.viewport);
        await page.evaluateOnNewDocument(instrument, profile.lowEnd);
        await page.goto(BASE + '/' + file.replace(/^public\//, ''), { waitUntil: 'load', timeout: 30000 });
        // Load-time activation settles once fonts, two frames and an idle period pass.
        await page.evaluate(() => Promise.all([document.fonts.ready, new Promise(resolve =>
            requestAnimationFrame(() => requestAnimationFrame(() => window.requestIdleCallback(resolve, { timeout: 1000 }))))]));
        return await page.evaluate(async () => {
            const log = window.__cssActivation;
            const served = new window.DOMParser().parseFromString(await (await fetch(location.href)).text(), 'text/html');
            const declared = [...served.querySelectorAll('link,style,script,meta,base')].map(log.describe);
            const live = [...document.querySelectorAll('link,style,script,meta,base')].map(log.describe);
            const sheets = [...document.styleSheets].filter(sheet => sheet.disabled
                && !/(^|\s)alternate(\s|$)/i.test(sheet.ownerNode?.getAttribute?.('rel') ?? '')
                && !sheet.ownerNode?.hasAttribute?.('disabled')).length;
            return {
                declared, live, added: log.added, removed: log.removed, writes: log.writes,
                shadowRoots: log.shadowRoots, adopted: document.adoptedStyleSheets.length, disabledSheets: sheets,
                charset: document.characterSet.toLowerCase(),
                declaredCharset: (served.querySelector('meta[charset]')?.getAttribute('charset') ?? '').toLowerCase(),
            };
        });
    } finally {
        await page.close();
    }
}

function subtract(list, remove) {
    const counts = new Map();
    for (const item of remove) counts.set(item, (counts.get(item) || 0) + 1);
    return list.filter(item => {
        const left = counts.get(item) || 0;
        if (left) counts.set(item, left - 1);
        return !left;
    });
}

function violations(file, result) {
    const keys = new Set(baseline.pages[file].runtimeStyleSources.map(id => KEY_BY_ID[id]));
    // Runtime additions the model allows: registered installer sources on pages
    // that reach the installer, inert JSON-LD data blocks, and non-executing
    // module preloads emitted by the production build.
    const allowed = entry => /^script\|application\/ld\+json\|$/.test(entry) || /^link\|modulepreload\|/.test(entry)
        || (entry.startsWith('style|') && keys.has(entry.split('|')[1]));
    const errors = [];
    for (const entry of subtract(result.added, result.declared)) {
        if (!allowed(entry)) errors.push('runtime insertion ' + entry);
    }
    for (const entry of result.removed) errors.push('runtime removal ' + entry);
    for (const entry of subtract(result.declared, result.live)) errors.push('declared input changed or missing ' + entry);
    for (const entry of subtract(result.live, result.declared)) {
        if (!allowed(entry)) errors.push('live input not declared ' + entry);
    }
    for (const write of result.writes) errors.push('activation write ' + write);
    if (result.shadowRoots) errors.push('attachShadow called ' + result.shadowRoots + 'x');
    if (result.adopted) errors.push('adoptedStyleSheets: ' + result.adopted);
    if (result.disabledSheets) errors.push(result.disabledSheets + ' stylesheet(s) disabled at runtime');
    if (result.charset !== result.declaredCharset) {
        errors.push('document encoding ' + result.charset + ' differs from declared ' + result.declaredCharset);
    }
    return errors;
}

const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    // Four concurrent tabs must remain schedulable while waiting on rAF/idle.
    // Match the repository's concurrent-browser contract so background tabs
    // cannot make activation verification nondeterministic.
    args: [...LAUNCH_ARGS,
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows'],
});
const failures = [];
try {
    const jobs = pages.flatMap(file => PROFILES.map(profile => ({ file, profile })));
    let next = 0;
    await Promise.all(Array.from({ length: 4 }, async () => {
        while (next < jobs.length) {
            const { file, profile } = jobs[next++];
            try {
                for (const error of violations(file, await observe(browser, file, profile))) {
                    failures.push(file + ' [' + profile.name + ']: ' + error);
                }
            } catch (error) {
                failures.push(file + ' [' + profile.name + ']: ' + error.message);
            }
        }
    }));
} finally {
    await browser.close();
}
if (failures.length) {
    console.error('FAIL live stylesheet activation differs from the declared page inputs');
    failures.sort().forEach(failure => console.error('  ' + failure));
    process.exit(1);
}
console.log('PASS live stylesheet activation matches declared inputs on ' + pages.length + ' pages × '
    + PROFILES.length + ' profiles (insertions, removals, attribute writes, encoding, adopted/shadow sheets)');
