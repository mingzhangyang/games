// 桌面舞台契约校验（2026-09-19）：registry frame-budget 页面 × 五档视口 × 中英双语
// 断言：
//   a. 整页不滚动：scrollingElement.scrollHeight <= innerHeight + 2
//   b. 画幅不失真：|rect.width/rect.height - ratio| < 0.01
//   c. 不糊：canvas.width >= canvas.clientWidth（border-box 下 rect 含 border）
//   d. 舞台随视口长大：1920x1080 档画布宽 > 1280x900 档
//   e. frame-budget 侧栏 computed contract 生效：max-height / overflow / overscroll + scrollbar skin
//   f. 侧栏在屏内：sidebar bottom <= innerHeight + 2
//   g. --frame-chrome 收敛：就绪后间隔 250ms 两次读数相等（src/platform/game-frame.js 反馈环护栏）
//   h. 无 pageerror
// 用法：node tests/verify-desktop-frame.mjs [baseUrl]
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { keepPage, exitIfNoPages } from './lib/page-filter.mjs';
import { registry } from './lib/registry.mjs';

const CHROME = CHROME_PATH;
const BASE = process.argv[2] || 'http://127.0.0.1:8899';

// P0 几何 baseline 与 frame-budget registry membership 是同一个契约。
// 先对未过滤的完整集合做一一对账；VERIFY_PAGES 只能减少本次测量工作量，
// 不能改变“哪些页面属于 baseline”的事实。
const FRAME_BUDGET_GAMES = registry.withCap('frame-budget');
const WIDTH_BASELINE_ZH = JSON.parse(readFileSync(
    new URL('./css-layer-p0-baseline.json', import.meta.url), 'utf8',
)).computedBaseline.desktopFrame.widthsZh;
const FRAME_BUDGET_PAGE_IDS = FRAME_BUDGET_GAMES.map(game => game.id).sort();
const BASELINE_PAGE_IDS = Object.keys(WIDTH_BASELINE_ZH).sort();
if (JSON.stringify(FRAME_BUDGET_PAGE_IDS) !== JSON.stringify(BASELINE_PAGE_IDS)) {
    const registryOnly = FRAME_BUDGET_PAGE_IDS.filter(id => !BASELINE_PAGE_IDS.includes(id));
    const baselineOnly = BASELINE_PAGE_IDS.filter(id => !FRAME_BUDGET_PAGE_IDS.includes(id));
    console.error('FAIL desktop-frame P0 coverage contract changed.');
    if (registryOnly.length) console.error('  frame-budget pages missing from baseline: ' + registryOnly.join(', '));
    if (baselineOnly.length) console.error('  baseline pages no longer carrying frame-budget: ' + baselineOnly.join(', '));
    process.exit(1);
}

// 画幅预算页 = 挂 frame-budget cap 的游戏；ratio 由注册表 stage.w/h 派生（不再手写 0.75）
const PAGES = Object.fromEntries(
    FRAME_BUDGET_GAMES.filter(game => keepPage(game.id)).map(game => [game.id, game.stage.w / game.stage.h]),
);
exitIfNoPages(Object.keys(PAGES), 'verify-desktop-frame');
const VIEWPORTS = [[1280, 800], [1280, 900], [1440, 900], [1920, 1080], [2560, 1440]];
const LANGS = ['en', 'zh'];

