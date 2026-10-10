// 结果/动作按钮图标改造的专项验证：
//   node tests/verify-button-icons.mjs [baseUrl] [outDir]
//
// 改动的按钮都在结果面板里，默认被开始浮层挡住，普通整页截图看不到。
// 这里按 id 找到按钮 → 把它的浮层祖先解开 hidden → 量「图标尺寸/与文案的垂直居中对齐」
// → 收一张该按钮的元素级截图，供人工目视。
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { keepPage, exitIfNoPages } from './lib/page-filter.mjs';
import { registry } from './lib/registry.mjs';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = CHROME_PATH;
const BASE = process.argv[2] || 'http://127.0.0.1:8899';
const OUT = process.argv[3] || join(tmpdir(), 'btn-icons');

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
    // sd-btn-levels / sd-btn-daily：开始菜单的模式钮（缺 game-btn 时图标比文字高 6.5px，PR #33）
    'silk-dew': ['sd-btn-levels', 'sd-btn-daily', 'sd-btn-next', 'sd-btn-replay', 'sd-btn-menu1', 'sd-btn-copy', 'sd-btn-menu2', 'sd-btn-again'],
    'bond-forge': ['bf-btn-next', 'bf-btn-replay', 'bf-btn-menu1', 'bf-btn-copy', 'bf-btn-menu2', 'bf-btn-again'],
    'echo-cave': ['ec-btn-next', 'ec-btn-replay', 'ec-btn-menu1', 'ec-btn-copy', 'ec-btn-menu2', 'ec-btn-again'],
    'maxwell-demon': ['md-btn-next', 'md-btn-replay', 'md-btn-menu1', 'md-btn-copy', 'md-btn-menu2', 'md-btn-again'],
    'crystal-bloom': ['cb-btn-next', 'cb-btn-replay', 'cb-btn-menu1', 'cb-btn-copy', 'cb-btn-menu2', 'cb-btn-again'],
    'flame-verse': ['fv-btn-next', 'fv-btn-replay', 'fv-btn-menu1', 'fv-btn-copy', 'fv-btn-menu2', 'fv-btn-again'],
    'ripple-duet': ['rd-btn-next', 'rd-btn-replay', 'rd-btn-menu1', 'rd-btn-copy', 'rd-btn-menu2', 'rd-btn-again'],
    'carrot-pull': ['cp-start-btn', 'cp-again-btn', 'cp-menu-btn'],
    'firefly-signal': ['fs-btn-next', 'fs-btn-retry', 'fs-btn-menu'],
    'shadow-loom': ['sl-btn-begin', 'sl-btn-next', 'sl-btn-replay', 'sl-btn-menu'],
    'tetris': ['restartBtn'],
    'minesweeper': ['ms-btn-again', 'ms-btn-copy', 'ms-btn-close'],
};

// TARGETS 是每页的按钮 id，派生不出来，但漏页必须红：新游戏挂了 topbar cap 却
// 没有条目，此前只是「不测它」，悄无声息（lumen 就是这么漏掉的）。
// 唯一豁免：gomoku 的结果面板没有「图标 + 文字」按钮（docs/css-dedup-roadmap-2026-10.md）。
registry.assertCovered({
    cap: 'topbar',
    covered: Object.keys(TARGETS),
    exempt: ['gomoku'],
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
    const svgStyle = svg ? getComputedStyle(svg) : null;
    const iconCss = svgStyle?.width ?? null;
    const iconHeightCss = svgStyle?.height ?? null;
    return {
        id,
        btn: `${b.w}x${b.h}`,
        display: cs.display,
        alignItems: cs.alignItems,
        svgCount: btn.querySelectorAll('svg').length,
        iconCss,
        iconHeightCss,
        icon: s ? `${s.w}x${s.h}` : null,
        scale,
        label: label ? label.textContent.trim() : null,
        // 相同祖先上的 scale 对两者影响一致：归一化到未变换的 CSS 像素。
        dy: (s && l && scale > 0) ? Math.round(((s.cy - l.cy) / scale) * 10) / 10 : null,
        overflow: btn.scrollWidth > btn.clientWidth + 1,
    };
});


