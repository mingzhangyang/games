// 布局几何度量：node scripts/layout-metrics.mjs [baseUrl]
// 输出各页 shell/topbar/icon-btn/stage/canvas/sidebar/footer-hint 的实际计算值，
// 用于检查跨页一致性（触控热区 ≥44px、顶栏高度、容器宽度等）。
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { registry } from './lib/registry.mjs';

const PAGES = registry.all().map(g => g.id);

const CHROME = CHROME_PATH;
const BASE = process.argv[2] || 'http://127.0.0.1:8899';

const MEASURE = () => {
    const px = v => Math.round(parseFloat(v) || 0);
    const g = sel => document.querySelector(sel);
    const rect = el => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) };
    };
    const cs = (el, p) => el ? getComputedStyle(el).getPropertyValue(p).trim() : '';

    const shell = g('.game-shell');
    const topbar = g('.game-topbar');
    const btn = g('.game-icon-btn');
    const stage = g('.game-stage');
    const canvas = g('.game-canvas') || g('canvas');
    const side = g('.game-sidebar');
    const hint = g('.game-footer-hint');
    const overlay = g('.game-overlay');

    let hit = null;
    if (btn) {
        const after = getComputedStyle(btn, '::after');
        const inset = px(after.insetTop || after.top);
        const r = btn.getBoundingClientRect();
        hit = { w: Math.round(r.width + inset * -2), h: Math.round(r.height + inset * -2), pad: inset };
    }
    return {
        shell: rect(shell), shellPad: cs(shell, 'padding'), shellMax: cs(shell, 'max-width'),
        topbar: rect(topbar),
        btn: rect(btn), btnRadius: cs(btn, 'border-radius'), btnFont: cs(btn, 'font-size'),
        hit, stage: rect(stage), stageMax: cs(stage, 'max-width'),
        canvas: rect(canvas), canvasRadius: cs(canvas, 'border-radius'),
        side: rect(side), hint: rect(hint), hintFont: cs(hint, 'font-size'),
        overlayBg: cs(overlay, 'backdrop-filter'),
    };
};

const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: LAUNCH_ARGS,
});

const rows = [];
for (const vp of [{ tag: 'M390', w: 390, h: 844 }, { tag: 'D1280', w: 1280, h: 900 }, { tag: 'D1920', w: 1920, h: 1080 }]) {
    for (const name of PAGES) {
        const page = await browser.newPage();
        await page.setViewport({ width: vp.w, height: vp.h });
        try {
            await page.goto(`${BASE}/${name}.html`, { waitUntil: 'networkidle2', timeout: 20000 });
        } catch { /* ignore */ }
        await new Promise(r => setTimeout(r, 900));
        // 只隐藏铺满视口的开始/结果浮层，露出真实舞台（不点击，避免触发导航或状态切换）
        await page.evaluate(() => {
            const kill = /(start|result|over|win|lose|pause|orientation|hero)/i;
            document.querySelectorAll('div,section').forEach(el => {
                const c = String(el.className || '');
                if (!kill.test(c)) return;
                const p = getComputedStyle(el).position;
                if (p === 'fixed' || p === 'absolute') {
                    const r = el.getBoundingClientRect();
                    if (r.width > innerWidth * 0.6 && r.height > innerHeight * 0.5) el.style.display = 'none';
                }
            });
        }).catch(() => { });
        await new Promise(r => setTimeout(r, 250));
        const m = await page.evaluate(MEASURE).catch(e => ({ err: e.message }));
        rows.push({ vp: vp.tag, name, m });
        await page.close();
    }
}
await browser.close();

const f = o => o ? `${o.w}x${o.h}` : '-';
for (const vp of ['M390', 'D1280', 'D1920']) {
    console.log(`\n===== ${vp} =====`);
    console.log('page                 shell      pad       topbar    btn     hit      stageMax  canvas        radius  sidebar  hint');
    for (const r of rows.filter(r => r.vp === vp)) {
        const m = r.m;
        if (m.err) { console.log(`${r.name.padEnd(20)} ERR ${m.err}`); continue; }
        console.log([
            r.name.padEnd(20),
            f(m.shell).padEnd(10),
            String(m.shellPad).split(' ').slice(0, 2).join(' ').padEnd(9),
            f(m.topbar).padEnd(9),
            f(m.btn).padEnd(7),
            (m.hit ? `${m.hit.w}x${m.hit.h}` : '-').padEnd(8),
            String(m.stageMax).padEnd(9),
            `${f(m.canvas)}/${m.canvasRadius}`.padEnd(13),
            String(m.canvasRadius).padEnd(7),
            f(m.side).padEnd(8),
            m.hint ? `y=${m.hint.y} ${m.hintFont}` : '-',
        ].join(' '));
    }
}
