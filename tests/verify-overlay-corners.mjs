// 覆盖层圆角回归：铺满容器的遮罩不能在四角露出它本该盖住的内容。
// 用法：node tests/lib/serve-static.mjs 8899 &  然后  node tests/verify-overlay-corners.mjs http://127.0.0.1:8899
//
// 背景：.game-overlay 自带 18px 圆角（layout 层），本意是贴合圆角舞台。可一旦遮罩铺在
// 直角的容器里（画牢的全出血沉浸式舞台、拔萝卜的直角 .cp-scene-wrap），四角就会露出一小块
// 未模糊、未压暗的画布 / 场景图 —— 截图里看到的「容器四角是直角」。
//
// 判定（几何 + 真实命中测试，不靠类名猜）：逐页逐视口，把每个遮罩类元素依次显形，对每个
// 「铺满其包含块」（absolute → offsetParent 的 padding box；fixed → 视口）且某角圆角 ≥2px 的
// 元素，在该角曲线外、包围盒内取一点：如果遮罩自身没命中，而命中栈里有包含块（或其后代）
// 绘制的内容 —— 画布 / 图片 / SVG / 不透明背景 —— 就是露角。祖先若以 ≥ 同等圆角裁剪
// （overflow:hidden + border-radius），命中测试自然落空，不会误报。测量时临时把全部元素的
// pointer-events 设为 auto，否则 pointer-events:none 的画布 / 遮罩会从命中栈里消失。
//
// 每条失败在修复前的版本上都能复现：c1749f8 之前的画牢、本改动之前的拔萝卜。
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { keepPage, exitIfNoPages } from './lib/page-filter.mjs';
import { registry } from './lib/registry.mjs';

const BASE = process.argv[2] || 'http://127.0.0.1:8899';
const VIEWPORTS = [
    { label: '390', width: 390, height: 664, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
    { label: '820', width: 820, height: 1180, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
    { label: '1280', width: 1280, height: 800, deviceScaleFactor: 1 },
];
// 显形候选：遮罩 / 弹窗 / 整屏面板。抽屉（.game-drawer）是视口级直角 scrim，面板本就只圆上角。
const CANDIDATES = '.game-overlay, [class*="overlay"], [class*="Overlay"], [class*="modal"], [class*="Modal"], [class*="screen"], dialog';

const PAGES = registry.all().map(g => ({ id: g.id, href: g.href })).filter(p => keepPage(p.id));
exitIfNoPages(PAGES, 'verify-overlay-corners');

const fails = [];
const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: LAUNCH_ARGS });

function scanPage() {
    const style = document.createElement('style');
    style.textContent = '* { pointer-events: auto !important; }';
    document.head.appendChild(style);
    const desc = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')
        + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
    const painted = el => {
        if (el instanceof window.SVGElement || ['CANVAS', 'IMG', 'VIDEO'].includes(el.tagName)) return true;
        const cs = getComputedStyle(el);
        if (cs.backgroundImage !== 'none') return true;
        const m = /rgba?\(([^)]+)\)/.exec(cs.backgroundColor);
        if (!m) return false;
        const alpha = m[1].split(/[\s,/]+/).filter(Boolean)[3];
        return Number(alpha ?? 1) > 0.05;
    };
    const kebab = name => name.replace(/[A-Z]/g, c => '-' + c.toLowerCase()).slice(1);
    const visible = u => {
        let alpha = 1;
        for (let e = u instanceof window.SVGElement ? u.ownerSVGElement || u : u; e && e !== document.documentElement; e = e.parentElement) {
            alpha *= Number(getComputedStyle(e).opacity);
        }
        return alpha > 0.05;
    };
    const issues = [];
    for (const el of document.querySelectorAll('body *')) {
        const cs = getComputedStyle(el);
        if (cs.position !== 'absolute' && cs.position !== 'fixed') continue;
        if (cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 120 || r.height < 120) continue;
        let cb;
        const host = cs.position === 'fixed' ? null : el.offsetParent;
        if (host) {
            const hr = host.getBoundingClientRect();
            const hs = getComputedStyle(host);
            cb = {
                left: hr.left + parseFloat(hs.borderLeftWidth), top: hr.top + parseFloat(hs.borderTopWidth),
                right: hr.right - parseFloat(hs.borderRightWidth), bottom: hr.bottom - parseFloat(hs.borderBottomWidth),
            };
        } else {
            cb = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
        }
        const fills = ['left', 'top', 'right', 'bottom'].every(k => Math.abs(r[k] - cb[k]) <= 2);
        if (!fills) continue;
        const scope = host || document.body;
        for (const [name, sx, sy] of [['TopLeft', 1, 1], ['TopRight', -1, 1], ['BottomLeft', 1, -1], ['BottomRight', -1, -1]]) {
            const rad = parseFloat(cs['border' + name + 'Radius']) || 0;
            if (rad < 2) continue;
            const d = Math.max(0.6, rad * 0.12);
            const x = (sx > 0 ? r.left : r.right) + sx * d;
            const y = (sy > 0 ? r.top : r.bottom) + sy * d;
            if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
            const stack = document.elementsFromPoint(x, y);
            if (stack.includes(el)) continue;
            // 只看遮罩之下的层：把该角临时拉直，命中栈里排在遮罩之前的都画在它上面。
            const prev = el.style.getPropertyValue('border-' + kebab(name) + '-radius');
            el.style.setProperty('border-' + kebab(name) + '-radius', '0', 'important');
            const square = document.elementsFromPoint(x, y);
            el.style.setProperty('border-' + kebab(name) + '-radius', prev);
            const at = square.indexOf(el);
            const below = new Set(at < 0 ? [] : square.slice(at + 1));
            const exposed = stack.find(u => below.has(u) && u !== document.documentElement && u !== document.body
                && !el.contains(u) && (u === scope || scope.contains(u)) && painted(u) && visible(u));
            if (exposed) issues.push(`${desc(el)} ${name} r${rad} exposes ${desc(exposed)}`);
        }
    }
    style.remove();
    return issues;
}

