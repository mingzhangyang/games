#!/usr/bin/env node
/**
 * smoke-sudoku-mist — 雾隐九宫的真实交互冒烟（需服务器 + Chrome）
 *
 * 走真实输入链（点击 / 触屏 / 键盘 → DOM 按钮 → session），期望值一律由 Node 侧同一个规则模型算出：
 *   ① boot：菜单可见、HUD 与键盘隐藏、顶栏暂停禁用 / 重开隐藏、8 关 + 3 个自由局、无 pageerror
 *   ② 开局：81 格；DOM 里出现的数字恰好是开局可见的题面数字（雾中格无数字、读屏标签不泄露）；
 *      雾层像素：雾中格不透明、可见格透明
 *   ③ 穿雾落子（点格 + 点数字键）：分数 = 模型给的分数；落子格与揭雾核里的雾在 1s 内散去
 *   ④ 填错（键盘）：格子不变、失误 +1、扣分不低于 0
 *   ⑤ 笔记：N 切换笔记、数字键记笔记、擦除；落子后同行列宫的同数字笔记被清掉
 *   ⑥ 点灯：说明文案无占位符、高亮指向模型的点灯格；照着落子 0 分
 *   ⑦ 暂停：P → 暂停浮层、计时冻结、重开钮隐藏；切到后台自动暂停、回前台不自动继续
 *   ⑧ 通关：结算分数与 Node 侧 replay(同一输入序列) 一致、本地最佳写入、统计上报 play / finish
 *   ⑨ 推理回放：回放条出现、盘面回到开局再逐步落子；停止回到结算
 *   ⑩ 下一关 / 菜单（显示最佳）/ 自由局（运行时出题）
 *   ⑪ 语言：中 → 英即时切换，可见文案无 {占位符}
 *   ⑫ 浅色主题：雾与棋盘换成宣纸配色
 *   ⑬ 手机（390×664，触屏）：轻点格子 + 数字键落子；棋盘与键盘都在首屏内、无横向滚动
 *
 * 用法：node tests/smoke-sudoku-mist.mjs [baseUrl]（verify-all 自动传入）
 */
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { LEVELS, levelById } from '../src/games/sudoku-mist/model/levels.js';
import { prepareLevel, replay } from '../src/games/sudoku-mist/model/session.js';
import { revealArea } from '../src/games/sudoku-mist/model/fog.js';
import { PEERS } from '../src/games/sudoku-mist/model/grid.js';

const BASE = process.argv.find(a => a.startsWith('http')) || 'http://127.0.0.1:8899';
const fails = [];
let passes = 0;
const check = (cond, label, extra = '') => {
    if (cond) passes++;
    else fails.push(`${label}${extra !== '' ? ' —— ' + extra : ''}`);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PLACEHOLDER = /\{\w+\}/;

const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: LAUNCH_ARGS });

async function open({ width = 1280, height = 900, mobile = false, lang = 'zh', theme = 'dark' } = {}) {
    const page = await browser.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e.message || e).split('\n')[0]));
    await page.setViewport({ width, height, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile });
    await page.setBypassServiceWorker(true);
    await page.evaluateOnNewDocument((l, t) => {
        try {
            localStorage.setItem('site_lang', l);
            localStorage.setItem('site_muted', '1');
            localStorage.setItem('site_theme', t);
        } catch { /* storage unavailable */ }
        // 统计打桩：记录 hubTrack 调用，不向生产发数据
        window.__tracked = [];
        Object.defineProperty(window, 'hubTrack', {
            configurable: true,
            get: () => (game, event) => window.__tracked.push(`${game}:${event}`),
            set: () => {},
        });
    }, lang, theme);
    await page.goto(`${BASE}/sudoku-mist.html`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => !!window.smGame?.el, { timeout: 15000 });
    return { page, errs };
}

