#!/usr/bin/env node
/**
 * smoke-index — index.html 落地页运行时冒烟（P4-1 内联抽离后的回归防线）。
 * 用法：node tests/smoke-index.mjs [http://127.0.0.1:PORT]
 * 断言：module 脚本执行（i18n 注入）、daily hub 更新、卡片渲染、语言切换、CSS 生效、无页面错误。
 * 语言态必须显式 setItem('site_lang')（headless 默认 en-US，见 verify 教训）。
 * P2：「新」胶囊按 UTC+8 今天运行时判定，所以页面时钟冻结在 FROZEN_NOW，期望集合从
 * registry 的 addedAt 用同一时刻算出；另验一个远期时钟下没有任何「新」胶囊。筛选条：
 * 每个按钮的可见卡数 = registry 计数、hash 往返、后退、直链 #cat=、非法 hash 退回全部。
 */
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';
import { registry } from './lib/registry.mjs';

const FROZEN_NOW = Date.UTC(2026, 9, 15, 4); // 2026-10-15 12:00 UTC+8
const FAR_FUTURE = Date.UTC(2030, 0, 1, 4);
const NEW_DAYS = 45;
const GAMES = registry.all();
const HOME = registry.site().home;
const ALL_HOME = [...GAMES.map(g => ({ id: g.id, h: g.home, daily: (g.caps || []).includes('daily') })),
    ...HOME.externalGames.map(g => ({ id: g.id, h: g, daily: false }))];
const expectNew = now => {
    const d = new Date(now + 8 * 3600 * 1000);
    const today = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    return ALL_HOME.filter(({ h }) => {
        if (!h.addedAt) return false;
        const [y, m, day] = h.addedAt.split('-').map(Number);
        const age = (today - Date.UTC(y, m - 1, day)) / 86400000;
        return age >= 0 && age < NEW_DAYS;
    }).map(e => e.id).sort();
};

const BASE = process.argv.find(a => a.startsWith('http')) || 'http://127.0.0.1:8899';
const fails = [];
const fail = msg => fails.push(msg);

const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: LAUNCH_ARGS,
});

async function loadPage(lang, { now = FROZEN_NOW, hash = '' } = {}) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e.message || e).split('\n')[0]));
    await page.evaluateOnNewDocument((l, fixed) => {
        try { localStorage.setItem('site_lang', l); } catch (e) { /* ignore */ }
        // 冻结「今天」：无参 new Date() 与 Date.now() 返回固定时刻，其余构造照旧
        const RealDate = Date;
        class FrozenDate extends RealDate {
            constructor(...args) { if (args.length) super(...args); else super(fixed); }
            static now() { return fixed; }
        }
        globalThis.Date = FrozenDate;
    }, lang, now);
    await page.goto(`${BASE}/index.html${hash}`, { waitUntil: 'networkidle0', timeout: 30000 });
    return { page, errs };
}

const newChipIds = page => page.evaluate(() => [...document.querySelectorAll('.game-card .card-chip--new')]
    .map(el => el.closest('.game-card').dataset.gameId).sort());

/** 当前可见卡片 id、各可见分区及其数量徽标、按下的筛选按钮 */
const filterState = page => page.evaluate(() => ({
    hash: location.hash,
    pressed: [...document.querySelectorAll('#games-filter [aria-pressed="true"]')].map(b => b.dataset.filter),
    barVisible: !document.getElementById('games-filter')?.hidden,
    visible: [...document.querySelectorAll('.game-card')].filter(c => c.getClientRects().length).map(c => c.dataset.gameId).sort(),
    sections: [...document.querySelectorAll('.games-cat')].filter(s => s.getClientRects().length)
        .map(s => ({ key: s.dataset.cat, count: Number(s.querySelector('.games-cat-count')?.textContent) })),
}));

function expectFilter(filter) {
    const keep = ALL_HOME.filter(e => filter === 'all' || (filter === 'daily' ? e.daily : e.h.category === filter));
    const sections = HOME.categories.map(c => ({ key: c.key, count: keep.filter(e => e.h.category === c.key).length }))
        .filter(s => s.count);
    return { visible: keep.map(e => e.id).sort(), sections };
}

function checkFilter(st, filter, where) {
    const want = expectFilter(filter);
    if (JSON.stringify(st.pressed) !== JSON.stringify([filter])) fail(`${where} 按下的筛选按钮=${st.pressed} 应为 ${filter}`);
    if (JSON.stringify(st.visible) !== JSON.stringify(want.visible)) fail(`${where} 可见卡片 ${st.visible.length} 张，应为 ${want.visible.length}`);
    if (JSON.stringify(st.sections) !== JSON.stringify(want.sections)) fail(`${where} 可见分区/数量=${JSON.stringify(st.sections)} 应为 ${JSON.stringify(want.sections)}`);
}