async function frames(page, n = 2) {
    await page.evaluate(n => new Promise(res => {
        const step = k => (k <= 0 ? res() : requestAnimationFrame(() => step(k - 1)));
        step(n);
    }), n);
}

for (const { id, href } of PAGES) {
    for (const vp of VIEWPORTS) {
        const page = await browser.newPage();
        await page.setViewport(vp);
        await page.setRequestInterception(true);
        page.on('request', req => (/workers\.dev/.test(req.url())
            ? req.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '[]' })
            : req.continue()));
        await page.evaluateOnNewDocument(() => {
            try { localStorage.setItem('site_lang', 'en'); localStorage.setItem('site_muted', '1'); } catch { /* private mode */ }
        });
        await page.goto(`${BASE}/${href}`, { waitUntil: 'load' });
        await page.evaluate(() => document.fonts.ready);
        await frames(page, 6);
        const issues = new Set(await page.evaluate(scanPage));
        const count = await page.evaluate(sel => document.querySelectorAll(sel).length, CANDIDATES);
        for (let i = 0; i < count; i++) {
            const shown = await page.evaluate((sel, i) => {
                const t = document.querySelectorAll(sel)[i];
                if (!t || t.closest('.game-drawer')) return false;
                const undo = [];
                const save = e => undo.push([e, e.getAttribute('class'), e.getAttribute('style'), e.hasAttribute('hidden')]);
                if (t.tagName === 'DIALOG' && !t.open) {
                    try { t.showModal(); } catch { t.setAttribute('open', ''); }
                    undo.push(['dialog', t]);
                }
                for (let e = t; e && e !== document.body; e = e.parentElement) {
                    save(e);
                    e.classList.remove('hidden');
                    e.removeAttribute('hidden');
                    if (e === t) e.classList.add('show', 'active', 'open', 'visible');
                    if (getComputedStyle(e).display === 'none') e.style.display = e === t ? 'flex' : 'block';
                }
                t.style.opacity = '1';
                t.style.visibility = 'visible';
                t.style.animation = 'none';
                t.style.transition = 'none';
                window.__ovUndo = undo;
                return true;
            }, CANDIDATES, i);
            if (!shown) continue;
            await frames(page, 2);
            for (const issue of await page.evaluate(scanPage)) issues.add(issue);
            await page.evaluate(() => {
                for (const entry of (window.__ovUndo || []).reverse()) {
                    if (entry[0] === 'dialog') { entry[1].close(); continue; }
                    const [e, cls, st, hidden] = entry;
                    if (cls === null) e.removeAttribute('class'); else e.setAttribute('class', cls);
                    if (st === null) e.removeAttribute('style'); else e.setAttribute('style', st);
                    e.toggleAttribute('hidden', hidden);
                }
            });
        }
        await page.close();
        const ok = issues.size === 0;
        console.log(`  ${ok ? '✓' : '✗'} ${id} @${vp.label}${ok ? '' : '\n      ' + [...issues].join('\n      ')}`);
        for (const issue of issues) fails.push(`${id} @${vp.label}: ${issue}`);
    }
}

await browser.close();
if (fails.length) {
    console.log(`\n✗ verify-overlay-corners: ${fails.length} exposed corner(s)`);
    process.exit(1);
}
console.log(`\n✓ verify-overlay-corners: ${PAGES.length} pages × ${VIEWPORTS.length} viewports, no overlay exposes its stage at a rounded corner`);