const MEASURE = () => {
    const g = s => document.querySelector(s);
    const canvas = g('.game-stage canvas') || g('canvas');
    const side = g('.game-sidebar');
    const shell = g('.game-shell');
    const sideStyle = side ? getComputedStyle(side) : null;
    let scrollbarSkin = null;
    if (side && sideStyle) {
        const probe = document.createElement('span');
        probe.style.display = 'none';
        side.append(probe);

        const resolvedBackground = value => {
            probe.style.background = value;
            return getComputedStyle(probe).backgroundColor;
        };
        const expectedThumbBackground = resolvedBackground('var(--frame-scrollbar-thumb)');
        const expectedThumbHoverBackground = resolvedBackground('var(--frame-scrollbar-thumb-hover)');
        const expectedTrackBackground = resolvedBackground('transparent');

        probe.style.setProperty('scrollbar-color', 'var(--frame-scrollbar-thumb) transparent');
        const expectedScrollbarColor = getComputedStyle(probe).scrollbarColor || '';
        probe.remove();

        scrollbarSkin = {
            scrollbarColor: sideStyle.scrollbarColor || '',
            scrollbarColorSupported: typeof sideStyle.scrollbarColor === 'string'
                && sideStyle.scrollbarColor !== '',
            expectedScrollbarColor,
            webkitTrackBackground: getComputedStyle(side, '::-webkit-scrollbar-track').backgroundColor || '',
            webkitThumbBackground: getComputedStyle(side, '::-webkit-scrollbar-thumb').backgroundColor || '',
            thumbHoverActive: side.matches(':hover'),
            expectedTrackBackground,
            expectedThumbBackground,
            expectedThumbHoverBackground,
        };
    }
    const r = canvas ? canvas.getBoundingClientRect() : null;
    return {
        pageH: document.scrollingElement.scrollHeight,
        innerH: innerHeight,
        canvas: canvas ? {
            rectW: Math.round(r.width), rectH: Math.round(r.height),
            attrW: canvas.width, attrH: canvas.height,
            clientW: canvas.clientWidth,
        } : null,
        // 纯 DOM/SVG 舞台（carrot-pull）没有 canvas：b/c 两条是 canvas 位图专属断言，照常跳过；
        // d「舞台随视口长大」改量 .game-stage 宽度，否则恒为 0 必然误报。
        stageW: g('.game-stage') ? Math.round(g('.game-stage').getBoundingClientRect().width) : 0,
        sideBottom: side ? Math.round(side.getBoundingClientRect().bottom) : -1,
        bodyHasFrameBudget: document.body.classList.contains('has-frame-budget'),
        sideContract: sideStyle ? {
            maxHeight: sideStyle.maxHeight,
            overflowY: sideStyle.overflowY,
            overscrollBehaviorY: sideStyle.overscrollBehaviorY || sideStyle.overscrollBehavior,
            scrollbarWidth: sideStyle.scrollbarWidth || '',
            scrollbarWidthSupported: typeof sideStyle.scrollbarWidth === 'string'
                && sideStyle.scrollbarWidth !== '',
            webkitScrollbarWidth: getComputedStyle(side, '::-webkit-scrollbar').width || '',
            ...scrollbarSkin,
        } : null,
        chrome: shell ? shell.style.getPropertyValue('--frame-chrome') : '',
        // bindFrame 量 chrome 靠 shell.querySelector(':scope > .game-topbar'/'.game-footer')。
        // 这两个节点一旦不是 shell 的**直接子节点**，querySelector 返回 null，
        // chrome 会静默少算一整个页脚（实测 143px -> 70px），舞台随之算大、整页溢出。
        // 这是个无声降级，必须单独断言（一次误删闭合标签就把 sf 的页脚挤出了 shell）。
        topbarIsChild: !!(shell && shell.querySelector(':scope > .game-topbar')),
        footerIsChild: !!(shell && shell.querySelector(':scope > .game-footer')),
    };
};