function buttonProblems(r) {
    if (r.err) return [r.err];
    const problems = [];
    if (r.display !== 'inline-flex' && r.display !== 'flex') problems.push('display=' + r.display);
    if (r.alignItems !== 'center') problems.push('align-items=' + r.alignItems);
    if (r.svgCount !== 1) problems.push('svg=' + r.svgCount);
    if (r.iconCss !== '15px' || r.iconHeightCss !== '15px') {
        problems.push('icon=' + r.iconCss + 'x' + r.iconHeightCss);
    }
    if (!r.label) problems.push('missing/empty span label');
    if (r.dy === null || Math.abs(r.dy) > 1) problems.push('dy=' + r.dy + 'px');
    if (r.overflow) problems.push('content overflow');
    return problems;
}

const RUN = Object.entries(TARGETS).filter(([n]) => keepPage(n));
exitIfNoPages(RUN, 'verify-button-icons');

await mkdir(OUT, { recursive: true });
const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: LAUNCH_ARGS,
});

let bad = 0;
for (const [name, ids] of RUN) {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
    await page.goto(`${BASE}/${name}.html`, { waitUntil: 'networkidle2', timeout: 20000 }).catch(() => { });
    await new Promise(r => setTimeout(r, 800));
    await page.evaluate(REVEAL, ids);
    await new Promise(r => setTimeout(r, 150));
    const rows = await page.evaluate(MEASURE, ids);

    console.log(`\n### ${name}`);
    for (const r of rows) {
        const problems = buttonProblems(r);
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

// W6: 真实结算态 + 多语言/主题/视口。普通 TARGETS 截图不代表结果按钮可用。
// 单独的 browser context 保证 site_lang/site_theme 不受其他游戏并行测试污染。
const W6_MATRIX = [
    { lang: 'en', theme: 'dark', w: 390, h: 844 },
    { lang: 'zh', theme: 'light', w: 390, h: 844 },
    { lang: 'en', theme: 'light', w: 1280, h: 900 },
    { lang: 'zh', theme: 'dark', w: 320, h: 568 },
];
const W6_LABELS = {
    tetris: { en: ['Restart'], zh: ['重新开始'] },
    minesweeper: {
        en: ['Play Again', 'Copy', 'Close'],
        zh: ['再来一局', '复制', '关闭'],
    },
};
const W6_NEGATIVE = {
    'remove-icon': 'svg=',
    'remove-label': 'span label',
    'wrong-size': 'icon=',
    'shift-label': 'dy=',
};
async function verifyMutationGuard(page, name) {
    const id = TARGETS[name][0];
    const html = await page.$eval('#' + id, node => node.innerHTML);
    for (const [mutation, expected] of Object.entries(W6_NEGATIVE)) {
        await page.evaluate(({ id, mutation }) => {
            const btn = document.getElementById(id);
            if (mutation === 'remove-icon') btn.querySelector('svg')?.remove();
            if (mutation === 'remove-label') btn.querySelector('span')?.remove();
            if (mutation === 'wrong-size') btn.querySelector('svg')?.style.setProperty('width', '20px', 'important');
            if (mutation === 'shift-label') btn.querySelector('span')?.style.setProperty('transform', 'translateY(5px)');
        }, { id, mutation });
        const [measured] = await page.evaluate(MEASURE, [id]);
        if (!buttonProblems(measured).some(issue => issue.includes(expected))) {
            bad++;
            console.error('  x ' + name + ': negative probe ' + mutation + ' escaped detection');
        }
        await page.evaluate(({ id, html }) => { document.getElementById(id).innerHTML = html; }, { id, html });
    }
}
for (const name of ['tetris', 'minesweeper'].filter(keepPage)) {
    for (const testCase of W6_MATRIX) {
        const tag = name + ' ' + testCase.w + 'x' + testCase.h + '/' + testCase.lang + '/' + testCase.theme;
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        try {
            await page.setViewport({ width: testCase.w, height: testCase.h });
            await page.evaluateOnNewDocument(({ lang, theme }) => {
                localStorage.setItem('site_lang', lang);
                localStorage.setItem('site_theme', theme);
            }, testCase);
            await page.goto(BASE + '/' + name + '.html', { waitUntil: 'load', timeout: 20000 });
            await page.waitForFunction(id => id === 'tetris' ? !!window.tetrisRuntime?.game : !!window.msGame,
                { timeout: 6000 }, name);
            const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
            if (theme !== testCase.theme) {
                bad++;
                console.error('  x ' + tag + ': theme=' + theme + ', expected ' + testCase.theme);
            }
            await page.evaluate(id => {
                if (id === 'tetris') {
                    window.game.gameOver = true;
                    document.getElementById('gameOverOverlay').style.display = 'flex';
                } else {
                    // 失败结算不触发远程排行榜，用真实运行时打开结果面板。
                    window.msGame.showResult(false, 12, false);
                }
            }, name);
            await page.evaluate(() => document.fonts.ready);
            // Tetris Game Over (400ms) 与 Minesweeper Result (280ms) 入场动效稳定后测量。
            await new Promise(resolve => setTimeout(resolve, 450));
            const rows = await page.evaluate(MEASURE, TARGETS[name]);
            for (let i = 0; i < rows.length; i++) {
                const issues = buttonProblems(rows[i]);
                const expected = W6_LABELS[name][testCase.lang][i];
                if (rows[i].label !== expected) issues.push('label=' + rows[i].label + ' expected ' + expected);
                if (issues.length) {
                    bad++;
                    console.error('  x ' + tag + ' #' + rows[i].id + ': ' + issues.join(', '));
                }
            }
            if (testCase.w === 390 && testCase.lang === 'en') {
                await verifyMutationGuard(page, name);
            }
            // 真实按钮点击合同：Restart / Again / Close，以及复制反馈的动态 SVG。
            if (name === 'tetris') {
                const ok = await page.evaluate(() => {
                    document.getElementById('restartBtn').click();
                    const g = window.tetrisRuntime.game;
                    return !g.gameOver && !!g.animationId
                        && document.getElementById('gameOverOverlay').style.display === 'none';
                });
                if (!ok) { bad++; console.error('  x ' + tag + ': Restart failed to resume gameplay'); }
            } else {
                await page.evaluate(() => {
                    // 避免无权限的 headless clipboard 使结果依赖机器环境。
                    Object.defineProperty(navigator, 'clipboard', {
                        configurable: true, value: { writeText: async () => {} },
                    });
                    document.getElementById('ms-btn-copy').click();
                });
                await page.waitForFunction(() => document.querySelector('#ms-btn-copy > span')?.textContent === window.msGame.TEXT.copied,
                    { timeout: 1400 });
                const [copyState] = await page.evaluate(MEASURE, ['ms-btn-copy']);
                const copyIssues = buttonProblems(copyState);
                if (copyIssues.length || copyState.label !== await page.evaluate(() => window.msGame.TEXT.copied)) {
                    bad++;
                    console.error('  x ' + tag + ': Copied feedback: ' + copyIssues.join(', '));
                }
                const actions = await page.evaluate(() => {
                    document.getElementById('ms-btn-close').click();
                    const closed = document.getElementById('ms-result').classList.contains('hidden');
                    window.msGame.showResult(false, 12, false);
                    document.getElementById('ms-btn-again').click();
                    const replayed = document.getElementById('ms-result').classList.contains('hidden');
                    return { closed, replayed };
                });
                if (!actions.closed || !actions.replayed) {
                    bad++;
                    console.error('  x ' + tag + ': Close or Again did not dismiss results');
                }
            }
            if (errors.length) {
                bad++;
                console.error('  x ' + tag + ': pageerror ' + errors.join(' | '));
            }
            console.log('  ' + tag + ': checked real result state');
        } catch (e) {
            bad++;
            console.error('  x ' + tag + ': ' + e.message);
        } finally {
            await context.close();
        }
    }
}

await browser.close();
console.log(`\n${bad === 0 ? '全部按钮通过' : `${bad} 个按钮有问题`}（截图在 ${OUT}）`);
process.exit(bad === 0 ? 0 : 1);