async function getChipSnapshot(page) {
    return page.evaluate(() => [...document.querySelectorAll('.game-card .card-chip:not(.tag--dark-only)')].map(el => {
        const title = el.closest('.game-card')?.querySelector('.card-title');
        const chipRect = el.getBoundingClientRect();
        const titleRect = title?.getBoundingClientRect();
        const intersectsTitle = Boolean(titleRect
            && titleRect.left < chipRect.right
            && titleRect.right > chipRect.left
            && titleRect.top < chipRect.bottom
            && titleRect.bottom > chipRect.top);
        const kind = [...el.classList].find(c => c.startsWith('card-chip--'))?.slice('card-chip--'.length) || '';
        const css = getComputedStyle(el);
        return {
            kind,
            text: el.textContent.trim(),
            visible: css.display !== 'none' && css.visibility !== 'hidden' && chipRect.width > 0,
            insideCard: (() => {
                const card = el.closest('.game-card').getBoundingClientRect();
                return chipRect.left >= card.left && chipRect.right <= card.right;
            })(),
            intersectsTitle,
        };
    }));
}

const CHIP_TEXT = {
    zh: { daily: '今日挑战', new: '新上线', external: '站外 ↗' },
    en: { daily: 'Daily', new: 'New', external: 'External ↗' },
};
function checkChips(chips, lang, where) {
    const want = CHIP_TEXT[lang];
    if (!chips.length) fail(`${where} 首页没有状态胶囊`);
    for (const kind of Object.keys(want)) {
        if (!chips.some(c => c.kind === kind)) fail(`${where} 缺 ${kind} 胶囊`);
    }
    const wrong = chips.filter(c => c.text !== want[c.kind]);
    if (wrong.length) fail(`${where} 胶囊文案未本地化: ${wrong.map(c => `${c.kind}="${c.text}"`).join(', ')}`);
    if (chips.some(c => !c.visible)) fail(`${where} 有胶囊不可见（文字胶囊必须无需 hover 即可读）`);
    if (chips.some(c => c.intersectsTitle)) fail(`${where} 胶囊与游戏标题重叠`);
    if (chips.some(c => !c.insideCard)) fail(`${where} 胶囊溢出卡片`);
}

// ── zh ──
{
    const { page, errs } = await loadPage('zh');
    const snap = await page.evaluate(() => ({
        title: document.getElementById('main-title')?.textContent || '',
        cards: document.querySelectorAll('.game-card').length,
        hubTitle: document.getElementById('hub-title')?.textContent || '',
        hubWord: document.getElementById('hub-task-word-name')?.textContent || '',
        langBtn: !!document.getElementById('lang-toggle'),
        bodyBg: getComputedStyle(document.body).backgroundColor,
        nestedLinks: document.querySelectorAll('.game-card a, .game-card button').length,
        cardLinks: [...document.querySelectorAll('.game-card')].every(c => c.tagName === 'A' && c.getAttribute('href')),
    }));

    if (errs.length) fail(`zh 页面错误: ${errs.join(' | ')}`);
    if (snap.title !== '单页游戏合集') fail(`zh i18n 注入未生效: main-title="${snap.title}"`);
    if (snap.cards < 13) fail(`zh 游戏卡片不足: ${snap.cards} < 13`);
    if (!snap.hubTitle) fail('zh daily hub 标题为空（updateDailyHub 未跑？）');
    if (!snap.hubWord) fail('zh daily task 名称为空');
    if (!snap.langBtn) fail('zh 缺 #lang-toggle');
    if (snap.bodyBg === 'rgba(0, 0, 0, 0)' || snap.bodyBg === 'rgb(255, 255, 255)') {
        fail(`zh CSS 疑似未生效: body 背景=${snap.bodyBg}`);
    }
    if (snap.nestedLinks) fail(`zh 卡片内仍有 ${snap.nestedLinks} 个嵌套可聚焦元素（每卡应只有一个 Tab 停靠点）`);
    if (!snap.cardLinks) fail('zh 存在不是 <a href> 的游戏卡片');
    checkChips(await getChipSnapshot(page), 'zh', 'zh');

    // 语言切换交互：zh → en
    if (snap.langBtn) {
        await page.evaluate(() => document.getElementById('lang-toggle').click());
        await new Promise(r => setTimeout(r, 200));
        const titleEn = await page.evaluate(() => document.getElementById('main-title')?.textContent || '');
        if (titleEn !== 'Mini Games Collection') fail(`语言切换未生效: main-title="${titleEn}"`);
        checkChips(await getChipSnapshot(page), 'en', 'zh → en 后');
    }
    await page.close();
}

// ── 直链 hash / 非法 hash / 远期时钟 ──
{
    const { page, errs } = await loadPage('en', { hash: '#cat=science' });
    checkFilter(await filterState(page), 'science', '直链 #cat=science');
    await page.evaluate(() => { location.hash = '#cat=nope'; });
    await new Promise(r => setTimeout(r, 100));
    checkFilter(await filterState(page), 'all', '非法 hash');
    if (errs.length) fail(`hash 页面错误: ${errs.join(' | ')}`);
    await page.close();
}
{
    const { page } = await loadPage('en', { now: FAR_FUTURE });
    const got = await newChipIds(page);
    if (got.length) fail(`远期时钟下仍有「新」胶囊: ${got}`);
    await page.close();
}