const snap = page => page.evaluate(() => {
    const vis = id => !document.getElementById(id).classList.contains('hidden');
    const g = window.smGame;
    return {
        state: g.state,
        paused: g.isPaused,
        start: vis('sm-start'),
        hud: vis('sm-hud'),
        panel: vis('sm-panel'),
        pause: vis('sm-pause'),
        result: vis('sm-result'),
        replayBar: vis('sm-replay-bar'),
        reset: vis('sm-reset-btn'),
        pauseDisabled: document.getElementById('sm-pause-btn').disabled,
        pausePressed: document.getElementById('sm-pause-btn').getAttribute('aria-pressed'),
        score: Number(document.getElementById('sm-score').textContent),
        mistakes: Number(document.getElementById('sm-mistakes').textContent),
        time: document.getElementById('sm-time').textContent,
        level: document.getElementById('sm-level').textContent,
        message: document.getElementById('sm-message').textContent,
    };
});

/** DOM 里每格的数字与读屏标签 */
const cells = page => page.$$eval('#sm-board .sm-cell', els => els.map(el => ({
    digit: el.querySelector('.sm-cell-digit').textContent,
    notes: [...el.querySelectorAll('.sm-note')].map(n => n.textContent).join(''),
    label: el.getAttribute('aria-label'),
    cls: el.className,
})));

/** 雾层在格中心的 alpha（0–255） */
const mistAlpha = (page, list) => page.evaluate(ids => {
    const c = document.getElementById('sm-mist');
    const ctx = c.getContext('2d');
    return ids.map(i => {
        const x = Math.floor(((i % 9) + 0.5) / 9 * c.width), y = Math.floor((Math.floor(i / 9) + 0.5) / 9 * c.height);
        return ctx.getImageData(x, y, 1, 1).data[3];
    });
}, list);

const firstDeducible = page => page.evaluate(() => {
    const s = window.smGame.session;
    const a = s.analysis();
    const i = a.order.find(c => !s.isKnown(c));
    return { cell: i, digit: a.values[i], tier: a.tierOf[i], fog: !s.isVisible(i) };
});

const clickCell = (page, i) => page.click(`#sm-board [data-cell="${i}"]`);
const clickDigit = (page, d) => page.click(`#sm-pad [data-digit="${d}"]`);

