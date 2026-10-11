// 移动端可见视口回归（PR #135 Mobile QA）
// 用法：node tests/lib/serve-static.mjs 8899 &  然后  node tests/verify-mobile-viewport-fit.mjs http://127.0.0.1:8899
//
// 背景：#132–#134 的手机校验都用 390×844 这类「整屏」视口，而 iPhone Safari 工具栏展开时
// 页面真正拿到的只有 375×553（SE）/ 390×664（14）。PR #135 在这些可见视口下截图巡检，
// 发现并修复了下列问题；每条断言在修复前的版本上都会失败（反向验证见 docs/mobile-qa-pr135.md）。
//   ① 输入框 / select 字号 <16px → iOS Safari 聚焦时整页放大且不复原
//   ② html/body 未设 touch-action: manipulation → 快速连点触发双击缩放
//   ③ 五子棋 / 黑白棋在矮视口、横屏下棋盘被压到每格 9–15px
//   ④ 塔防竖屏「请旋转」提示居中在 ~1300px 高的舞台中段，首屏看不到
//   ⑤ 影织 480×854 舞台按宽铺满，灯（Lamp Walk 关卡要拖）落在首屏以下
//   ⑥ 御剑飞行 HUD 标签（真气 / 青莲极意 / 登仙之路）英文下仍是中文
// 俄罗斯方块棋盘被固定底栏遮住的问题由 verify-tetris-topbar-mobile 承担。
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { keepPage, exitIfNoPages } from './lib/page-filter.mjs';
import { registry } from './lib/registry.mjs';

const BASE = process.argv[2] || 'http://127.0.0.1:8899';

