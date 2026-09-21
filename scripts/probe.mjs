// 单页布局探针：node scripts/probe.mjs <page> [w] [h] [selector]
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
const CHROME = CHROME_PATH;
const [page_, w = 1280, h = 900, sel = '.game-shell', shot = ''] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: LAUNCH_ARGS });
const p = await b.newPage();
await p.setViewport({ width: +w, height: +h });
await p.goto(`http://127.0.0.1:8899/${page_}.html`, { waitUntil: 'networkidle2' }).catch(() => { });
await new Promise(r => setTimeout(r, 800));
console.log(await p.evaluate(s => {
    const el = document.querySelector(s);
    const cs = el && getComputedStyle(el);
    const bcs = getComputedStyle(document.body);
    return JSON.stringify({
        sel: s,
        w: el && Math.round(el.getBoundingClientRect().width),
        width: cs?.width, maxWidth: cs?.maxWidth, boxSizing: cs?.boxSizing,
        padding: cs?.padding, display: cs?.display,
        // whiteSpace / borderRadius 是共享层最容易压掉页面意图的两个属性
        // （.game-toast 曾用 nowrap 把 pm/wd 的 max-width 换行压成单行）
        whiteSpace: cs?.whiteSpace, borderRadius: cs?.borderRadius,
        frameMax: cs?.getPropertyValue('--frame-max').trim(),
        frameMaxWide: cs?.getPropertyValue('--frame-max-wide').trim(),
        frameStage: cs?.getPropertyValue('--frame-stage').trim(),
        body: { display: bcs.display, width: bcs.width, padding: bcs.padding, position: bcs.position },
        viewport: innerWidth,
        extra: {
            parent: el?.parentElement?.tagName, offsetW: el?.offsetWidth,
            transform: cs?.transform, zoom: cs?.zoom, flex: cs?.flex,
            animation: cs?.animationName, scrollW: document.documentElement.scrollWidth,
            position: cs?.position,
            canvases: [...document.querySelectorAll('canvas')].map(c => ({
                id: c.id, attr: `${c.width}x${c.height}`,
                cssW: c.style.width || null,
                rect: [Math.round(c.getBoundingClientRect().width), Math.round(c.getBoundingClientRect().height)],
            })),
            other: [...document.querySelectorAll('.board-container,.game-board,.game-stage')].map(e => ({
                cls: e.className, w: Math.round(e.getBoundingClientRect().width),
                pos: getComputedStyle(e).position,
            })),
        },
    }, null, 1);
}, sel));
if (shot) {
    const handle = await p.$(sel);
    if (handle) await handle.screenshot({ path: shot });
}
await b.close();