try {
    /* ── 桌面 ── */
    const { page, errs } = await open();

    // ① boot
    let s = await snap(page);
    const menu = await page.evaluate(() => ({
        levels: document.querySelectorAll('#sm-chapters .sm-level').length,
        free: document.querySelectorAll('#sm-free .sm-free-btn').length,
        more: document.querySelectorAll('#smStartMore a').length,
    }));
    check(s.state === 'menu' && s.start && !s.hud && !s.panel && s.pauseDisabled && !s.reset,
        '① boot：菜单可见、HUD / 键盘隐藏、暂停禁用、重开隐藏', JSON.stringify(s));
    check(menu.levels === LEVELS.length && menu.free === 3 && menu.more > 0, '① 菜单：8 关 + 3 个自由局 + 更多游戏', JSON.stringify(menu));

    // ② 开局（真实点击关卡按钮）
    await page.click('#sm-level-thin-1');
    await sleep(150);
    s = await snap(page);
    const lv = prepareLevel(levelById('thin-1'));
    const visibleGivens = [...lv.visible0].map((v, i) => (v && lv.givens[i] ? i : -1)).filter(i => i >= 0);
    let dom = await cells(page);
    const domDigits = dom.map((c, i) => (c.digit ? i : -1)).filter(i => i >= 0);
    check(s.state === 'playing' && s.hud && s.panel && !s.start && !s.pauseDisabled && dom.length === 81,
        '② 开局：HUD + 键盘可见、81 格', JSON.stringify(s));
    check(JSON.stringify(domDigits) === JSON.stringify(visibleGivens)
        && domDigits.every(i => dom[i].digit === String(lv.givens[i])),
    `② DOM 只出现开局可见的 ${visibleGivens.length} 个题面数字`, JSON.stringify(domDigits));
    const fogCells = dom.map((c, i) => (/sm-cell--fog/.test(c.cls) ? i : -1)).filter(i => i >= 0);
    check(fogCells.length === 81 - [...lv.visible0].filter(Boolean).length
        && fogCells.every(i => !/\d$/.test(dom[i].label.replace(/第 \d 行第 \d 列|Row \d, column \d/, ''))),
    '② 雾中格的读屏标签不带数字');
    await sleep(100);
    const [fogA, clearA] = await mistAlpha(page, [fogCells[0], visibleGivens[0]]);
    check(fogA > 150 && clearA < 40, '② 雾层像素：雾中格不透明、可见格透明', `fog ${fogA} clear ${clearA}`);

    // ③ 穿雾落子：点格 + 点数字键
    const step1 = await firstDeducible(page);
    const area = revealArea(step1.cell, lv.reveal).filter(j => !lv.visible0[j]);
    await clickCell(page, step1.cell);
    await clickDigit(page, step1.digit);
    s = await snap(page);
    const expected1 = Math.round({ 1: 10, 2: 20, 3: 40, 4: 80 }[step1.tier] * (step1.fog ? 1.5 : 1));
    dom = await cells(page);
    check(step1.fog && s.score === expected1 && dom[step1.cell].digit === String(step1.digit) && /sm-cell--placed/.test(dom[step1.cell].cls),
        `③ 穿雾落子：T${step1.tier} × 1.5 = ${expected1} 分`, JSON.stringify({ score: s.score, step1 }));
    await sleep(1100);
    const after = await mistAlpha(page, area);
    check(after.every(a => a < 40), `③ 揭雾：落子格周围 ${area.length} 格的雾 1s 内散去`, JSON.stringify(after));

    // ④ 填错（键盘）
    const step2 = await firstDeducible(page);
    await clickCell(page, step2.cell);
    const wrong = step2.digit % 9 + 1;
    const before = (await snap(page)).score;
    await page.keyboard.press(String(wrong));
    s = await snap(page);
    dom = await cells(page);
    check(s.mistakes === 1 && s.score === Math.max(0, before - 20) && !dom[step2.cell].digit,
        '④ 填错：格子不变、失误 +1、扣 20', JSON.stringify({ before, s }));

    // ⑤ 笔记
    await page.keyboard.press('n');
    await page.keyboard.press(String(step2.digit));
    await page.keyboard.press(String(wrong));
    dom = await cells(page);
    check(dom[step2.cell].notes === [step2.digit, wrong].sort().join(''), '⑤ 笔记模式：数字键记笔记', dom[step2.cell].notes);
    const notesPressed = await page.$eval('#sm-btn-notes', el => el.getAttribute('aria-pressed'));
    await page.click('#sm-btn-erase');
    dom = await cells(page);
    check(notesPressed === 'true' && dom[step2.cell].notes === '', '⑤ 擦除笔记');
    // 给一个同伴记上 step2.digit，落子后它应被清掉
    const peer = PEERS[step2.cell].find(p => !dom[p].digit);
    await clickCell(page, peer);
    await page.keyboard.press(String(step2.digit));
    await page.keyboard.press('n');
    await clickCell(page, step2.cell);
    await page.keyboard.press(String(step2.digit));
    dom = await cells(page);
    check(dom[step2.cell].digit === String(step2.digit) && !dom[peer].notes.includes(String(step2.digit)),
        '⑤ 落子后同行列宫里同一数字的笔记被清掉', dom[peer].notes);

    // ⑥ 点灯
    const expectHint = await firstDeducible(page);
    const beforeHint = (await snap(page)).score;
    await page.click('#sm-btn-hint');
    s = await snap(page);
    dom = await cells(page);
    check(s.message.length > 4 && !PLACEHOLDER.test(s.message) && /sm-cell--hint\b/.test(dom[expectHint.cell].cls),
        '⑥ 点灯：说明文案完整、高亮指向最容易的一格', s.message);
    await page.keyboard.press(String(expectHint.digit));
    s = await snap(page);
    check(s.score === beforeHint, '⑥ 照着点灯落子 0 分', `${beforeHint} → ${s.score}`);

    // ⑦ 暂停 + 后台
    await page.keyboard.press('p');
    s = await snap(page);
    const t0 = s.time;
    await sleep(1300);
    const s2 = await snap(page);
    check(s.paused && s.pause && !s.reset && s.pausePressed === 'true' && s2.time === t0, '⑦ P 暂停：浮层、计时冻结、重开隐藏', JSON.stringify(s2));
    await page.click('#sm-btn-resume');
    s = await snap(page);
    check(!s.paused && !s.pause && s.reset, '⑦ 继续');
    await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        document.dispatchEvent(new Event('visibilitychange'));
    });
    s = await snap(page);
    check(s.paused && s.pause, '⑦ 切到后台：自动暂停并显示暂停浮层');
    await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
        document.dispatchEvent(new Event('visibilitychange'));
    });
    s = await snap(page);
    check(s.paused && s.pause, '⑦ 回到前台：不自动继续');
    await page.click('#sm-btn-resume');

    // ⑧ 通关：剩下的格子全部用真实点击推完
    for (let n = 0; n < 90; n++) {
        const st = await page.evaluate(() => window.smGame.state);
        if (st !== 'playing') break;
        const step = await firstDeducible(page);
        await clickCell(page, step.cell);
        await clickDigit(page, step.digit);
    }
    await page.waitForFunction(() => !document.getElementById('sm-result').classList.contains('hidden'), { timeout: 5000 });
    const result = await page.evaluate(() => ({
        inputs: window.smGame.session.inputs,
        score: Number(document.getElementById('sm-result-score').textContent),
        stats: [...document.querySelectorAll('#sm-result-stats .sm-stat')].map(li => li.textContent),
        best: localStorage.getItem('game:sudoku-mist:v1:best:thin-1'),
        tracked: window.__tracked,
        text: document.getElementById('sm-result').innerText,
    }));
    const model = replay(levelById('thin-1'), result.inputs).summary();
    check(model.done && result.score === model.score && JSON.parse(result.best || '{}').score === model.score,
        `⑧ 结算分数 = Node 侧回放同一输入序列（${model.score}），本地最佳写入`, JSON.stringify({ dom: result.score, model: model.score, best: result.best }));
    check(result.stats.length === 10 && !PLACEHOLDER.test(result.text) && model.mistakes === 1 && model.hintPlaced === 1,
        '⑧ 结算统计 10 行、无占位符（失误 1、点灯 1）');
    check(result.tracked.includes('sudoku-mist:play') && result.tracked.includes('sudoku-mist:finish'), '⑧ 统计上报 play / finish', JSON.stringify(result.tracked));
    s = await snap(page);
    check(!s.panel && !s.reset && s.pauseDisabled, '⑧ 结算：键盘隐藏、重开隐藏、暂停禁用', JSON.stringify(s));

    // ⑨ 推理回放
    await page.click('#sm-btn-replay');
    await sleep(700);
    const mid = await page.evaluate(() => ({
        bar: !document.getElementById('sm-replay-bar').classList.contains('hidden'),
        text: document.getElementById('sm-replay-text').textContent,
        known: [...document.querySelectorAll('#sm-board .sm-cell-digit')].filter(el => el.textContent).length,
    }));
    check(mid.bar && /\d+ \/ \d+/.test(mid.text) && mid.known > visibleGivens.length && mid.known < 81,
        '⑨ 回放：从开局重新逐步落子', JSON.stringify(mid));
    await page.click('#sm-btn-stop-replay');
    s = await snap(page);
    check(s.state === 'result' && s.result && !s.replayBar, '⑨ 停止回放回到结算');

    // ⑩ 下一关 / 菜单 / 自由局
    await page.click('#sm-btn-next');
    s = await snap(page);
    check(s.state === 'playing' && s.level === levelById('thin-2').name.zh, '⑩ 下一关', s.level);
    await page.keyboard.press('Escape');
    await page.click('#sm-btn-pause-menu');
    const bestText = await page.$eval('#sm-level-thin-1 .sm-level-best', el => el.textContent);
    check(bestText.includes(String(model.score)), '⑩ 菜单显示本关最佳', bestText);
    await page.click('#sm-free-first');
    await page.waitForFunction(() => window.smGame.state === 'playing', { timeout: 8000 });
    s = await snap(page);
    const freeKnown = (await cells(page)).filter(c => c.digit).length;
    check(s.level === '自由局 · 初雾' && freeKnown > 0 && freeKnown < 40, '⑩ 自由局：运行时出题并开局', JSON.stringify({ level: s.level, freeKnown }));

    // ⑪ 语言
    await page.evaluate(() => window.smGame.toMenu());
    const en = await page.evaluate(() => {
        localStorage.setItem('site_lang', 'en');
        window.dispatchEvent(new CustomEvent('site-settings:changed'));
        return {
            title: document.querySelector('.sm-start-title').textContent,
            level: document.querySelector('#sm-level-thin-1 .sm-level-name').textContent,
            lang: document.documentElement.lang,
            text: document.body.innerText,
        };
    });
    check(en.title === 'Sudoku in the Mist' && en.level === 'Bamboo Path' && en.lang === 'en', '⑪ 中 → 英即时切换', JSON.stringify({ ...en, text: undefined }));
    check(!PLACEHOLDER.test(en.text), '⑪ 可见文案无 {占位符}');
    check(errs.length === 0, '桌面：无 pageerror', errs.join(' | '));
    await page.close();

    /* ── 浅色主题 ── */
    {
        const { page: lp, errs: lerrs } = await open({ theme: 'light' });
        await lp.click('#sm-level-through-1');
        await sleep(150);
        const light = await lp.evaluate(() => ({
            theme: document.documentElement.dataset.theme,
            fog: getComputedStyle(document.documentElement).getPropertyValue('--sm-cv-fog-rgb').trim(),
            board: getComputedStyle(document.getElementById('sm-board-wrap')).backgroundColor,
        }));
        const lvl = prepareLevel(levelById('through-1'));
        const fogCell = [...lvl.visible0].findIndex(v => !v);
        const px = await lp.evaluate(i => {
            const c = document.getElementById('sm-mist');
            const d = c.getContext('2d').getImageData(Math.floor(((i % 9) + 0.5) / 9 * c.width), Math.floor((Math.floor(i / 9) + 0.5) / 9 * c.height), 1, 1).data;
            return [...d];
        }, fogCell);
        check(light.theme === 'light' && light.fog === '251, 249, 244' && light.board === 'rgb(233, 225, 207)'
            && px[0] > 200 && px[3] > 150, '⑫ 浅色：宣纸棋盘 + 白雾', JSON.stringify({ light, px }));
        check(lerrs.length === 0, '浅色：无 pageerror', lerrs.join(' | '));
        await lp.close();
    }

    /* ── 手机：390×664 可见视口，触屏 ── */
    {
        const { page: mp, errs: merrs } = await open({ width: 390, height: 664, mobile: true });
        await mp.tap('#sm-level-thin-1');
        await sleep(200);
        const step = await firstDeducible(mp);
        await mp.tap(`#sm-board [data-cell="${step.cell}"]`);
        await mp.tap(`#sm-pad [data-digit="${step.digit}"]`);
        const geo = await mp.evaluate(i => {
            const r = id => { const b = document.getElementById(id).getBoundingClientRect(); return { width: b.width, bottom: b.bottom }; };
            return {
                digit: document.querySelector(`#sm-board [data-cell="${i}"] .sm-cell-digit`).textContent,
                score: Number(document.getElementById('sm-score').textContent),
                board: r('sm-board-wrap'),
                pad: r('sm-pad'),
                scrollW: document.documentElement.scrollWidth,
                innerW: innerWidth,
                innerH: innerHeight,
                keyH: document.querySelector('#sm-pad .sm-key').getBoundingClientRect().height,
            };
        }, step.cell);
        check(geo.digit === String(step.digit) && geo.score > 0, '⑬ 触屏：轻点格子 + 数字键落子', JSON.stringify({ digit: geo.digit, score: geo.score }));
        check(geo.scrollW <= geo.innerW && geo.board.width >= 340 && geo.pad.bottom <= geo.innerH && geo.keyH >= 44,
            '⑬ 390×664：棋盘 ≥ 340px、键盘在首屏内、按键 ≥ 44px、无横向滚动', JSON.stringify({ board: geo.board.width, padBottom: geo.pad.bottom, innerH: geo.innerH, scrollW: geo.scrollW, keyH: geo.keyH }));
        check(merrs.length === 0, '手机：无 pageerror', merrs.join(' | '));
        await mp.close();
    }
} catch (e) {
    fails.push(`异常：${e.stack || e}`);
} finally {
    await browser.close();
}

for (const f of fails) console.error(`✗ ${f}`);
console.log(fails.length === 0 ? `\nsmoke-sudoku-mist 全部通过 ✅（${passes} 项）` : `\n${fails.length} 个失败 ❌（${passes} 项通过）`);
process.exit(fails.length === 0 ? 0 : 1);
