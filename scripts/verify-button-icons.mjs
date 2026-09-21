// 结果/动作按钮图标改造的专项验证：
//   node scripts/verify-button-icons.mjs [baseUrl] [outDir]
//
// 改动的按钮都在结果面板里，默认被开始浮层挡住，普通整页截图看不到。
// 这里按 id 找到按钮 → 把它的浮层祖先解开 hidden → 量「图标尺寸/与文案的垂直居中对齐」
// → 收一张该按钮的元素级截图，供人工目视。
import puppeteer from 'puppeteer-core';
import { CHROME_PATH } from './lib/browser.mjs';
import { registry } from './lib/registry.mjs';
import { mkdir } from 'node:fs/promises';

const CHROME = process.env.CHROME_BIN ||
    CHROME_PATH;
const BASE = process.argv[2] || 'http://127.0.0.1:8899';
const OUT = process.argv[3] || 'C:/Users/mingz/AppData/Local/Temp/btn-icons';

const TARGETS = {
    'planet-merge': ['pm-btn-menu', 'pm-btn-again', 'pm-btn-share', 'pm-btn-copy', 'pm-btn-home2'],
    'hoop-shot': ['hs-btn-menu', 'hs-btn-again', 'hs-btn-share', 'hs-btn-copy', 'hs-btn-home'],
    'gravity-slingshot': ['gd-btn-replay', 'gd-btn-menu1', 'gd-btn-copy', 'gd-btn-menu2', 'gd-btn-again'],
    'tower-defense': ['td-btn-menu', 'td-btn-again', 'td-btn-copy', 'td-btn-menu2'],
    'reversi': ['rv-btn-again', 'rv-btn-copy', 'rv-btn-menu'],
    'needle-awn': ['na-btn-pause-home', 'na-btn-result-home'],
    'sword-flight': ['sf-btn-menu', 'sf-btn-victory-menu', 'sf-btn-go-menu', 'sf-btn-open-rank'],
    'word-daily': ['wd-btn-next', 'wd-btn-stats-inline', 'wd-btn-share-inline', 'wd-modal-next', 'wd-share'],
    'lumen': ['lm-btn-next', 'lm-btn-replay', 'lm-btn-menu1', 'lm-btn-copy', 'lm-btn-menu2', 'lm-btn-again'],
    'circuit': ['cc-btn-next', 'cc-btn-replay', 'cc-btn-menu1', 'cc-btn-copy', 'cc-btn-menu2', 'cc-btn-again'],
    'silk-dew': ['sd-btn-next', 'sd-btn-replay', 'sd-btn-menu1', 'sd-btn-copy', 'sd-btn-menu2', 'sd-btn-again'],
};

// TARGETS 是每页的按钮 id，派生不出来，但漏页必须红：新游戏挂了 topbar cap 却
// 没有条目，此前只是「不测它」，悄无声息（lumen 就是这么漏掉的）。
// 豁免三页，理由各不相同，详见 docs/backlog.md：
//   gomoku      —— 结果面板没有「图标 + 文字」按钮，无可测
//   tetris / minesweeper —— 图标早于本次迁移就有，本校验器一直没覆盖（待补）
registry.assertCovered({
    cap: 'topbar',
    covered: Object.keys(TARGETS),
    exempt: ['gomoku', 'tetris', 'minesweeper'],
    label: 'TARGETS',
});

const REVEAL = (ids) => {
    for (const id of ids) {
        const btn = document.getElementById(id);
        if (!btn) continue;
        // 解开祖先的 display:none（.hidden / [hidden] / 内联 none）
        for (let el = btn; el && el !== document.body; el = el.parentElement) {
            el.classList?.remove('hidden');
            el.removeAttribute?.('hidden');
            if (getComputedStyle(el).display === 'none') el.style.display = 'flex';
        }
    }
};

const MEASURE = (ids) => ids.map(id => {
    const btn = document.getElementById(id);
    if (!btn) return { id, err: 'not found' };
    const svg = btn.querySelector('svg');
    const label = btn.querySelector('span');
    const r = e => { const b = e.getBoundingClientRect(); return { w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10, cy: Math.round((b.top + b.height / 2) * 10) / 10 }; };
    const cs = getComputedStyle(btn);
    const b = r(btn);
    const s = svg ? r(svg) : null;
    const l = label ? r(label) : null;
    // 结果面板可能有入场 transform: scale()，rect 会被缩放 → 图标尺寸与溢出判断
    // 都改用「计算样式」和「未变换的 offset/scroll 宽度」，避免误报。
    const scale = btn.offsetWidth ? Math.round((b.w / btn.offsetWidth) * 1000) / 1000 : 1;
    const iconCss = svg ? getComputedStyle(svg).width : null;
    return {
        id,
        btn: `${b.w}x${b.h}`,
        display: cs.display,
        svgCount: btn.querySelectorAll('svg').length,
        iconCss,
        icon: s ? `${s.w}x${s.h}` : null,
        scale,
        label: label ? label.textContent.trim() : null,
        // 图标与文案中心的垂直偏差，>1px 就是基线没对齐
        dy: (s && l) ? Math.round((s.cy - l.cy) * 10) / 10 : null,
        overflow: btn.scrollWidth > btn.clientWidth + 1,
    };
});

await mkdir(OUT, { recursive: true });
const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-first-run', '--disable-gpu', '--hide-scrollbars', '--mute-audio'],
});

let bad = 0;
for (const [name, ids] of Object.entries(TARGETS)) {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
    await page.goto(`${BASE}/${name}.html`, { waitUntil: 'networkidle2', timeout: 20000 }).catch(() => { });
    await new Promise(r => setTimeout(r, 800));
    await page.evaluate(REVEAL, ids);
    await new Promise(r => setTimeout(r, 150));
    const rows = await page.evaluate(MEASURE, ids);

    console.log(`\n### ${name}`);
    for (const r of rows) {
        const problems = [];
        if (r.err) problems.push(r.err);
        if (r.display !== 'inline-flex' && r.display !== 'flex') problems.push(`display=${r.display}`);
        if (r.svgCount !== 1) problems.push(`svg=${r.svgCount}`);
        if (r.iconCss && r.iconCss !== '15px') problems.push(`icon=${r.iconCss}`);
        if (r.dy !== null && Math.abs(r.dy) > 1) problems.push(`dy=${r.dy}px`);
        if (r.overflow) problems.push('内容溢出');
        if (problems.length) bad++;
        console.log(
            `  ${problems.length ? '✗' : '✓'} ${r.id.padEnd(22)} ${String(r.btn).padEnd(10)} ` +
            `${String(r.iconCss).padEnd(6)} 实测=${String(r.icon).padEnd(8)} scale=${String(r.scale).padEnd(6)} ` +
            `dy=${String(r.dy).padEnd(6)} ${r.label ?? ''}` +
            (problems.length ? `   ← ${problems.join(', ')}` : '')
        );
    }
    await page.evaluate((sel) => {
        const first = document.getElementById(sel[0]);
        const box = first?.closest('.game-overlay, .wd-modal, .sf-overlay, .game-stage') || first?.parentElement;
        if (box) box.scrollIntoView();
    }, ids).catch(() => { });
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true }).catch(() => { });
    await page.close();
}
await browser.close();
console.log(`\n${bad === 0 ? '全部按钮通过' : `${bad} 个按钮有问题`}（截图在 ${OUT}）`);
process.exit(bad === 0 ? 0 : 1);