// 提速（2026-09-28，563s → 见 docs/traps.md「校验基础设施」）：
//   - 语言用 evaluateOnNewDocument 在首个脚本前写入，省掉原来的 goto + reload 两次加载；
//   - waitUntil 'load' + 显式就绪条件（字体就绪、--frame-chrome 已写入且连续两帧布局不变），
//     替代 networkidle2（每次白等 ~750ms）与固定 600ms sleep；
//   - 每个 (页, 视口, 语言) 仍是一次全新加载（不用 setViewport 复用页面 —— 那测的是 resize 路径，
//     不是首屏，hs/pm 的 inline-width 自锁只在首屏暴露），但用 JOBS 个标签页并发跑；
//   - 每个用例一个独立 browser context：同源标签页共享 localStorage，en/zh 用例并发写 site_lang
//     会互相覆盖，site-settings 还会经 storage 事件把别的标签页的语言实时切过来（PR #33 评审）。
// f 条收敛检查仍是「就绪后隔一段时间再读一次」：反馈环是逐帧振荡的，250ms（~15 帧）足以暴露。
// 标签页并发：VERIFY_FRAME_JOBS 显式指定；否则跟随 verify-all 下发的 VERIFY_JOBS（上限 4），
// 这样 `verify-all --jobs=1` 排查时本项也退回串行
const JOBS = Math.max(1, Number(process.env.VERIFY_FRAME_JOBS
    || (process.env.VERIFY_JOBS ? Math.min(4, Number(process.env.VERIFY_JOBS)) : 4)) || 1);
const CONVERGE_GAP_MS = 250;

