// 五子棋可玩性回归检查
// 用法：node scripts/serve-static.mjs 8899 &  然后  node scripts/verify-gomoku.mjs http://127.0.0.1:8899
//
// 背景：2026-09-17 的 566dd8f 把木质棋盘底从 .board-container 的背景搬到绝对定位的 ::before，
// 伪元素因此画在 <canvas> 之上 —— 网格被盖住、点击被吃掉，棋盘完全点不动。
// 单纯量几何（layout-metrics）测不出来，必须验「像素 + 命中目标 + 真实落子」。
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { mkdirSync } from 'node:fs';

const EXE = CHROME_PATH;
const BASE = process.argv[2] || 'http://127.0.0.1:8899';
const OUT = process.argv[3] || 'C:/tmp';
mkdirSync(OUT, { recursive: true });

const fails = [];
const check = (ok, label, detail) => {
    if (!ok) fails.push(label + (detail ? ' — ' + detail : ''));
    console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? '  (' + detail + ')' : ''}`);
};

const browser = await puppeteer.launch({ executablePath: EXE, headless: 'new', args: LAUNCH_ARGS });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push((e.stack || e.message).split('\n').slice(0, 4).join('\n    ')));

for (const vp of [
    { name: '移动端 390×844', width: 390, height: 844, deviceScaleFactor: 2 },
    { name: '桌面端 1280×900', width: 1280, height: 900, deviceScaleFactor: 1 },
]) {
    console.log('\n=== ' + vp.name + ' ===');
    await page.setViewport(vp);
    await page.goto(BASE + '/gomoku.html', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 800));

    const info = await page.evaluate(() => {
        const c = document.getElementById('gameBoard');
        const r = c.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const scale = c.width / r.width;
        // 网格线 (20,20+半格) 处取样：木色=被盖住，深棕 93,64,55=网格可见
        const px = (x, y) => {
            const d = c.getContext('2d').getImageData(Math.round(x * scale), Math.round(y * scale), 1, 1).data;
            return [d[0], d[1], d[2]];
        };
        const onLine = px(20, 175 * (r.height / 350));
        const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return {
            rect: { x: r.x, y: r.y, w: r.width, h: r.height },
            gridPixel: onLine.join(','),
            gridVisible: Math.abs(onLine[0] - 93) < 45 && Math.abs(onLine[1] - 64) < 45,
            hitId: top ? (top.id || top.tagName) : null,
            dpr,
        };
    });

    check(info.gridVisible, '棋盘网格可见（木质底没盖住画布）', '像素 ' + info.gridPixel);
    check(info.hitId === 'gameBoard', '画布命中测试在最上层（点击不被容器吃掉）', '命中 ' + info.hitId);

    // 切到双人模式，便于用连续落子验证胜负
    await page.click('#modeBtn');
    await new Promise(r => setTimeout(r, 400));
    const mode = await page.evaluate(() => document.getElementById('modeText').textContent);
    check(/2 Players|双人/.test(mode), '模式可切到双人对战', mode);

    const geom = await page.evaluate(() => {
        const c = document.getElementById('gameBoard');
        const r = c.getBoundingClientRect();
        const cssSize = parseFloat(c.style.width);
        const cell = (cssSize - 40) / 14;
        return { x: r.x, y: r.y, scale: r.width / cssSize, cell };
    });
    const at = (row, col) => ({
        x: geom.x + (20 + col * geom.cell) * geom.scale,
        y: geom.y + (20 + row * geom.cell) * geom.scale,
    });

    const countStones = () => page.evaluate(() => {
        const c = document.getElementById('gameBoard');
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let dark = 0, light = 0;
        for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] < 128) continue;
            if (d[i] < 70 && d[i + 1] < 70 && d[i + 2] < 70) dark++;
            else if (d[i] > 230 && d[i + 1] > 230 && d[i + 2] > 230) light++;
        }
        return { dark, light };
    });

    const before = await countStones();
    const p0 = at(7, 7);
    await page.mouse.click(p0.x, p0.y);
    await new Promise(r => setTimeout(r, 300));
    const afterOne = await countStones();
    check(afterOne.dark > before.dark, '点击棋盘能落子', `dark ${before.dark} → ${afterOne.dark}`);

    // 连点成五连（双人模式）。黑先手已落 (7,7)，之后每一对里白先、黑后：
    //   白 (8,8)~(8,11) 陪跑 4 子，黑 (7,8)~(7,11) 成五连。
    // 制胜的一手（7,11）必须放在最后 —— 结算面板一出，再点就会落在面板背景上把它关掉。
    for (let i = 0; i < 4; i++) {
        for (const p of [at(8, 8 + i), at(7, 8 + i)]) {
            await page.mouse.click(p.x, p.y);
            await new Promise(r => setTimeout(r, 250));
        }
    }
    const modalShown = await page.evaluate(() => getComputedStyle(document.getElementById('gameOverModal')).display !== 'none');
    const title = await page.evaluate(() => document.getElementById('modalMessage').textContent);
    check(modalShown, '五连即判胜并弹出结算面板', '文案 "' + title + '"');

    // 结算态：状态栏不能还停在「该谁走棋」（面板写「黑方获胜」而状态栏写「黑方走棋」自相矛盾）
    const endStatus = await page.evaluate(() => document.getElementById('statusText').textContent.trim());
    check(!/Turn|走棋/.test(endStatus), '对局结束后状态栏不再是「该谁走棋」', endStatus);

    // 语言切换 UI 已收敛到首页（2026-09-21）：游戏页不得再有语言钮 ——
    // 本页 #langBtn 与顶栏 data-chrome="lang" 都应不存在（verify-chrome §④ 同口径）。
    const langUi = await page.evaluate(() => ({
        pageBtn: !!document.getElementById('langBtn'),
        chromeBtn: !!document.querySelector('[data-chrome="lang"]'),
    }));
    check(!langUi.pageBtn && !langUi.chromeBtn, '游戏页无语言钮（语言入口收敛到首页）',
        'pageBtn=' + langUi.pageBtn + ' chromeBtn=' + langUi.chromeBtn);

    await page.screenshot({ path: OUT + '/gomoku-' + (vp.width > 400 ? 'desktop' : 'mobile') + '.png', fullPage: true });

    // 重开一局仍可落子
    if (modalShown) {
        await page.click('#modalRestartBtn');
        await new Promise(r => setTimeout(r, 400));
        const restarted = await countStones();
        check(restarted.dark + restarted.light === 0, '「再来一局」清空棋盘', `dark=${restarted.dark} light=${restarted.light}`);
    } else {
        check(false, '「再来一局」清空棋盘', '结算面板未出现，跳过');
    }
}

check(pageErrors.length === 0, '无 JS 运行时错误', pageErrors.join(' | ') || 'none');

// ── en boot 趟（语言入口收敛到首页后的唯一生效路径）──
// 游戏页对 site_lang 只读不写：预置 en 后冷加载，<html lang> 与顶栏共享文案
// 必须直接是英文 —— 这验证「首页切好的语言，进游戏页生效」。
console.log('\n=== en boot 趟（预置 site_lang=en 冷加载） ===');
await page.evaluateOnNewDocument(() => {
    try { localStorage.setItem('site_lang', 'en'); } catch (e) { /* ignore */ }
});
await page.goto(BASE + '/gomoku.html', { waitUntil: 'networkidle2' });
await new Promise(r => setTimeout(r, 800));
const enBoot = await page.evaluate(() => ({
    htmlLang: document.documentElement.lang,
    moreAria: (document.querySelector('[data-chrome="more"]') || { getAttribute: () => null }).getAttribute('aria-label'),
    langBtn: !!document.getElementById('langBtn'),
}));
check(/^en/.test(enBoot.htmlLang), '预置 en 后 boot：<html lang> 以 en 开头', enBoot.htmlLang);
check(enBoot.moreAria === 'More games', '预置 en 后 boot：顶栏共享文案为英文', String(enBoot.moreAria));
check(!enBoot.langBtn, '预置 en 后 boot：仍无语言钮', String(enBoot.langBtn));

await browser.close();
console.log('\n' + (fails.length ? '失败 ' + fails.length + ' 项:\n - ' + fails.join('\n - ') : '全部通过'));
process.exit(fails.length ? 1 : 0);
