// 桌面舞台契约校验（2026-09-19）：六页 × 五档视口 × 中英双语
// 断言：
//   a. 整页不滚动：scrollingElement.scrollHeight <= innerHeight + 2
//   b. 画幅不失真：|rect.width/rect.height - ratio| < 0.01
//   c. 不糊：canvas.width >= canvas.clientWidth（border-box 下 rect 含 border）
//   d. 舞台随视口长大：1920x1080 档画布宽 > 1280x900 档
//   e. 侧栏在屏内：sidebar bottom <= innerHeight + 2
//   f. --frame-chrome 收敛：间隔 500ms 两次读数相等（js/game-frame.js 反馈环护栏）
//   g. 无 pageerror
// 用法：node scripts/verify-desktop-frame.mjs [baseUrl]
import puppeteer from 'puppeteer-core';
import { CHROME_PATH } from './lib/browser.mjs';

const CHROME = process.env.CHROME_BIN ||
    CHROME_PATH;
const BASE = process.argv[2] || 'http://127.0.0.1:8899';

const PAGES = {
    'gravity-slingshot': 480 / 640,
    'tower-defense': 480 / 640,
    'needle-awn': 480 / 640,
    'sword-flight': 480 / 640,
    'hoop-shot': 420 / 640,
    'planet-merge': 420 / 640,
};
const VIEWPORTS = [[1280, 800], [1280, 900], [1440, 900], [1920, 1080], [2560, 1440]];
const LANGS = ['en', 'zh'];

const MEASURE = () => {
    const g = s => document.querySelector(s);
    const canvas = g('.game-stage canvas') || g('canvas');
    const side = g('.game-sidebar');
    const shell = g('.game-shell');
    const r = canvas ? canvas.getBoundingClientRect() : null;
    return {
        pageH: document.scrollingElement.scrollHeight,
        innerH: innerHeight,
        canvas: canvas ? {
            rectW: Math.round(r.width), rectH: Math.round(r.height),
            attrW: canvas.width, attrH: canvas.height,
            clientW: canvas.clientWidth,
        } : null,
        sideBottom: side ? Math.round(side.getBoundingClientRect().bottom) : -1,
        chrome: shell ? shell.style.getPropertyValue('--frame-chrome') : '',
        // bindFrame 量 chrome 靠 shell.querySelector(':scope > .game-topbar'/'.game-footer')。
        // 这两个节点一旦不是 shell 的**直接子节点**，querySelector 返回 null，
        // chrome 会静默少算一整个页脚（实测 143px -> 70px），舞台随之算大、整页溢出。
        // 这是个无声降级，必须单独断言（一次误删闭合标签就把 sf 的页脚挤出了 shell）。
        topbarIsChild: !!(shell && shell.querySelector(':scope > .game-topbar')),
        footerIsChild: !!(shell && shell.querySelector(':scope > .game-footer')),
    };
};

const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-first-run', '--disable-gpu', '--hide-scrollbars', '--mute-audio'],
});

const failures = [];
const widthTable = {}; // page -> "WxH/lang" -> canvas rectW

for (const lang of LANGS) {
    for (const [page, ratio] of Object.entries(PAGES)) {
        const canvasW = {};
        for (const [W, H] of VIEWPORTS) {
            const pg = await browser.newPage();
            await pg.setViewport({ width: W, height: H });
            const errors = [];
            pg.on('pageerror', e => errors.push(e.message));
            await pg.goto(`${BASE}/${page}.html`, { waitUntil: 'networkidle2', timeout: 20000 }).catch(() => { });
            await pg.evaluate(l => { try { localStorage.setItem('site_lang', l); } catch (e) { } }, lang);
            await pg.reload({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => { });
            await new Promise(r => setTimeout(r, 600));
            const m1 = await pg.evaluate(MEASURE).catch(e => ({ err: e.message }));
            await new Promise(r => setTimeout(r, 500));
            const m2 = await pg.evaluate(MEASURE).catch(e => ({ err: e.message }));
            const tag = `${page} ${W}x${H} ${lang}`;

            if (m1.err) {
                failures.push(`${tag}: measure 失败 ${m1.err}`);
                await pg.close();
                continue;
            }
            const rectW = m1.canvas ? m1.canvas.rectW : 0;
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
                    failures.push(`${tag}: 画布糊 attrW ${m1.canvas.attrW} < clientW ${m1.canvas.clientW}`);
                }
            }
            // e. 侧栏在屏内（td 1998px / sf 1097px 的回归）
            if (m1.sideBottom >= 0 && m1.sideBottom > m1.innerH + 2) failures.push(`${tag}: 侧栏溢出 bottom ${m1.sideBottom} > innerH ${m1.innerH}`);
            // f. --frame-chrome 收敛（反馈环护栏：差值 ≤1px 视为稳定）
            const c1 = parseFloat(m1.chrome), c2 = parseFloat(m2.chrome);
            if (!m1.chrome || !Number.isFinite(c1) || Math.abs(c1 - c2) > 1) {
                failures.push(`${tag}: --frame-chrome 未收敛 "${m1.chrome}" -> "${m2.chrome}"`);
            }
            // g. 无 pageerror
            if (errors.length) failures.push(`${tag}: pageerror ${errors.join(' | ')}`);

            await pg.close();
        }
        // d. 舞台确实随视口长大
        const w1280 = canvasW['1280x900'], w1920 = canvasW['1920x1080'];
        if (!(w1920 > w1280)) failures.push(`${page}: 1920 档画布宽 ${w1920} 未大于 1280x900 档 ${w1280}`);
    }
}
await browser.close();

// 画布宽一览（1920 档，中文）
console.log('\n===== 画布宽 @1920x1080 zh =====');
for (const page of Object.keys(PAGES)) {
    console.log(`${page.padEnd(20)} ${widthTable[`${page}|1280x900|zh`]}px -> ${widthTable[`${page}|1920x1080|zh`]}px  (2560: ${widthTable[`${page}|2560x1440|zh`]}px)`);
}

if (failures.length) {
    console.error(`\nFAIL ${failures.length} 项:`);
    failures.forEach(f => console.error('  ✗ ' + f));
    process.exit(1);
} else {
    console.log(`\nPASS 全部断言通过（${Object.keys(PAGES).length} 页 × ${VIEWPORTS.length} 视口 × ${LANGS.length} 语言）`);
}