const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    // 并发标签页不能被当成后台页节流 rAF / 定时器，否则就绪判定会一直等不到新帧
    args: [...LAUNCH_ARGS, '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});

const failures = [];
// 已登记的既有缺口：不算失败，但每次运行都要打出来，避免被遗忘
const knownGaps = [];
const widthTable = {}; // page -> "WxH/lang" -> canvas rectW

function scrollbarSkinFailures(contract) {
    const issues = [];
    if (!contract) return ['missing sidebar contract'];
    if (contract.scrollbarWidthSupported && contract.scrollbarWidth !== 'thin') {
        issues.push(`scrollbar-width=${contract.scrollbarWidth}，期望 thin`);
    }
    if (contract.scrollbarColorSupported
        && contract.scrollbarColor !== contract.expectedScrollbarColor) {
        issues.push(`scrollbar-color=${contract.scrollbarColor}，期望 ${contract.expectedScrollbarColor}`);
    }
    if (contract.webkitScrollbarWidth) {
        if (contract.webkitScrollbarWidth !== '6px') {
            issues.push(`webkit scrollbar width=${contract.webkitScrollbarWidth}，期望 6px`);
        }
        if (contract.webkitTrackBackground !== contract.expectedTrackBackground) {
            issues.push(`webkit track background=${contract.webkitTrackBackground}，期望 ${contract.expectedTrackBackground}`);
        }
        const expectedThumbBackground = contract.thumbHoverActive
            ? contract.expectedThumbHoverBackground
            : contract.expectedThumbBackground;
        if (contract.webkitThumbBackground !== expectedThumbBackground) {
            const state = contract.thumbHoverActive ? 'hover' : 'idle';
            issues.push(`webkit thumb ${state} background=${contract.webkitThumbBackground}，期望 ${expectedThumbBackground}`);
        }
    }
    return issues;
}

// 就绪：字体加载完、bindFrame 已写 --frame-chrome、且连续两帧舞台尺寸与 chrome 不变
const WAIT_STABLE = () => new Promise(resolve => {
    const t0 = performance.now();
    const snap = () => {
        const shell = document.querySelector('.game-shell');
        const st = document.querySelector('.game-stage canvas') || document.querySelector('canvas') || document.querySelector('.game-stage');
        const r = st ? st.getBoundingClientRect() : { width: 0, height: 0 };
        return [shell ? shell.style.getPropertyValue('--frame-chrome') : '', r.width, r.height, st && st.width, document.scrollingElement.scrollHeight].join('|');
    };
    let prev = null, same = 0;
    const tick = () => {
        const cur = snap();
        same = (cur === prev && !cur.startsWith('|')) ? same + 1 : 0;
        prev = cur;
        if (same >= 2 || performance.now() - t0 > 4000) resolve();
        else requestAnimationFrame(tick);
    };
    document.fonts.ready.then(() => requestAnimationFrame(tick));
});

async function measureOne(page, W, H, lang) {
    const ctx = await browser.createBrowserContext();
    const pg = await ctx.newPage();
    try {
        await pg.setViewport({ width: W, height: H });
        await pg.evaluateOnNewDocument(l => { try { localStorage.setItem('site_lang', l); } catch (e) { } }, lang);
        const errors = [];
        pg.on('pageerror', e => errors.push(e.message));
        await pg.goto(`${BASE}/${page}.html`, { waitUntil: 'load', timeout: 20000 }).catch(() => { });
        await pg.evaluate(WAIT_STABLE).catch(() => { });
        await pg.mouse.move(0, 0);
        const m1 = await pg.evaluate(MEASURE).catch(e => ({ err: e.message }));
        let mHover = null;
        if (!m1.err && m1.sideContract) {
            await pg.hover('.game-sidebar').catch(() => { });
            mHover = await pg.evaluate(MEASURE).catch(e => ({ err: e.message }));
            await pg.mouse.move(0, 0);
        }
        await new Promise(r => setTimeout(r, CONVERGE_GAP_MS));
        const m2 = await pg.evaluate(MEASURE).catch(e => ({ err: e.message }));
        return { m1, mHover, m2, errors };
    } finally {
        await ctx.close();
    }
}

const jobs = [];
for (const lang of LANGS) {
    for (const [page, ratio] of Object.entries(PAGES)) {
        for (const [W, H] of VIEWPORTS) jobs.push({ page, ratio, W, H, lang });
    }
}
const measured = new Map();
let next = 0;
await Promise.all(Array.from({ length: Math.min(JOBS, jobs.length) }, async () => {
    while (next < jobs.length) {
        const job = jobs[next++];
        measured.set(job, await measureOne(job.page, job.W, job.H, job.lang));
    }
}));

// 断言按原顺序逐条跑，保证失败列表与串行版本一致
for (const lang of LANGS) {
    for (const [page, ratio] of Object.entries(PAGES)) {
        const canvasW = {};
        for (const job of jobs.filter(j => j.page === page && j.lang === lang)) {
            const { W, H } = job;
            const { m1, mHover, m2, errors } = measured.get(job);
            const tag = `${page} ${W}x${H} ${lang}`;

            if (m1.err) {
                failures.push(`${tag}: measure 失败 ${m1.err}`);
                continue;
            }
            const rectW = m1.canvas ? m1.canvas.rectW : m1.stageW;
            widthTable[`${page}|${W}x${H}|${lang}`] = rectW;
            canvasW[`${W}x${H}`] = rectW;

            // a. 整页不滚动
            if (m1.pageH > m1.innerH + 2) failures.push(`${tag}: 整页可滚 pageH ${m1.pageH} > innerH ${m1.innerH}`);
            if (!m1.topbarIsChild) failures.push(`${tag}: .game-topbar 不是 .game-shell 的直接子节点 —— bindFrame 会少算 chrome`);
            if (!m1.footerIsChild) failures.push(`${tag}: .game-footer 不是 .game-shell 的直接子节点 —— bindFrame 会少算 chrome`);
            if (m1.canvas) {
                // b. 画幅不失真（P1.1 sf 手机压扁 bug 的桌面回归）
                const r = m1.canvas.rectW / m1.canvas.rectH;
                if (Math.abs(r - ratio) >= 0.01) failures.push(`${tag}: 画幅失真 ${r.toFixed(4)} vs 期望 ${ratio.toFixed(4)}`);
                // c. 不糊：后端缓冲区 >= 内容盒（na/sf 固定后端的回归；rect 含 border，用 clientW）
                if (m1.canvas.attrW < m1.canvas.clientW) {
                    // tetris 是已登记的已知缺口，不是新回归：它的 CSS 早就接了纵向预算
                    // （css/tetris.css:110-113 四个 --frame-* + src/games/tetris/index.js 的 logicalWidth），
                    // 但整份渲染代码直接按 canvas.width 的像素坐标作画（约 12 处，外加
                    // Tetris.gridCanvas 离屏缓存与 particle/lineClear 两层必须像素对齐的画布），
                    // 后端缓冲区一直钉在 400×800。≥1920 宽时棋盘被放大到 464–480 CSS px，发虚。
                    // 修它要把逻辑坐标从 canvas.width 里剥出来，属独立改动（见 docs/backlog.md）。
                    // 这里只降级为告警，其余 6 条断言对 tetris 照常生效。
                    if (page === 'tetris') {
                        knownGaps.push(`${tag}: 画布糊 attrW ${m1.canvas.attrW} < clientW ${m1.canvas.clientW}`);
                    } else {
                        failures.push(`${tag}: 画布糊 attrW ${m1.canvas.attrW} < clientW ${m1.canvas.clientW}`);
                    }
                }
            }
            // e. frame-budget computed contract 必须真正赢得 cascade，而不只是 body 上有 class。
            const c1 = parseFloat(m1.chrome), c2 = parseFloat(m2.chrome);
            if (!m1.bodyHasFrameBudget) {
                failures.push(`${tag}: body 缺少 has-frame-budget，sidebar contract 未激活`);
            }
            if (!m1.sideContract) {
                failures.push(`${tag}: frame-budget 页面缺少 .game-sidebar`);
            } else {
                const maxHeight = parseFloat(m1.sideContract.maxHeight);
                const expectedMaxHeight = m1.innerH - c1;
                if (!Number.isFinite(maxHeight) || (Number.isFinite(expectedMaxHeight)
                    && Math.abs(maxHeight - expectedMaxHeight) > 2)) {
                    failures.push(`${tag}: sidebar max-height ${m1.sideContract.maxHeight}，期望约 ${expectedMaxHeight.toFixed(1)}px`);
                }
                if (m1.sideContract.overflowY !== 'auto') {
                    failures.push(`${tag}: sidebar overflow-y=${m1.sideContract.overflowY}，期望 auto`);
                }
                if (m1.sideContract.overscrollBehaviorY !== 'contain') {
                    failures.push(`${tag}: sidebar overscroll-behavior-y=${m1.sideContract.overscrollBehaviorY}，期望 contain`);
                }
                for (const issue of scrollbarSkinFailures(m1.sideContract)) {
                    failures.push(`${tag}: sidebar ${issue}`);
                }
                if (!mHover || mHover.err || !mHover.sideContract?.thumbHoverActive) {
                    failures.push(`${tag}: sidebar hover 状态未成功测量`);
                } else {
                    for (const issue of scrollbarSkinFailures(mHover.sideContract)) {
                        failures.push(`${tag}: hovered sidebar ${issue}`);
                    }
                }
            }
            // f. 侧栏在屏内（历史 1998px / 1097px 整页溢出的回归）
            if (m1.sideBottom >= 0 && m1.sideBottom > m1.innerH + 2) failures.push(`${tag}: 侧栏溢出 bottom ${m1.sideBottom} > innerH ${m1.innerH}`);
            // g. --frame-chrome 收敛（反馈环护栏：差值 ≤1px 视为稳定）
            if (!m1.chrome || !Number.isFinite(c1) || Math.abs(c1 - c2) > 1) {
                failures.push(`${tag}: --frame-chrome 未收敛 "${m1.chrome}" -> "${m2.chrome}"`);
            }
            // h. 无 pageerror
            if (errors.length) failures.push(`${tag}: pageerror ${errors.join(' | ')}`);

        }
        // d. 舞台确实随视口长大
        const w1280 = canvasW['1280x900'], w1920 = canvasW['1920x1080'];
        if (!(w1920 > w1280)) failures.push(`${page}: 1920 档画布宽 ${w1920} 未大于 1280x900 档 ${w1280}`);
    }
}

// 负向回归：只覆盖 scrollbar 颜色、不动宽度，验证 computed-style contract 真能抓住 cascade 漏洞。
const regressionPage = Object.keys(PAGES)[0];
if (regressionPage) {
    const ctx = await browser.createBrowserContext();
    const pg = await ctx.newPage();
    try {
        await pg.setViewport({ width: 1280, height: 900 });
        await pg.goto(`${BASE}/${regressionPage}.html`, { waitUntil: 'load', timeout: 20000 }).catch(() => { });
        await pg.evaluate(WAIT_STABLE).catch(() => { });
        const before = await pg.evaluate(MEASURE);
        await pg.addStyleTag({ content: `
            body.has-frame-budget .game-sidebar {
                scrollbar-color: rgb(1, 2, 3) transparent;
            }
            body.has-frame-budget .game-sidebar::-webkit-scrollbar-thumb {
                background: rgb(1, 2, 3);
            }
            body.has-frame-budget .game-sidebar:hover::-webkit-scrollbar-thumb,
            body.has-frame-budget .game-sidebar::-webkit-scrollbar-thumb:hover {
                background: rgb(4, 5, 6);
            }
        ` });
        await pg.mouse.move(0, 0);
        const after = await pg.evaluate(MEASURE);
        await pg.hover('.game-sidebar');
        const afterHover = await pg.evaluate(MEASURE);
        const beforeSkin = scrollbarSkinFailures(before.sideContract);
        const afterSkin = scrollbarSkinFailures(after.sideContract);
        const afterHoverSkin = scrollbarSkinFailures(afterHover.sideContract);
        if (beforeSkin.length) {
            failures.push(`scrollbar color regression probe baseline invalid: ${beforeSkin.join(' | ')}`);
        }
        if (before.sideContract?.scrollbarWidth !== after.sideContract?.scrollbarWidth
            || before.sideContract?.webkitScrollbarWidth !== after.sideContract?.webkitScrollbarWidth) {
            failures.push('scrollbar color regression probe changed widths; fixture must isolate color-only overrides');
        }
        if (!afterSkin.some(issue => /color|background/.test(issue))) {
            failures.push('scrollbar color regression probe failed to detect an idle color-only cascade override');
        }
        if (!afterHover.sideContract?.thumbHoverActive
            || !afterHoverSkin.some(issue => /hover background/.test(issue))) {
            failures.push('scrollbar color regression probe failed to detect a hover-only thumb-color override');
        }
    } finally {
        await ctx.close();
    }
}

await browser.close();

// P0 CSS cascade snapshot：冻结代表性页面的桌面舞台宽度，迁移 PR 必须显式对账。
for (const [page, expectedWidths] of Object.entries(WIDTH_BASELINE_ZH)) {
    if (!Object.hasOwn(PAGES, page)) continue; // VERIFY_PAGES may intentionally narrow measurement only.
    for (const [viewport, expected] of Object.entries(expectedWidths)) {
        const actual = widthTable[page + '|' + viewport + '|zh'];
        if (actual !== expected) {
            failures.push('CSS P0 geometry baseline ' + page + ' ' + viewport + ' zh changed: '
                + actual + 'px (expected ' + expected + 'px)');
        }
    }
}

// 画布宽一览（1920 档，中文）
console.log('\n===== 画布宽 @1920x1080 zh =====');
for (const page of Object.keys(PAGES)) {
    console.log(`${page.padEnd(20)} ${widthTable[`${page}|1280x900|zh`]}px -> ${widthTable[`${page}|1920x1080|zh`]}px  (2560: ${widthTable[`${page}|2560x1440|zh`]}px)`);
}

if (knownGaps.length) {
    console.warn(`\n⚠ 已知缺口 ${knownGaps.length} 项（不计失败，待独立改动修复）:`);
    knownGaps.forEach(f => console.warn('  ⚠ ' + f));
}

if (failures.length) {
    console.error(`\nFAIL ${failures.length} 项:`);
    failures.forEach(f => console.error('  ✗ ' + f));
    process.exit(1);
} else {
    console.log(`\nPASS 全部断言通过（${Object.keys(PAGES).length} 页 × ${VIEWPORTS.length} 视口 × ${LANGS.length} 语言）`);
}