// ── en ──
{
    const { page, errs } = await loadPage('en');
    const snap = await page.evaluate(() => ({
        title: document.getElementById('main-title')?.textContent || '',
        hubWordStatus: document.getElementById('hub-task-word-status')?.textContent || '',
    }));
    if (errs.length) fail(`en 页面错误: ${errs.join(' | ')}`);
    if (snap.title !== 'Mini Games Collection') fail(`en i18n 注入未生效: main-title="${snap.title}"`);
    checkChips(await getChipSnapshot(page), 'en', 'en');
    const wantNew = expectNew(FROZEN_NOW);
    if (!wantNew.length) fail('FROZEN_NOW 下 registry 没有任何 addedAt 在 45 天内的游戏，「新」胶囊测不到');
    const gotNew = await newChipIds(page);
    if (JSON.stringify(gotNew) !== JSON.stringify(wantNew)) fail(`「新」胶囊=${gotNew} 应为 addedAt 45 天内的 ${wantNew}`);
    const newLabelled = await page.evaluate(() => [...document.querySelectorAll('.card-chip--new')].every(chip =>
        chip.closest('.game-card').getAttribute('aria-labelledby').split(/\s+/).includes(chip.id)));
    if (!newLabelled) fail('「新」胶囊未加入整卡 aria-labelledby');

    // ── 筛选条 ──
    let st = await filterState(page);
    if (!st.barVisible) fail('筛选条未在 JS 绑定后显现');
    // 选中钮是小字号白字：WCAG AA 要 ≥ 4.5:1（深色主色 #6366f1 只有 4.47，PR #147 review）
    const pressedContrast = await page.$eval('#games-filter [aria-pressed="true"]', el => {
        const rgb = v => v.match(/[\d.]+/g).slice(0, 3).map(Number);
        const lum = c => {
            const [r, g, b] = c.map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const css = getComputedStyle(el);
        const [a, b] = [lum(rgb(css.color)), lum(rgb(css.backgroundColor))].sort((x, y) => y - x);
        return (a + 0.05) / (b + 0.05);
    });
    if (pressedContrast < 4.5) fail(`选中筛选钮对比度 ${pressedContrast.toFixed(2)}:1 < 4.5:1`);
    checkFilter(st, 'all', '初始');
    const filters = await page.$$eval('#games-filter [data-filter]', bs => bs.map(b => b.dataset.filter));
    for (const f of filters) {
        await page.click(`#games-filter [data-filter="${f}"]`);
        st = await filterState(page);
        checkFilter(st, f, `点击 ${f} 后`);
        const wantHash = f === 'all' ? '' : `#cat=${f}`;
        if (st.hash !== wantHash) fail(`点击 ${f} 后 hash="${st.hash}" 应为 "${wantHash}"`);
    }
    await page.click('#games-filter [data-filter="daily"]');
    await page.click('#games-filter [data-filter="science"]');
    await page.goBack();
    await new Promise(r => setTimeout(r, 100));
    checkFilter(await filterState(page), 'daily', '后退一步');
    await page.click('#games-filter [data-filter="all"]');
    checkFilter(await filterState(page), 'all', '回到全部');
    // 「每日」把卡片移进暂存 div：回到全部后 DOM 顺序必须复原，暂存期间切语言也要覆盖到
    const domOrder = () => page.$$eval('.games-cat .games-grid .game-card', cs => cs.map(c => c.dataset.gameId));
    const orderBefore = await domOrder();
    await page.click('#games-filter [data-filter="daily"]');
    await page.click('#lang-toggle');
    await new Promise(r => setTimeout(r, 200));
    await page.click('#games-filter [data-filter="all"]');
    if (JSON.stringify(await domOrder()) !== JSON.stringify(orderBefore)) fail('每日 → 全部 后卡片顺序未复原');
    const zhTitle = await page.$eval('[data-game-id="tetris"] .card-title', el => el.textContent);
    const wantZh = GAMES.find(g => g.id === 'tetris').name.zh;
    if (zhTitle !== wantZh) fail(`暂存期间切中文，回到全部后 tetris 标题="${zhTitle}" 应为 "${wantZh}"`);
    await page.click('#lang-toggle');
    await new Promise(r => setTimeout(r, 200));
    const stored = await page.evaluate(() => Object.keys(localStorage).filter(k => /filter|cat/i.test(k)));
    if (stored.length) fail(`筛选状态不应写 localStorage: ${stored}`);
    for (const w of [390, 320]) {
        await page.setViewport({ width: w, height: 844 });
        await page.reload({ waitUntil: 'networkidle0', timeout: 30000 });
        checkChips(await getChipSnapshot(page), 'en', `${w}px`);
    }
    await page.close();
}

await browser.close();

if (fails.length) {
    console.error('✗ smoke-index');
    for (const f of fails) console.error(`  - ${f}`);
    process.exit(1);
}
console.log('smoke-index：i18n 注入 / daily hub / 整卡链接 / 状态胶囊 / 「新」判定 / 筛选 + hash / 语言切换 / CSS 全部通过 ✅');