const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const SE = { width: 375, height: 553, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const ANDROID_LAND = { width: 839, height: 360, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, isLandscape: true };
const DESKTOP = { width: 1280, height: 900, deviceScaleFactor: 1 };

const ALL = ['index', ...registry.all().map(g => g.id)].filter(keepPage);
exitIfNoPages(ALL, 'verify-mobile-viewport-fit');

const fails = [];
const check = (ok, label, detail) => {
    if (!ok) fails.push(label + (detail ? ' — ' + detail : ''));
    console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? '  (' + detail + ')' : ''}`);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: LAUNCH_ARGS });
const pageErrors = [];

async function open(id, viewport, { lang = 'en' } = {}) {
    const page = await browser.newPage();
    page.on('pageerror', e => pageErrors.push(`${id}: ${e.message}`));
    await page.setUserAgent(IOS_UA);
    await page.setViewport(viewport);
    // 外部 Worker（排行榜 / 统计）一律本地应答，避免网络抖动混进布局断言
    await page.setRequestInterception(true);
    page.on('request', r => (/workers\.dev/.test(r.url())
        ? r.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '[]' })
        : r.continue()));
    await page.evaluateOnNewDocument(l => {
        try { localStorage.setItem('site_lang', l); } catch { /* private mode */ }
    }, lang);
    await page.goto(`${BASE}/${id}.html`, { waitUntil: 'load' });
    await sleep(700);
    return page;
}

async function tap(page, selector) {
    const el = await page.waitForSelector(selector, { visible: true, timeout: 5000 });
    await el.tap();
    await sleep(600);
}

// ── ① + ② 全站：表单控件字号与页面级 touch-action ──
console.log('\n=== ①② 375×553 · 表单控件 ≥16px / html·body touch-action ===');
for (const id of ALL) {
    const page = await open(id, SE);
    const r = await page.evaluate(() => ({
        small: [...document.querySelectorAll('input:not([type=range]):not([type=checkbox]):not([type=radio]):not([type=hidden]), select, textarea')]
            .map(el => ({ id: el.id || el.className, size: parseFloat(getComputedStyle(el).fontSize) }))
            .filter(x => x.size < 16)
            .map(x => `${x.id} ${x.size}px`),
        html: getComputedStyle(document.documentElement).touchAction,
        body: getComputedStyle(document.body).touchAction,
    }));
    check(r.small.length === 0, `${id}: 表单控件字号 ≥16px（iOS 聚焦不放大）`, r.small.join(', ') || 'ok');
    if (id !== 'index') {
        check(r.html === 'manipulation' && r.body === 'manipulation',
            `${id}: html/body touch-action = manipulation（禁双击缩放）`, `html=${r.html} body=${r.body}`);
    }
    await page.close();
}

// 桌面鼠标场景保留侧栏 13px 密度：16px 只给触屏 / 移动布局
if (keepPage('planet-merge')) {
    console.log('\n=== ① 桌面 1280×900 · 侧栏用户名保持 13px ===');
    const page = await open('planet-merge', DESKTOP);
    const size = await page.$eval('.game-lb-username', el => getComputedStyle(el).fontSize);
    check(size === '13px', 'planet-merge: 桌面 .game-lb-username 仍为 13px', size);
    await page.close();
}

// ── ③ 棋盘触控下限 ──
if (keepPage('gomoku')) {
    console.log('\n=== ③ 五子棋 · 375×553 / 横屏 839×360 ===');
    for (const vp of [SE, ANDROID_LAND]) {
        const page = await open('gomoku', vp);
        const size = await page.$eval('#gameBoard', el => el.getBoundingClientRect().width);
        const cell = (size - 40) / 14;
        check(cell >= 18, `gomoku ${vp.width}×${vp.height}: 每格 ≥18px`, `棋盘 ${size.toFixed(0)}px · 每格 ${cell.toFixed(1)}px`);
        await page.close();
    }
}
if (keepPage('reversi')) {
    console.log('\n=== ③ 黑白棋 · 横屏 839×360 ===');
    const page = await open('reversi', ANDROID_LAND);
    await tap(page, '#rv-btn-play');
    const w = await page.$eval('#rv-board', el => el.getBoundingClientRect().width);
    check(w >= 280, 'reversi 839×360: 棋盘 ≥280px（每格 ≥ ~33px）', `${w.toFixed(0)}px`);
    await page.close();
}

// ── ④ 塔防竖屏旋转提示在首屏 ──
if (keepPage('tower-defense')) {
    console.log('\n=== ④ 塔防 · 竖屏 375×553 ===');
    const page = await open('tower-defense', SE);
    const r = await page.evaluate(() => {
        const prompt = document.getElementById('td-rotate-prompt');
        const title = document.getElementById('td-rotate-title').getBoundingClientRect();
        const copy = document.getElementById('td-rotate-copy').getBoundingClientRect();
        return { active: prompt.classList.contains('is-active'), top: title.top, bottom: copy.bottom, vh: innerHeight };
    });
    check(r.active, 'tower-defense 竖屏: 旋转提示处于激活态');
    check(r.top >= 0 && r.bottom <= r.vh, 'tower-defense 竖屏: 旋转提示标题与说明都在首屏内',
        `title.top ${r.top.toFixed(0)} · copy.bottom ${r.bottom.toFixed(0)} · 视口 ${r.vh}`);
    await page.close();
}

// ── ⑤ 影织：灯与托盘在首屏 ──
if (keepPage('shadow-loom')) {
    console.log('\n=== ⑤ 影织 · 375×553 ===');
    const page = await open('shadow-loom', SE);
    await tap(page, '#sl-btn-begin');
    const r = await page.evaluate(() => {
        const c = document.getElementById('sl-canvas').getBoundingClientRect();
        // 逻辑场 480×854；灯可拖区间 y 648–672（LAMP_BOX），托盘装饰到 ~730
        const at = y => c.top + c.height * y / 854;
        return { lamp: at(672), tray: at(730), vh: innerHeight, gutter: c.left, ratio: c.height / c.width };
    });
    check(r.tray <= r.vh, 'shadow-loom: 灯可拖区与托盘（逻辑 y≤730）完整落在首屏',
        `y730 → ${r.tray.toFixed(0)} · 视口 ${r.vh}`);
    check(Math.abs(r.ratio - 854 / 480) < 0.01, 'shadow-loom: 舞台保持 480×854 比例（不拉伸）', r.ratio.toFixed(3));
    await page.close();
}

// ── ⑥ 御剑飞行 HUD 英文 ──
if (keepPage('sword-flight')) {
    console.log('\n=== ⑥ 御剑飞行 · 英文 HUD ===');
    const page = await open('sword-flight', SE, { lang: 'en' });
    const r = await page.evaluate(() => ['sf-lbl-qi', 'sf-lbl-ult', 'sf-progress-label']
        .map(id => document.getElementById(id))
        .map(el => ({ text: el.textContent, title: el.closest('[title]')?.getAttribute('title') || '' })));
    const cjk = /[一-鿿]/;
    check(r.every(x => !cjk.test(x.text)), 'sword-flight en: HUD 标签无中文', r.map(x => x.text).join(' / '));
    check(r.slice(0, 2).every(x => !cjk.test(x.title)), 'sword-flight en: 能量槽 title 无中文', r.slice(0, 2).map(x => x.title).join(' / '));
    await page.close();
    const zh = await open('sword-flight', SE, { lang: 'zh' });
    const zhText = await zh.$eval('#sf-lbl-qi', el => el.textContent);
    check(zhText === '真气', 'sword-flight zh: HUD 标签保留中文', zhText);
    await zh.close();
}

check(pageErrors.length === 0, '无 pageerror', pageErrors.slice(0, 3).join(' | '));
await browser.close();

if (fails.length) {
    console.log(`\n✗ ${fails.length} 项失败`);
    process.exit(1);
}
console.log('\n全部通过');
