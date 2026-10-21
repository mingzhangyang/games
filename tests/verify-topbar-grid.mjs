// verify-all: timeout=300000
// Chrome step 3: live, bilingual layout audit at 320x568 / 375x553 / 390x664 / 1280x900.
// Prints measured available/required title widths for EVERY page and language.
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { keepPage, exitIfNoPages } from './lib/page-filter.mjs';
import { registry } from './lib/registry.mjs';

const BASE = process.argv.slice(2).find(a => a.startsWith('http')) || 'http://127.0.0.1:8899';
const GAMES = registry.withCap('topbar').map(g => g.id).filter(keepPage);
exitIfNoPages(GAMES, 'verify-topbar-grid');

const VIEWPORTS = [[320, 568], [375, 553], [390, 664], [1280, 900]];
const MOBILE = new Map();
const fails = [];
const widths = [];
let count = 0;
function assert(ok, label) {
    count++;
    if (!ok) fails.push(label);
}
const near = (a, b, tolerance = 1) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance;
const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: LAUNCH_ARGS });

async function measure(page) {
    return page.evaluate(() => {
        const header = document.querySelector('.game-topbar');
        const home = header?.querySelector('[data-chrome="home"]');
        const sound = header?.querySelector('[data-chrome="sound"]');
        const center = header?.querySelector('.game-topbar-center');
        const name = center?.querySelector('.game-topbar-name');
        const box = el => {
            if (!el) return null;
            const rect = el.getBoundingClientRect();
            return { x: rect.left, y: rect.top, right: rect.right, bottom: rect.bottom,
                width: rect.width, height: rect.height };
        };
        const style = name && getComputedStyle(name);
        const inner = name?.innerText?.trim() || '';
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        let required = 0;
        if (style && inner) {
            ctx.font = [style.fontWeight, style.fontSize, style.fontFamily].join(' ');
            required = ctx.measureText(inner.replace(/\s+/g, ' ')).width;
        }
        const truncatedOther = header ? [...header.querySelectorAll('*')].filter(el => {
            if (el === name || el.closest('.game-topbar-name')) return false;
            const cs = getComputedStyle(el);
            return el.children.length === 0 && el.textContent.trim() && cs.textOverflow === 'ellipsis'
                && el.scrollWidth > el.clientWidth + 1;
        }).map(el => el.id || el.className || el.tagName) : [];
        const nested = name ? [...name.querySelectorAll('*')].filter(el => getComputedStyle(el).display !== 'none')
            .map(el => ({ font: getComputedStyle(el).fontSize,
                weight: getComputedStyle(el).fontWeight,
                shadow: getComputedStyle(el).textShadow })) : [];
        return { grid: header && getComputedStyle(header).display === 'grid',
            columns: header && getComputedStyle(header).gridTemplateColumns,
            home: box(home), sound: box(sound), name: box(name), center: box(center),
            nameHidden: name && (getComputedStyle(name).display === 'none' || box(name).width === 0),
            text: inner, size: style?.fontSize, weight: style?.fontWeight,
            font: style?.fontFamily, shadow: style?.textShadow,
            background: style?.backgroundImage, fill: style?.webkitTextFillColor,
            color: style?.color, whiteSpace: style?.whiteSpace,
            ellipsis: style?.textOverflow, available: center?.getBoundingClientRect().width || 0,
            required, truncatedOther, nested,
            lineHeight: style ? parseFloat(style.lineHeight) : 0,
            textHeight: name?.getBoundingClientRect().height || 0 };
    });
}

