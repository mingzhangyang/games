#!/usr/bin/env node
/**
 * smoke-index — index.html 落地页运行时冒烟（P4-1 内联抽离后的回归防线）。
 * 用法：node tests/smoke-index.mjs [http://127.0.0.1:PORT]
 * 断言：module 脚本执行（i18n 注入）、daily hub 更新、卡片渲染、语言切换、CSS 生效、无页面错误。
 * 语言态必须显式 setItem('site_lang')（headless 默认 en-US，见 verify 教训）。
 */
import puppeteer from 'puppeteer-core';
import { CHROME_PATH, LAUNCH_ARGS } from './lib/browser.mjs';

const BASE = process.argv.find(a => a.startsWith('http')) || 'http://127.0.0.1:8899';
const fails = [];
const fail = msg => fails.push(msg);

const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: LAUNCH_ARGS,
});

async function loadPage(lang) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e.message || e).split('\n')[0]));
    await page.evaluateOnNewDocument(l => {
        try { localStorage.setItem('site_lang', l); } catch (e) { /* ignore */ }
    }, lang);
    await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle0', timeout: 30000 });
    return { page, errs };
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
console.log('smoke-index：i18n 注入 / daily hub / 整卡链接 / 状态胶囊 / 语言切换 / CSS 全部通过 ✅');
