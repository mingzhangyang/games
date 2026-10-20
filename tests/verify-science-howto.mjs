#!/usr/bin/env node
/**
 * verify-science-howto — 科学实验室几款游戏「进来就知道怎么玩」的真机门禁。
 *
 * 2026-10 用户反馈：麦克斯韦妖 / 晶绽等科学类游戏进来不知道怎么操作。排查到三处：
 *   ① 开局玩法提示（tip toast）整批不可见：md/cb/fv/ec/sd 的 showToast 只加 is-on、不摘初始的
 *      `hidden`（game-hidden-contract 下 display:none !important），rd 反过来只摘 hidden、不加 is-on
 *      （.rd-toast 默认 opacity:0）。smoke 只断言类名，所以一直是假绿 —— 本脚本一律断言**计算样式**。
 *   ② 开始界面的玩法说明是一整段科普散文，操作埋在中间。现为「目标 + ①②③ 操作步骤」，
 *      触屏另有不提键盘的 howtoTouch，科普挪到侧栏「原理」段。
 *   ③ 圆形动作钮只有图标（眼睛 / 门 / ▶ / 垃圾桶），看不出哪个是观测、哪个是开门。
 *
 * 每页 × zh/en × 触屏(390×664 coarse)/桌面(1280×800)：
 *   · 点「关卡模式」进第一关后，提示条 display≠none、opacity≥0.9、文字非空、整条落在舞台内；
 *   · HOWTO_PAGES：开始界面说明以「目标」开头、含 ①②③、按行排版（pre-line）；触屏版不含键鼠字样，
 *     桌面版与触屏版不同（桌面照常写快捷键）；侧栏「原理」段非空；
 *   · LABEL_PAGES：每颗动作钮里有可见文字标签、标签在钮内、钮上不再用 aria-label 盖掉可见名。
 *
 * 用法：node tests/verify-science-howto.mjs [baseUrl]（verify-all 自动传入）
 */
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { keepPage, exitIfNoPages } from './lib/page-filter.mjs';

const BASE = process.argv.find(a => a.startsWith('http')) || 'http://127.0.0.1:8899';
const ORIGIN = new URL(BASE).origin;

/** id → 页前缀；toast 都是 #<p>-toast，进关都是 #<p>-btn-levels */
const PAGES = {
    'maxwell-demon': 'md',
    'crystal-bloom': 'cb',
    'flame-verse': 'fv',
    'ripple-duet': 'rd',
    'echo-cave': 'ec',
    'silk-dew': 'sd',
};
const HOWTO_PAGES = new Set(['maxwell-demon', 'crystal-bloom', 'flame-verse', 'ripple-duet']);
/** 动作钮 id → 期望的标签（zh / en） */
const LABEL_PAGES = {
    'maxwell-demon': { 'md-scan-btn': ['观测', 'Scan'], 'md-gate-btn': ['开门', 'Open'] },
    'crystal-bloom': { 'cb-stir-btn': ['搅拌', 'Stir'], 'cb-run-btn': ['生长', 'Grow'] },
    'flame-verse': { 'fv-clear-btn': ['倒掉', 'Empty'], 'fv-run-btn': ['送检', 'Assay'] },
};
// 与 verify-touch-hints 同一套键鼠字样，再补上本组游戏用到的 F / Delete / 1–8 / ← / →（单个 → 是正文里的「急冷 → 枝晶」）
const KEY_MOUSE = [
    /\b(?:click|right-click|mouse|keyboard|space|enter|esc|delete|arrows?)\b/i,
    /鼠标|键盘|右键|左键|空格|回车|方向键|Delete|←\s*\/\s*→|1–8|按 ?[A-Z]\b|\bor [A-Z]\b|\([A-Z]\)|（[A-Z]）/,
];

const pages = Object.keys(PAGES).filter(keepPage);
exitIfNoPages(pages, 'verify-science-howto');

const fails = [];
let passes = 0;
const check = (cond, label, extra = '') => {
    if (cond) passes++;
    else fails.push(`${label}${extra !== '' ? ' —— ' + extra : ''}`);
};
const wait = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: LAUNCH_ARGS });