for (const [w, h] of VIEWPORTS) {
    for (const lang of ['zh', 'en']) {
        for (const id of GAMES) {
            const tag = id + '@' + w + 'x' + h + '/' + lang;
            const page = await browser.newPage();
            try {
                await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
                await page.evaluateOnNewDocument(l => {
                    try { localStorage.setItem('site_lang', l); } catch { /* private mode */ }
                }, lang);
                await page.goto(BASE + '/' + id + '.html', { waitUntil: 'domcontentloaded', timeout: 25000 });
                await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
                await page.waitForFunction(() => document.fonts.status === 'loaded', { timeout: 3000 }).catch(() => {});
                const r = await measure(page);
                widths.push({ id, w, h, lang, text: r.text,
                    available: +r.available.toFixed(1), required: +r.required.toFixed(1),
                    overflow: +Math.max(0, r.required - r.available).toFixed(1) });
                console.log('TOPBAR_WIDTH ' + JSON.stringify(widths.at(-1)));
                assert(r.grid, tag + ': header not grid');
                assert(r.home && r.sound && r.center && r.name, tag + ': missing required anchor/title');
                if (!r.home || !r.sound || !r.center || !r.name) continue;
                const titleException = id === 'tower-defense' && w <= 480 && h > w;
                assert(titleException || !r.nameHidden, tag + ': name unexpectedly hidden');
                assert(r.truncatedOther.length === 0,
                    tag + ': non-title text truncated: ' + r.truncatedOther.join(','));
                assert(near(r.sound.right, w - 10, 1.5) || w >= 1024,
                    tag + ': Sound not flush with mobile bar edge: x=' + r.sound.right);
                if (!r.nameHidden) {
                    assert(near(r.name.x - r.home.right, 12, 1.2),
                        tag + ': name must start 12px after Home: dx=' + (r.name.x - r.home.right).toFixed(1));
                    assert(r.whiteSpace === 'nowrap', tag + ': title is not single-line nowrap');
                    assert(r.textHeight <= r.lineHeight + 2, tag + ': title is wrapping');
                    assert(r.ellipsis === 'ellipsis', tag + ': only title ellipsis must be enabled');
                    assert(r.size === (w <= 480 ? '16px' : '17px') && r.weight === '700',
                        tag + ': wrong title type scale ' + r.size + '/' + r.weight);
                    assert(r.font.includes('system-ui'), tag + ': nonstandard title font ' + r.font);
                    assert(r.shadow === 'none' && r.background === 'none',
                        tag + ': title glow/gradient remains');
                    assert(r.nested.every(n => n.font === r.size && n.weight === '700' && n.shadow === 'none'),
                        tag + ': nested title style differs from contract');
                    if (lang === 'zh' && w === 390) {
                        assert(r.required <= r.available + 1.5,
                            tag + ': Chinese title must fit at 390px, needs ' + r.required.toFixed(1)
                            + ' in ' + r.available.toFixed(1) + 'px');
                    }
                }
                if (w <= 480) {
                    const key = w + 'x' + h;
                    const anchor = { homeX: r.home.x, homeY: r.home.y,
                        soundX: r.sound.x, soundY: r.sound.y, nameX: r.name?.x, nameY: r.name?.y };
                    const original = MOBILE.get(key);
                    if (!original) MOBILE.set(key, anchor);
                    else for (const field of ['homeX', 'homeY', 'soundX', 'soundY', ...(!r.nameHidden ? ['nameX', 'nameY'] : [])]) {
                        assert(near(anchor[field], original[field], 1.2),
                            tag + ': mobile anchor ' + field + ' differs: '
                            + anchor[field]?.toFixed(1) + ' vs ' + original[field]?.toFixed(1));
                    }
                }
                // Reverse mutations: real layout and text-style regression gates must turn red.
                if (id === GAMES[0] && w === 390 && lang === 'zh') {
                    await page.evaluate(() => document.querySelector('.game-topbar').style.setProperty('display', 'flex', 'important'));
                    assert(!(await measure(page)).grid, 'inverse: forced flex must be detected');
                    await page.evaluate(() => document.querySelector('.game-topbar').style.removeProperty('display'));
                    await page.evaluate(() => document.querySelector('.game-topbar-name').style.setProperty('font-size', '11px', 'important'));
                    assert((await measure(page)).size !== '16px', 'inverse: forced 11px title must be detected');
                }
            } catch (e) {
                assert(false, tag + ': browser exception: ' + (e.message || e));
            } finally {
                await page.close();
            }
        }
    }
}
await browser.close();
console.log('TOPBAR_WIDTH_SUMMARY ' + JSON.stringify({ samples: widths.length, expected: GAMES.length * VIEWPORTS.length * 2,
    longEnglish: widths.filter(r => r.lang === 'en' && r.w <= 390 && r.overflow > 1),
    anchors: Object.fromEntries(MOBILE) }));
if (fails.length) {
    console.log('✗ verify-topbar-grid: ' + fails.length + '/' + count + ' checks failed');
    for (const f of fails) console.log('  ✗ ' + f);
    process.exitCode = 1;
} else {
    console.log('✓ verify-topbar-grid: ' + count + ' checks passed');
}
