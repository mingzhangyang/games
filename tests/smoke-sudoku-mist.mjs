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
 *   ⑮ 星级：结算星数 = starsFor(模型分数, 关卡阈值)，菜单关卡按钮显示同样的星
 *   ⑯ 每日一雾：菜单入口 → 计分局不能重开（顶栏 / 暂停浮层都没有重开）；落子后进度写入本地；
 *      整页刷新后入口显示「继续」，点进去按输入序列恢复（分数、笔记、用时）；排行榜弹窗静默暂停、关闭后继续；
 *      完成时只 POST 一次到 sudoku-mist-d<今天>（分数 = Node 侧回放）、写完成标记、清进度；
 *      「再来一局」是练习局：可以重开，完成后不再提交
 *   ⑰ 每日一雾边界：A 在计分局里时 B 进不来（Web Locks，留在菜单说明原因）；A 完成后 B 再进是练习局（只 POST 一次、不覆盖成绩）；
 *      完成那一刻发现别处已写完成标记 → 降为练习局；
 *      完成标记写不进存储 → 进度存成含最后一步的完整输入、本页「再来一局」仍是练习局且完成后不删恢复数据、
 *      刷新后重放到 done 恢复原分数；POST 未返回时成绩已在本地重试队列，确认后移除；进页补交昨天未确认的成绩
 *   ⑱ 同一时刻一个标签页：B 在局里时 A 进不来也覆盖不了；B 离开后 A 再进以存档为准（不用自己过期的内存检查点）；
 *      进度写不进存储时，回菜单再进用本页内存检查点（失误不会被「撤销」）
 *   ⑲ 锁的边界：持有暂停租约（切到后台）时续上存档照常是计分局；拿锁的标签页关掉后锁自动放开
 *
 * 用法：node tests/smoke-sudoku-mist.mjs [baseUrl]（verify-all 自动传入）
 */
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { LEVELS, levelById } from '../src/games/sudoku-mist/model/levels.js';
import { prepareLevel, replay } from '../src/games/sudoku-mist/model/session.js';
import { revealArea } from '../src/games/sudoku-mist/model/fog.js';
import { PEERS } from '../src/games/sudoku-mist/model/grid.js';
import { starsFor } from '../src/games/sudoku-mist/model/scoring.js';
import { generateDaily } from '../src/games/sudoku-mist/model/generator.js';
import { todayKey } from '../src/platform/daily.js';

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