async function audit(id, lang, touch) {
    const p = PAGES[id];
    const tag = `${id}/${lang}/${touch ? 'touch' : 'desktop'}`;
    const page = await browser.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e.message || e).split('\n')[0]));
    await page.setViewport(touch
        ? { width: 390, height: 664, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
        : { width: 1280, height: 800, deviceScaleFactor: 1 });
    await page.setBypassServiceWorker(true);
    await page.setRequestInterception(true);
    page.on('request', r => (r.url().startsWith(ORIGIN) ? r.continue() : r.abort()));
    await page.evaluateOnNewDocument(l => {
        try { localStorage.clear(); localStorage.setItem('site_lang', l); } catch { /* private mode */ }
    }, lang);
    await page.goto(`${BASE}/${id}.html`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(pp => document.getElementById(`${pp}-btn-levels`), { timeout: 15000 }, p);
    await wait(300);

    const coarse = await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches);
    check(coarse === touch, `${tag}: (pointer: coarse) = ${touch}（否则测不到对应文案）`);

    let howto = null;
    if (HOWTO_PAGES.has(id)) {
        howto = await page.evaluate(pp => {
            const start = document.getElementById(`${pp}-howto`);
            const science = document.getElementById(`${pp}-side-science`);
            return {
                text: start ? start.textContent.trim() : '',
                whiteSpace: start ? getComputedStyle(start).whiteSpace : '',
                side: (document.getElementById(`${pp}-side-howto`) || {}).textContent || '',
                science: science ? science.textContent.trim() : '',
            };
        }, p);
        const goal = lang === 'zh' ? '目标：' : 'Goal:';
        check(howto.text.startsWith(goal), `${tag}: 玩法说明以「${goal}」开头`, howto.text.slice(0, 30));
        check(['①', '②', '③'].every(m => howto.text.includes(m)), `${tag}: 玩法说明含 ①②③ 操作步骤`);
        check(howto.text.split('\n').length >= 4, `${tag}: 目标 + 三步分行`, `${howto.text.split('\n').length} 行`);
        check(howto.whiteSpace === 'pre-line', `${tag}: 说明按行排版（white-space: pre-line）`, howto.whiteSpace);
        check(howto.side.trim() === howto.text, `${tag}: 侧栏玩法与开始界面同一份文案`);
        check(howto.science.length > 20, `${tag}: 侧栏「原理」段非空`);
        if (touch) {
            const hit = KEY_MOUSE.find(re => re.test(howto.text));
            check(!hit, `${tag}: 触屏玩法说明不含键鼠字样`, hit ? `${hit} 命中` : '');
        }
    }

    await page.evaluate(pp => document.getElementById(`${pp}-btn-levels`).click(), p);
    await wait(450);   // toast 有 0.2s 的 opacity 过渡
    const toast = await page.evaluate(pp => {
        const t = document.getElementById(`${pp}-toast`);
        const stage = t && t.closest('.game-stage');
        if (!t || !stage) return null;
        const cs = getComputedStyle(t);
        const r = t.getBoundingClientRect();
        const s = stage.getBoundingClientRect();
        return {
            display: cs.display, visibility: cs.visibility, opacity: Number(cs.opacity),
            text: t.textContent.trim(),
            inside: r.width > 0 && r.left >= s.left - 1 && r.right <= s.right + 1 && r.top >= s.top - 1,
            lines: Math.round((r.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)) / parseFloat(cs.lineHeight)),
        };
    }, p);
    check(toast !== null, `${tag}: 舞台内有提示条`);
    if (toast) {
        check(toast.display !== 'none' && toast.visibility === 'visible', `${tag}: 开局提示真的显示（不是 display:none）`,
            `display=${toast.display} visibility=${toast.visibility}`);
        check(toast.opacity >= 0.9, `${tag}: 开局提示不透明`, `opacity=${toast.opacity}`);
        check(toast.text.length > 0, `${tag}: 开局提示有文字`);
        check(toast.inside, `${tag}: 提示条整条落在舞台内`);
        check(toast.lines <= 3, `${tag}: 提示条用满舞台宽，不挤成细长条`, `${toast.lines} 行`);
    }

    const labels = LABEL_PAGES[id];
    if (labels) {
        for (const [btnId, [zh, en]] of Object.entries(labels)) {
            const r = await page.evaluate(bid => {
                const b = document.getElementById(bid);
                const l = b && b.querySelector('.sci-action-label');
                if (!b || !l) return null;
                const br = b.getBoundingClientRect();
                const lr = l.getBoundingClientRect();
                const cs = getComputedStyle(l);
                return {
                    text: l.textContent.trim(),
                    ariaLabel: b.getAttribute('aria-label'),
                    shown: cs.display !== 'none' && cs.visibility === 'visible' && lr.width > 0 && lr.height > 0,
                    inside: lr.left >= br.left - 1 && lr.right <= br.right + 1 && lr.top >= br.top - 1 && lr.bottom <= br.bottom + 1,
                };
            }, btnId);
            check(r !== null, `${tag}: #${btnId} 带文字标签`);
            if (!r) continue;
            const want = lang === 'zh' ? zh : en;
            check(r.text === want, `${tag}: #${btnId} 标签为「${want}」`, r.text);
            check(r.shown, `${tag}: #${btnId} 标签可见`);
            check(r.inside, `${tag}: #${btnId} 标签不溢出圆钮`);
            check(r.ariaLabel === null, `${tag}: #${btnId} 不用 aria-label 盖掉可见名`, String(r.ariaLabel));
        }
    }

    check(errs.length === 0, `${tag}: 无 pageerror`, errs.join(' | '));
    await page.close();
    return howto ? howto.text : null;
}

for (const id of pages) {
    for (const lang of ['zh', 'en']) {
        const touchText = await audit(id, lang, true);
        const deskText = await audit(id, lang, false);
        if (HOWTO_PAGES.has(id)) {
            check(touchText !== deskText, `${id}/${lang}: 桌面版说明写快捷键，与触屏版不同`);
        }
    }
}

await browser.close();

if (fails.length) {
    console.log(`✗ verify-science-howto：${fails.length} 项失败 / ${passes} 项通过`);
    for (const f of fails) console.log('  ✗ ' + f);
    process.exit(1);
}
console.log(`✓ verify-science-howto：${passes} 项全部通过（${pages.length} 页 × zh/en × 触屏/桌面）`);