async function open({ width = 1280, height = 900, mobile = false, lang = 'zh', theme = 'dark', scores = null, context = browser } = {}) {
    const page = await context.newPage();
    const errs = [];
    // 排行榜 Worker 打桩：GET 回空榜，POST 记下请求体（不向生产发数据）
    if (scores) {
        await page.setRequestInterception(true);
        page.on('request', req => {
            const url = req.url();
            if (!url.startsWith('https://game-scores.orangely.workers.dev/')) { void req.continue(); return; }
            const key = new URL(url).searchParams.get('game');
            if (req.method() === 'POST') {
                if (scores.offline) { void req.abort('internetdisconnected'); return; }
                scores.posts.push(JSON.parse(req.postData() || '{}'));
                // hold：先不回应，测「请求还在路上」的状态；release() 再放行
                if (scores.hold) { scores.held.push(req); return; }
            }
            else if (req.method() === 'GET') scores.gets.push(key);
            const headers = {
                'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'Content-Type',
            };
            void req.respond({ status: 200, contentType: 'application/json', headers, body: req.method() === 'POST' ? '{"ok":true}' : '[]' });
        });
    }
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

/** WCAG contrast lower bound for note chips over any fog/wisp/selection color.
 * An arbitrary underlying RGB lies between black and white per channel, and
 * the backing alpha bounds its resulting luminance between these two extremes.
 */
const noteReadability = page => page.evaluate(() => {
    const game = window.smGame;
    const cell = game.session.view().findIndex(v => v.state === 'fog');
    if (cell < 0) return { error: 'no fog cell' };
    const savedNote = game.notes[cell], savedSelection = game.selected;
    const luminance = rgb => {
        const linear = rgb.map(v => {
            const n = v / 255;
            return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
        });
        return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    };
    const channels = value => (value.match(/[0-9.]+/g) || []).map(Number);
    const results = [];
    game.notes[cell] |= 1;
    for (const selected of [-1, cell]) {
        game.selected = selected;
        game.render();
        const el = document.querySelector(`#sm-board [data-cell="${cell}"] .sm-note:not(:empty)`);
        if (!el) { results.push({ error: 'no visible note' }); continue; }
        const style = getComputedStyle(el);
        const fg = channels(style.color);
        const bg = channels(style.backgroundColor);
        const alpha = bg[3] ?? 1;
        const fgLum = luminance(fg.slice(0, 3));
        const blackLum = luminance(bg.slice(0, 3).map(c => c * alpha));
        const whiteLum = luminance(bg.slice(0, 3).map(c => c * alpha + 255 * (1 - alpha)));
        const worst = fgLum <= blackLum ? (blackLum + 0.05) / (fgLum + 0.05)
            : fgLum >= whiteLum ? (fgLum + 0.05) / (whiteLum + 0.05) : 1;
        results.push({ selected: selected >= 0, contrast: Number(worst.toFixed(2)) });
    }
    game.notes[cell] = savedNote;
    game.selected = savedSelection;
    game.render();
    return {
        theme: document.documentElement.dataset.theme,
        results,
        bodyFont: getComputedStyle(document.body).fontFamily,
        titleFont: getComputedStyle(document.querySelector('.sm-title-main')).fontFamily,
    };
});

const clickCell = (page, i) => page.click(`#sm-board [data-cell="${i}"]`);

/** 页内走 n 步推理落子（wrong = true 时最后再填错一次） */
const stepInPage = (page, n, { wrong = false } = {}) => page.evaluate((k, w) => {
    const g = window.smGame;
    const next = () => {
        const s = g.session;
        const a = s.analysis();
        const i = a.order.find(c => !s.isKnown(c));
        return { i, d: a.values[i] };
    };
    for (let m = 0; m < k; m++) {
        const { i, d } = next();
        g.selected = i;
        g.onDigit(d);
    }
    if (w) {
        const { i, d } = next();
        g.selected = i;
        g.onDigit(d % 9 + 1);
    }
    return { inputs: g.session.inputs.length, mistakes: g.session.summary().mistakes, state: g.state };
}, n, wrong);

/** 页内快速推完一局（走 onCell / onDigit，同一条规则路径；只给生命周期类断言用，真实点击另有 ⑧ ⑯） */
const solveInPage = page => page.evaluate(() => {
    const g = window.smGame;
    for (let n = 0; n < 300 && g.state === 'playing'; n++) {
        const s = g.session;
        const a = s.analysis();
        const i = a.order.find(c => !s.isKnown(c));
        if (i === undefined) {
            const ready = s.view().findIndex((_, j) => s.isCharged(j));
            if (ready < 0) break;
            g.onCell(ready);
            continue;
        }
        g.selected = i;
        g.onDigit(a.values[i]);
    }
    return { state: g.state, score: g.session.score, ranked: g.meta.ranked };
});
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
    const darkNotes = await noteReadability(page);
    check(darkNotes.theme === 'dark' && darkNotes.results.length === 2
        && darkNotes.results.every(x => x.contrast >= 4.5),
    '⑤ 深色笔记：动态雾层/选中态的保守对比度 ≥ 4.5:1', JSON.stringify(darkNotes));
    check(darkNotes.bodyFont.includes('sans-serif') && !darkNotes.bodyFont.includes('Times New Roman')
        && darkNotes.titleFont.includes('serif'),
    '⑤ 界面使用无衬线字体，同时保留标题衬线字', JSON.stringify(darkNotes));
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
    const thinStars = starsFor(model.score, levelById('thin-1').stars);
    const resultStars = await page.$eval('#sm-result-stars', el => ({
        visible: !el.classList.contains('hidden'), n: Number(el.dataset.stars), text: el.textContent, label: el.getAttribute('aria-label'),
    }));
    check(resultStars.visible && resultStars.n === thinStars && resultStars.text === '★'.repeat(thinStars) + '☆'.repeat(3 - thinStars)
        && resultStars.label.includes(String(thinStars)) && !PLACEHOLDER.test(resultStars.label),
    `⑮ 结算星级 = starsFor(${model.score}, [${levelById('thin-1').stars}]) = ${thinStars}`, JSON.stringify(resultStars));
    const resultRank = await page.$eval('#sm-result', el => el.querySelector('.scoreboard-trigger')?.classList.contains('hidden'));
    check(resultRank === true, '⑮ 关卡结算不显示排行榜入口（只有每日榜）');

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
    const menuStars = await page.$eval('#sm-level-thin-1 .sm-level-stars', el => Number(el.dataset.stars));
    const unplayedStars = await page.$('#sm-level-thin-3 .sm-level-stars');
    check(menuStars === thinStars && unplayedStars === null, '⑮ 菜单：通关关卡显示星级，未通关的不显示', String(menuStars));
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

    /* ── 关键回归：roving tabIndex、顺序死局、0 分通关 ── */
    {
        const { page: rp, errs: rerrs } = await open();
        const solution = '534678912672195348198342567859761423426853791713924856961537284287419635345286179';
        const mask = Array(81).fill('1');
        for (const i of [3, 4, 5, 6, 30, 31]) mask[i] = '0';
        await rp.evaluate((givens, maskString) => {
            window.smGame.begin({ kind: 'level', id: 'thin-1', name: { en: 'Regression', zh: '回归' } },
                { givens, window: maskString, cap: 2, reveal: 'cross' });
        }, solution, mask.join(''));
        await clickCell(rp, 6);
        const tab = await rp.evaluate(() => ({
            selected: window.smGame.selected,
            active: document.activeElement?.dataset.cell,
            tabstop: document.querySelector('#sm-board [data-cell="6"]').tabIndex,
            old: document.querySelector('#sm-board [data-cell="40"]').tabIndex,
        }));
        check(tab.selected === 6 && tab.tabstop === 0 && tab.old === -1,
            '⑭ 鼠标选中格同步 roving tabindex', JSON.stringify(tab));
        await rp.focus('#sm-pad [data-digit="1"]');
        await rp.keyboard.down('Shift');
        await rp.keyboard.press('Tab');
        await rp.keyboard.up('Shift');
        const returnedFocus = await rp.evaluate(() => document.activeElement?.dataset.cell);
        check(returnedFocus === '6', '⑭ 从数字键盘 Shift+Tab 返回正确选中格', returnedFocus);
        await rp.keyboard.press('9');
        const charged = await rp.evaluate(() => ({
            isCharged: window.smGame.session.isCharged(5),
            label: document.querySelector('#sm-board [data-cell="5"]').getAttribute('aria-label'),
            classes: document.querySelector('#sm-board [data-cell="5"]').className,
        }));
        check(charged.isCharged && /sm-cell--charged/.test(charged.classes) && /揭雾/.test(charged.label),
            '⑭ 被提前揭开的隐藏题面可点按揭雾且有读屏标签', JSON.stringify(charged));
        await clickCell(rp, 5);
        const used = await rp.evaluate(() => ({
            visible: window.smGame.session.isVisible(4),
            charged: window.smGame.session.isCharged(5),
            inputs: window.smGame.session.inputs,
        }));
        check(used.visible && !used.charged && used.inputs.some(a => a.type === 'activate' && a.cell === 5),
            '⑭ 真实点击题面释放揭雾机会', JSON.stringify(used));

        // 只剩一处雾中数字；先点灯再落子，整局可以合法地获得 0 分。
        await rp.evaluate(givens => {
            localStorage.removeItem('game:sudoku-mist:v1:best:thin-1');
            window.smGame.begin({ kind: 'level', id: 'thin-1', name: { en: 'Zero score', zh: '零分' } },
                { givens, window: '0' + '1'.repeat(80), cap: 2, reveal: 'cross' });
        }, solution);
        await rp.click('#sm-btn-hint');
        await rp.keyboard.press('5');
        const zero = await rp.evaluate(() => ({
            state: window.smGame.state,
            score: window.smGame.session.score,
            stored: localStorage.getItem('game:sudoku-mist:v1:best:thin-1'),
        }));
        await rp.evaluate(() => window.smGame.toMenu());
        const badge = await rp.$eval('#sm-level-thin-1', el => ({
            done: el.classList.contains('sm-level--done'),
            text: el.querySelector('.sm-level-best').textContent,
        }));
        check(zero.state === 'result' && zero.score === 0 && JSON.parse(zero.stored || '{}').score === 0
            && badge.done && badge.text.includes('0'), '⑭ 0 分通关持久化，并在菜单显示完成', JSON.stringify({ zero, badge }));
        await rp.reload({ waitUntil: 'load' });
        await rp.waitForFunction(() => !!window.smGame?.el);
        const restored = await rp.$eval('#sm-level-thin-1', el => ({
            done: el.classList.contains('sm-level--done'),
            text: el.querySelector('.sm-level-best').textContent,
        }));
        check(restored.done && restored.text.includes('0'), '⑭ 刷新后恢复零分通关记录', JSON.stringify(restored));
        check(rerrs.length === 0, '回归场景：无 pageerror', rerrs.join(' | '));
        await rp.close();
    }

    /* ── ⑯ 每日一雾 ── */
    {
        const scores = { posts: [], gets: [] };
        const { page: dp, errs: derrs } = await open({ scores });
        const key = todayKey();
        const daily = generateDaily(key);
        const runSlot = `game:sudoku-mist:v1:daily-run:${key}`;
        const doneSlot = `game:sudoku-mist:v1:daily:${key}`;
        const entry = () => dp.$eval('#sm-daily-btn', el => el.textContent);
        check(/每日一雾/.test(await entry()) && !PLACEHOLDER.test(await entry()), '⑯ 菜单有每日一雾入口', await entry());
        await dp.click('#sm-daily-btn');
        await dp.waitForFunction(() => window.smGame.state === 'playing', { timeout: 8000 });
        const meta = await dp.evaluate(() => ({ ...window.smGame.meta, givens: undefined }));
        check(meta.kind === 'daily' && meta.ranked === true && meta.dateKey === key && meta.seed === daily.seed,
            `⑯ 开局：今天（${key}）的计分局，题面与 Node 侧 generateDaily 一致`, JSON.stringify(meta));
        // 三步真实落子 + 一个笔记
        for (let n = 0; n < 3; n++) {
            const step = await firstDeducible(dp);
            await clickCell(dp, step.cell);
            await clickDigit(dp, step.digit);
        }
        const noteCell = await dp.evaluate(() => window.smGame.session.view().findIndex(v => v.state === 'open' || v.state === 'fog'));
        await clickCell(dp, noteCell);
        await dp.keyboard.down('Shift');
        await dp.keyboard.press('7');
        await dp.keyboard.up('Shift');
        s = await snap(dp);
        check(s.state === 'playing' && !s.reset, '⑯ 计分局有进度时顶栏也没有重开', JSON.stringify(s));
        const saved = await dp.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), runSlot);
        check(saved?.inputs?.length === 3 && saved.seed === daily.seed && saved.notes?.[noteCell] === 1 << 6,
            '⑯ 每次输入后进度写入本地（输入序列 + 笔记）', JSON.stringify(saved));
        await dp.keyboard.press('p');
        const pauseUi = await dp.evaluate(() => ({
            restart: !document.getElementById('sm-btn-restart').classList.contains('hidden'),
            copy: document.getElementById('sm-pause-copy').textContent,
        }));
        check(!pauseUi.restart && /不能重开/.test(pauseUi.copy), '⑯ 暂停浮层：计分局没有重开按钮、说明已保存', JSON.stringify(pauseUi));
        await dp.click('#sm-btn-resume');
        await sleep(1100);
        const before = await dp.evaluate(() => ({ score: window.smGame.session.score, elapsed: window.smGame.elapsedMs() }));
        await dp.evaluate(() => window.smGame.persist());

        // 整页刷新 → 继续
        await dp.reload({ waitUntil: 'load' });
        await dp.waitForFunction(() => !!window.smGame?.el);
        check(/继续 · 已走 3 步/.test(await entry()), '⑯ 刷新后入口显示「继续 · 已走 3 步」（笔记不算步）', await entry());
        await dp.click('#sm-daily-btn');
        await dp.waitForFunction(() => window.smGame.state === 'playing', { timeout: 8000 });
        const resumed = await dp.evaluate(n => ({
            inputs: window.smGame.session.inputs,
            score: window.smGame.session.score,
            note: window.smGame.notes[n],
            elapsed: window.smGame.elapsedMs(),
            message: document.getElementById('sm-message').textContent,
            tracked: window.__tracked,
            hud: Number(document.getElementById('sm-score').textContent),
        }), noteCell);
        check(resumed.inputs.length === 3 && resumed.score === before.score && resumed.hud === before.score
            && resumed.score === replay(daily, resumed.inputs).score,
        `⑯ 恢复：输入序列、分数（${before.score}）与 Node 侧回放一致`, JSON.stringify({ ...resumed, inputs: resumed.inputs.length }));
        check(resumed.note === 1 << 6 && resumed.elapsed >= 1000 && /恢复/.test(resumed.message) && !resumed.tracked.includes('sudoku-mist:play'),
            '⑯ 恢复：笔记、用时、提示文案；续玩不重复上报 play', JSON.stringify(resumed));

        // 排行榜弹窗：静默暂停 → 关闭后继续
        await dp.click('.scoreboard-trigger--icon');
        await dp.waitForFunction(() => document.querySelector('dialog[data-scoreboard-dialog]')?.open, { timeout: 5000 });
        await sleep(200);
        const ranking = await snap(dp);
        await dp.keyboard.press('Escape');
        await dp.waitForFunction(() => !document.querySelector('dialog[data-scoreboard-dialog]')?.open && !window.smGame.isPaused, { timeout: 5000 });
        check(ranking.paused && !ranking.pause && scores.gets.at(-1) === `sudoku-mist-d${key}`,
            '⑯ 排行榜弹窗：读今天的每日榜、静默暂停、关闭后自动继续', JSON.stringify({ paused: ranking.paused, gets: scores.gets }));

        // 推完：只提交一次
        for (let n = 0; n < 90; n++) {
            if (await dp.evaluate(() => window.smGame.state) !== 'playing') break;
            const step = await firstDeducible(dp);
            await clickCell(dp, step.cell);
            await clickDigit(dp, step.digit);
        }
        await dp.waitForFunction(() => !document.getElementById('sm-result').classList.contains('hidden'), { timeout: 5000 });
        await sleep(300);
        const fin = await dp.evaluate((r, d) => ({
            inputs: window.smGame.session.inputs,
            score: Number(document.getElementById('sm-result-score').textContent),
            best: document.getElementById('sm-result-best').textContent,
            stars: document.getElementById('sm-result-stars').classList.contains('hidden'),
            rank: document.querySelector('#sm-result .scoreboard-trigger')?.classList.contains('hidden'),
            run: localStorage.getItem(r),
            done: JSON.parse(localStorage.getItem(d) || 'null'),
        }), runSlot, doneSlot);
        const dailyModel = replay(daily, fin.inputs).summary();
        check(dailyModel.done && fin.score === dailyModel.score && scores.posts.length === 1
            && scores.posts[0].game === `sudoku-mist-d${key}` && scores.posts[0].score === dailyModel.score,
        `⑯ 完成：POST 一次到 sudoku-mist-d${key}，分数 = 回放 ${dailyModel.score}`, JSON.stringify({ dom: fin.score, posts: scores.posts }));
        check(fin.done?.score === dailyModel.score && fin.run === null && /排行榜/.test(fin.best) && fin.stars && fin.rank === false,
            '⑯ 完成标记写入、进度清除、结算说明计入排行榜并显示排行榜入口、无星级', JSON.stringify({ ...fin, inputs: undefined }));

        // 练习局
        await dp.click('#sm-btn-again');
        await dp.waitForFunction(() => window.smGame.state === 'playing', { timeout: 8000 });
        const step = await firstDeducible(dp);
        await clickCell(dp, step.cell);
        await clickDigit(dp, step.digit);
        s = await snap(dp);
        const practice = await dp.evaluate(r => ({ ranked: window.smGame.meta.ranked, run: localStorage.getItem(r) }), runSlot);
        check(practice.ranked === false && s.reset && practice.run === null, '⑯ 再来一局 = 练习局：可以重开、不存进度', JSON.stringify(practice));
        for (let n = 0; n < 90; n++) {
            if (await dp.evaluate(() => window.smGame.state) !== 'playing') break;
            const st = await firstDeducible(dp);
            await clickCell(dp, st.cell);
            await clickDigit(dp, st.digit);
        }
        await dp.waitForFunction(() => !document.getElementById('sm-result').classList.contains('hidden'), { timeout: 5000 });
        const practiceBest = await dp.$eval('#sm-result-best', el => el.textContent);
        check(scores.posts.length === 1 && practiceBest.includes(String(dailyModel.score)) && /练习/.test(practiceBest),
            '⑯ 练习局完成不再提交，结算显示今天的计分成绩', JSON.stringify({ posts: scores.posts.length, practiceBest }));
        await dp.click('#sm-btn-menu');
        check(/已完成/.test(await entry()) && (await entry()).includes(String(dailyModel.score)), '⑯ 菜单入口显示已完成与分数', await entry());
        check(derrs.length === 0, '每日局：无 pageerror', derrs.join(' | '));
        await dp.close();
    }

    /* ── ⑰ 每日一雾边界 ── */
    {
        const scores = { posts: [], gets: [], hold: false, held: [] };
        const key = todayKey();
        const runSlot = `game:sudoku-mist:v1:daily-run:${key}`;
        const doneSlot = `game:sudoku-mist:v1:daily:${key}`;
        const { page: a, errs: aerrs } = await open({ scores });
        await a.evaluate((r, d) => { localStorage.removeItem(r); localStorage.removeItem(d); localStorage.removeItem('scoreboard:pending:v1'); }, runSlot, doneSlot);
        const { page: b, errs: berrs } = await open({ scores });
        // 两个标签页同时只有一个在前台；后台的那个会自动暂停（且不自动继续）。操作哪页先把它切到前台再继续
        const front = async p => {
            await p.bringToFront();
            await p.evaluate(() => { const g = window.smGame; if (g.state === 'playing' && g.isPaused) g.resume(); });
        };
        const enterDaily = async p => {
            await p.click('#sm-daily-btn');
            await p.waitForFunction(() => !document.getElementById('sm-start').hasAttribute('aria-busy')
                && (window.smGame.state === 'playing' || document.getElementById('sm-start-status').textContent), { timeout: 8000 });
        };
        await front(a);
        await a.evaluate(() => window.smGame.toMenu());
        await enterDaily(a);
        // A 拿着今天的锁：B 点进来被拒绝，留在菜单说明原因
        await front(b);
        await b.evaluate(() => window.smGame.toMenu());
        await enterDaily(b);
        const refused = await b.evaluate(() => ({
            state: window.smGame.state, ranked: window.smGame.isRanked(), status: document.getElementById('sm-start-status').textContent,
        }));
        // A 完成：POST 还在路上时，成绩已经在本地重试队列里
        scores.hold = true;
        await front(a);
        const aDone = await solveInPage(a);
        await sleep(300);
        const inFlight = await a.evaluate(() => JSON.parse(localStorage.getItem('scoreboard:pending:v1') || '[]'));
        check(refused.state === 'menu' && !refused.ranked && /另一个标签页/.test(refused.status)
            && aDone.state === 'result' && aDone.ranked === true
            && scores.held.length === 1 && inFlight.length === 1 && inFlight[0].game === `sudoku-mist-d${key}` && inFlight[0].score === aDone.score,
        '⑰ A 在计分局里时 B 进不来（留在菜单说明原因）；A 完成后 POST 未返回时成绩已在本地重试队列',
        JSON.stringify({ refused, aDone, held: scores.held.length, inFlight }));
        scores.hold = false;
        for (const req of scores.held.splice(0)) {
            void req.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"ok":true}' });
        }
        await a.waitForFunction(() => JSON.parse(localStorage.getItem('scoreboard:pending:v1') || '[]').length === 0, { timeout: 5000 })
            .catch(() => {});
        const afterAck = await a.evaluate(() => JSON.parse(localStorage.getItem('scoreboard:pending:v1') || '[]').length);
        check(afterAck === 0, '⑰ Worker 确认后成绩从本地重试队列移除', String(afterAck));
        // A 完成就放开锁：B 再进是练习局；完成后不提交、不覆盖 A 的成绩
        await front(b);
        await enterDaily(b);
        const bDone = await solveInPage(b);
        await sleep(1100);
        const bView = await b.evaluate(d => ({
            done: JSON.parse(localStorage.getItem(d) || 'null'),
            best: document.getElementById('sm-result-best').textContent,
        }), doneSlot);
        check(bDone.state === 'result' && bDone.ranked === false && scores.posts.length === 1
            && bView.done?.score === aDone.score && /练习/.test(bView.best),
        '⑰ A 完成后 B 再进是练习局：只 POST 一次、不覆盖第一次的成绩', JSON.stringify({ bDone, posts: scores.posts.length, bView }));
        // 完成那一刻再查完成标记（兜底）：计分局还在手上，但别处已经写了今天的完成标记 → 降为练习局
        await a.evaluate((r, d) => { localStorage.removeItem(r); localStorage.removeItem(d); window.smGame.dailyCleared.clear(); window.smGame.toMenu(); }, runSlot, doneSlot);
        await front(a);
        await enterDaily(a);
        await a.waitForFunction(() => window.smGame.state === 'playing' && window.smGame.isRanked(), { timeout: 8000 });
        await a.evaluate(d => localStorage.setItem(d, JSON.stringify({ score: 7, time: 1 })), doneSlot);
        const posts2 = scores.posts.length;
        const late = await solveInPage(a);
        const lateDone = await a.evaluate(d => JSON.parse(localStorage.getItem(d) || 'null'), doneSlot);
        check(late.ranked === false && scores.posts.length === posts2 && lateDone?.score === 7,
            '⑰ 完成时发现别处已写完成标记：降为练习局、不提交、不覆盖', JSON.stringify({ late, lateDone }));
        await b.close();
        await a.close();

        // 完成标记写不进存储：进度不清；本页再进仍是练习局（新开一页：A 的内存里已经记着今天完成过）
        const { page: c, errs: cerrs } = await open({ scores });
        await c.evaluate((r, d) => {
            localStorage.removeItem(r); localStorage.removeItem(d);
            window.smGame.toMenu();
        }, runSlot, doneSlot);
        await c.click('#sm-daily-btn');
        await c.waitForFunction(() => window.smGame.state === 'playing' && window.smGame.meta.ranked === true, { timeout: 8000 });
        await c.evaluate(d => {
            const real = window.Storage.prototype.setItem;
            window.Storage.prototype.setItem = function (k, v) {
                if (k === d) throw new Error('QuotaExceededError');
                return real.call(this, k, v);
            };
        }, doneSlot);
        const posts0 = scores.posts.length;
        const cDone = await solveInPage(c);
        const failed = await c.evaluate((r, d) => ({
            run: JSON.parse(localStorage.getItem(r) || 'null')?.inputs.length ?? -1,
            full: window.smGame.session.inputs.length,
            done: localStorage.getItem(d),
        }), runSlot, doneSlot);
        await c.evaluate(() => window.smGame.again());
        await c.waitForFunction(() => window.smGame.state === 'playing', { timeout: 8000 });
        const again = await c.evaluate(() => window.smGame.meta.ranked);
        check(cDone.ranked === true && scores.posts.length === posts0 + 1 && failed.run === failed.full && failed.done === null && again === false,
            '⑰ 完成标记写失败：照常提交、进度存成含最后一步的完整输入、本页「再来一局」仍是练习局', JSON.stringify({ cDone, failed, again }));
        // 练习局完成：完成标记没落盘，不能删掉恢复数据
        const practiceDone = await solveInPage(c);
        const kept = await c.evaluate(r => JSON.parse(localStorage.getItem(r) || 'null')?.inputs.length ?? -1, runSlot);
        check(practiceDone.state === 'result' && practiceDone.ranked === false && kept === failed.full,
            '⑰ 完成标记写失败后的练习局完成：恢复数据保留', JSON.stringify({ practiceDone, kept }));
        // 刷新（存储恢复正常）：按完整输入重放到 done，直接结算出原来的分数并写好完成标记
        await c.reload({ waitUntil: 'load' });
        await c.waitForFunction(() => !!window.smGame?.el);
        await c.click('#sm-daily-btn');
        await c.waitForFunction(() => !document.getElementById('sm-result').classList.contains('hidden'), { timeout: 8000 });
        const restoredDone = await c.evaluate((r, d) => ({
            score: Number(document.getElementById('sm-result-score').textContent),
            done: JSON.parse(localStorage.getItem(d) || 'null'),
            run: localStorage.getItem(r),
        }), runSlot, doneSlot);
        check(restoredDone.score === cDone.score && restoredDone.done?.score === cDone.score && restoredDone.run === null,
            `⑰ 刷新后恢复已完成的结果：分数 ${cDone.score}、补写完成标记、清进度`, JSON.stringify(restoredDone));
        // 昨天的每日成绩没等到确认：今天进页也要补交（按它自己的榜单键）
        const yesterday = todayKey(Date.now() - 24 * 3600 * 1000);
        await c.evaluate(y => {
            localStorage.setItem('scoreboard:pending:v1', JSON.stringify([{ game: `sudoku-mist-d${y}`, name: 'Tester', score: 321, at: Date.now() - 3600 * 1000 }]));
        }, yesterday);
        const posts1 = scores.posts.length;
        await c.reload({ waitUntil: 'load' });
        await c.waitForFunction(() => JSON.parse(localStorage.getItem('scoreboard:pending:v1') || '[]').length === 0, { timeout: 5000 })
            .catch(() => {});
        const recovered = scores.posts.slice(posts1);
        const left = await c.evaluate(() => JSON.parse(localStorage.getItem('scoreboard:pending:v1') || '[]').length);
        check(recovered.some(p => p.game === `sudoku-mist-d${yesterday}` && p.score === 321) && left === 0,
            `⑰ 进页补交昨天（${yesterday}）未确认的每日成绩，确认后出队`, JSON.stringify({ recovered, left }));
        check(aerrs.length === 0 && berrs.length === 0 && cerrs.length === 0, '⑰ 无 pageerror', [...aerrs, ...berrs, ...cerrs].join(' | '));
        await c.close();
    }

    /* ── 请求竞态、兼容边界与离线补交 ── */
    {
        const scores = { posts: [], gets: [] };
        // Fixed-date fixtures must not share today's completion left by earlier scenarios.
        const context = await browser.createBrowserContext();
        const { page: p, errs } = await open({ scores, context });
        check(await p.evaluate(() => !Object.keys(localStorage).some(k => k.startsWith('game:sudoku-mist:v1:daily'))),
            '固定日期回归使用独立存储，不受此前每日完成记录影响');
        const key = '20261021';
        // 锁授予前另一个页面完成：必须在锁内重读完成状态，不能开始第二个计分局。
        const raced = await p.evaluate(async date => {
            const g = window.smGame;
            const acquire = g.daily.acquire;
            g.daily.acquire = async k => {
                localStorage.setItem(`game:sudoku-mist:v1:daily:${k}`, JSON.stringify({ score: 123, time: 10 }));
                return acquire(k);
            };
            await g.startDaily(date);
            g.daily.acquire = acquire;
            return { ranked: g.isRanked(), held: g.daily.holds(date) };
        }, key);
        check(!raced.ranked && !raced.held, '拿锁后重读完成标记：等待期间完成的每日题只能练习', JSON.stringify(raced));
        const repeated = await p.evaluate(async () => {
            const g = window.smGame;
            g.toMenu();
            const acquire = g.daily.acquire;
            const callbacks = [];
            let entered;
            const waiting = new Promise(resolve => { entered = resolve; });
            g.daily.acquire = date => new Promise(resolve => {
                callbacks.push(() => acquire(date).then(resolve));
                entered();
            });
            const first = g.startDaily('20261025');
            await waiting;
            const second = g.startDaily('20261025');
            const third = g.startDaily('20261025');
            await new Promise(resolve => setTimeout(resolve, 80));
            await Promise.all(callbacks.map(cb => cb()));
            await Promise.all([first, second, third]);
            g.daily.acquire = acquire;
            return { requests: callbacks.length, shared: first === second && second === third,
                state: g.state, ranked: g.isRanked(), held: g.daily.holds('20261025'), status: g.el.status.textContent };
        });
        check(repeated.requests === 1 && repeated.shared && repeated.state === 'playing' && repeated.ranked
            && repeated.held && repeated.status === '',
        '同页连续点击在锁回调延迟时共享同一次开局，不会误报其他标签页', JSON.stringify(repeated));
        const cached = await p.evaluate(async () => {
            const g = window.smGame;
            await g.startDaily('20261024');
            g.hint();
            const length = g.session.inputs.length;
            window.dispatchEvent(new window.PageTransitionEvent('pagehide', { persisted: true }));
            window.dispatchEvent(new window.PageTransitionEvent('pageshow', { persisted: true }));
            const result = { state: g.state, held: g.daily.holds('20261024') };
            await g.startDaily('20261024');
            return { ...result, resumed: g.session.inputs.length === length, reacquired: g.daily.holds('20261024') };
        });
        check(cached.state === 'menu' && !cached.held && cached.resumed && cached.reacquired,
            '页面缓存恢复回菜单，续玩必须重新拿锁并恢复输入', JSON.stringify(cached));
        const canceled = await p.evaluate(async () => {
            const g = window.smGame;
            const pending = g.startDaily('20261022');
            g.startLevel(0);
            await pending;
            return { kind: g.meta.kind, held: g.daily.holds('20261022') };
        });
        check(canceled.kind === 'level' && !canceled.held, '切换章节后迟到的每日开局不能覆盖新关卡', JSON.stringify(canceled));
        // Selecting Free then Daily in the same event loop: only the latest
        // request may commit a game after the earlier free-play timeout fires.
        const freeThenDaily = await p.evaluate(async () => {
            const g = window.smGame;
            g.toMenu();
            const free = g.startFree('first', 10101);
            const daily = g.startDaily('20261027');
            await Promise.all([free, daily]);
            return { kind: g.meta?.kind, dateKey: g.meta?.dateKey,
                ranked: g.isRanked(), held: g.daily.holds('20261027') };
        });
        check(freeThenDaily.kind === 'daily' && freeThenDaily.dateKey === '20261027'
            && freeThenDaily.ranked && freeThenDaily.held,
        '自由局等待出题时选择每日局：最新的每日选择胜出，不被旧自由回调覆盖', JSON.stringify(freeThenDaily));
        const readFailure = await p.evaluate(async () => {
            const g = window.smGame;
            g.toMenu();
            const date = '20261026';
            const slot = `game:sudoku-mist:v1:daily-run:${date}`;
            await g.startDaily(date);
            g.hint();
            const before = { inputs: g.session.inputs.length, score: g.session.summary().score };
            g.toMenu(); // release and reacquire: in-memory state is now from an old lease
            const original = window.Storage.prototype.getItem;
            let refused;
            window.Storage.prototype.getItem = function (k) {
                if (k === slot) throw new Error('SecurityError');
                return original.call(this, k);
            };
            try {
                await g.startDaily(date);
                refused = { state: g.state, status: g.el.status.textContent,
                    stored: JSON.parse(original.call(localStorage, slot) || 'null')?.inputs.length };
            } finally { window.Storage.prototype.getItem = original; }
            await g.startDaily(date);
            return { before, refused, after: { state: g.state, ranked: g.isRanked(),
                inputs: g.session.inputs.length, score: g.session.summary().score } };
        });
        check(readFailure.before.inputs > 0 && readFailure.refused.state === 'menu'
            && /无法读取/.test(readFailure.refused.status)
            && readFailure.refused.stored === readFailure.before.inputs
            && readFailure.after.state === 'playing' && readFailure.after.ranked
            && readFailure.after.inputs === readFailure.before.inputs
            && readFailure.after.score === readFailure.before.score,
        '新租约读存档失败：拒绝计分开局；读取恢复后保留原输入和分数', JSON.stringify(readFailure));
        const completionReadFailure = await p.evaluate(async () => {
            const g = window.smGame;
            g.toMenu();
            const date = '20261029';
            const slot = `game:sudoku-mist:v1:daily:${date}`;
            const original = window.Storage.prototype.getItem;
            window.Storage.prototype.getItem = function (k) {
                if (k === slot) throw new Error('SecurityError');
                return original.call(this, k);
            };
            try {
                await g.startDaily(date);
                return { state: g.state, status: g.el.status.textContent,
                    run: original.call(localStorage, `game:sudoku-mist:v1:daily-run:${date}`) };
            } finally { window.Storage.prototype.getItem = original; }
        });
        check(completionReadFailure.state === 'menu' && completionReadFailure.run === null
            && /无法读取/.test(completionReadFailure.status),
        '完成标记读取失败同样阻止开启新的计分局，不写进度', JSON.stringify(completionReadFailure));
        // A stale menu must not open today's ranked run after UTC+8 midnight.
        const rollover = await p.evaluate(async () => {
            const g = window.smGame;
            g.toMenu();
            const now = Date.now;
            const oldKey = '20261018', newKey = '20261019';
            const oldDone = `game:sudoku-mist:v1:daily:${oldKey}`;
            localStorage.setItem(oldDone, JSON.stringify({ score: 432, time: 12000 }));
            try {
                Date.now = () => Date.UTC(2026, 9, 18, 15, 59, 50);
                g.renderDailyEntry();
                const advertised = g.el.daily.textContent;
                Date.now = () => Date.UTC(2026, 9, 18, 16, 0, 10);
                document.getElementById('sm-daily-btn').click();
                await new Promise(resolve => setTimeout(resolve, 110));
                return { advertised, updated: g.el.daily.textContent,
                    state: g.state, status: g.el.status.textContent,
                    held: g.daily.holds(newKey),
                    todayRun: localStorage.getItem(`game:sudoku-mist:v1:daily-run:${newKey}`) };
            } finally {
                Date.now = now;
                g.toMenu();
            }
        });
        check(rollover.advertised.includes('2026-10-18') && rollover.advertised.includes('432')
            && rollover.updated.includes('2026-10-19') && rollover.state === 'menu'
            && /新的一天/.test(rollover.status) && !rollover.held && rollover.todayRun === null,
        '跨 UTC+8 午夜后，旧练习入口只刷新日期，不误开启今天的计分局', JSON.stringify(rollover));
        // 页面启动时离线；连网事件必须补交昨日队列，而不要求刷新/打开榜单。
        scores.offline = true;
        await p.evaluate(() => {
            localStorage.setItem('scoreboard:pending:v1', JSON.stringify([
                { game: 'sudoku-mist-d20261018', name: 'Offline', score: 234, at: Date.now() },
            ]));
            window.dispatchEvent(new Event('online'));
        });
        await sleep(500);
        check(await p.evaluate(() => JSON.parse(localStorage.getItem('scoreboard:pending:v1')).length === 1),
            '离线失败不会删除补交成绩');
        scores.offline = false;
        await p.evaluate(() => window.dispatchEvent(new Event('online')));
        await p.waitForFunction(() => JSON.parse(localStorage.getItem('scoreboard:pending:v1') || '[]').length === 0);
        check(scores.posts.some(x => x.game === 'sudoku-mist-d20261018' && x.score === 234), '重新连网后自动按原日期补交成绩');
        // 不支持 Web Locks：禁止计分，不写进度；章节仍可用。
        await p.evaluateOnNewDocument(() => Object.defineProperty(navigator, 'locks', { value: undefined }));
        await p.reload({ waitUntil: 'load' });
        await p.waitForFunction(() => !!window.smGame?.el);
        const unsupported = await p.evaluate(async () => {
            const g = window.smGame;
            await g.startDaily('20261023');
            const result = { state: g.state, ranked: g.isRanked(), status: g.el.status.textContent,
                run: localStorage.getItem('game:sudoku-mist:v1:daily-run:20261023') };
            g.startLevel(0);
            result.chapter = g.state;
            return result;
        });
        check(unsupported.state === 'menu' && !unsupported.ranked && unsupported.run === null
            && /Web Locks/.test(unsupported.status) && unsupported.chapter === 'playing',
        '不支持 Web Locks 时拒绝计分并说明原因，章节仍可玩', JSON.stringify(unsupported));
        check(errs.length === 0, '请求竞态与兼容边界无 pageerror', errs.join(' | '));
        await context.close();
    }

    /* ── ⑱ 每日一雾：同一时刻一个标签页、内存检查点 ── */
    {
        const scores = { posts: [], gets: [], hold: false, held: [] };
        const key = todayKey();
        const runSlot = `game:sudoku-mist:v1:daily-run:${key}`;
        const doneSlot = `game:sudoku-mist:v1:daily:${key}`;
        const stored = p => p.evaluate(r => JSON.parse(localStorage.getItem(r) || 'null')?.inputs.length ?? -1, runSlot);
        const front = async p => {
            await p.bringToFront();
            await p.evaluate(() => { const g = window.smGame; if (g.state === 'playing' && g.isPaused) g.resume(); });
        };
        const enterDaily = async p => {
            await p.click('#sm-daily-btn');
            await p.waitForFunction(() => window.smGame.state === 'playing', { timeout: 8000 });
        };
        const { page: a, errs: aerrs } = await open({ scores });
        await a.evaluate((r, d) => { localStorage.removeItem(r); localStorage.removeItem(d); window.smGame.toMenu(); }, runSlot, doneSlot);
        await enterDaily(a);
        await stepInPage(a, 3);
        await a.evaluate(() => window.smGame.toMenu());
        // A 回菜单放开锁；B 接着存档里的 3 步玩到 7 步。B 在局里时 A 进不来
        const { page: b, errs: berrs } = await open({ scores });
        await front(b);
        await enterDaily(b);
        const bResumed = await b.evaluate(() => window.smGame.session.inputs.length);
        await stepInPage(b, 4);
        await front(a);
        await a.click('#sm-daily-btn');
        await a.waitForFunction(() => !document.getElementById('sm-start').hasAttribute('aria-busy') && document.getElementById('sm-start-status').textContent, { timeout: 8000 });
        const aRefused = await a.evaluate(() => ({ state: window.smGame.state, status: document.getElementById('sm-start-status').textContent }));
        const whileB = await stored(a);
        await front(b);
        await b.evaluate(() => window.smGame.toMenu());
        // A 再进：存档在它离开后被 B 写过，以存档（7 步）为准，不用自己过期的内存检查点（3 步）
        await front(a);
        await enterDaily(a);
        const aTook = await a.evaluate(() => window.smGame.session.inputs.length);
        await a.evaluate(() => window.smGame.persist());
        const afterA = await stored(a);
        check(bResumed === 3 && aRefused.state === 'menu' && /另一个标签页/.test(aRefused.status) && whileB === 7,
            '⑱ B 在局里时 A 进不来、也不会覆盖 B 的进度（7 步）', JSON.stringify({ bResumed, aRefused, whileB }));
        check(aTook === 7 && afterA === 7, '⑱ B 离开后 A 再进：接着存档里的 7 步（不用自己过期的 3 步）', JSON.stringify({ aTook, afterA }));
        await b.close();
        check(aerrs.length === 0 && berrs.length === 0, '⑱ 两个标签页：无 pageerror', [...aerrs, ...berrs].join(' | '));
        await a.close();

        // 进度写不进存储：回菜单再进，用本页内存检查点
        const { page: c, errs: cerrs } = await open({ scores });
        await c.evaluate((r, d) => { localStorage.removeItem(r); localStorage.removeItem(d); window.smGame.toMenu(); }, runSlot, doneSlot);
        await enterDaily(c);
        await stepInPage(c, 2);
        await c.evaluate(r => {
            const real = window.Storage.prototype.setItem;
            window.__restoreProgressWrites = () => { window.Storage.prototype.setItem = real; };
            window.Storage.prototype.setItem = function (k, v) {
                if (k === r) throw new Error('QuotaExceededError');
                return real.call(this, k, v);
            };
        }, runSlot);
        const before = await stepInPage(c, 3, { wrong: true });
        await c.evaluate(() => window.smGame.toMenu());
        const entryText = await c.$eval('#sm-daily-btn', el => el.textContent);
        await enterDaily(c);
        const back = await c.evaluate(r => ({
            inputs: window.smGame.session.inputs.length,
            mistakes: window.smGame.session.summary().mistakes,
            stored: JSON.parse(localStorage.getItem(r) || 'null')?.inputs.length ?? -1,
            message: window.smGame.el.message.textContent,
        }), runSlot);
        check(before.inputs === 6 && before.mistakes === 1 && back.stored === 2 && back.inputs === 6 && back.mistakes === 1
            && entryText.includes('6') && /无法保存/.test(back.message),
        '⑱ 进度写不进存储：回菜单再进仍是 6 步、失误 1 次（存储里只有 2 步）', JSON.stringify({ before, back, entryText }));
        // 即使原页回了菜单，第二页也不能用旧的 2 步接手；恢复后应交接完整 6 步。
        await c.evaluate(() => window.smGame.toMenu());
        const { page: blocked, errs: blockedErrors } = await open({ scores });
        const refusedDirty = await blocked.evaluate(async () => {
            await window.smGame.startDaily();
            return window.smGame.state;
        });
        const warning = await c.$eval('#sm-start-status', el => el.textContent);
        check(refusedDirty === 'menu' && /无法保存/.test(warning),
            '⑱ 未落盘的检查点保留独占锁并提示未保存，第二页不能从旧进度接手', warning);
        await c.evaluate(() => { window.__restoreProgressWrites(); window.smGame.toMenu(); });
        await blocked.evaluate(() => window.smGame.startDaily());
        const recoveredDirty = await blocked.evaluate(() => ({ inputs: window.smGame.session.inputs.length,
            mistakes: window.smGame.session.summary().mistakes }));
        check(recoveredDirty.inputs === 6 && recoveredDirty.mistakes === 1,
            '⑱ 存储恢复后先补存再交接，另一页保留全部输入和失误', JSON.stringify(recoveredDirty));
        check(blockedErrors.length === 0, '⑱ 接手页无 pageerror', blockedErrors.join(' | '));
        await blocked.close();
        check(cerrs.length === 0, '⑱ 写失败：无 pageerror', cerrs.join(' | '));
        await c.close();
    }

    /* ── ⑳ 锁丢失后跨标签页接管/恢复的端到端回归 ── */
    {
        const context = await browser.createBrowserContext();
        const { page: a, errs: aerrs } = await open({ context });
        const date = '20261030';
        const runSlot = `game:sudoku-mist:v1:daily-run:${date}`;
        const oldDirty = await a.evaluate(async (key, slot) => {
            const g = window.smGame;
            await g.startDaily(key);
            g.hint(); // rev 1 reaches localStorage
            const originalSet = window.Storage.prototype.setItem;
            try {
                window.Storage.prototype.setItem = function (k, v) {
                    if (k === slot) throw new Error('QuotaExceededError');
                    return originalSet.call(this, k, v);
                };
                g.hint(); // rev 2 lives only in A's memory
                const inputs = g.session.inputs.length;
                g.toMenu(); // failed flush retains the original lock
                window.dispatchEvent(new window.PageTransitionEvent('pagehide', { persisted: true }));
                return { inputs, held: g.daily.holds(key) };
            } finally {
                window.Storage.prototype.setItem = originalSet;
            }
        }, date, runSlot);
        const { page: b, errs: berrs } = await open({ context });
        await b.bringToFront();
        const newer = await b.evaluate(async (key, slot) => {
            const g = window.smGame;
            await g.startDaily(key);
            if (g.isPaused) g.resume();
            const initially = g.session.inputs.length;
            g.hint();
            g.hint();
            g.toMenu();
            const stored = JSON.parse(localStorage.getItem(slot) || 'null');
            return { initially, inputs: stored?.inputs.length, rev: stored?.rev };
        }, date, runSlot);
        await a.bringToFront();
        const staleAttempt = await a.evaluate(async (key, slot) => {
            const g = window.smGame;
            const originalGet = window.Storage.prototype.getItem;
            window.Storage.prototype.getItem = function (k) {
                if (k === slot) throw new Error('SecurityError');
                return originalGet.call(this, k);
            };
            let refused;
            try {
                await g.startDaily(key);
                const raw = originalGet.call(localStorage, slot);
                refused = { state: g.state, status: g.el.status.textContent,
                    snapshot: raw && JSON.parse(raw) };
            } finally {
                window.Storage.prototype.getItem = originalGet;
            }
            await g.startDaily(key);
            return { refused, resumed: { state: g.state, inputs: g.session.inputs.length } };
        }, date, runSlot);
        check(oldDirty.inputs === 2 && !oldDirty.held && newer.initially === 1
            && newer.inputs === 3 && newer.rev === 3
            && staleAttempt.refused.state === 'menu'
            && /无法读取/.test(staleAttempt.refused.status)
            && staleAttempt.refused.snapshot?.inputs.length === newer.inputs
            && staleAttempt.refused.snapshot?.rev === newer.rev
            && staleAttempt.resumed.state === 'playing'
            && staleAttempt.resumed.inputs === newer.inputs,
        '⑳ A 失锁、B 写入新版进度后，A 新锁读失败绝不回写旧 dirty；恢复后采用 B 的 3 步',
        JSON.stringify({ oldDirty, newer, staleAttempt }));

        const recoveredDirty = await a.evaluate(async () => {
            const g = window.smGame;
            g.toMenu();
            const key = '20261031';
            const slot = `game:sudoku-mist:v1:daily-run:${key}`;
            await g.startDaily(key);
            if (g.isPaused) g.resume();
            g.hint(); // persist base rev 1
            const originalSet = window.Storage.prototype.setItem;
            let inputs;
            try {
                window.Storage.prototype.setItem = function (k, v) {
                    if (k === slot) throw new Error('QuotaExceededError');
                    return originalSet.call(this, k, v);
                };
                g.hint(); // newer memory only
                inputs = g.session.inputs.length;
                g.toMenu();
                window.dispatchEvent(new window.PageTransitionEvent('pagehide', { persisted: true }));
            } finally {
                window.Storage.prototype.setItem = originalSet;
            }
            await g.startDaily(key);
            const restored = { state: g.state, ranked: g.isRanked(),
                inputs: g.session.inputs.length, dirty: g.daily.unsaved };
            g.toMenu();
            const finalSave = JSON.parse(localStorage.getItem(slot) || 'null');
            return { inputs, restored, saved: finalSave?.inputs.length };
        });
        check(recoveredDirty.inputs === 2 && recoveredDirty.restored.state === 'playing'
            && recoveredDirty.restored.ranked && recoveredDirty.restored.inputs === 2
            && recoveredDirty.restored.dirty && recoveredDirty.saved === 2,
        '⑳ 未被其他标签页修改的 dirty 检查点，失锁重获后保留全部输入并补存',
        JSON.stringify(recoveredDirty));
        check(aerrs.length === 0 && berrs.length === 0,
            '⑳ 锁恢复的双标签页回归没有 pageerror', [...aerrs, ...berrs].join(' | '));
        await context.close();
    }

    /* ── ⑲ 锁的边界：暂停租约下续上存档、关掉拿锁的标签页 ── */
    {
        const scores = { posts: [], gets: [], hold: false, held: [] };
        const key = todayKey();
        const runSlot = `game:sudoku-mist:v1:daily-run:${key}`;
        const doneSlot = `game:sudoku-mist:v1:daily:${key}`;
        const stored = p => p.evaluate(r => JSON.parse(localStorage.getItem(r) || 'null'), runSlot);
        const front = async p => {
            await p.bringToFront();
            await p.evaluate(() => { const g = window.smGame; if (g.state === 'playing' && g.isPaused) g.resume(); });
        };
        const setHidden = (p, v) => p.evaluate(h => {
            Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
            document.dispatchEvent(new Event('visibilitychange'));
        }, v);
        // 暂停租约（后台）持有时续上：invalidate 静默暂停并存档，不能被当成「被接手」
        const { page: d, errs: derrs } = await open({ scores });
        await d.evaluate((r, k) => { localStorage.removeItem(r); localStorage.removeItem(k); window.smGame.toMenu(); }, runSlot, doneSlot);
        await d.click('#sm-daily-btn');
        await d.waitForFunction(() => window.smGame.state === 'playing', { timeout: 8000 });
        await stepInPage(d, 2);
        await d.reload({ waitUntil: 'load' });
        await d.waitForFunction(() => !!window.smGame?.el);
        await setHidden(d, true);
        await d.evaluate(() => window.smGame.startDaily());
        await sleep(100);
        const leased = await d.evaluate(() => ({
            state: window.smGame.state, paused: window.smGame.isPaused, ranked: window.smGame.isRanked(),
            inputs: window.smGame.session.inputs.length, held: window.smGame.pauseOwnership.isHeld('hidden'),
        }));
        const leasedRun = await stored(d);
        await setHidden(d, false);
        await d.evaluate(() => window.smGame.resume());
        const after = await d.evaluate(() => ({ state: window.smGame.state, ranked: window.smGame.isRanked() }));
        check(leased.state === 'playing' && leased.paused && leased.held && leased.ranked && leased.inputs === 2
            && leasedRun?.inputs.length === 2 && after.state === 'playing' && after.ranked,
        '⑲ 后台暂停租约下续上存档：静默暂停、仍是计分局（没被误判为过期）、回前台可继续', JSON.stringify({ leased, leasedRun: leasedRun?.inputs.length, after }));

        // 拿着锁的标签页关掉：浏览器自动放锁，另一个标签页就能进来接着玩
        await stepInPage(d, 1);
        const { page: e, errs: eerrs } = await open({ scores });
        await front(e);
        await e.click('#sm-daily-btn');
        await e.waitForFunction(() => !document.getElementById('sm-start').hasAttribute('aria-busy') && document.getElementById('sm-start-status').textContent, { timeout: 8000 });
        const refused = await e.evaluate(() => ({ state: window.smGame.state, status: document.getElementById('sm-start-status').textContent }));
        await d.close();
        await e.click('#sm-daily-btn');
        await e.waitForFunction(() => window.smGame.state === 'playing' && window.smGame.isRanked(), { timeout: 8000 });
        const eTook = await e.evaluate(() => window.smGame.session.inputs.length);
        check(refused.state === 'menu' && /另一个标签页/.test(refused.status) && eTook === 3,
            '⑲ 拿着锁的标签页关掉后锁自动放开：另一个标签页进来接着 3 步', JSON.stringify({ refused, eTook }));
        check(derrs.length === 0 && eerrs.length === 0, '⑲ 无 pageerror', [...derrs, ...eerrs].join(' | '));
        await e.close();
    }

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
        const lightNotes = await noteReadability(lp);
        check(lightNotes.theme === 'light' && lightNotes.results.length === 2
            && lightNotes.results.every(x => x.contrast >= 4.5),
        '⑫ 浅色笔记：选中/未选中均有 ≥ 4.5:1 的保守对比度', JSON.stringify(lightNotes));
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
